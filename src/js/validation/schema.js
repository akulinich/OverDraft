/**
 * Teams Data Schema Validation
 * 
 * Expected CSV format from Google Sheet (Команды tab):
 * 
 * Structure (per team, 4 columns + 1 separator):
 *   Col 0: Role (or empty)
 *   Col 1: Name (team name in header, player name in data)
 *   Col 2: Rating
 *   Col 3: Avg rating (only for first player row)
 *   Col 4: Empty separator
 * 
 * Row structure per team block:
 *   Row 0: [empty, TeamName, empty, empty]
 *   Row 1: [TeamNumber, empty, empty, empty]
 *   Rows 2-6: 5 players (Tank, DPS, DPS, Support, Support)
 * 
 * Layout:
 *   - 3 teams horizontally per block
 *   - Empty rows between vertical blocks
 */

/**
 * @typedef {Object} ValidationError
 * @property {string} field
 * @property {string} message
 * @property {number} [row]
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid
 * @property {ValidationError[]} errors
 * @property {ParsedTeamsData|null} data
 */

/**
 * @typedef {Object} TeamPlayer
 * @property {string} role
 * @property {string} nickname
 * @property {number} rating
 */

/**
 * @typedef {Object} Team
 * @property {string} name
 * @property {number} teamNumber
 * @property {TeamPlayer[]} players
 * @property {number} [avgRating]
 */

/**
 * @typedef {Object} ParsedTeamsData
 * @property {Team[]} teams
 */

const ROLE_PATTERNS = {
  tank: /^(танк|tanks?)/i,
  dps: /^(дд|dd|dps|damage)/i,
  support: /^(сапп?ы?|support|heal|саппорт)/i
};

const TEAM_COLS = 4;
const SEPARATOR_COLS = 1;
const BLOCK_WIDTH = TEAM_COLS + SEPARATOR_COLS; // 5
const TEAMS_PER_ROW = 3;
const PLAYERS_PER_TEAM = 5;

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
 * @param {string[][]} rows 
 * @param {number} row 
 * @param {number} col 
 * @returns {string}
 */
function getCell(rows, row, col) {
  if (row < 0 || row >= rows.length) return '';
  if (!rows[row] || col < 0 || col >= rows[row].length) return '';
  return (rows[row][col] || '').trim();
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
function findRoleRows(allRows) {
  const roleRows = [];
  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i];
    if (!row) continue;
    for (let j = 0; j < row.length; j++) {
      if (normalizeRole(row[j])) {
        roleRows.push(i);
        break;
      }
    }
  }
  return roleRows;
}

/**
 * Parse teams from a horizontal group of rows
 * @param {string[][]} allRows 
 * @param {number} nameRow - Row index for team names
 * @param {number} numberRow - Row index for team numbers  
 * @param {number} playerStartRow - First player row
 * @returns {Team[]}
 */
function parseTeamsFromBlock(allRows, nameRow, numberRow, playerStartRow) {
  /** @type {Team[]} */
  const teams = [];
  
  for (let teamIdx = 0; teamIdx < TEAMS_PER_ROW; teamIdx++) {
    const startCol = teamIdx * BLOCK_WIDTH;
    
    // Get team name from column 1 of this team's block
    const teamName = getCell(allRows, nameRow, startCol + 1);
    
    // Get team number from column 0 of this team's block
    const teamNumStr = getCell(allRows, numberRow, startCol);
    const teamNumber = parseInt(teamNumStr, 10);
    
    // Skip if no team name and no team number
    if (!teamName && isNaN(teamNumber)) {
      continue;
    }
    
    // Parse players
    /** @type {TeamPlayer[]} */
    const players = [];
    let avgRating = null;
    
    // Expected roles for each row
    const expectedRoles = ['tank', 'dps', 'dps', 'support', 'support'];
    
    for (let p = 0; p < PLAYERS_PER_TEAM; p++) {
      const rowIdx = playerStartRow + p;
      
      const roleCell = getCell(allRows, rowIdx, startCol);
      const nickname = getCell(allRows, rowIdx, startCol + 1);
      const ratingStr = getCell(allRows, rowIdx, startCol + 2);
      const avgStr = getCell(allRows, rowIdx, startCol + 3);
      
      // First player row has avg rating
      if (p === 0 && avgStr) {
        avgRating = parseRating(avgStr);
      }
      
      const rating = parseRating(ratingStr);
      
      if (nickname && rating !== null) {
        const role = normalizeRole(roleCell) || expectedRoles[p];
        players.push({ role, nickname, rating });
      }
    }
    
    if (players.length > 0) {
      teams.push({
        name: teamName || `Team ${teamNumber || teams.length + 1}`,
        teamNumber: isNaN(teamNumber) ? teams.length + 1 : teamNumber,
        players,
        ...(avgRating !== null && { avgRating })
      });
    }
  }
  
  return teams;
}

/**
 * Validates teams data from raw sheet data
 * @param {string[]} headers
 * @param {string[][]} rows
 * @returns {ValidationResult}
 */
export function validateTeamsData(headers, rows) {
  const errors = [];
  
  // Combine all rows (headers is first row of data, not actual headers)
  const allRows = [headers, ...rows];
  
  if (allRows.length < 7) {
    return {
      valid: false,
      errors: [{ field: 'data', message: 'Недостаточно данных. Ожидается минимум 7 строк.' }],
      data: null
    };
  }
  
  // Find rows with role markers to understand block structure
  const roleRows = findRoleRows(allRows);
  
  if (roleRows.length === 0) {
    return {
      valid: false,
      errors: [{ field: 'structure', message: 'Не найдены роли игроков (Танки, ДД, Сапы).' }],
      data: null
    };
  }
  
  /** @type {Team[]} */
  const teams = [];
  
  // Process blocks based on role row positions
  // Each block has roles starting at certain rows, with name/number 2 rows before
  let processedRows = new Set();
  
  for (const roleRow of roleRows) {
    // Skip if we already processed this block
    if (processedRows.has(roleRow)) continue;
    
    // The first role row (Tank) is 2 rows after name row
    // So: nameRow, numberRow, playerRows[0-4]
    const nameRow = roleRow - 2;
    const numberRow = roleRow - 1;
    const playerStartRow = roleRow;
    
    // Skip if nameRow is negative
    if (nameRow < 0) continue;
    
    // Mark these rows as processed
    for (let i = playerStartRow; i < playerStartRow + PLAYERS_PER_TEAM; i++) {
      processedRows.add(i);
    }
    
    const blockTeams = parseTeamsFromBlock(allRows, nameRow, numberRow, playerStartRow);
    teams.push(...blockTeams);
  }
  
  if (teams.length === 0) {
    errors.push({ field: 'teams', message: 'Не удалось распознать команды.' });
  }
  
  // Validate teams
  teams.forEach((team, idx) => {
    if (team.players.length < 3) {
      errors.push({
        field: `teams[${idx}]`,
        message: `Команда "${team.name}": найдено только ${team.players.length} игроков (минимум 3)`
      });
    }
  });
  
  return {
    valid: errors.length === 0,
    errors,
    data: errors.length === 0 ? { teams } : null
  };
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
 * @returns {string}
 */
export function getSchemaDocumentation() {
  return `
Ожидаемый формат таблицы команд:

Структура блока команды (4 колонки):
  Строка 1: [пусто, Название команды, пусто, пусто]
  Строка 2: [Номер команды, пусто, пусто, пусто]
  Строки 3-7: 5 игроков

Структура игрока:
  Колонка 1: Роль (Танки, ДД, или пусто)
  Колонка 2: Никнейм
  Колонка 3: Рейтинг
  Колонка 4: Средний рейтинг (только первая строка)

Расположение:
  - 3 команды в ряду (4 колонки + 1 разделитель = 5 колонок на команду)
  - Пустые строки между блоками команд

Допустимые роли: Танки, ДД, Сапы
`.trim();
}
