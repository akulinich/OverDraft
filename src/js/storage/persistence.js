/**
 * localStorage persistence layer
 */

const STORAGE_KEYS = {
  CONFIGURED_SHEETS: 'overdraft_configured_sheets',
  TEAMS_SHEET: 'overdraft_teams_sheet',
  SETTINGS: 'overdraft_settings',
  COLUMN_MAPPINGS: 'overdraft_column_mappings',
  COLUMNS_CONFIG: 'overdraft_columns_config',
  TEAMS_LAYOUT: 'overdraft_teams_layout',
  TEAMS_DISPLAY_CONFIG: 'overdraft_teams_display_config',
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
 * @property {'light'|'dark'} theme
 */

/**
 * @typedef {Object} ColumnMapping
 * @property {string|null} nickname - Column name for player nickname
 * @property {string|null} role - Column name for player role
 * @property {string|null} rating - Column name for player rating
 * @property {string|null} heroes - Column name for player heroes
 * @deprecated Use ColumnsConfiguration instead
 */

/**
 * @typedef {Object} StoredColumnMappings
 * @property {number} version
 * @property {Object<string, ColumnMapping>} mappings - Keyed by sheetKey (spreadsheetId_gid)
 * @deprecated Use StoredColumnsConfig instead
 */

/**
 * Column type for rendering
 * @typedef {'name'|'role'|'rating'|'heroes'|'text'} ColumnType
 */

/**
 * Single column configuration
 * @typedef {Object} ColumnConfig
 * @property {string} id - Unique identifier (uuid)
 * @property {string} displayName - User-defined display name
 * @property {string} sheetColumn - Mapped column name from Google Sheet
 * @property {ColumnType} columnType - Type of data in this column
 * @property {number} order - Order in the table (0-based)
 */

/**
 * Complete columns configuration for a sheet
 * @typedef {Object} ColumnsConfiguration
 * @property {ColumnConfig[]} columns - Ordered array of column configurations
 */

/**
 * Stored columns configurations
 * @typedef {Object} StoredColumnsConfig
 * @property {number} version
 * @property {Object<string, ColumnsConfiguration>} configs - Keyed by sheetKey (spreadsheetId_gid)
 */

/**
 * Teams display column configuration
 * @typedef {Object} TeamsDisplayConfig
 * @property {string[]} visibleColumnIds - IDs of columns to show in team player rows
 */

/**
 * Stored teams display configurations
 * @typedef {Object} StoredTeamsDisplayConfig
 * @property {number} version
 * @property {Object<string, TeamsDisplayConfig>} configs - Keyed by sheetKey (spreadsheetId_gid)
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
 * @deprecated Use removeColumnsConfiguration instead
 */
export function removeColumnMapping(sheetKey) {
  const stored = safeLoad(STORAGE_KEYS.COLUMN_MAPPINGS, getDefaultColumnMappings);
  delete stored.mappings[sheetKey];
  safeSave(STORAGE_KEYS.COLUMN_MAPPINGS, stored);
}

// ============================================================================
// Dynamic Columns Configuration (new system)
// ============================================================================

/**
 * Generates a unique ID for column configuration
 * @returns {string}
 */
export function generateColumnId() {
  return `col_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Gets default columns config storage
 * @returns {StoredColumnsConfig}
 */
function getDefaultColumnsConfig() {
  return {
    version: CURRENT_VERSION,
    configs: {}
  };
}

/**
 * Creates default columns configuration with only the name column
 * @param {string} [nameColumnHeader] - Optional header name for name column
 * @returns {ColumnsConfiguration}
 */
export function createDefaultColumnsConfiguration(nameColumnHeader = null) {
  // Always include the mandatory name column
  return {
    columns: [{
      id: generateColumnId(),
      displayName: 'Имя',
      sheetColumn: nameColumnHeader || '', // Empty if not provided, user must select
      columnType: 'name',
      order: 0
    }]
  };
}

/**
 * Migrates legacy ColumnMapping to new ColumnsConfiguration format
 * @param {ColumnMapping} legacyMapping - Legacy column mapping
 * @returns {ColumnsConfiguration}
 */
export function migrateColumnMappingToConfig(legacyMapping) {
  const columns = [];
  let order = 0;
  
  // Name column is always first
  if (legacyMapping.nickname) {
    columns.push({
      id: generateColumnId(),
      displayName: 'Имя',
      sheetColumn: legacyMapping.nickname,
      columnType: 'name',
      order: order++
    });
  }
  
  // Role column
  if (legacyMapping.role) {
    columns.push({
      id: generateColumnId(),
      displayName: 'Роль',
      sheetColumn: legacyMapping.role,
      columnType: 'role',
      order: order++
    });
  }
  
  // Rating column
  if (legacyMapping.rating) {
    columns.push({
      id: generateColumnId(),
      displayName: 'Рейтинг',
      sheetColumn: legacyMapping.rating,
      columnType: 'rating',
      order: order++
    });
  }
  
  // Heroes column
  if (legacyMapping.heroes) {
    columns.push({
      id: generateColumnId(),
      displayName: 'Герои',
      sheetColumn: legacyMapping.heroes,
      columnType: 'heroes',
      order: order++
    });
  }
  
  return { columns };
}

/**
 * Loads columns configuration for a specific sheet
 * Migrates from legacy format if needed
 * @param {string} sheetKey - Key in format spreadsheetId_gid
 * @returns {ColumnsConfiguration|null}
 */
export function loadColumnsConfiguration(sheetKey) {
  // First try to load new format
  const stored = safeLoad(STORAGE_KEYS.COLUMNS_CONFIG, getDefaultColumnsConfig);
  if (stored.configs?.[sheetKey]) {
    return stored.configs[sheetKey];
  }
  
  // Try to migrate from legacy format
  const legacyMapping = loadColumnMapping(sheetKey);
  if (legacyMapping && (legacyMapping.nickname || legacyMapping.role || legacyMapping.rating || legacyMapping.heroes)) {
    const migrated = migrateColumnMappingToConfig(legacyMapping);
    // Save migrated config
    saveColumnsConfiguration(sheetKey, migrated);
    return migrated;
  }
  
  return null;
}

/**
 * Saves columns configuration for a specific sheet
 * @param {string} sheetKey - Key in format spreadsheetId_gid
 * @param {ColumnsConfiguration} config
 */
export function saveColumnsConfiguration(sheetKey, config) {
  const stored = safeLoad(STORAGE_KEYS.COLUMNS_CONFIG, getDefaultColumnsConfig);
  stored.configs[sheetKey] = config;
  stored.version = CURRENT_VERSION;
  safeSave(STORAGE_KEYS.COLUMNS_CONFIG, stored);
}

/**
 * Removes columns configuration for a specific sheet
 * @param {string} sheetKey - Key in format spreadsheetId_gid
 */
export function removeColumnsConfiguration(sheetKey) {
  const stored = safeLoad(STORAGE_KEYS.COLUMNS_CONFIG, getDefaultColumnsConfig);
  delete stored.configs[sheetKey];
  safeSave(STORAGE_KEYS.COLUMNS_CONFIG, stored);
}

/**
 * Validates a columns configuration
 * @param {ColumnsConfiguration} config
 * @returns {{valid: boolean, error?: string}}
 */
export function validateColumnsConfiguration(config) {
  if (!config || !Array.isArray(config.columns)) {
    return { valid: false, error: 'Invalid configuration structure' };
  }
  
  // Must have at least the name column
  const nameColumn = config.columns.find(c => c.columnType === 'name');
  if (!nameColumn) {
    return { valid: false, error: 'Name column is required' };
  }
  
  // Check for duplicate column IDs
  const ids = new Set();
  for (const col of config.columns) {
    if (ids.has(col.id)) {
      return { valid: false, error: `Duplicate column ID: ${col.id}` };
    }
    ids.add(col.id);
  }
  
  // Check all columns have required fields
  for (const col of config.columns) {
    if (!col.id || !col.displayName || !col.sheetColumn || !col.columnType) {
      return { valid: false, error: 'Column missing required fields' };
    }
  }
  
  return { valid: true };
}

/**
 * Gets a column by type from configuration
 * @param {ColumnsConfiguration} config
 * @param {ColumnType} columnType
 * @returns {ColumnConfig|null}
 */
export function getColumnByType(config, columnType) {
  return config?.columns?.find(c => c.columnType === columnType) || null;
}

/**
 * Gets ordered columns (sorted by order field)
 * @param {ColumnsConfiguration} config
 * @returns {ColumnConfig[]}
 */
export function getOrderedColumns(config) {
  if (!config?.columns) return [];
  return [...config.columns].sort((a, b) => a.order - b.order);
}

// ============================================================================
// Teams Display Configuration
// ============================================================================

/**
 * Gets default teams display config storage
 * @returns {StoredTeamsDisplayConfig}
 */
function getDefaultTeamsDisplayConfig() {
  return {
    version: CURRENT_VERSION,
    configs: {}
  };
}

/**
 * Loads teams display configuration for a specific sheet
 * @param {string} sheetKey - Key in format spreadsheetId_gid
 * @returns {TeamsDisplayConfig|null}
 */
export function loadTeamsDisplayConfig(sheetKey) {
  const stored = safeLoad(STORAGE_KEYS.TEAMS_DISPLAY_CONFIG, getDefaultTeamsDisplayConfig);
  return stored.configs?.[sheetKey] || null;
}

/**
 * Saves teams display configuration for a specific sheet
 * @param {string} sheetKey - Key in format spreadsheetId_gid
 * @param {TeamsDisplayConfig} config
 */
export function saveTeamsDisplayConfig(sheetKey, config) {
  const stored = safeLoad(STORAGE_KEYS.TEAMS_DISPLAY_CONFIG, getDefaultTeamsDisplayConfig);
  stored.configs[sheetKey] = config;
  stored.version = CURRENT_VERSION;
  safeSave(STORAGE_KEYS.TEAMS_DISPLAY_CONFIG, stored);
}

/**
 * Removes teams display configuration for a specific sheet
 * @param {string} sheetKey - Key in format spreadsheetId_gid
 */
export function removeTeamsDisplayConfig(sheetKey) {
  const stored = safeLoad(STORAGE_KEYS.TEAMS_DISPLAY_CONFIG, getDefaultTeamsDisplayConfig);
  delete stored.configs[sheetKey];
  safeSave(STORAGE_KEYS.TEAMS_DISPLAY_CONFIG, stored);
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
  localStorage.removeItem(STORAGE_KEYS.COLUMNS_CONFIG);
  localStorage.removeItem(STORAGE_KEYS.TEAMS_LAYOUT);
  localStorage.removeItem(STORAGE_KEYS.TEAMS_DISPLAY_CONFIG);
  localStorage.removeItem(STORAGE_KEYS.LOCAL_CSV_DATA);
  localStorage.removeItem(STORAGE_KEYS.LANGUAGE);
}


