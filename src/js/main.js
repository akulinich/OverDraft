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
import { validateTeamsData, validateTeamsDataWithConfig } from './validation/schema.js';
import { getSheetKey } from './utils/parser.js';
import { 
  loadTeamsLayoutConfig, 
  saveTeamsLayoutConfig, 
  getDefaultTeamsLayoutConfig 
} from './storage/persistence.js';

/** @type {ReturnType<typeof createPollingManager>|null} */
let pollingManager = null;

/** @type {number|null} Current selected row index in players table */
let selectedPlayerRowIndex = null;

/** @type {string|null} Last rendered player details hash for change detection */
let lastPlayerDetailsHash = null;

/** @type {boolean} Flag indicating if column mapping modal is currently shown */
let isColumnMappingPending = false;

/** @type {{headers: string[], data: string[][]}|null} Pending sheet data waiting for column mapping */
let pendingSheetData = null;

/** @type {boolean} Flag indicating if teams layout modal is currently shown */
let isTeamsLayoutPending = false;

/** @type {{headers: string[], data: string[][], allRows: string[][]}|null} Pending teams data waiting for layout config */
let pendingTeamsData = null;

/**
 * Fetches and renders players sheet data
 * @param {boolean} [skipColumnValidation=false] - Skip column validation (used after mapping confirmed)
 */
async function fetchAndRenderPlayers(skipColumnValidation = false) {
  const sheet = store.getFirstSheet();
  if (!sheet) return;
  
  // Don't fetch if we're waiting for column mapping
  if (isColumnMappingPending) return;
  
  try {
    const data = await fetchSheet(sheet.spreadsheetId, sheet.gid);
    const sheetKey = getSheetKey(sheet.spreadsheetId, sheet.gid);
    
    // Check if column mapping is needed (only on first load or when not skipped)
    if (!skipColumnValidation) {
      const existingMapping = store.getColumnMapping(sheetKey);
      const validation = store.validateRequiredColumns(data.headers, data.data, existingMapping);
      
      if (!validation.valid) {
        // Show column mapping modal
        isColumnMappingPending = true;
        pendingSheetData = { headers: data.headers, data: data.data };
        
        if (config.isDev) {
          console.log('[App] Column mapping needed:', validation);
        }
        
        events.openColumnMappingModal(
          data.headers, 
          data.data, 
          validation.detected, 
          validation.missing, 
          validation.errors
        );
        return;
      }
    }
    
    store.updateSheetData(data);
    
    // Render table if on players tab
    if (store.getActiveTab() === 'players') {
      const teams = getParsedTeams();
      renderPlayersPanel(data.headers, data.data, teams);
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
 * Computes a hash for player details to detect changes
 * @param {import('./state/store.js').Player|null} player
 * @returns {string}
 */
function computePlayerDetailsHash(player) {
  if (!player) return '';
  return JSON.stringify(player.rawRow);
}

/**
 * Renders players panel with table and details
 * @param {string[]} headers
 * @param {string[][]} data
 * @param {import('./validation/schema.js').Team[]} teams
 */
function renderPlayersPanel(headers, data, teams) {
  renderer.renderPlayersTable(headers, data, teams);
  
  // Try to keep currently selected player
  const currentPlayer = store.getSelectedPlayer();
  const filteredData = getFilteredTableData(headers, data, teams);
  
  // Find nickname column
  const nicknameIdx = headers.findIndex(h => 
    /^(ник|никнейм|nickname|nick|имя|name|игрок|player)/i.test(h.trim())
  );
  
  if (currentPlayer && nicknameIdx !== -1) {
    // Check if current player is still in filtered data
    const currentRowIndex = filteredData.findIndex(row => 
      row[nicknameIdx]?.trim()?.toLowerCase() === currentPlayer.nickname.toLowerCase()
    );
    
    if (currentRowIndex !== -1) {
      // Player still exists, keep selection
      selectedPlayerRowIndex = currentRowIndex;
      
      // Get fresh player data from store
      const freshPlayer = store.getPlayerByNickname(currentPlayer.nickname);
      const newHash = computePlayerDetailsHash(freshPlayer);
      
      // Only re-render details if data changed
      if (newHash !== lastPlayerDetailsHash) {
        lastPlayerDetailsHash = newHash;
        renderer.renderPlayerDetailsPanel(freshPlayer || currentPlayer, headers);
      }
      
      renderer.updatePlayerRowSelection(currentRowIndex);
      return;
    }
  }
  
  // Auto-select first player if none selected or previous selection not found
  const firstPlayer = renderer.getFirstFilteredPlayer(headers, data, teams);
  if (firstPlayer) {
    store.setSelectedPlayer(firstPlayer);
    selectedPlayerRowIndex = 0;
    
    const newHash = computePlayerDetailsHash(firstPlayer);
    if (newHash !== lastPlayerDetailsHash) {
      lastPlayerDetailsHash = newHash;
      renderer.renderPlayerDetailsPanel(firstPlayer, headers);
    }
    
    renderer.updatePlayerRowSelection(0);
  } else {
    store.setSelectedPlayer(null);
    selectedPlayerRowIndex = null;
    lastPlayerDetailsHash = null;
    renderer.clearPlayerDetailsPanel();
    renderer.updatePlayerRowSelection(null);
  }
}

/**
 * Fetches and renders teams sheet data
 * @param {boolean} [skipLayoutValidation=false] - Skip layout validation (used after config confirmed)
 */
async function fetchAndRenderTeams(skipLayoutValidation = false) {
  const teamsSheet = store.getTeamsSheet();
  if (!teamsSheet) {
    if (store.getActiveTab() === 'teams') {
      renderer.showTeamsNotConfigured();
    }
    return;
  }
  
  // Don't fetch if we're waiting for layout config
  if (isTeamsLayoutPending) return;
  
  try {
    const data = await fetchSheet(teamsSheet.spreadsheetId, teamsSheet.gid);
    const sheetKey = getSheetKey(teamsSheet.spreadsheetId, teamsSheet.gid);
    
    // Load saved config or use defaults
    let layoutConfig = loadTeamsLayoutConfig(sheetKey);
    if (!layoutConfig) {
      layoutConfig = getDefaultTeamsLayoutConfig();
    }
    
    // All rows including headers (for validation)
    const allRows = [data.headers, ...data.data];
    
    if (!skipLayoutValidation) {
      // Validate with config
      const validation = validateTeamsDataWithConfig(allRows, layoutConfig);
      
      if (!validation.valid || (validation.data && validation.data.teams.length === 0)) {
        // Show layout configuration modal
        isTeamsLayoutPending = true;
        pendingTeamsData = { headers: data.headers, data: data.data, allRows };
        
        if (config.isDev) {
          console.log('[App] Teams layout config needed:', validation);
        }
        
        events.openTeamsLayoutModal(
          allRows,
          layoutConfig,
          validation.parseError,
          onTeamsLayoutConfirmed,
          onTeamsLayoutCancelled
        );
        return;
      }
      
      // Save the config if not already saved
      if (!loadTeamsLayoutConfig(sheetKey)) {
        saveTeamsLayoutConfig(sheetKey, layoutConfig);
      }
    }
    
    store.updateTeamsData(data);
    
    // Render teams if on teams tab
    if (store.getActiveTab() === 'teams') {
      await renderer.renderTeamsView(data.headers, data.data, layoutConfig);
    }
    
  } catch (err) {
    console.error('[App] Teams fetch error:', err);
    
    if (store.getActiveTab() === 'teams') {
      renderer.showTeamsNotConfigured();
    }
  }
}

/**
 * Called when teams layout configuration is confirmed
 * @param {import('./storage/persistence.js').TeamsLayoutConfig} layoutConfig
 */
async function onTeamsLayoutConfirmed(layoutConfig) {
  isTeamsLayoutPending = false;
  
  const teamsSheet = store.getTeamsSheet();
  if (!teamsSheet || !pendingTeamsData) return;
  
  const sheetKey = getSheetKey(teamsSheet.spreadsheetId, teamsSheet.gid);
  
  // Save the config
  saveTeamsLayoutConfig(sheetKey, layoutConfig);
  
  // Update teams data in store
  store.updateTeamsData({
    spreadsheetId: teamsSheet.spreadsheetId,
    gid: teamsSheet.gid,
    headers: pendingTeamsData.headers,
    data: pendingTeamsData.data,
    lastUpdated: new Date()
  });
  
  pendingTeamsData = null;
  
  // Render teams if on teams tab
  if (store.getActiveTab() === 'teams') {
    const teamsData = store.getTeamsData();
    if (teamsData) {
      await renderer.renderTeamsView(teamsData.headers, teamsData.data, layoutConfig);
    }
  }
}

/**
 * Called when teams layout configuration is cancelled
 */
function onTeamsLayoutCancelled() {
  isTeamsLayoutPending = false;
  pendingTeamsData = null;
  
  if (store.getActiveTab() === 'teams') {
    renderer.showTeamsNotConfigured();
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
 * @param {'players'|'teams'} tab 
 */
async function onTabChange(tab) {
  renderer.showTab(tab);
  
  // Show filters only on players tab
  renderer.updateFiltersVisibility(tab === 'players');
  renderer.updateFilterButtonStates();
  
  if (tab === 'players') {
    const sheet = store.getFirstSheet();
    if (sheet) {
      const cached = store.getSheetData(sheet.spreadsheetId, sheet.gid);
      if (cached) {
        const teams = getParsedTeams();
        renderPlayersPanel(cached.headers, cached.data, teams);
        renderer.showDataDisplay();
      }
    }
  } else if (tab === 'teams') {
    // Clear player selection for teams tab
    store.setSelectedPlayer(null);
    renderer.clearTeamsPlayerDetailsPanel();
    
    const teamsData = store.getTeamsData();
    if (teamsData) {
      const teamsSheet = store.getTeamsSheet();
      const layoutConfig = teamsSheet 
        ? loadTeamsLayoutConfig(getSheetKey(teamsSheet.spreadsheetId, teamsSheet.gid))
        : null;
      await renderer.renderTeamsView(teamsData.headers, teamsData.data, layoutConfig);
    } else if (store.hasTeamsSheet()) {
      await fetchAndRenderTeams();
    } else {
      renderer.showTeamsNotConfigured();
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
  
  // Get saved layout config for this sheet
  const teamsSheet = store.getTeamsSheet();
  let layoutConfig = null;
  if (teamsSheet) {
    const sheetKey = getSheetKey(teamsSheet.spreadsheetId, teamsSheet.gid);
    layoutConfig = loadTeamsLayoutConfig(sheetKey);
  }
  
  const result = validateTeamsData(teamsData.headers, teamsData.data, layoutConfig || undefined);
  return result.data ? result.data.teams : [];
}

/**
 * Called when a filter is toggled
 */
function onFilterChange() {
  const activeTab = store.getActiveTab();
  const teams = getParsedTeams();
  
  if (activeTab === 'players') {
    const sheet = store.getFirstSheet();
    if (sheet) {
      const cached = store.getSheetData(sheet.spreadsheetId, sheet.gid);
      if (cached) {
        renderPlayersPanel(cached.headers, cached.data, teams);
      }
    }
  }
}

/**
 * Called when a player is clicked in a team card
 * @param {string} nickname
 */
function onTeamPlayerSelect(nickname) {
  const sheet = store.getFirstSheet();
  const cached = sheet ? store.getSheetData(sheet.spreadsheetId, sheet.gid) : null;
  const headers = cached?.headers || [];
  
  const player = store.getPlayerByNickname(nickname);
  
  if (player) {
    store.setSelectedPlayer(player);
    renderer.renderTeamsPlayerDetailsPanel(player, headers);
    renderer.updateTeamsPlayerSelection(nickname);
  } else {
    // Player not found in players sheet, show minimal info with just nickname
    const playerLike = {
      nickname,
      battleTag: '',
      role: 'unknown',
      rating: 0,
      heroes: '',
      rawRow: []
    };
    store.setSelectedPlayer(playerLike);
    renderer.renderTeamsPlayerDetailsPanel(playerLike, headers);
    renderer.updateTeamsPlayerSelection(nickname);
  }
}

/**
 * Called when a player row is clicked in the players table
 * @param {number} rowIndex
 */
function onPlayerRowSelect(rowIndex) {
  const sheet = store.getFirstSheet();
  if (!sheet) return;
  
  const cached = store.getSheetData(sheet.spreadsheetId, sheet.gid);
  if (!cached) return;
  
  const teams = getParsedTeams();
  
  // Apply filters to get the actual data being displayed
  const filteredData = getFilteredTableData(cached.headers, cached.data, teams);
  if (rowIndex < 0 || rowIndex >= filteredData.length) return;
  
  // Find nickname column to look up player
  const nicknameIdx = cached.headers.findIndex(h => 
    /^(ник|никнейм|nickname|nick|имя|name|игрок|player)/i.test(h.trim())
  );
  
  if (nicknameIdx === -1) return;
  
  const nickname = filteredData[rowIndex][nicknameIdx]?.trim();
  if (!nickname) return;
  
  const player = store.getPlayerByNickname(nickname);
  if (player) {
    store.setSelectedPlayer(player);
    selectedPlayerRowIndex = rowIndex;
    lastPlayerDetailsHash = computePlayerDetailsHash(player);
    renderer.renderPlayerDetailsPanel(player, cached.headers);
    renderer.updatePlayerRowSelection(rowIndex);
  }
}

/**
 * Gets filtered table data based on current filters
 * @param {string[]} headers
 * @param {string[][]} data
 * @param {import('./validation/schema.js').Team[]} teams
 * @returns {string[][]}
 */
function getFilteredTableData(headers, data, teams) {
  const filters = store.getFilters();
  
  if (!filters.availableOnly && filters.role === null) {
    return data;
  }
  
  const filteredPlayers = store.getFilteredPlayers(teams);
  const filteredNicknames = new Set(filteredPlayers.map(p => p.nickname.toLowerCase()));
  
  const nicknameIdx = headers.findIndex(h => 
    /^(ник|никнейм|nickname|nick|имя|name|игрок|player)/i.test(h.trim())
  );
  
  if (nicknameIdx === -1) {
    return data;
  }
  
  return data.filter(row => {
    const nickname = row[nicknameIdx]?.trim()?.toLowerCase();
    return nickname && filteredNicknames.has(nickname);
  });
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
 * Called when user clicks "Configure teams layout" button in settings
 */
async function onConfigureTeamsLayout() {
  const teamsSheet = store.getTeamsSheet();
  if (!teamsSheet) return;
  
  try {
    const data = await fetchSheet(teamsSheet.spreadsheetId, teamsSheet.gid);
    const sheetKey = getSheetKey(teamsSheet.spreadsheetId, teamsSheet.gid);
    const allRows = [data.headers, ...data.data];
    
    // Load saved config or use defaults
    let layoutConfig = loadTeamsLayoutConfig(sheetKey) || getDefaultTeamsLayoutConfig();
    
    // Validate to get any errors
    const validation = validateTeamsDataWithConfig(allRows, layoutConfig);
    
    // Cache the data for when config is confirmed
    pendingTeamsData = { headers: data.headers, data: data.data, allRows };
    isTeamsLayoutPending = true;
    
    // Open the modal
    events.openTeamsLayoutModal(
      allRows,
      layoutConfig,
      validation.parseError,
      onTeamsLayoutConfirmed,
      onTeamsLayoutCancelled
    );
  } catch (err) {
    console.error('[App] Failed to load teams data for layout config:', err);
  }
}

/**
 * Called when column mapping is confirmed in the modal
 * @param {import('./storage/persistence.js').ColumnMapping} mapping
 */
async function onColumnMappingConfirmed(mapping) {
  isColumnMappingPending = false;
  
  const sheet = store.getFirstSheet();
  if (!sheet || !pendingSheetData) return;
  
  const sheetKey = getSheetKey(sheet.spreadsheetId, sheet.gid);
  
  // Update sheet data with new mapping
  store.updateSheetData({
    spreadsheetId: sheet.spreadsheetId,
    gid: sheet.gid,
    headers: pendingSheetData.headers,
    data: pendingSheetData.data,
    lastUpdated: new Date()
  }, mapping);
  
  pendingSheetData = null;
  
  // Render the data
  if (store.getActiveTab() === 'players') {
    const teams = getParsedTeams();
    const cached = store.getSheetData(sheet.spreadsheetId, sheet.gid);
    if (cached) {
      renderPlayersPanel(cached.headers, cached.data, teams);
      renderer.showDataDisplay();
    }
  }
  
  renderer.updateStatusBar(new Date(), true);
  
  // Start polling if not already running
  if (!pollingManager?.isRunning()) {
    startPolling();
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
    onFilterChange,
    onPlayerRowSelect,
    onTeamPlayerSelect,
    onColumnMappingConfirmed,
    onConfigureTeamsLayout
  });
  
  // Show tabs if teams sheet is configured
  renderer.updateTabsVisibility(store.hasTeamsSheet());
  
  // Show filters on players tab by default
  renderer.updateFiltersVisibility(store.getActiveTab() === 'players');
  renderer.updateFilterButtonStates();
  
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

