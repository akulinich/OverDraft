/**
 * OverDraft — Main Application Entry Point
 */

import { config } from './config.js';
import { fetchSheet, SheetError } from './api/sheets.js';
import { initOverFastData } from './api/overfast.js';
import * as store from './state/store.js';
import * as renderer from './ui/renderer.js';
import * as events from './ui/events.js';
import { createPollingManager } from './utils/polling.js';
import { getVersionString, getBuildInfo } from './version.js';
import { validateTeamsData } from './validation/schema.js';

/** @type {ReturnType<typeof createPollingManager>|null} */
let pollingManager = null;

/**
 * Fetches and renders players sheet data
 */
async function fetchAndRenderPlayers() {
  const sheet = store.getFirstSheet();
  if (!sheet) return;
  
  try {
    const data = await fetchSheet(sheet.spreadsheetId, sheet.gid);
    store.updateSheetData(data);
    
    // Render table if on players tab
    if (store.getActiveTab() === 'players') {
      renderer.renderTable(data.headers, data.data);
      renderer.showDataDisplay();
    }
    renderer.updateStatusBar(data.lastUpdated, true);
    renderer.showStatusError(null);
    
  } catch (err) {
    console.error('[App] Players fetch error:', err);
    
    const isLikelyNotPublished = 
      (err instanceof SheetError && (err.type === 'NOT_PUBLISHED' || err.type === 'NETWORK')) ||
      err.name === 'TypeError';
    
    const cached = store.getSheetData(sheet.spreadsheetId, sheet.gid);
    if (cached) {
      renderer.showStatusError(err instanceof SheetError ? getErrorMessage(err) : 'Ошибка загрузки');
    } else {
      const message = isLikelyNotPublished 
        ? 'Не удалось подключиться. Вероятно, таблица не опубликована.'
        : (err instanceof SheetError ? getErrorMessage(err) : 'Не удалось загрузить данные');
      renderer.showError(message, isLikelyNotPublished);
    }
    
    store.setError(sheet.spreadsheetId, sheet.gid, err);
  }
}

/**
 * Fetches and renders teams sheet data
 */
async function fetchAndRenderTeams() {
  const teamsSheet = store.getTeamsSheet();
  if (!teamsSheet) {
    if (store.getActiveTab() === 'teams') {
      renderer.showTeamsNotConfigured();
    }
    return;
  }
  
  try {
    const data = await fetchSheet(teamsSheet.spreadsheetId, teamsSheet.gid);
    store.updateTeamsData(data);
    
    // Render teams if on teams tab
    if (store.getActiveTab() === 'teams') {
      renderer.renderTeamsView(data.headers, data.data);
    }
    
  } catch (err) {
    console.error('[App] Teams fetch error:', err);
    
    if (store.getActiveTab() === 'teams') {
      renderer.showTeamsNotConfigured();
    }
  }
}

/**
 * Fetches and renders all data
 */
async function fetchAndRender() {
  await Promise.all([
    fetchAndRenderPlayers(),
    store.hasTeamsSheet() ? fetchAndRenderTeams() : Promise.resolve()
  ]);
}

/**
 * Gets user-friendly error message
 * @param {SheetError} err 
 * @returns {string}
 */
function getErrorMessage(err) {
  switch (err.type) {
    case 'NOT_PUBLISHED':
      return 'Таблица не опубликована в интернете';
    case 'NOT_FOUND':
      return 'Таблица не найдена. Проверьте URL.';
    case 'NETWORK':
      return 'Ошибка сети. Проверьте подключение.';
    case 'PARSE_ERROR':
      return 'Не удалось обработать данные таблицы.';
    default:
      return 'Произошла неизвестная ошибка.';
  }
}

/**
 * Starts polling for data updates
 */
function startPolling() {
  if (pollingManager) {
    pollingManager.stop();
  }
  
  pollingManager = createPollingManager(fetchAndRender, store.getState().pollingInterval);
  pollingManager.start();
}

/**
 * Called when sheet is configured
 */
async function onSheetConfigured() {
  renderer.showLoading();
  renderer.updateTabsVisibility(store.hasTeamsSheet());
  await fetchAndRender();
  startPolling();
}

/**
 * Called when tab changes
 * @param {'players'|'teams'|'draft'} tab 
 */
async function onTabChange(tab) {
  renderer.showTab(tab);
  
  if (tab === 'players') {
    const sheet = store.getFirstSheet();
    if (sheet) {
      const cached = store.getSheetData(sheet.spreadsheetId, sheet.gid);
      if (cached) {
        renderer.renderTable(cached.headers, cached.data);
        renderer.showDataDisplay();
      }
    }
  } else if (tab === 'teams') {
    store.setSelectedTeam(null);
    const teamsData = store.getTeamsData();
    if (teamsData) {
      renderer.renderTeamsView(teamsData.headers, teamsData.data);
    } else if (store.hasTeamsSheet()) {
      await fetchAndRenderTeams();
    } else {
      renderer.showTeamsNotConfigured();
    }
  } else if (tab === 'draft') {
    const selectedTeam = store.getSelectedTeam();
    if (selectedTeam) {
      const teams = getParsedTeams();
      // Use fresh team data from parsed teams, not the cached selectedTeam
      const freshTeam = teams.find(t => t.name === selectedTeam.name) || selectedTeam;
      const unselectedByRole = store.getUnselectedPlayersByRole(teams);
      renderer.renderDraftView(freshTeam, unselectedByRole);
    }
  }
}

/**
 * Gets parsed teams from cached teams data
 * @returns {import('./validation/schema.js').Team[]}
 */
function getParsedTeams() {
  const teamsData = store.getTeamsData();
  if (!teamsData) return [];
  
  const result = validateTeamsData(teamsData.headers, teamsData.data);
  return result.valid && result.data ? result.data.teams : [];
}

/**
 * Called when a team card is clicked
 * @param {string} teamName
 */
function onTeamSelect(teamName) {
  const teams = getParsedTeams();
  const team = teams.find(t => t.name === teamName);
  
  if (!team) {
    console.warn('[App] Team not found:', teamName);
    return;
  }
  
  store.setSelectedTeam(team);
  store.setActiveTab('draft');
  
  // Render immediately with fresh data
  const unselectedByRole = store.getUnselectedPlayersByRole(teams);
  renderer.showTab('draft');
  renderer.renderDraftView(team, unselectedByRole);
}

/**
 * Called when a player is selected in draft view
 * @param {string} nickname
 */
function onPlayerSelect(nickname) {
  const player = store.getPlayerByNickname(nickname);
  
  if (player) {
    store.setSelectedPlayer(player);
    renderer.renderDraftPlayerDescription(player);
    renderer.updateDraftPlayerSelection(nickname);
  } else {
    // Player might be from team (TeamPlayer), create a minimal player object
    const selectedTeam = store.getSelectedTeam();
    if (selectedTeam) {
      const teamPlayer = selectedTeam.players.find(
        p => p.nickname.toLowerCase() === nickname.toLowerCase()
      );
      if (teamPlayer) {
        // Create a Player-like object from TeamPlayer
        const playerLike = {
          nickname: teamPlayer.nickname,
          role: teamPlayer.role,
          rating: teamPlayer.rating,
          heroes: '',
          rawRow: []
        };
        renderer.renderDraftPlayerDescription(playerLike);
        renderer.updateDraftPlayerSelection(nickname);
      }
    }
  }
}

/**
 * Called when back button in draft view is clicked
 */
function onDraftBack() {
  store.setSelectedTeam(null);
  store.setSelectedPlayer(null);
  store.setActiveTab('teams');
  onTabChange('teams');
}

/**
 * Called when polling interval changes
 * @param {number} interval 
 */
function onPollingIntervalChange(interval) {
  if (pollingManager) {
    pollingManager.setInterval(interval);
  }
}

/**
 * Initializes the application
 */
async function init() {
  if (config.isDev) {
    console.log('[OverDraft] Initializing in development mode');
  }
  
  // Display version
  const versionEl = document.getElementById('app-version');
  if (versionEl) {
    versionEl.textContent = getVersionString();
  }
  
  // Display version in settings
  const settingsVersionEl = document.getElementById('settings-version');
  const settingsBuildEl = document.getElementById('settings-build-time');
  if (settingsVersionEl) {
    settingsVersionEl.textContent = getVersionString();
  }
  if (settingsBuildEl) {
    settingsBuildEl.textContent = getBuildInfo();
  }
  
  // Initialize state from localStorage
  store.initializeState();
  
  // Initialize local icons data (heroes, roles, ranks)
  // This is synchronous since we use local assets
  await initOverFastData();
  store.setOverfastLoaded(true);
  if (config.isDev) {
    console.log('[OverDraft] Icons data loaded (local assets)');
  }
  
  // Apply saved theme
  renderer.applyTheme(store.getState().theme);
  renderer.updatePollingDisplay(store.getState().pollingInterval);
  
  // Initialize event handlers
  events.initializeEvents({
    onSheetConfigured,
    onPollingIntervalChange,
    onTabChange,
    onTeamSelect,
    onPlayerSelect,
    onDraftBack
  });
  
  // Show tabs if teams sheet is configured
  renderer.updateTabsVisibility(store.hasTeamsSheet());
  
  // Check if sheets are configured
  if (store.hasConfiguredSheets()) {
    // Show loading and fetch data
    renderer.showLoading();
    await fetchAndRender();
    startPolling();
  } else {
    // Show setup modal
    events.showModal('setup-modal');
  }
  
  // Update status bar periodically
  setInterval(() => {
    const sheet = store.getFirstSheet();
    if (sheet) {
      const cached = store.getSheetData(sheet.spreadsheetId, sheet.gid);
      if (cached) {
        renderer.updateStatusBar(cached.lastUpdated, pollingManager?.isRunning() ?? false);
      }
    }
  }, 1000);
}

// Start application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

