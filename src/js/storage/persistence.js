/**
 * localStorage persistence layer
 */

const STORAGE_KEYS = {
  CONFIGURED_SHEETS: 'overdraft_configured_sheets',
  TEAMS_SHEET: 'overdraft_teams_sheet',
  SETTINGS: 'overdraft_settings',
  COLUMN_MAPPINGS: 'overdraft_column_mappings'
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
 * @typedef {Object} ColumnMapping
 * @property {string|null} nickname - Column name for player nickname
 * @property {string|null} role - Column name for player role
 * @property {string|null} rating - Column name for player rating
 * @property {string|null} heroes - Column name for player heroes
 */

/**
 * @typedef {Object} StoredColumnMappings
 * @property {number} version
 * @property {Object<string, ColumnMapping>} mappings - Keyed by sheetKey (spreadsheetId_gid)
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
 * Loads teams sheet config from localStorage
 * @returns {SheetConfig|null}
 */
export function loadTeamsSheet() {
  const stored = safeLoad(STORAGE_KEYS.TEAMS_SHEET, () => null);
  return stored;
}

/**
 * Saves teams sheet config to localStorage
 * @param {SheetConfig|null} sheet 
 */
export function saveTeamsSheet(sheet) {
  if (sheet) {
    safeSave(STORAGE_KEYS.TEAMS_SHEET, sheet);
  } else {
    localStorage.removeItem(STORAGE_KEYS.TEAMS_SHEET);
  }
}

/**
 * Gets default column mappings storage
 * @returns {StoredColumnMappings}
 */
function getDefaultColumnMappings() {
  return {
    version: CURRENT_VERSION,
    mappings: {}
  };
}

/**
 * Loads column mapping for a specific sheet
 * @param {string} sheetKey - Key in format spreadsheetId_gid
 * @returns {ColumnMapping|null}
 */
export function loadColumnMapping(sheetKey) {
  const stored = safeLoad(STORAGE_KEYS.COLUMN_MAPPINGS, getDefaultColumnMappings);
  return stored.mappings?.[sheetKey] || null;
}

/**
 * Saves column mapping for a specific sheet
 * @param {string} sheetKey - Key in format spreadsheetId_gid
 * @param {ColumnMapping} mapping
 */
export function saveColumnMapping(sheetKey, mapping) {
  const stored = safeLoad(STORAGE_KEYS.COLUMN_MAPPINGS, getDefaultColumnMappings);
  stored.mappings[sheetKey] = mapping;
  stored.version = CURRENT_VERSION;
  safeSave(STORAGE_KEYS.COLUMN_MAPPINGS, stored);
}

/**
 * Removes column mapping for a specific sheet
 * @param {string} sheetKey - Key in format spreadsheetId_gid
 */
export function removeColumnMapping(sheetKey) {
  const stored = safeLoad(STORAGE_KEYS.COLUMN_MAPPINGS, getDefaultColumnMappings);
  delete stored.mappings[sheetKey];
  safeSave(STORAGE_KEYS.COLUMN_MAPPINGS, stored);
}

/**
 * Clears all stored data
 */
export function clearAll() {
  localStorage.removeItem(STORAGE_KEYS.CONFIGURED_SHEETS);
  localStorage.removeItem(STORAGE_KEYS.TEAMS_SHEET);
  localStorage.removeItem(STORAGE_KEYS.SETTINGS);
  localStorage.removeItem(STORAGE_KEYS.COLUMN_MAPPINGS);
}


