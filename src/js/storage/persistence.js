/**
 * localStorage persistence layer
 */

const STORAGE_KEYS = {
  CONFIGURED_SHEETS: 'overdraft_configured_sheets',
  TEAMS_SHEET: 'overdraft_teams_sheet',
  SETTINGS: 'overdraft_settings',
  COLUMN_MAPPINGS: 'overdraft_column_mappings',
  TEAMS_LAYOUT: 'overdraft_teams_layout',
  LOCAL_CSV_DATA: 'overdraft_local_csv_data',
  LANGUAGE: 'overdraft_language'
};

const CURRENT_VERSION = 1;

/**
 * @typedef {Object} SheetConfig
 * @property {'google'|'local'} sourceType - Data source type (defaults to 'google' for backwards compatibility)
 * @property {string} spreadsheetId - For google: spreadsheet ID, for local: 'local'
 * @property {string} gid - For google: sheet tab ID, for local: file name
 * @property {string} [alias] - User-defined name
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
 * @typedef {Object} TeamsLayoutConfig
 * @property {number} startRow - Initial row offset from top (default: 0)
 * @property {number} startCol - Initial column offset from left (default: 0)
 * @property {number} teamsPerRow - Number of teams horizontally (default: 3)
 * @property {number} columnsPerTeam - Data columns per team (default: 4)
 * @property {number} separatorColumns - Empty columns between teams (default: 1)
 * @property {number} rowsBetweenBlocks - Empty rows between team blocks (default: 1)
 * @property {number} playersPerTeam - Players in each team (default: 5)
 * @property {number} headerRows - Header rows per team block (name + number) (default: 2)
 */

/**
 * @typedef {Object} StoredTeamsLayout
 * @property {number} version
 * @property {Object<string, TeamsLayoutConfig>} layouts - Keyed by sheetKey (spreadsheetId_gid)
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
 * Gets default teams layout storage
 * @returns {StoredTeamsLayout}
 */
function getDefaultTeamsLayout() {
  return {
    version: CURRENT_VERSION,
    layouts: {}
  };
}

/**
 * Gets default teams layout config
 * @returns {TeamsLayoutConfig}
 */
export function getDefaultTeamsLayoutConfig() {
  return {
    startRow: 0,
    startCol: 0,
    teamsPerRow: 3,
    columnsPerTeam: 4,
    separatorColumns: 1,
    rowsBetweenBlocks: 1,
    playersPerTeam: 5,
    headerRows: 2
  };
}

/**
 * Loads teams layout config for a specific sheet
 * @param {string} sheetKey - Key in format spreadsheetId_gid
 * @returns {TeamsLayoutConfig|null}
 */
export function loadTeamsLayoutConfig(sheetKey) {
  const stored = safeLoad(STORAGE_KEYS.TEAMS_LAYOUT, getDefaultTeamsLayout);
  return stored.layouts?.[sheetKey] || null;
}

/**
 * Saves teams layout config for a specific sheet
 * @param {string} sheetKey - Key in format spreadsheetId_gid
 * @param {TeamsLayoutConfig} config
 */
export function saveTeamsLayoutConfig(sheetKey, config) {
  const stored = safeLoad(STORAGE_KEYS.TEAMS_LAYOUT, getDefaultTeamsLayout);
  stored.layouts[sheetKey] = config;
  stored.version = CURRENT_VERSION;
  safeSave(STORAGE_KEYS.TEAMS_LAYOUT, stored);
}

/**
 * Removes teams layout config for a specific sheet
 * @param {string} sheetKey - Key in format spreadsheetId_gid
 */
export function removeTeamsLayoutConfig(sheetKey) {
  const stored = safeLoad(STORAGE_KEYS.TEAMS_LAYOUT, getDefaultTeamsLayout);
  delete stored.layouts[sheetKey];
  safeSave(STORAGE_KEYS.TEAMS_LAYOUT, stored);
}

/**
 * @typedef {Object} StoredLocalCSV
 * @property {number} version
 * @property {Object<string, string>} files - Keyed by filename, value is base64-encoded CSV
 */

/**
 * Gets default local CSV storage
 * @returns {StoredLocalCSV}
 */
function getDefaultLocalCSV() {
  return {
    version: CURRENT_VERSION,
    files: {}
  };
}

/**
 * Saves local CSV data to localStorage
 * @param {string} fileName - File name (used as key)
 * @param {string} base64Data - Base64-encoded CSV content
 */
export function saveLocalCSVData(fileName, base64Data) {
  const stored = safeLoad(STORAGE_KEYS.LOCAL_CSV_DATA, getDefaultLocalCSV);
  stored.files[fileName] = base64Data;
  stored.version = CURRENT_VERSION;
  safeSave(STORAGE_KEYS.LOCAL_CSV_DATA, stored);
}

/**
 * Loads local CSV data from localStorage
 * @param {string} fileName - File name (key)
 * @returns {string|null} Base64-encoded CSV content or null if not found
 */
export function loadLocalCSVData(fileName) {
  const stored = safeLoad(STORAGE_KEYS.LOCAL_CSV_DATA, getDefaultLocalCSV);
  return stored.files?.[fileName] || null;
}

/**
 * Removes local CSV data from localStorage
 * @param {string} fileName - File name (key)
 */
export function removeLocalCSVData(fileName) {
  const stored = safeLoad(STORAGE_KEYS.LOCAL_CSV_DATA, getDefaultLocalCSV);
  delete stored.files[fileName];
  safeSave(STORAGE_KEYS.LOCAL_CSV_DATA, stored);
}

/**
 * Loads language preference from localStorage
 * @returns {'ru'|'en'|null}
 */
export function loadLanguage() {
  try {
    const lang = localStorage.getItem(STORAGE_KEYS.LANGUAGE);
    if (lang === 'ru' || lang === 'en') {
      return lang;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Saves language preference to localStorage
 * @param {'ru'|'en'} lang
 */
export function saveLanguage(lang) {
  try {
    localStorage.setItem(STORAGE_KEYS.LANGUAGE, lang);
  } catch (err) {
    console.error('[Persistence] Failed to save language:', err);
  }
}

/**
 * Clears all stored data
 */
export function clearAll() {
  localStorage.removeItem(STORAGE_KEYS.CONFIGURED_SHEETS);
  localStorage.removeItem(STORAGE_KEYS.TEAMS_SHEET);
  localStorage.removeItem(STORAGE_KEYS.SETTINGS);
  localStorage.removeItem(STORAGE_KEYS.COLUMN_MAPPINGS);
  localStorage.removeItem(STORAGE_KEYS.TEAMS_LAYOUT);
  localStorage.removeItem(STORAGE_KEYS.LOCAL_CSV_DATA);
  localStorage.removeItem(STORAGE_KEYS.LANGUAGE);
}


