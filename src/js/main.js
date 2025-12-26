/**
 * OverDraft — Main Application Entry Point
 */

import { config } from './config.js';
import { fetchSheet, SheetError } from './api/sheets.js';
import * as store from './state/store.js';
import * as renderer from './ui/renderer.js';
import * as events from './ui/events.js';
import { createPollingManager } from './utils/polling.js';

/** @type {ReturnType<typeof createPollingManager>|null} */
let pollingManager = null;

/**
 * Fetches and renders sheet data
 */
async function fetchAndRender() {
  const sheet = store.getFirstSheet();
  if (!sheet) return;
  
  try {
    const data = await fetchSheet(sheet.spreadsheetId, sheet.gid);
    store.updateSheetData(data);
    
    // Render table
    renderer.renderTable(data.headers, data.data);
    renderer.showDataDisplay();
    renderer.updateStatusBar(data.lastUpdated, true);
    renderer.showStatusError(null);
    
  } catch (err) {
    console.error('[App] Fetch error:', err);
    
    // Network errors are almost always caused by unpublished sheets (CORS blocked)
    const isLikelyNotPublished = 
      (err instanceof SheetError && (err.type === 'NOT_PUBLISHED' || err.type === 'NETWORK')) ||
      err.name === 'TypeError';
    
    // If we have cached data, keep showing it
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
  await fetchAndRender();
  startPolling();
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
  
  // Initialize state from localStorage
  store.initializeState();
  
  // Apply saved theme
  renderer.applyTheme(store.getState().theme);
  renderer.updatePollingDisplay(store.getState().pollingInterval);
  
  // Initialize event handlers
  events.initializeEvents({
    onSheetConfigured,
    onPollingIntervalChange
  });
  
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

