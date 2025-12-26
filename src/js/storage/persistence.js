/**
 * localStorage persistence layer
 */

const STORAGE_KEYS = {
  CONFIGURED_SHEETS: 'overdraft_configured_sheets',
  SETTINGS: 'overdraft_settings'
};

const CURRENT_VERSION = 1;

/**
 * @typedef {Object} SheetConfig
 * @property {string} spreadsheetId
 * @property {string} gid
 * @property {string} [alias]
 * @property {string} addedAt - ISO date string
 */

/**
 * @typedef {Object} StoredSheets
 * @property {number} version
 * @property {SheetConfig[]} sheets
 */

/**
 * @typedef {Object} StoredSettings
 * @property {number} version
 * @property {number} pollingInterval
 * @property {'light'|'dark'} theme
 */

/**
 * Default settings
 * @returns {StoredSettings}
 */
function getDefaultSettings() {
  return {
    version: CURRENT_VERSION,
    pollingInterval: 1000,
    theme: 'dark'
  };
}

/**
 * Default sheets config
 * @returns {StoredSheets}
 */
function getDefaultSheets() {
  return {
    version: CURRENT_VERSION,
    sheets: []
  };
}

/**
 * Safely parses JSON from localStorage
 * @param {string} key 
 * @param {function(): T} defaultFactory 
 * @returns {T}
 * @template T
 */
function safeLoad(key, defaultFactory) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultFactory();
    
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaultFactory();
    
    return parsed;
  } catch {
    return defaultFactory();
  }
}

/**
 * Safely saves JSON to localStorage
 * @param {string} key 
 * @param {*} value 
 */
function safeSave(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error('[Persistence] Failed to save:', err);
  }
}

/**
 * Loads configured sheets from localStorage
 * @returns {SheetConfig[]}
 */
export function loadConfiguredSheets() {
  const stored = safeLoad(STORAGE_KEYS.CONFIGURED_SHEETS, getDefaultSheets);
  return stored.sheets || [];
}

/**
 * Saves configured sheets to localStorage
 * @param {SheetConfig[]} sheets 
 */
export function saveConfiguredSheets(sheets) {
  safeSave(STORAGE_KEYS.CONFIGURED_SHEETS, {
    version: CURRENT_VERSION,
    sheets
  });
}

/**
 * Loads settings from localStorage
 * @returns {StoredSettings}
 */
export function loadSettings() {
  return safeLoad(STORAGE_KEYS.SETTINGS, getDefaultSettings);
}

/**
 * Saves settings to localStorage
 * @param {Partial<StoredSettings>} settings 
 */
export function saveSettings(settings) {
  const current = loadSettings();
  safeSave(STORAGE_KEYS.SETTINGS, {
    ...current,
    ...settings,
    version: CURRENT_VERSION
  });
}

/**
 * Clears all stored data
 */
export function clearAll() {
  localStorage.removeItem(STORAGE_KEYS.CONFIGURED_SHEETS);
  localStorage.removeItem(STORAGE_KEYS.SETTINGS);
}


