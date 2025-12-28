/**
 * Teams Data Schema Validation
 * 
 * Expected CSV format from Google Sheet (Команды tab):
 * 
 * Structure (per team, configurable columns + separator):
 *   Col 0: Role (or empty)
 *   Col 1: Name (team name in header, player name in data)
 *   Col 2: Rating
 *   Col 3: Avg rating (only for first player row)
 *   Col 4+: Empty separator(s)
 * 
 * Row structure per team block:
 *   Row 0: [empty, TeamName, empty, empty]
 *   Row 1: [TeamNumber, empty, empty, empty]
 *   Rows 2+: N players (configurable)
 * 
 * Layout:
 *   - Configurable teams horizontally per block
 *   - Configurable empty rows between vertical blocks
 */

import { getDefaultTeamsLayoutConfig } from '../storage/persistence.js';

/**
 * @typedef {Object} ValidationError
 * @property {string} field
 * @property {string} message
 * @property {number} [row]
 */

/**
 * @typedef {Object} ParseError
 * @property {'cell_error'|'structure_error'|'data_error'} type
 * @property {number} row - 0-based row index in raw data
 * @property {number} col - 0-based column index
 * @property {string} expected - What was expected (e.g., 'player_nickname')
 * @property {string} actual - What was found
 * @property {string} message - Human-readable error message
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid
 * @property {ValidationError[]} errors
 * @property {ParseError|null} parseError - Detailed error for UI highlighting
 * @property {ParsedTeamsData|null} data
 */

/**
 * @typedef {Object} Team
 * @property {string} name
 * @property {number} teamNumber
 * @property {string[]} playerNicknames - List of player nicknames in this team
 */

/**
 * @typedef {Object} ParsedTeamsData
 * @property {Team[]} teams
 */

/**
 * @typedef {import('../storage/persistence.js').TeamsLayoutConfig} TeamsLayoutConfig
 */

const ROLE_PATTERNS = {
  tank: /^(танк|tanks?)/i,
  dps: /^(дд|dd|dps|damage)/i,
  support: /^(сапп?ы?|support|heal|саппорт)/i
};

/**
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
 * @param {string} value 
 * @returns {number|null}
 */
function parseRating(value) {
  if (!value || typeof value !== 'string') return null;
  const num = parseInt(value.trim(), 10);
  if (isNaN(num) || num < 0 || num > 10000) return null;
  return num;
}

/**
 * Spreadsheet error values to treat as empty
 */
const SPREADSHEET_ERRORS = ['#N/A', '#REF!', '#VALUE!', '#DIV/0!', '#NAME?', '#NULL!', '#NUM!', '#ERROR!'];

/**
 * @param {string[][]} rows 
 * @param {number} row 
 * @param {number} col 
 * @returns {string}
 */
function getCell(rows, row, col) {
  if (row < 0 || row >= rows.length) return '';
  if (!rows[row] || col < 0 || col >= rows[row].length) return '';
  const value = (rows[row][col] || '').trim();
  // Treat spreadsheet errors as empty cells
  if (SPREADSHEET_ERRORS.includes(value.toUpperCase())) return '';
  return value;
}

/**
 * Check if a row is empty or mostly empty
 * @param {string[]} row 
 * @returns {boolean}
 */
function isEmptyRow(row) {
  if (!row) return true;
  return row.every(cell => !cell || !cell.trim());
}

/**
 * Find rows that contain role markers (Танки, ДД, Сапы)
 * @param {string[][]} allRows 
 * @returns {number[]} Row indices that contain roles
 */
/**
 * Finds rows containing role markers
 * @param {string[][]} allRows
 * @param {number} startRow - Row offset to start searching from
 * @param {number} startCol - Column offset to start searching from
 * @returns {number[]}
 */
function findRoleRows(allRows, startRow = 0, startCol = 0) {
  const roleRows = [];
  for (let i = startRow; i < allRows.length; i++) {
    const row = allRows[i];
    if (!row) continue;
    for (let j = startCol; j < row.length; j++) {
      if (normalizeRole(row[j])) {
        roleRows.push(i);
        break;
      }
    }
  }
  return roleRows;
}

/**
 * Calculate block width (columns per team including separator)
 * @param {TeamsLayoutConfig} config
 * @returns {number}
 */
function getBlockWidth(config) {
  return config.columnsPerTeam + config.separatorColumns;
}

/**
 * Calculate block height (rows per team block including separator)
 * @param {TeamsLayoutConfig} config
 * @returns {number}
 */
function getBlockHeight(config) {
  return config.headerRows + config.playersPerTeam + config.rowsBetweenBlocks;
}

/**
 * Parse teams from a horizontal group of rows
 * @param {string[][]} allRows 
 * @param {number} nameRow - Row index for team names
 * @param {number} numberRow - Row index for team numbers  
 * @param {number} playerStartRow - First player row
 * @param {TeamsLayoutConfig} config
 * @param {ParseError[]} parseErrors - Array to collect parse errors
 * @returns {Team[]}
 */
function parseTeamsFromBlock(allRows, nameRow, numberRow, playerStartRow, config, parseErrors) {
  /** @type {Team[]} */
  const teams = [];
  const blockWidth = getBlockWidth(config);
  const colOffset = config.startCol ?? 0;
  
  for (let teamIdx = 0; teamIdx < config.teamsPerRow; teamIdx++) {
    const teamStartCol = colOffset + teamIdx * blockWidth;
    const teamEndCol = teamStartCol + config.columnsPerTeam;
    
    // Search for team name in any cell of the name row within this team's block (optional)
    let teamName = '';
    for (let c = teamStartCol; c < teamEndCol; c++) {
      const cellValue = getCell(allRows, nameRow, c);
      if (cellValue && cellValue.trim()) {
        teamName = cellValue.trim();
        break;
      }
    }
    
    // Search for team number in any cell of the number row within this team's block (required)
    let teamNumber = NaN;
    for (let c = teamStartCol; c < teamEndCol; c++) {
      const cellValue = getCell(allRows, numberRow, c);
      const parsed = parseInt(cellValue, 10);
      if (!isNaN(parsed)) {
        teamNumber = parsed;
        break;
      }
    }
    
    // Skip if no team number (team number is the only required field)
    if (isNaN(teamNumber)) {
      continue;
    }
    
    // Parse player nicknames only (column index 1 within team block)
    // All other player data (role, rating) comes from the players table
    /** @type {string[]} */
    const playerNicknames = [];
    
    for (let p = 0; p < config.playersPerTeam; p++) {
      const rowIdx = playerStartRow + p;
      const nickname = getCell(allRows, rowIdx, teamStartCol + 1);
      
      if (nickname && nickname.trim()) {
        playerNicknames.push(nickname.trim());
      }
    }
    
    // Add team even if it has no players (empty teams are allowed)
    teams.push({
      name: teamName || `Team ${teamNumber}`,
      teamNumber,
      playerNicknames
    });
  }
  
  return teams;
}

/**
 * Tries to auto-detect teams layout from raw data
 * @param {string[][]} allRows - All rows including headers
 * @returns {{config: TeamsLayoutConfig, confidence: number}}
 */
export function tryAutoDetectLayout(allRows) {
  const defaultConfig = getDefaultTeamsLayoutConfig();
  let bestConfig = { ...defaultConfig };
  let bestConfidence = 0;
  
  // Find role rows to understand block structure
  const roleRows = findRoleRows(allRows);
  
  if (roleRows.length === 0) {
    return { config: defaultConfig, confidence: 0 };
  }
  
  // Analyze first role row to detect block structure
  const firstRoleRow = roleRows[0];
  
  // Detect headerRows by looking for team name/number above first role row
  let headerRows = 2; // Default
  for (let h = 1; h <= 3; h++) {
    if (firstRoleRow - h >= 0) {
      const cell = getCell(allRows, firstRoleRow - h, 1);
      if (cell && !normalizeRole(cell)) {
        // Found potential team name
        headerRows = h;
        break;
      }
    }
  }
  
  // Detect consecutive role rows to find playersPerTeam
  let playersCount = 1;
  for (let i = 1; i < 10; i++) {
    if (roleRows.includes(firstRoleRow + i) || getCell(allRows, firstRoleRow + i, 1)) {
      playersCount++;
    } else {
      break;
    }
  }
  
  // Detect teams per row by looking for team numbers or names horizontally
  let teamsPerRow = 1;
  const nameRow = firstRoleRow - headerRows;
  const numberRow = firstRoleRow - 1;
  
  if (numberRow >= 0) {
    // Look for team numbers (column 0 of each team block) - these are required
    const numRow = allRows[numberRow] || [];
    let lastTeamCol = 0;
    
    for (let col = 5; col < numRow.length; col++) {
      const cell = (numRow[col] || '').trim();
      // Check if it's a number (team number)
      if (cell && !isNaN(parseInt(cell, 10)) && col - lastTeamCol >= 4) {
        teamsPerRow++;
        lastTeamCol = col;
      }
    }
  }
  
  // Fallback: look for team names if no numbers found
  if (teamsPerRow === 1 && nameRow >= 0) {
    const row = allRows[nameRow] || [];
    let lastTeamCol = 1;
    
    for (let col = 5; col < row.length; col++) {
      const cell = (row[col] || '').trim();
      if (cell && col - lastTeamCol >= 4) {
        teamsPerRow++;
        lastTeamCol = col;
      }
    }
  }
  
  // Detect separator columns
  let separatorCols = 1;
  if (teamsPerRow > 1 && nameRow >= 0) {
    const row = allRows[nameRow] || [];
    // Find first team name, then count empty cols until second team
    let foundFirst = false;
    let emptyCount = 0;
    for (let col = 0; col < row.length; col++) {
      const cell = (row[col] || '').trim();
      if (cell && !foundFirst) {
        foundFirst = true;
      } else if (foundFirst && !cell) {
        emptyCount++;
      } else if (foundFirst && cell) {
        separatorCols = Math.max(1, emptyCount - 3); // Subtract data columns
        break;
      }
    }
  }
  
  bestConfig = {
    teamsPerRow: Math.min(teamsPerRow, 5),
    columnsPerTeam: 4,
    separatorColumns: separatorCols,
    rowsBetweenBlocks: 1,
    playersPerTeam: Math.min(playersCount, 10),
    headerRows
  };
  
  // Calculate confidence based on how many teams we can parse
  const testResult = validateTeamsDataWithConfig(allRows, bestConfig);
  if (testResult.valid && testResult.data) {
    bestConfidence = Math.min(1, testResult.data.teams.length / 3);
  } else if (testResult.data && testResult.data.teams.length > 0) {
    bestConfidence = 0.5;
  }
  
  return { config: bestConfig, confidence: bestConfidence };
}

/**
 * Validates teams data from raw sheet data with config
 * @param {string[][]} allRows - All rows including first row
 * @param {TeamsLayoutConfig} config
 * @returns {ValidationResult}
 */
export function validateTeamsDataWithConfig(allRows, config) {
  const errors = [];
  /** @type {ParseError[]} */
  const parseErrors = [];
  
  const startRow = config.startRow ?? 0;
  const startCol = config.startCol ?? 0;
  
  const blockHeight = getBlockHeight(config);
  const teamDataHeight = config.headerRows + config.playersPerTeam;
  
  const minRows = startRow + teamDataHeight;
  
  if (allRows.length < minRows) {
    return {
      valid: false,
      errors: [{ field: 'data', message: `Недостаточно данных. Ожидается минимум ${minRows} строк.` }],
      parseError: {
        type: 'data_error',
        row: 0,
        col: 0,
        expected: `${minRows} rows`,
        actual: `${allRows.length}`,
        message: `Недостаточно данных. Ожидается минимум ${minRows} строк, найдено ${allRows.length}.`
      },
      data: null
    };
  }
  
  /** @type {Team[]} */
  const teams = [];
  
  // Process blocks based on config (no longer relying on role markers)
  // Calculate how many row blocks we can fit
  const availableRows = allRows.length - startRow;
  const numRowBlocks = Math.floor(availableRows / blockHeight) + 
    (availableRows % blockHeight >= teamDataHeight ? 1 : 0);
  
  for (let blockIdx = 0; blockIdx < numRowBlocks; blockIdx++) {
    const blockStartRow = startRow + blockIdx * blockHeight;
    
    // Check if we have enough rows for this block's team data
    if (blockStartRow + teamDataHeight > allRows.length) break;
    
    // Header rows: first row is name, second row is number (when headerRows >= 2)
    const nameRow = blockStartRow;
    const numberRow = blockStartRow + config.headerRows - 1;
    const playerStartRow = blockStartRow + config.headerRows;
    
    const blockTeams = parseTeamsFromBlock(
      allRows, nameRow, numberRow, playerStartRow, config, parseErrors
    );
    teams.push(...blockTeams);
  }
  
  // No teams found - check if there's data but no valid team numbers
  if (teams.length === 0 && numRowBlocks > 0) {
    parseErrors.push({
      type: 'structure_error',
      row: startRow + config.headerRows - 1,
      col: startCol,
      expected: 'team_number',
      actual: '',
      message: 'Не найдены номера команд. Проверьте настройки структуры таблицы.'
    });
  }
  
  // Return first parse error for highlighting
  const firstParseError = parseErrors.length > 0 ? parseErrors[0] : null;
  
  return {
    valid: parseErrors.length === 0,
    errors,
    parseError: firstParseError,
    data: { teams }
  };
}

/**
 * Validates teams data from raw sheet data (legacy wrapper)
 * @param {string[]} headers
 * @param {string[][]} rows
 * @param {TeamsLayoutConfig} [config]
 * @returns {ValidationResult}
 */
export function validateTeamsData(headers, rows, config) {
  // Combine all rows (headers is first row of data, not actual headers)
  const allRows = [headers, ...rows];
  const effectiveConfig = config || getDefaultTeamsLayoutConfig();
  return validateTeamsDataWithConfig(allRows, effectiveConfig);
}

/**
 * @param {ValidationError[]} errors 
 * @returns {string}
 */
export function formatValidationErrors(errors) {
  if (errors.length === 0) return '';
  return errors.map(err => {
    const prefix = err.row !== undefined ? `[Строка ${err.row}] ` : '';
    return `${prefix}${err.message}`;
  }).join('\n');
}

/**
 * Formats a parse error for display
 * @param {ParseError} error
 * @returns {string}
 */
export function formatParseError(error) {
  const cellRef = `[Строка ${error.row + 1}, Колонка ${error.col + 1}]`;
  return `${cellRef} ${error.message}`;
}

/**
 * @param {TeamsLayoutConfig} [config]
 * @returns {string}
 */
export function getSchemaDocumentation(config) {
  const cfg = config || getDefaultTeamsLayoutConfig();
  const blockWidth = getBlockWidth(cfg);
  
  return `
Ожидаемый формат таблицы команд:

Структура блока команды (${cfg.columnsPerTeam} колонки данных):
  Строка 1: [пусто, Название команды (опц.), пусто, пусто]
  Строка 2: [Номер команды*, пусто, пусто, пусто]
  Строки 3-${2 + cfg.playersPerTeam}: ${cfg.playersPerTeam} игроков (опц.)

* Обязательное поле — только номер команды

Структура игрока (все поля опциональны):
  Колонка 1: Роль (Танки, ДД, Сапы)
  Колонка 2: Никнейм
  Колонка 3: Рейтинг
  Колонка 4: Средний рейтинг (только первая строка)

Расположение:
  - ${cfg.teamsPerRow} команд в ряду (${cfg.columnsPerTeam} колонки + ${cfg.separatorColumns} разделитель = ${blockWidth} колонок на команду)
  - ${cfg.rowsBetweenBlocks} пустых строк между блоками команд

Команды могут быть изначально пустыми и заполняться позже.
`.trim();
}
