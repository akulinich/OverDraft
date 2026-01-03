/**
 * In-memory state management
 */

import { 
  loadConfiguredSheets, 
  loadSettings, 
  loadTeamsSheet, 
  saveConfiguredSheets, 
  saveSettings, 
  saveTeamsSheet, 
  loadColumnMapping, 
  saveColumnMapping, 
  loadLocalCSVData, 
  saveLocalCSVData, 
  removeLocalCSVData,
  loadColumnsConfiguration,
  saveColumnsConfiguration,
  removeColumnsConfiguration,
  loadTeamsDisplayConfig,
  saveTeamsDisplayConfig,
  removeTeamsDisplayConfig,
  generateColumnId,
  getOrderedColumns,
  getColumnByType
} from '../storage/persistence.js';
import { getSheetKey } from '../utils/parser.js';

/**
 * @typedef {import('../storage/persistence.js').ColumnMapping} ColumnMapping
 * @typedef {import('../storage/persistence.js').ColumnConfig} ColumnConfig
 * @typedef {import('../storage/persistence.js').ColumnsConfiguration} ColumnsConfiguration
 * @typedef {import('../storage/persistence.js').ColumnType} ColumnType
 * @typedef {import('../storage/persistence.js').TeamsDisplayConfig} TeamsDisplayConfig
 */

/**
 * @typedef {Object} ColumnValidationError
 * @property {string} column - Column key (e.g. 'rating')
 * @property {string} message - Error description
 */

/**
 * @typedef {Object} ColumnValidationResult
 * @property {boolean} valid - True if all required columns are mapped and valid
 * @property {string[]} missing - Keys of missing columns
 * @property {ColumnMapping} detected - Auto-detected mapping
 * @property {ColumnValidationError[]} errors - Data validation errors
 */

/**
 * @typedef {import('../api/sheets.js').SheetData} SheetData
 * @typedef {import('../storage/persistence.js').SheetConfig} SheetConfig
 * @typedef {import('../validation/schema.js').Team} Team
 * @typedef {import('../validation/schema.js').TeamPlayer} TeamPlayer
 */

/**
 * @typedef {Object} Player
 * @property {string} nickname - Player nickname (Discord or display name)
 * @property {string} battleTag - Player BattleTag (if available)
 * @property {'tank'|'dps'|'support'} role - Player role
 * @property {number} rating - Player rating
 * @property {string} heroes - Player heroes (comma-separated)
 * @property {string[]} rawRow - Original row data from sheet
 */

/**
 * @typedef {Object} FilterState
 * @property {boolean} availableOnly - Show only players not assigned to any team
 * @property {'tank'|'dps'|'support'|null} role - Filter by role, null = all roles
 */

/**
 * @typedef {Object} SortState
 * @property {string|null} columnId - Column ID to sort by, null = no sorting
 * @property {'asc'|'desc'} direction - Sort direction
 */

/**
 * @typedef {Object} AppState
 * @property {Map<string, SheetData>} sheets - Cached sheet data
 * @property {SheetConfig[]} configuredSheets - User-configured sheets
 * @property {SheetConfig|null} teamsSheet - Teams sheet configuration
 * @property {SheetData|null} teamsData - Cached teams sheet data
 * @property {Map<string, Player>} parsedPlayers - Parsed players by nickname
 * @property {Team|null} selectedTeam - Currently selected team for draft view
 * @property {Player|null} selectedPlayer - Currently selected player for details
 * @property {boolean} isLoading
 * @property {Map<string, Error>} errors
 * @property {'light'|'dark'} theme
 * @property {import('../storage/persistence.js').TableDensity} tableDensity - Table row density
 * @property {'players'|'teams'|'draft'} activeTab - Currently active tab
 * @property {boolean} overfastLoaded - Whether OverFast API data is loaded
 * @property {boolean} overfastLoading - Whether OverFast API data is currently loading
 * @property {FilterState} filters - Player list filters
 * @property {SortState} sort - Table sort state
 * @property {Map<string, ColumnMapping>} columnMappings - Column mappings by sheet key (deprecated)
 * @property {Map<string, ColumnsConfiguration>} columnsConfigs - Dynamic column configurations by sheet key
 * @property {Map<string, TeamsDisplayConfig>} teamsDisplayConfigs - Teams display configs by sheet key
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
  parsedPlayers: new Map(),
  selectedTeam: null,
  selectedPlayer: null,
  isLoading: false,
  errors: new Map(),
  theme: 'dark',
  tableDensity: 'comfortable',
  activeTab: 'players',
  overfastLoaded: false,
  overfastLoading: false,
  filters: {
    availableOnly: false,
    role: null
  },
  sort: {
    columnId: null,
    direction: 'desc'
  },
  columnMappings: new Map(),
  columnsConfigs: new Map(),
  teamsDisplayConfigs: new Map()
};

/** Column header patterns for player data parsing */
const HEADER_PATTERNS = {
  nickname: /^(ник|никнейм|nickname|nick|имя|name|игрок|player)/i,
  battleTag: /^(battletag|battle.?tag|тег|btag)/i,
  role: /^(роль|role)/i,
  rating: /^(рейтинг|rating|sr|ранг|rank)/i,
  heroes: /^(герои|heroes|hero|персонажи|characters)/i
};

/** Required columns for player data */
export const REQUIRED_COLUMNS = ['nickname', 'role', 'rating', 'heroes'];

/** Human-readable labels for required columns */
export const REQUIRED_COLUMN_LABELS = {
  nickname: 'Ник игрока',
  role: 'Роль',
  rating: 'Рейтинг',
  heroes: 'Герои'
};

/** Role normalization patterns */
const ROLE_PATTERNS = {
  tank: /^(танк|tanks?)/i,
  dps: /^(дпс|дд|dd|dps|damage|дамаг)/i,
  support: /^(сапп?ы?|суппорт|support|heal|хил)/i
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
    theme: settings.theme,
    tableDensity: settings.tableDensity || 'comfortable'
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
 * Only clears column configurations for sheets that are different from the new one
 * @param {SheetConfig} config 
 */
export function replaceSheet(config) {
  const newKey = getSheetKey(config.spreadsheetId, config.gid);
  
  // Clear old columns configuration only for sheets that are different from the new one
  for (const oldSheet of state.configuredSheets) {
    const oldKey = getSheetKey(oldSheet.spreadsheetId, oldSheet.gid);
    // Only clear if it's a different sheet
    if (oldKey !== newKey) {
      state.columnsConfigs.delete(oldKey);
      state.teamsDisplayConfigs.delete(oldKey);
      removeColumnsConfiguration(oldKey);
      removeTeamsDisplayConfig(oldKey);
    }
  }
  
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
 * Normalizes role string to standard format
 * @param {string} role
 * @returns {'tank'|'dps'|'support'|null}
 */
function normalizeRole(role) {
  if (!role || typeof role !== 'string') return null;
  const trimmed = role.trim();
  if (ROLE_PATTERNS.tank.test(trimmed)) return 'tank';
  if (ROLE_PATTERNS.dps.test(trimmed)) return 'dps';
  if (ROLE_PATTERNS.support.test(trimmed)) return 'support';
  return null;
}

/**
 * Finds column index by header pattern
 * @param {string[]} headers
 * @param {RegExp} pattern
 * @returns {number} -1 if not found
 */
function findColumnIndex(headers, pattern) {
  return headers.findIndex(h => pattern.test(h.trim()));
}

/**
 * Parses players from sheet data
 * @param {string[]} headers
 * @param {string[][]} data
 * @returns {Map<string, Player>}
 */
function parsePlayersFromSheet(headers, data) {
  const players = new Map();
  
  const nicknameIdx = findColumnIndex(headers, HEADER_PATTERNS.nickname);
  const battleTagIdx = findColumnIndex(headers, HEADER_PATTERNS.battleTag);
  const roleIdx = findColumnIndex(headers, HEADER_PATTERNS.role);
  const ratingIdx = findColumnIndex(headers, HEADER_PATTERNS.rating);
  const heroesIdx = findColumnIndex(headers, HEADER_PATTERNS.heroes);
  
  if (nicknameIdx === -1 && battleTagIdx === -1) {
    console.warn('[Store] Could not find nickname or battletag column in player sheet');
    return players;
  }
  
  for (const row of data) {
    const nickname = nicknameIdx >= 0 ? row[nicknameIdx]?.trim() : '';
    const battleTag = battleTagIdx >= 0 ? row[battleTagIdx]?.trim() : '';
    
    // Need at least one identifier
    if (!nickname && !battleTag) continue;
    
    const roleStr = roleIdx >= 0 ? row[roleIdx]?.trim() : '';
    const role = normalizeRole(roleStr) || 'dps';
    
    const ratingStr = ratingIdx >= 0 ? row[ratingIdx]?.trim() : '0';
    const rating = parseInt(ratingStr, 10) || 0;
    
    const heroes = heroesIdx >= 0 ? row[heroesIdx]?.trim() || '' : '';
    
    const player = {
      nickname: nickname || battleTag,
      battleTag,
      role,
      rating,
      heroes,
      rawRow: row
    };
    
    // Store by nickname (primary key)
    if (nickname) {
      players.set(nickname.toLowerCase(), player);
    }
    
    // Also store by battleTag for lookup (if different from nickname)
    if (battleTag && battleTag.toLowerCase() !== nickname.toLowerCase()) {
      players.set(battleTag.toLowerCase(), player);
    }
  }
  
  return players;
}

// ============================================================================
// Column Mapping Functions
// ============================================================================

/**
 * Auto-detects column mapping from headers using patterns
 * @param {string[]} headers
 * @returns {ColumnMapping}
 */
export function detectColumnMapping(headers) {
  /** @type {ColumnMapping} */
  const mapping = {
    nickname: null,
    role: null,
    rating: null,
    heroes: null
  };
  
  for (const key of REQUIRED_COLUMNS) {
    const pattern = HEADER_PATTERNS[key];
    if (pattern) {
      const index = headers.findIndex(h => pattern.test(h.trim()));
      if (index !== -1) {
        mapping[key] = headers[index];
      }
    }
  }
  
  return mapping;
}

/**
 * Validates that a column contains mostly numeric data
 * @param {string[][]} data - Sheet data rows
 * @param {number} columnIndex - Index of the column to validate
 * @returns {boolean} True if at least 50% of non-empty values are numbers
 */
export function validateRatingColumn(data, columnIndex) {
  if (columnIndex < 0) return false;
  
  let numericCount = 0;
  let nonEmptyCount = 0;
  
  for (const row of data) {
    const value = row[columnIndex]?.trim();
    if (!value) continue;
    
    nonEmptyCount++;
    const num = parseFloat(value);
    if (!isNaN(num)) {
      numericCount++;
    }
  }
  
  // If no data, consider it valid (will fail on missing column check)
  if (nonEmptyCount === 0) return true;
  
  // At least 50% of non-empty values should be numeric
  return (numericCount / nonEmptyCount) >= 0.5;
}

/**
 * Validates required columns are present and data is valid
 * @param {string[]} headers - Column headers from sheet
 * @param {string[][]} data - Sheet data rows
 * @param {ColumnMapping} [existingMapping] - Existing mapping to validate
 * @returns {ColumnValidationResult}
 */
export function validateRequiredColumns(headers, data, existingMapping) {
  const detected = detectColumnMapping(headers);
  const mapping = existingMapping || detected;
  
  /** @type {string[]} */
  const missing = [];
  /** @type {ColumnValidationError[]} */
  const errors = [];
  
  // Check each required column
  for (const key of REQUIRED_COLUMNS) {
    const columnName = mapping[key];
    
    if (!columnName) {
      missing.push(key);
      continue;
    }
    
    // Check if column still exists in headers
    const columnIndex = headers.indexOf(columnName);
    if (columnIndex === -1) {
      missing.push(key);
      continue;
    }
    
    // Special validation for rating column
    if (key === 'rating') {
      if (!validateRatingColumn(data, columnIndex)) {
        errors.push({
          column: 'rating',
          message: `Колонка "${columnName}" не содержит числовых данных`
        });
      }
    }
  }
  
  return {
    valid: missing.length === 0 && errors.length === 0,
    missing,
    detected,
    errors
  };
}

/**
 * Gets column mapping for a sheet
 * @param {string} sheetKey
 * @returns {ColumnMapping|null}
 */
export function getColumnMapping(sheetKey) {
  return state.columnMappings.get(sheetKey) || loadColumnMapping(sheetKey);
}

/**
 * Sets and saves column mapping for a sheet
 * @param {string} sheetKey
 * @param {ColumnMapping} mapping
 * @deprecated Use setColumnsConfiguration instead
 */
export function setColumnMapping(sheetKey, mapping) {
  state.columnMappings.set(sheetKey, mapping);
  saveColumnMapping(sheetKey, mapping);
  notify('columnMappings');
}

// ============================================================================
// Dynamic Columns Configuration (new system)
// ============================================================================

/**
 * Gets columns configuration for a sheet
 * @param {string} sheetKey
 * @returns {ColumnsConfiguration|null}
 */
export function getColumnsConfiguration(sheetKey) {
  return state.columnsConfigs.get(sheetKey) || loadColumnsConfiguration(sheetKey);
}

/**
 * Sets and saves columns configuration for a sheet
 * @param {string} sheetKey
 * @param {ColumnsConfiguration} config
 */
export function setColumnsConfiguration(sheetKey, config) {
  state.columnsConfigs.set(sheetKey, config);
  saveColumnsConfiguration(sheetKey, config);
  notify('columnsConfigs');
}

/**
 * Creates a new column configuration
 * @param {string} displayName
 * @param {string} sheetColumn
 * @param {ColumnType} columnType
 * @param {number} order
 * @returns {ColumnConfig}
 */
export function createColumnConfig(displayName, sheetColumn, columnType, order) {
  return {
    id: generateColumnId(),
    displayName,
    sheetColumn,
    columnType,
    order
  };
}

/**
 * Adds a column to an existing configuration
 * @param {string} sheetKey
 * @param {ColumnConfig} column
 */
export function addColumnToConfiguration(sheetKey, column) {
  const config = getColumnsConfiguration(sheetKey) || { columns: [] };
  config.columns.push(column);
  setColumnsConfiguration(sheetKey, config);
}

/**
 * Removes a column from configuration by ID
 * @param {string} sheetKey
 * @param {string} columnId
 */
export function removeColumnFromConfiguration(sheetKey, columnId) {
  const config = getColumnsConfiguration(sheetKey);
  if (!config) return;
  
  // Don't allow removing the name column
  const column = config.columns.find(c => c.id === columnId);
  if (column?.columnType === 'name') {
    console.warn('[Store] Cannot remove name column');
    return;
  }
  
  config.columns = config.columns.filter(c => c.id !== columnId);
  // Re-order remaining columns
  config.columns.forEach((c, i) => c.order = i);
  setColumnsConfiguration(sheetKey, config);
}

/**
 * Updates a column in the configuration
 * @param {string} sheetKey
 * @param {string} columnId
 * @param {Partial<ColumnConfig>} updates
 */
export function updateColumnInConfiguration(sheetKey, columnId, updates) {
  const config = getColumnsConfiguration(sheetKey);
  if (!config) return;
  
  const column = config.columns.find(c => c.id === columnId);
  if (!column) return;
  
  // Don't allow changing name column type
  if (column.columnType === 'name' && updates.columnType && updates.columnType !== 'name') {
    console.warn('[Store] Cannot change name column type');
    return;
  }
  
  Object.assign(column, updates);
  setColumnsConfiguration(sheetKey, config);
}

/**
 * Reorders columns in the configuration
 * @param {string} sheetKey
 * @param {string[]} orderedIds - Column IDs in new order
 */
export function reorderColumns(sheetKey, orderedIds) {
  const config = getColumnsConfiguration(sheetKey);
  if (!config) return;
  
  // Create a map of columns by ID
  const columnsById = new Map(config.columns.map(c => [c.id, c]));
  
  // Rebuild columns array in new order
  const reordered = [];
  orderedIds.forEach((id, index) => {
    const column = columnsById.get(id);
    if (column) {
      column.order = index;
      reordered.push(column);
    }
  });
  
  // Add any columns that weren't in orderedIds (shouldn't happen, but safety)
  config.columns.forEach(c => {
    if (!orderedIds.includes(c.id)) {
      c.order = reordered.length;
      reordered.push(c);
    }
  });
  
  config.columns = reordered;
  setColumnsConfiguration(sheetKey, config);
}

/**
 * Gets ordered columns for a sheet
 * @param {string} sheetKey
 * @returns {ColumnConfig[]}
 */
export function getOrderedColumnsForSheet(sheetKey) {
  const config = getColumnsConfiguration(sheetKey);
  return config ? getOrderedColumns(config) : [];
}

/**
 * Gets the name column for a sheet
 * @param {string} sheetKey
 * @returns {ColumnConfig|null}
 */
export function getNameColumn(sheetKey) {
  const config = getColumnsConfiguration(sheetKey);
  return config ? getColumnByType(config, 'name') : null;
}

/**
 * Checks if there are any role columns configured for a sheet
 * @param {string} sheetKey
 * @returns {boolean}
 */
export function hasRoleColumns(sheetKey) {
  const config = getColumnsConfiguration(sheetKey);
  if (!config) return false;
  return config.columns.some(c => c.columnType === 'role' && c.sheetColumn);
}

// ============================================================================
// Teams Display Configuration
// ============================================================================

/**
 * Gets teams display configuration for a sheet
 * @param {string} sheetKey
 * @returns {TeamsDisplayConfig|null}
 */
export function getTeamsDisplayConfiguration(sheetKey) {
  return state.teamsDisplayConfigs.get(sheetKey) || loadTeamsDisplayConfig(sheetKey);
}

/**
 * Sets and saves teams display configuration for a sheet
 * @param {string} sheetKey
 * @param {TeamsDisplayConfig} config
 */
export function setTeamsDisplayConfiguration(sheetKey, config) {
  state.teamsDisplayConfigs.set(sheetKey, config);
  saveTeamsDisplayConfig(sheetKey, config);
  notify('teamsDisplayConfigs');
}

/**
 * Gets column index from mapping
 * @param {string[]} headers
 * @param {ColumnMapping} mapping
 * @param {string} columnKey
 * @returns {number} -1 if not found
 */
function getColumnIndexFromMapping(headers, mapping, columnKey) {
  const columnName = mapping[columnKey];
  if (!columnName) return -1;
  return headers.indexOf(columnName);
}

/**
 * Parses players from sheet data using column mapping
 * @param {string[]} headers
 * @param {string[][]} data
 * @param {ColumnMapping} [mapping] - Optional mapping, auto-detects if not provided
 * @returns {Map<string, Player>}
 * @deprecated Use parsePlayersWithColumnsConfig instead
 */
function parsePlayersFromSheetWithMapping(headers, data, mapping) {
  const players = new Map();
  const effectiveMapping = mapping || detectColumnMapping(headers);
  
  const nicknameIdx = getColumnIndexFromMapping(headers, effectiveMapping, 'nickname');
  const battleTagIdx = findColumnIndex(headers, HEADER_PATTERNS.battleTag);
  const roleIdx = getColumnIndexFromMapping(headers, effectiveMapping, 'role');
  const ratingIdx = getColumnIndexFromMapping(headers, effectiveMapping, 'rating');
  const heroesIdx = getColumnIndexFromMapping(headers, effectiveMapping, 'heroes');
  
  if (nicknameIdx === -1 && battleTagIdx === -1) {
    console.warn('[Store] Could not find nickname or battletag column in player sheet');
    return players;
  }
  
  for (const row of data) {
    const nickname = nicknameIdx >= 0 ? row[nicknameIdx]?.trim() : '';
    const battleTag = battleTagIdx >= 0 ? row[battleTagIdx]?.trim() : '';
    
    // Need at least one identifier
    if (!nickname && !battleTag) continue;
    
    const roleStr = roleIdx >= 0 ? row[roleIdx]?.trim() : '';
    const role = normalizeRole(roleStr) || 'dps';
    
    const ratingStr = ratingIdx >= 0 ? row[ratingIdx]?.trim() : '0';
    const rating = parseInt(ratingStr, 10) || 0;
    
    const heroes = heroesIdx >= 0 ? row[heroesIdx]?.trim() || '' : '';
    
    const player = {
      nickname: nickname || battleTag,
      battleTag,
      role,
      rating,
      heroes,
      rawRow: row
    };
    
    // Store by nickname (primary key)
    if (nickname) {
      players.set(nickname.toLowerCase(), player);
    }
    
    // Also store by battleTag for lookup (if different from nickname)
    if (battleTag && battleTag.toLowerCase() !== nickname.toLowerCase()) {
      players.set(battleTag.toLowerCase(), player);
    }
  }
  
  return players;
}

/**
 * Parses players from sheet data using ColumnsConfiguration
 * @param {string[]} headers
 * @param {string[][]} data
 * @param {ColumnsConfiguration} config
 * @returns {Map<string, Player>}
 */
function parsePlayersWithColumnsConfig(headers, data, config) {
  const players = new Map();
  
  // Get column indices from config
  const orderedColumns = getOrderedColumns(config);
  
  // Find special columns
  const nameColumn = orderedColumns.find(c => c.columnType === 'name');
  const roleColumns = orderedColumns.filter(c => c.columnType === 'role'); // ALL role columns
  const ratingColumn = orderedColumns.find(c => c.columnType === 'rating');
  const heroesColumn = orderedColumns.find(c => c.columnType === 'heroes');
  
  const nicknameIdx = nameColumn ? headers.indexOf(nameColumn.sheetColumn) : -1;
  const battleTagIdx = findColumnIndex(headers, HEADER_PATTERNS.battleTag);
  const roleIndices = roleColumns.map(c => headers.indexOf(c.sheetColumn)).filter(idx => idx !== -1);
  const ratingIdx = ratingColumn ? headers.indexOf(ratingColumn.sheetColumn) : -1;
  const heroesIdx = heroesColumn ? headers.indexOf(heroesColumn.sheetColumn) : -1;
  
  if (nicknameIdx === -1 && battleTagIdx === -1) {
    console.warn('[Store] Could not find nickname or battletag column in player sheet');
    return players;
  }
  
  for (const row of data) {
    const nickname = nicknameIdx >= 0 ? row[nicknameIdx]?.trim() : '';
    const battleTag = battleTagIdx >= 0 ? row[battleTagIdx]?.trim() : '';
    
    // Need at least one identifier
    if (!nickname && !battleTag) continue;
    
    // Collect all roles from all role columns
    const roles = [];
    for (const roleIdx of roleIndices) {
      const roleStr = row[roleIdx]?.trim();
      const normalizedRole = normalizeRole(roleStr);
      if (normalizedRole && !roles.includes(normalizedRole)) {
        roles.push(normalizedRole);
      }
    }
    
    // Primary role is the first one, or 'dps' if none
    const role = roles[0] || 'dps';
    
    const ratingStr = ratingIdx >= 0 ? row[ratingIdx]?.trim() : '0';
    const rating = parseInt(ratingStr, 10) || 0;
    
    const heroes = heroesIdx >= 0 ? row[heroesIdx]?.trim() || '' : '';
    
    const player = {
      nickname: nickname || battleTag,
      battleTag,
      role,
      roles, // Array of all roles from all role columns
      rating,
      heroes,
      rawRow: row
    };
    
    // Store by nickname (primary key)
    if (nickname) {
      players.set(nickname.toLowerCase(), player);
    }
    
    // Also store by battleTag for lookup (if different from nickname)
    if (battleTag && battleTag.toLowerCase() !== nickname.toLowerCase()) {
      players.set(battleTag.toLowerCase(), player);
    }
  }
  
  return players;
}

/**
 * Updates cached sheet data
 * @param {SheetData} data 
 * @param {ColumnMapping|ColumnsConfiguration} [mappingOrConfig] - Optional column mapping or config
 */
export function updateSheetData(data, mappingOrConfig) {
  const key = getSheetKey(data.spreadsheetId, data.gid);
  const existing = state.sheets.get(key);
  
  // Check if data actually changed
  const hasChanged = !existing || 
    JSON.stringify(existing.data) !== JSON.stringify(data.data) ||
    JSON.stringify(existing.headers) !== JSON.stringify(data.headers);
  
  state.sheets.set(key, data);
  state.errors.delete(key);
  
  // Try to use ColumnsConfiguration first
  let columnsConfig = null;
  
  // Check if mappingOrConfig is a ColumnsConfiguration (has 'columns' array)
  if (mappingOrConfig && 'columns' in mappingOrConfig) {
    columnsConfig = mappingOrConfig;
  } else {
    // Try to load existing ColumnsConfiguration
    columnsConfig = getColumnsConfiguration(key);
  }
  
  if (columnsConfig && columnsConfig.columns && columnsConfig.columns.length > 0) {
    // Use new system
    state.parsedPlayers = parsePlayersWithColumnsConfig(data.headers, data.data, columnsConfig);
  } else {
    // Fall back to legacy system
    const effectiveMapping = (mappingOrConfig && !('columns' in mappingOrConfig)) 
      ? mappingOrConfig 
      : (getColumnMapping(key) || detectColumnMapping(data.headers));
    state.parsedPlayers = parsePlayersFromSheetWithMapping(data.headers, data.data, effectiveMapping);
  }
  
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
 * Updates theme
 * @param {'light'|'dark'} theme 
 */
export function setTheme(theme) {
  state.theme = theme;
  saveSettings({ theme });
  notify('theme');
}

/**
 * Table density levels in order
 * @type {import('../storage/persistence.js').TableDensity[]}
 */
const DENSITY_LEVELS = ['compact', 'normal', 'comfortable'];

/**
 * Updates table density
 * @param {import('../storage/persistence.js').TableDensity} density 
 */
export function setTableDensity(density) {
  state.tableDensity = density;
  saveSettings({ tableDensity: density });
  notify('tableDensity');
}

/**
 * Increases table density (smaller rows)
 */
export function decreaseTableDensity() {
  const currentIdx = DENSITY_LEVELS.indexOf(state.tableDensity);
  if (currentIdx > 0) {
    setTableDensity(DENSITY_LEVELS[currentIdx - 1]);
  }
}

/**
 * Decreases table density (larger rows)
 */
export function increaseTableDensity() {
  const currentIdx = DENSITY_LEVELS.indexOf(state.tableDensity);
  if (currentIdx < DENSITY_LEVELS.length - 1) {
    setTableDensity(DENSITY_LEVELS[currentIdx + 1]);
  }
}

/**
 * Checks if density can be decreased (made more compact)
 * @returns {boolean}
 */
export function canDecreaseDensity() {
  return DENSITY_LEVELS.indexOf(state.tableDensity) > 0;
}

/**
 * Checks if density can be increased (made more comfortable)
 * @returns {boolean}
 */
export function canIncreaseDensity() {
  return DENSITY_LEVELS.indexOf(state.tableDensity) < DENSITY_LEVELS.length - 1;
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
 * Checks if a sheet config is for a local file
 * @param {SheetConfig} config
 * @returns {boolean}
 */
export function isLocalSheet(config) {
  return config?.sourceType === 'local';
}

/**
 * Gets stored local CSV data
 * @param {string} fileName
 * @returns {string|null} Base64-encoded CSV or null
 */
export function getLocalCSVData(fileName) {
  return loadLocalCSVData(fileName);
}

/**
 * Saves local CSV data to storage
 * @param {string} fileName
 * @param {string} base64Data
 */
export function setLocalCSVData(fileName, base64Data) {
  saveLocalCSVData(fileName, base64Data);
}

/**
 * Removes local CSV data from storage
 * @param {string} fileName
 */
export function deleteLocalCSVData(fileName) {
  removeLocalCSVData(fileName);
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
 * @param {'players'|'teams'|'draft'} tab 
 */
export function setActiveTab(tab) {
  state.activeTab = tab;
  notify('activeTab');
}

/**
 * Gets active tab
 * @returns {'players'|'teams'|'draft'}
 */
export function getActiveTab() {
  return state.activeTab;
}

/**
 * Gets parsed players map
 * @returns {Map<string, Player>}
 */
export function getParsedPlayers() {
  return state.parsedPlayers;
}

/**
 * Gets a player by nickname (case-insensitive)
 * @param {string} nickname
 * @returns {Player|undefined}
 */
export function getPlayerByNickname(nickname) {
  return state.parsedPlayers.get(nickname.toLowerCase());
}

/**
 * Sets the selected team for draft view
 * @param {Team|null} team
 */
export function setSelectedTeam(team) {
  state.selectedTeam = team;
  state.selectedPlayer = null;
  notify('selectedTeam');
}

/**
 * Gets the selected team
 * @returns {Team|null}
 */
export function getSelectedTeam() {
  return state.selectedTeam;
}

/**
 * Sets the selected player for details panel
 * @param {Player|null} player
 */
export function setSelectedPlayer(player) {
  state.selectedPlayer = player;
  notify('selectedPlayer');
}

/**
 * Gets the selected player
 * @returns {Player|null}
 */
export function getSelectedPlayer() {
  return state.selectedPlayer;
}

/**
 * Gets all player nicknames that are assigned to any team
 * @param {Team[]} teams
 * @returns {Set<string>}
 */
function getAssignedPlayerNicknames(teams) {
  const assigned = new Set();
  for (const team of teams) {
    for (const nickname of team.playerNicknames) {
      assigned.add(nickname.toLowerCase());
    }
  }
  return assigned;
}

/**
 * Gets unselected players grouped by role
 * @param {Team[]} teams - All teams to check against
 * @returns {{tank: Player[], dps: Player[], support: Player[]}}
 */
export function getUnselectedPlayersByRole(teams) {
  const assigned = getAssignedPlayerNicknames(teams);
  
  const result = {
    tank: [],
    dps: [],
    support: []
  };
  
  // Track already added players to avoid duplicates
  // (same player may be stored under both nickname and battleTag)
  const addedPlayers = new Set();
  
  for (const player of state.parsedPlayers.values()) {
    // Skip if already added (duplicate entry)
    const playerKey = player.nickname.toLowerCase();
    if (addedPlayers.has(playerKey)) continue;
    
    // Check if player is assigned by either nickname or battleTag
    const isAssigned = 
      assigned.has(player.nickname.toLowerCase()) ||
      (player.battleTag && assigned.has(player.battleTag.toLowerCase()));
    
    if (!isAssigned) {
      result[player.role].push(player);
      addedPlayers.add(playerKey);
    }
  }
  
  // Sort each role by rating descending
  result.tank.sort((a, b) => b.rating - a.rating);
  result.dps.sort((a, b) => b.rating - a.rating);
  result.support.sort((a, b) => b.rating - a.rating);
  
  return result;
}

/**
 * Sets OverFast loading state
 * @param {boolean} loading
 */
export function setOverfastLoading(loading) {
  state.overfastLoading = loading;
  notify('overfastLoading');
}

/**
 * Sets OverFast loaded state
 * @param {boolean} loaded
 */
export function setOverfastLoaded(loaded) {
  state.overfastLoaded = loaded;
  state.overfastLoading = false;
  notify('overfastLoaded');
}

/**
 * Checks if OverFast data is loaded
 * @returns {boolean}
 */
export function isOverfastLoaded() {
  return state.overfastLoaded;
}

/**
 * Checks if OverFast data is currently loading
 * @returns {boolean}
 */
export function isOverfastLoading() {
  return state.overfastLoading;
}

// ============================================================================
// Filter Functions
// ============================================================================

/**
 * Gets current filter state
 * @returns {FilterState}
 */
export function getFilters() {
  return state.filters;
}

/**
 * Sets the available-only filter
 * @param {boolean} availableOnly
 */
export function setFilterAvailableOnly(availableOnly) {
  state.filters = { ...state.filters, availableOnly };
  notify('filters');
}

/**
 * Sets the role filter
 * @param {'tank'|'dps'|'support'|null} role - null to show all roles
 */
export function setFilterRole(role) {
  state.filters = { ...state.filters, role };
  notify('filters');
}

/**
 * Toggles the available-only filter
 */
export function toggleFilterAvailableOnly() {
  state.filters = { ...state.filters, availableOnly: !state.filters.availableOnly };
  notify('filters');
}

/**
 * Toggles a role filter (same role = clear, different role = set)
 * @param {'tank'|'dps'|'support'} role
 */
export function toggleFilterRole(role) {
  state.filters = {
    ...state.filters,
    role: state.filters.role === role ? null : role
  };
  notify('filters');
}

/**
 * Resets all filters to default values
 */
export function resetFilters() {
  state.filters = { availableOnly: false, role: null };
  notify('filters');
}

// ============================================================================
// Sort State
// ============================================================================

/**
 * Gets the current sort state
 * @returns {SortState}
 */
export function getSortState() {
  return state.sort;
}

/**
 * Sets the sort column and direction
 * @param {string|null} columnId - Column ID to sort by, null to clear
 * @param {'asc'|'desc'} [direction='desc'] - Sort direction
 */
export function setSortColumn(columnId, direction = 'desc') {
  state.sort = { columnId, direction };
  notify('sort');
}

/**
 * Toggles sort on a column (cycles: desc -> asc -> none)
 * @param {string} columnId
 */
export function toggleSort(columnId) {
  if (state.sort.columnId !== columnId) {
    // New column - start with descending (highest first)
    state.sort = { columnId, direction: 'desc' };
  } else if (state.sort.direction === 'desc') {
    // Same column, desc -> asc
    state.sort = { columnId, direction: 'asc' };
  } else {
    // Same column, asc -> clear sort
    state.sort = { columnId: null, direction: 'desc' };
  }
  notify('sort');
}

/**
 * Clears any active sort
 */
export function clearSort() {
  state.sort = { columnId: null, direction: 'desc' };
  notify('sort');
}

/**
 * Gets filtered players based on current filter state
 * @param {Team[]} teams - All teams to check for availability
 * @returns {Player[]}
 */
export function getFilteredPlayers(teams) {
  const { availableOnly, role } = state.filters;
  const assigned = getAssignedPlayerNicknames(teams);
  const addedPlayers = new Set();
  const result = [];
  
  for (const player of state.parsedPlayers.values()) {
    const playerKey = player.nickname.toLowerCase();
    
    // Skip duplicates
    if (addedPlayers.has(playerKey)) continue;
    
    // Apply available-only filter
    if (availableOnly) {
      const isAssigned = 
        assigned.has(player.nickname.toLowerCase()) ||
        (player.battleTag && assigned.has(player.battleTag.toLowerCase()));
      if (isAssigned) continue;
    }
    
    // Apply role filter - check if any of player's roles match
    if (role !== null) {
      const playerRoles = player.roles || [player.role];
      if (!playerRoles.includes(role)) continue;
    }
    
    result.push(player);
    addedPlayers.add(playerKey);
  }
  
  return result;
}


