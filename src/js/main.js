/**
 * OverDraft — Main Application Entry Point
 */

import { config } from './config.js';
import { fetchSheet, SheetError } from './api/sheets.js';
import * as store from './state/store.js';
import * as renderer from './ui/renderer.js';
import * as events from './ui/events.js';
import { createPollingManager } from './utils/polling.js';
import { getVersionString, getBuildInfo } from './version.js';

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
 * @param {'players'|'teams'} tab 
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
    const teamsData = store.getTeamsData();
    if (teamsData) {
      renderer.renderTeamsView(teamsData.headers, teamsData.data);
    } else if (store.hasTeamsSheet()) {
      await fetchAndRenderTeams();
    } else {
      renderer.showTeamsNotConfigured();
    }
  }
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
  
  // Apply saved theme
  renderer.applyTheme(store.getState().theme);
  renderer.updatePollingDisplay(store.getState().pollingInterval);
  
  // Initialize event handlers
  events.initializeEvents({
    onSheetConfigured,
    onPollingIntervalChange,
    onTabChange
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

