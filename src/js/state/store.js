/**
 * In-memory state management
 */

import { loadConfiguredSheets, loadSettings, loadTeamsSheet, saveConfiguredSheets, saveSettings, saveTeamsSheet } from '../storage/persistence.js';
import { getSheetKey } from '../utils/parser.js';

/**
 * @typedef {import('../api/sheets.js').SheetData} SheetData
 * @typedef {import('../storage/persistence.js').SheetConfig} SheetConfig
 */

/**
 * @typedef {Object} AppState
 * @property {Map<string, SheetData>} sheets - Cached sheet data
 * @property {SheetConfig[]} configuredSheets - User-configured sheets
 * @property {SheetConfig|null} teamsSheet - Teams sheet configuration
 * @property {SheetData|null} teamsData - Cached teams sheet data
 * @property {boolean} isLoading
 * @property {Map<string, Error>} errors
 * @property {number} pollingInterval
 * @property {'light'|'dark'} theme
 * @property {'players'|'teams'} activeTab - Currently active tab
 */

/**
 * State change callback type
 * @callback StateListener
 * @param {AppState} state
 * @param {string} changedKey
 */

/** @type {AppState} */
let state = {
  sheets: new Map(),
  configuredSheets: [],
  teamsSheet: null,
  teamsData: null,
  isLoading: false,
  errors: new Map(),
  pollingInterval: 1000,
  theme: 'dark',
  activeTab: 'players'
};

/** @type {Set<StateListener>} */
const listeners = new Set();

/**
 * Notifies all listeners of state change
 * @param {string} changedKey 
 */
function notify(changedKey) {
  listeners.forEach(listener => {
    try {
      listener(state, changedKey);
    } catch (err) {
      console.error('[Store] Listener error:', err);
    }
  });
}

/**
 * Gets current state (read-only reference)
 * @returns {AppState}
 */
export function getState() {
  return state;
}

/**
 * Subscribes to state changes
 * @param {StateListener} listener 
 * @returns {function(): void} Unsubscribe function
 */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Initializes state from localStorage
 */
export function initializeState() {
  const sheets = loadConfiguredSheets();
  const teamsSheet = loadTeamsSheet();
  const settings = loadSettings();
  
  state = {
    ...state,
    configuredSheets: sheets,
    teamsSheet,
    pollingInterval: settings.pollingInterval,
    theme: settings.theme
  };
  
  notify('init');
}

/**
 * Adds a new sheet configuration
 * @param {SheetConfig} config 
 */
export function addSheet(config) {
  const newConfig = {
    ...config,
    addedAt: new Date().toISOString()
  };
  
  state.configuredSheets = [...state.configuredSheets, newConfig];
  saveConfiguredSheets(state.configuredSheets);
  notify('configuredSheets');
}

/**
 * Removes a sheet configuration
 * @param {string} spreadsheetId 
 * @param {string} gid 
 */
export function removeSheet(spreadsheetId, gid) {
  state.configuredSheets = state.configuredSheets.filter(
    s => !(s.spreadsheetId === spreadsheetId && s.gid === gid)
  );
  
  const key = getSheetKey(spreadsheetId, gid);
  state.sheets.delete(key);
  state.errors.delete(key);
  
  saveConfiguredSheets(state.configuredSheets);
  notify('configuredSheets');
}

/**
 * Replaces all configured sheets with a single new one
 * @param {SheetConfig} config 
 */
export function replaceSheet(config) {
  const newConfig = {
    ...config,
    addedAt: new Date().toISOString()
  };
  
  state.configuredSheets = [newConfig];
  state.sheets.clear();
  state.errors.clear();
  
  saveConfiguredSheets(state.configuredSheets);
  notify('configuredSheets');
}

/**
 * Updates cached sheet data
 * @param {SheetData} data 
 */
export function updateSheetData(data) {
  const key = getSheetKey(data.spreadsheetId, data.gid);
  const existing = state.sheets.get(key);
  
  // Check if data actually changed
  const hasChanged = !existing || 
    JSON.stringify(existing.data) !== JSON.stringify(data.data) ||
    JSON.stringify(existing.headers) !== JSON.stringify(data.headers);
  
  state.sheets.set(key, data);
  state.errors.delete(key);
  
  if (hasChanged) {
    notify('sheetData');
  }
}

/**
 * Sets loading state
 * @param {boolean} loading 
 */
export function setLoading(loading) {
  state.isLoading = loading;
  notify('isLoading');
}

/**
 * Sets error for a sheet
 * @param {string} spreadsheetId 
 * @param {string} gid 
 * @param {Error} error 
 */
export function setError(spreadsheetId, gid, error) {
  const key = getSheetKey(spreadsheetId, gid);
  state.errors.set(key, error);
  notify('errors');
}

/**
 * Clears error for a sheet
 * @param {string} spreadsheetId 
 * @param {string} gid 
 */
export function clearError(spreadsheetId, gid) {
  const key = getSheetKey(spreadsheetId, gid);
  state.errors.delete(key);
  notify('errors');
}

/**
 * Updates polling interval
 * @param {number} interval 
 */
export function setPollingInterval(interval) {
  state.pollingInterval = interval;
  saveSettings({ pollingInterval: interval });
  notify('pollingInterval');
}

/**
 * Updates theme
 * @param {'light'|'dark'} theme 
 */
export function setTheme(theme) {
  state.theme = theme;
  saveSettings({ theme });
  notify('theme');
}

/**
 * Checks if at least one sheet is configured
 * @returns {boolean}
 */
export function hasConfiguredSheets() {
  return state.configuredSheets.length > 0;
}

/**
 * Gets the first configured sheet
 * @returns {SheetConfig|undefined}
 */
export function getFirstSheet() {
  return state.configuredSheets[0];
}

/**
 * Gets cached data for a sheet
 * @param {string} spreadsheetId 
 * @param {string} gid 
 * @returns {SheetData|undefined}
 */
export function getSheetData(spreadsheetId, gid) {
  return state.sheets.get(getSheetKey(spreadsheetId, gid));
}

/**
 * Sets teams sheet configuration
 * @param {SheetConfig} config 
 */
export function setTeamsSheet(config) {
  state.teamsSheet = {
    ...config,
    addedAt: new Date().toISOString()
  };
  saveTeamsSheet(state.teamsSheet);
  notify('teamsSheet');
}

/**
 * Gets teams sheet configuration
 * @returns {SheetConfig|null}
 */
export function getTeamsSheet() {
  return state.teamsSheet;
}

/**
 * Updates cached teams data
 * @param {SheetData} data 
 */
export function updateTeamsData(data) {
  state.teamsData = data;
  notify('teamsData');
}

/**
 * Gets cached teams data
 * @returns {SheetData|null}
 */
export function getTeamsData() {
  return state.teamsData;
}

/**
 * Checks if teams sheet is configured
 * @returns {boolean}
 */
export function hasTeamsSheet() {
  return state.teamsSheet !== null;
}

/**
 * Sets active tab
 * @param {'players'|'teams'} tab 
 */
export function setActiveTab(tab) {
  state.activeTab = tab;
  notify('activeTab');
}

/**
 * Gets active tab
 * @returns {'players'|'teams'}
 */
export function getActiveTab() {
  return state.activeTab;
}


