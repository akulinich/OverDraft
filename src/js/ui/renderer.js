/**
 * DOM rendering functions
 */

import { createElement, escapeHtml, getRoleClass, getRatingClass, formatRelativeTime, createRoleIcon, createHeroIconsContainer, createRankBadge } from './components.js';
import { validateTeamsData, formatValidationErrors, getSchemaDocumentation } from '../validation/schema.js';
import { isLoaded as isOverfastLoaded } from '../api/overfast.js';
import * as store from '../state/store.js';
import { getOrderedColumns } from '../storage/persistence.js';
import { t } from '../i18n/index.js';

/**
 * Mandatory column keys in display order
 * @type {readonly string[]}
 */
const MANDATORY_COLUMNS = ['role', 'nickname', 'heroes', 'rating'];

/**
 * Header patterns for mandatory columns
 */
const MANDATORY_HEADER_PATTERNS = {
  nickname: /^(ник|никнейм|nickname|nick|имя|name|игрок|player)/i,
  role: /^(роль|role)/i,
  rating: /^(рейтинг|rating|sr|ранг|rank)/i,
  heroes: /^(герои|heroes|hero|персонажи|characters)/i
};

/**
 * Gets display labels for mandatory columns (used in table headers)
 * Uses i18n translations
 * @returns {Object<string, string>}
 */
function getMandatoryColumnLabels() {
  return {
    nickname: t('columns.nickname'),
    role: t('columns.role'),
    rating: t('columns.rating'),
    heroes: t('columns.heroes')
  };
}

/** @type {Map<string, string>} Cache of previous row data for change detection */
const previousRowData = new Map();

/**
 * Gets the nickname column index using mapping or pattern fallback
 * @param {string[]} headers
 * @returns {number} Column index or -1 if not found
 */
function getNicknameColumnIndex(headers) {
  const sheet = store.getFirstSheet();
  const sheetKey = sheet ? `${sheet.spreadsheetId}_${sheet.gid}` : null;
  const mapping = sheetKey ? store.getColumnMapping(sheetKey) : null;
  
  // Try mapping first
  if (mapping && mapping.nickname) {
    const idx = headers.indexOf(mapping.nickname);
    if (idx !== -1) return idx;
  }
  
  // Fallback to pattern
  return headers.findIndex(h => 
    MANDATORY_HEADER_PATTERNS.nickname.test(h.trim())
  );
}

/**
 * Renders table headers
 * @param {string[]} headers 
 */
export function renderTableHeader(headers) {
  const thead = document.getElementById('table-header');
  if (!thead) return;
  
  thead.innerHTML = '';
  
  const tr = createElement('tr');
  headers.forEach(header => {
    const th = createElement('th', {}, escapeHtml(header));
    tr.appendChild(th);
  });
  
  thead.appendChild(tr);
}

/**
 * Gets the current column mapping from store
 * @returns {import('../state/store.js').ColumnMapping|null}
 */
function getCurrentColumnMapping() {
  const sheet = store.getFirstSheet();
  if (!sheet) return null;
  const sheetKey = `${sheet.spreadsheetId}_${sheet.gid}`;
  return store.getColumnMapping(sheetKey);
}

/**
 * Determines if a column contains rating data based on header
 * @param {string} header 
 * @returns {boolean}
 */
function isRatingColumn(header) {
  // First check mapping
  const mapping = getCurrentColumnMapping();
  if (mapping && mapping.rating) {
    return header === mapping.rating;
  }
  // Fallback to pattern
  const lower = header.toLowerCase();
  return lower.includes('рейтинг') || lower.includes('rating') || lower.includes('sr');
}

/**
 * Determines if a column contains role data based on header
 * @param {string} header 
 * @returns {boolean}
 */
function isRoleColumn(header) {
  // First check mapping
  const mapping = getCurrentColumnMapping();
  if (mapping && mapping.role) {
    return header === mapping.role;
  }
  // Fallback to pattern
  const lower = header.toLowerCase();
  return lower.includes('роль') || lower.includes('role');
}

/**
 * Determines if a column contains heroes data based on header
 * @param {string} header 
 * @returns {boolean}
 */
function isHeroesColumn(header) {
  // First check mapping
  const mapping = getCurrentColumnMapping();
  if (mapping && mapping.heroes) {
    return header === mapping.heroes;
  }
  // Fallback to pattern
  const lower = header.toLowerCase();
  return lower.includes('герои') || lower.includes('heroes') || lower.includes('hero') || 
         lower.includes('персонажи') || lower.includes('characters');
}

/**
 * Determines if a column is a comment/notes column (should not render icons)
 * @param {string} header 
 * @returns {boolean}
 */
function isCommentColumn(header) {
  const lower = header.toLowerCase();
  return lower.includes('комментарий') || lower.includes('comment') || lower.includes('notes') ||
         lower.includes('заметки') || lower.includes('примечание');
}

/**
 * Renders a single cell with appropriate styling
 * @param {string} value 
 * @param {string} header 
 * @param {number} colIndex 
 * @param {string} [columnKey] - Optional column key (e.g., 'rating', 'role', 'heroes', 'nickname')
 * @returns {HTMLElement}
 */
function renderCell(value, header, colIndex, columnKey) {
  const td = createElement('td');
  
  // Add column-specific class for fixed widths
  if (columnKey) {
    td.classList.add(`col-${columnKey}`);
  }
  
  // Skip icon rendering for comment columns
  if (isCommentColumn(header)) {
    td.textContent = value;
    return td;
  }
  
  // Apply role-specific styling with icon
  if (columnKey === 'role' || isRoleColumn(header)) {
    td.classList.add('cell-role');
    const normalizedRole = normalizeRoleValue(value);
    if (normalizedRole && isOverfastLoaded()) {
      const icon = createRoleIcon(normalizedRole, { size: 'sm' });
      td.appendChild(icon);
    } else {
      const roleClass = getRoleClass(value);
      if (roleClass) td.classList.add(roleClass);
      td.textContent = value;
    }
    return td;
  }
  
  // Apply rating-specific styling with rank icon
  if (columnKey === 'rating' || isRatingColumn(header)) {
    td.classList.add('cell-rating');
    const rankBadge = createRankBadge(value, { showNumber: true, size: 'sm' });
    td.appendChild(rankBadge);
    return td;
  }
  
  // Apply heroes column with icons
  if ((columnKey === 'heroes' || isHeroesColumn(header)) && value) {
    td.classList.add('cell-heroes');
    const heroIcons = createHeroIconsContainer(value, { size: 'md', maxIcons: 5 });
    td.appendChild(heroIcons);
    return td;
  }
  
  // Nickname column
  if (columnKey === 'nickname') {
    td.classList.add('cell-nickname');
  }
  
  // Default: escape and display text
  td.textContent = value;
  return td;
}

/**
 * Normalizes role value from sheet to standard format
 * @param {string} value 
 * @returns {'tank'|'dps'|'support'|null}
 */
function normalizeRoleValue(value) {
  if (!value || typeof value !== 'string') return null;
  const lower = value.toLowerCase().trim();
  if (lower.includes('танк') || lower.includes('tank')) return 'tank';
  if (lower.includes('дпс') || lower.includes('дд') || lower.includes('dd') || lower.includes('dps') || lower.includes('damage') || lower.includes('дамаг')) return 'dps';
  if (lower.includes('саппорт') || lower.includes('суппорт') || lower.includes('сап') || lower.includes('хил') || lower.includes('support') || lower.includes('heal')) return 'support';
  return null;
}

/**
 * Applies filters to table data rows
 * @param {string[][]} data - Raw row data
 * @param {string[]} headers - Column headers
 * @param {import('../validation/schema.js').Team[]} teams - Teams for availability check
 * @returns {string[][]} Filtered data rows
 */
function applyFiltersToTableData(data, headers, teams) {
  const filters = store.getFilters();
  
  // If no filters active, return original data
  if (!filters.availableOnly && filters.role === null) {
    return data;
  }
  
  // Get filtered players from store
  const filteredPlayers = store.getFilteredPlayers(teams);
  const filteredNicknames = new Set(filteredPlayers.map(p => p.nickname.toLowerCase()));
  
  // Find nickname column index using mapping
  const nicknameIdx = getNicknameColumnIndex(headers);
  
  if (nicknameIdx === -1) {
    return data; // Can't filter without nickname column
  }
  
  return data.filter(row => {
    const nickname = row[nicknameIdx]?.trim()?.toLowerCase();
    return nickname && filteredNicknames.has(nickname);
  });
}

/**
 * Renders table body with data rows
 * @param {string[][]} data 
 * @param {string[]} headers 
 * @param {import('../validation/schema.js').Team[]} [teams] - Optional teams for filtering
 */
export function renderTableBody(data, headers, teams = []) {
  const tbody = document.getElementById('table-body');
  if (!tbody) return;
  
  // Apply filters to data
  const filteredData = applyFiltersToTableData(data, headers, teams);
  
  // Create document fragment for efficient DOM updates
  const fragment = document.createDocumentFragment();
  const newRowData = new Map();
  
  filteredData.forEach((row, rowIndex) => {
    const tr = createElement('tr');
    const rowKey = `row_${rowIndex}`;
    const rowString = JSON.stringify(row);
    
    // Track row data for change detection
    newRowData.set(rowKey, rowString);
    
    // Add highlight animation if row changed
    if (previousRowData.has(rowKey) && previousRowData.get(rowKey) !== rowString) {
      tr.classList.add('row-updated');
    }
    
    row.forEach((cell, colIndex) => {
      const header = headers[colIndex] || '';
      const td = renderCell(cell, header, colIndex);
      tr.appendChild(td);
    });
    
    fragment.appendChild(tr);
  });
  
  // Update cache
  previousRowData.clear();
  newRowData.forEach((value, key) => previousRowData.set(key, value));
  
  // Replace tbody content
  tbody.innerHTML = '';
  tbody.appendChild(fragment);
}

/**
 * Finds column indices for mandatory columns using column mapping
 * @param {string[]} headers
 * @returns {{key: string, index: number, header: string, originalHeader: string}[]}
 */
function findMandatoryColumnIndices(headers) {
  const result = [];
  
  // Try to get mapping from store first
  const sheet = store.getFirstSheet();
  const sheetKey = sheet ? `${sheet.spreadsheetId}_${sheet.gid}` : null;
  const mapping = sheetKey ? store.getColumnMapping(sheetKey) : null;
  
  // Get translated labels
  const columnLabels = getMandatoryColumnLabels();
  
  for (const key of MANDATORY_COLUMNS) {
    let index = -1;
    let originalHeader = '';
    
    // First, try using the saved mapping
    if (mapping && mapping[key]) {
      index = headers.indexOf(mapping[key]);
      if (index !== -1) {
        originalHeader = mapping[key];
      }
    }
    
    // Fallback to pattern matching if mapping not found
    if (index === -1) {
      const pattern = MANDATORY_HEADER_PATTERNS[key];
      index = headers.findIndex(h => pattern.test(h.trim()));
      if (index !== -1) {
        originalHeader = headers[index];
      }
    }
    
    if (index !== -1) {
      // Use display label for header, preserve original for cell rendering
      result.push({ 
        key, 
        index, 
        header: columnLabels[key] || originalHeader,
        originalHeader 
      });
    }
  }
  
  return result;
}

/**
 * Renders players table with only mandatory columns (legacy)
 * @param {string[]} headers 
 * @param {string[][]} data 
 * @param {import('../validation/schema.js').Team[]} [teams] - Optional teams for filtering
 * @deprecated Use renderPlayersTableWithConfig instead
 */
export function renderPlayersTable(headers, data, teams = []) {
  const mandatoryCols = findMandatoryColumnIndices(headers);
  
  // Render header with mandatory columns only
  const thead = document.getElementById('table-header');
  if (thead) {
    thead.innerHTML = '';
    const tr = createElement('tr');
    
    for (const col of mandatoryCols) {
      const th = createElement('th', { className: `col-${col.key}` }, escapeHtml(col.header));
      tr.appendChild(th);
    }
    
    thead.appendChild(tr);
  }
  
  // Render body with mandatory columns only
  const tbody = document.getElementById('table-body');
  if (!tbody) return;
  
  // Apply filters
  const filteredData = applyFiltersToTableData(data, headers, teams);
  
  const fragment = document.createDocumentFragment();
  
  filteredData.forEach((row, rowIndex) => {
    const tr = createElement('tr', { 
      className: 'player-table-row',
      dataset: { rowIndex: String(rowIndex) }
    });
    
    for (const col of mandatoryCols) {
      const value = row[col.index] || '';
      // Use originalHeader for cell styling detection, key for column type
      const td = renderCell(value, col.originalHeader, col.index, col.key);
      tr.appendChild(td);
    }
    
    fragment.appendChild(tr);
  });
  
  tbody.innerHTML = '';
  tbody.appendChild(fragment);
}

/**
 * Renders players table using dynamic columns configuration
 * @param {string[]} headers 
 * @param {string[][]} data 
 * @param {import('../storage/persistence.js').ColumnsConfiguration} config - Dynamic columns configuration
 * @param {import('../validation/schema.js').Team[]} [teams] - Optional teams for filtering
 */
export function renderPlayersTableWithConfig(headers, data, config, teams = []) {
  const orderedColumns = getOrderedColumns(config);
  
  // Build column info with indices
  const columnInfo = orderedColumns.map(col => ({
    config: col,
    index: headers.indexOf(col.sheetColumn),
    header: col.displayName,
    key: col.columnType
  })).filter(col => col.index !== -1);
  
  // Render header
  const thead = document.getElementById('table-header');
  if (thead) {
    thead.innerHTML = '';
    const tr = createElement('tr');
    
    for (const col of columnInfo) {
      const th = createElement('th', { className: `col-${col.key}` }, escapeHtml(col.header));
      tr.appendChild(th);
    }
    
    thead.appendChild(tr);
  }
  
  // Render body
  const tbody = document.getElementById('table-body');
  if (!tbody) return;
  
  // Apply filters
  const filteredData = applyFiltersToTableData(data, headers, teams);
  
  const fragment = document.createDocumentFragment();
  
  filteredData.forEach((row, rowIndex) => {
    const tr = createElement('tr', { 
      className: 'player-table-row',
      dataset: { rowIndex: String(rowIndex) }
    });
    
    for (const col of columnInfo) {
      const value = row[col.index] || '';
      const td = renderCellByType(value, col.key);
      tr.appendChild(td);
    }
    
    fragment.appendChild(tr);
  });
  
  tbody.innerHTML = '';
  tbody.appendChild(fragment);
}

/**
 * Renders a cell based on column type
 * @param {string} value
 * @param {import('../storage/persistence.js').ColumnType} columnType
 * @returns {HTMLElement}
 */
function renderCellByType(value, columnType) {
  const td = createElement('td');
  td.classList.add(`col-${columnType}`);
  
  switch (columnType) {
    case 'name':
      td.classList.add('cell-nickname');
      td.textContent = value;
      break;
      
    case 'role': {
      td.classList.add('cell-role');
      const normalizedRole = normalizeRoleValue(value);
      if (normalizedRole && isOverfastLoaded()) {
        const icon = createRoleIcon(normalizedRole, { size: 'sm' });
        td.appendChild(icon);
      } else {
        const roleClass = getRoleClass(value);
        if (roleClass) td.classList.add(roleClass);
        td.textContent = value;
      }
      break;
    }
    
    case 'rating': {
      td.classList.add('cell-rating');
      const rankBadge = createRankBadge(value, { showNumber: true, size: 'sm' });
      td.appendChild(rankBadge);
      break;
    }
    
    case 'heroes': {
      td.classList.add('cell-heroes');
      if (value) {
        const heroIcons = createHeroIconsContainer(value, { size: 'md', maxIcons: 5 });
        td.appendChild(heroIcons);
      }
      break;
    }
    
    case 'text':
    default:
      td.textContent = value;
      break;
  }
  
  return td;
}

/**
 * Gets the first player from filtered data
 * @param {string[]} headers
 * @param {string[][]} data
 * @param {import('../validation/schema.js').Team[]} teams
 * @returns {import('../state/store.js').Player|null}
 */
export function getFirstFilteredPlayer(headers, data, teams) {
  const filteredData = applyFiltersToTableData(data, headers, teams);
  if (filteredData.length === 0) return null;
  
  // Find nickname column index using mapping
  const nicknameIdx = getNicknameColumnIndex(headers);
  
  if (nicknameIdx === -1) return null;
  
  const nickname = filteredData[0][nicknameIdx]?.trim();
  if (!nickname) return null;
  
  return store.getPlayerByNickname(nickname) || null;
}

/**
 * Renders full player details in the right panel (legacy version)
 * @param {import('../state/store.js').Player} player
 * @param {string[]} headers - All headers from the sheet
 * @param {string} [containerId='player-details-content'] - Container element ID
 * @deprecated Use renderPlayerDetailsPanelWithConfig instead
 */
export function renderPlayerDetailsPanel(player, headers, containerId = 'player-details-content') {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  container.innerHTML = '';
  container.classList.add('has-player');
  
  const card = createElement('div', { className: 'player-info-card' });
  
  // Header with role icon and name
  const header = createElement('div', { className: 'player-info-header' });
  const roleWrapper = createElement('span', { className: `player-role-badge ${player.role}` });
  const roleIcon = createRoleIcon(player.role, { size: 'lg' });
  roleWrapper.appendChild(roleIcon);
  header.appendChild(roleWrapper);
  header.appendChild(createElement('h4', { className: 'player-info-name' }, player.nickname));
  card.appendChild(header);
  
  // Main stats (rating and role)
  const mainStats = createElement('div', { className: 'player-info-main-stats' });
  
  // Rating stat with rank badge
  const ratingStat = createElement('div', { className: 'player-info-stat' });
  ratingStat.appendChild(createElement('span', { className: 'stat-label' }, t('players.rating')));
  const rankBadge = createRankBadge(player.rating, { showNumber: true, size: 'md' });
  rankBadge.classList.add('stat-value');
  ratingStat.appendChild(rankBadge);
  mainStats.appendChild(ratingStat);
  
  // Role stat
  const roleStat = createElement('div', { className: 'player-info-stat' });
  roleStat.appendChild(createElement('span', { className: 'stat-label' }, t('players.role')));
  const roleValue = createElement('span', { className: 'stat-value stat-role' });
  roleValue.appendChild(createRoleIcon(player.role, { size: 'sm' }));
  roleValue.appendChild(document.createTextNode(' ' + getRoleDisplayName(player.role)));
  roleStat.appendChild(roleValue);
  mainStats.appendChild(roleStat);
  
  card.appendChild(mainStats);
  
  // Heroes section with icons
  if (player.heroes) {
    const heroesSection = createElement('div', { className: 'player-info-heroes' });
    heroesSection.appendChild(createElement('span', { className: 'stat-label' }, t('players.heroes')));
    const heroIcons = createHeroIconsContainer(player.heroes, { size: 'md', maxIcons: 10 });
    heroIcons.classList.add('heroes-list');
    heroesSection.appendChild(heroIcons);
    card.appendChild(heroesSection);
  }
  
  // Additional fields from rawRow (all original columns)
  if (player.rawRow && player.rawRow.length > 0 && headers.length > 0) {
    const additionalSection = createElement('div', { className: 'player-info-additional' });
    additionalSection.appendChild(createElement('span', { className: 'section-label' }, t('players.allData')));
    
    const fieldsList = createElement('div', { className: 'player-info-fields' });
    
    for (let i = 0; i < headers.length; i++) {
      const value = player.rawRow[i];
      if (value === undefined || value === null || value === '') continue;
      
      const fieldRow = createElement('div', { className: 'player-info-field' });
      fieldRow.appendChild(createElement('span', { className: 'field-label' }, headers[i]));
      fieldRow.appendChild(createElement('span', { className: 'field-value' }, String(value)));
      fieldsList.appendChild(fieldRow);
    }
    
    additionalSection.appendChild(fieldsList);
    card.appendChild(additionalSection);
  }
  
  container.appendChild(card);
}

/**
 * Renders full player details in the right panel using dynamic config
 * @param {import('../state/store.js').Player} player
 * @param {string[]} headers - All headers from the sheet
 * @param {import('../storage/persistence.js').ColumnsConfiguration} config - Dynamic columns configuration
 * @param {string} [containerId='player-details-content'] - Container element ID
 */
export function renderPlayerDetailsPanelWithConfig(player, headers, config, containerId = 'player-details-content') {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  container.innerHTML = '';
  container.classList.add('has-player');
  
  const card = createElement('div', { className: 'player-info-card' });
  
  // Get ordered key columns
  const orderedColumns = getOrderedColumns(config);
  const keyColumnHeaders = new Set(orderedColumns.map(c => c.sheetColumn));
  
  // Find role column for header icon
  const roleColumn = orderedColumns.find(c => c.columnType === 'role');
  
  // Header with role icon (if configured) and name
  const header = createElement('div', { className: 'player-info-header' });
  
  if (roleColumn && player.role) {
    const roleWrapper = createElement('span', { className: `player-role-badge ${player.role}` });
    const roleIcon = createRoleIcon(player.role, { size: 'lg' });
    roleWrapper.appendChild(roleIcon);
    header.appendChild(roleWrapper);
  }
  
  header.appendChild(createElement('h4', { className: 'player-info-name' }, player.nickname));
  card.appendChild(header);
  
  // Key columns section - render ALL key columns in configured order (except name which is in header)
  const keyColumnsSection = createElement('div', { className: 'player-info-key-columns' });
  let hasKeyColumns = false;
  
  for (const col of orderedColumns) {
    // Skip name column (already in header)
    if (col.columnType === 'name') continue;
    
    // Skip columns without sheet mapping
    if (!col.sheetColumn) continue;
    
    const colIndex = headers.indexOf(col.sheetColumn);
    if (colIndex === -1 || !player.rawRow) continue;
    
    const value = player.rawRow[colIndex];
    if (value === undefined || value === null || value === '') continue;
    
    // Render based on column type
    switch (col.columnType) {
      case 'rating': {
        // Use actual value from this column, not player.rating (which may be from a different column)
        const ratingValue = parseInt(value, 10) || 0;
        const ratingStat = createElement('div', { className: 'player-info-stat' });
        ratingStat.appendChild(createElement('span', { className: 'stat-label' }, col.displayName));
        const rankBadge = createRankBadge(ratingValue, { showNumber: true, size: 'md' });
        rankBadge.classList.add('stat-value');
        ratingStat.appendChild(rankBadge);
        keyColumnsSection.appendChild(ratingStat);
        hasKeyColumns = true;
        break;
      }
      case 'role': {
        // Use actual value from this column, not player.role (which may be from a different column)
        const roleValue = normalizeRoleValue(value);
        const roleStat = createElement('div', { className: 'player-info-stat' });
        roleStat.appendChild(createElement('span', { className: 'stat-label' }, col.displayName));
        const roleDisplay = createElement('span', { className: 'stat-value stat-role' });
        if (roleValue) {
          roleDisplay.appendChild(createRoleIcon(roleValue, { size: 'sm' }));
          roleDisplay.appendChild(document.createTextNode(' ' + getRoleDisplayName(roleValue)));
        } else {
          roleDisplay.textContent = value;
        }
        roleStat.appendChild(roleDisplay);
        keyColumnsSection.appendChild(roleStat);
        hasKeyColumns = true;
        break;
      }
      case 'heroes': {
        const heroesSection = createElement('div', { className: 'player-info-heroes' });
        heroesSection.appendChild(createElement('span', { className: 'stat-label' }, col.displayName));
        const heroIcons = createHeroIconsContainer(value, { size: 'md', maxIcons: 10 });
        heroIcons.classList.add('heroes-list');
        heroesSection.appendChild(heroIcons);
        keyColumnsSection.appendChild(heroesSection);
        hasKeyColumns = true;
        break;
      }
      case 'text':
      default: {
        const stat = createElement('div', { className: 'player-info-stat' });
        stat.appendChild(createElement('span', { className: 'stat-label' }, col.displayName));
        stat.appendChild(createElement('span', { className: 'stat-value' }, String(value)));
        keyColumnsSection.appendChild(stat);
        hasKeyColumns = true;
        break;
      }
    }
  }
  
  if (hasKeyColumns) {
    card.appendChild(keyColumnsSection);
  }
  
  // Additional fields from rawRow (columns NOT in key columns)
  if (player.rawRow && player.rawRow.length > 0 && headers.length > 0) {
    const additionalFields = [];
    
    for (let i = 0; i < headers.length; i++) {
      // Skip key columns
      if (keyColumnHeaders.has(headers[i])) continue;
      
      const value = player.rawRow[i];
      if (value === undefined || value === null || value === '') continue;
      
      additionalFields.push({ header: headers[i], value: String(value) });
    }
    
    if (additionalFields.length > 0) {
      const additionalSection = createElement('div', { className: 'player-info-additional' });
      additionalSection.appendChild(createElement('span', { className: 'section-label' }, t('players.otherData')));
      
      const fieldsList = createElement('div', { className: 'player-info-fields' });
      
      for (const field of additionalFields) {
        const fieldRow = createElement('div', { className: 'player-info-field' });
        fieldRow.appendChild(createElement('span', { className: 'field-label' }, field.header));
        fieldRow.appendChild(createElement('span', { className: 'field-value' }, field.value));
        fieldsList.appendChild(fieldRow);
      }
      
      additionalSection.appendChild(fieldsList);
      card.appendChild(additionalSection);
    }
  }
  
  container.appendChild(card);
}

/**
 * Clears the player details panel
 */
export function clearPlayerDetailsPanel() {
  const container = document.getElementById('player-details-content');
  if (!container) return;
  
  container.innerHTML = `
    <div class="player-details-empty">
      <p>${t('players.notSelected')}</p>
    </div>
  `;
  container.classList.remove('has-player');
}

/**
 * Updates selected row highlight in players table
 * @param {number|null} rowIndex - Selected row index or null to clear
 */
export function updatePlayerRowSelection(rowIndex) {
  // Clear previous selection
  document.querySelectorAll('.player-table-row.selected').forEach(el => {
    el.classList.remove('selected');
  });
  
  if (rowIndex === null || rowIndex === undefined) return;
  
  // Highlight selected row
  const row = document.querySelector(`.player-table-row[data-row-index="${rowIndex}"]`);
  if (row) {
    row.classList.add('selected');
  }
}

/**
 * Gets human-readable role display name
 * @param {'tank'|'dps'|'support'} role
 * @returns {string}
 */
function getRoleDisplayName(role) {
  switch (role) {
    case 'tank': return t('roles.tank');
    case 'dps': return t('roles.dps');
    case 'support': return t('roles.support');
    default: return role;
  }
}

/**
 * Renders the full table
 * @param {string[]} headers 
 * @param {string[][]} data 
 * @param {import('../validation/schema.js').Team[]} [teams] - Optional teams for filtering
 */
export function renderTable(headers, data, teams = []) {
  renderTableHeader(headers);
  renderTableBody(data, headers, teams);
}

/**
 * Shows the data display section
 */
export function showDataDisplay() {
  const display = document.getElementById('data-display');
  const loading = document.getElementById('loading-state');
  const error = document.getElementById('error-state');
  
  if (display) display.hidden = false;
  if (loading) loading.hidden = true;
  if (error) error.hidden = true;
}

/**
 * Shows the loading state
 */
export function showLoading() {
  const display = document.getElementById('data-display');
  const loading = document.getElementById('loading-state');
  const error = document.getElementById('error-state');
  
  if (display) display.hidden = true;
  if (loading) loading.hidden = false;
  if (error) error.hidden = true;
}

/**
 * Shows the error state
 * @param {string} message 
 * @param {boolean} [showPublishInstructions=false] - Show detailed publish instructions
 */
export function showError(message, showPublishInstructions = false) {
  const display = document.getElementById('data-display');
  const loading = document.getElementById('loading-state');
  const error = document.getElementById('error-state');
  const errorMsg = document.getElementById('error-message');
  const instructions = document.getElementById('error-instructions');
  
  if (display) display.hidden = true;
  if (loading) loading.hidden = true;
  if (error) error.hidden = false;
  if (errorMsg) errorMsg.textContent = message;
  if (instructions) instructions.hidden = !showPublishInstructions;
}

/**
 * Updates the status bar
 * @param {Date} [lastUpdate] 
 * @param {boolean} [isPolling] 
 */
export function updateStatusBar(lastUpdate, isPolling = true) {
  const lastUpdateEl = document.getElementById('last-update');
  const indicator = document.getElementById('polling-indicator');
  
  if (lastUpdateEl && lastUpdate) {
    const timeAgo = formatRelativeTime(lastUpdate);
    lastUpdateEl.textContent = t('status.updated', { time: timeAgo });
  }
  
  if (indicator) {
    indicator.classList.toggle('paused', !isPolling);
  }
}

/**
 * Shows error indicator in status bar
 * @param {string} [message] 
 */
export function showStatusError(message) {
  const errorIndicator = document.getElementById('error-indicator');
  const errorText = document.getElementById('error-text');
  
  if (errorIndicator) {
    errorIndicator.hidden = !message;
  }
  if (errorText) {
    errorText.textContent = message || '';
  }
}

/**
 * Formats sheet info HTML
 * @param {Object} sheet
 * @param {string} sheet.spreadsheetId
 * @param {string} sheet.gid
 * @returns {string}
 */
function formatSheetInfoHtml(sheet) {
  return `<div class="sheet-info-row">ID: ${escapeHtml(sheet.spreadsheetId)}</div><div class="sheet-info-row">gid: ${escapeHtml(sheet.gid)}</div>`;
}

/**
 * Updates the current sheet info in settings
 * @param {Object} sheet 
 * @param {string} sheet.spreadsheetId
 * @param {string} sheet.gid
 * @param {string} [sheet.alias]
 */
export function updateSheetInfo(sheet) {
  const infoEl = document.getElementById('current-sheet-info');
  if (!infoEl) return;
  
  infoEl.innerHTML = formatSheetInfoHtml(sheet);
}

/**
 * Updates the current teams sheet info in settings
 * @param {Object|null} sheet 
 * @param {string} [sheet.spreadsheetId]
 * @param {string} [sheet.gid]
 */
export function updateTeamsSheetInfo(sheet) {
  const infoEl = document.getElementById('current-teams-info');
  if (!infoEl) return;
  
  if (sheet) {
    infoEl.innerHTML = formatSheetInfoHtml(sheet);
  } else {
    infoEl.textContent = t('settings.notConfigured');
  }
}

/**
 * Applies theme to document
 * @param {'light'|'dark'} theme 
 */
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  
  // Update theme buttons
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
}

/**
 * Applies table density class
 * @param {import('../storage/persistence.js').TableDensity} density 
 */
export function applyTableDensity(density) {
  const table = document.getElementById('data-table');
  if (!table) return;
  
  // Remove all density classes
  table.classList.remove('density-compact', 'density-normal', 'density-comfortable');
  
  // Add the selected density class
  table.classList.add(`density-${density}`);
  
  // Update button states
  updateDensityButtonStates(density);
}

/**
 * Updates density button disabled states
 * @param {import('../storage/persistence.js').TableDensity} density 
 */
export function updateDensityButtonStates(density) {
  const densityLevels = ['compact', 'normal', 'comfortable'];
  const currentIdx = densityLevels.indexOf(density);
  
  const decreaseBtn = document.querySelector('.density-btn[data-density="decrease"]');
  const increaseBtn = document.querySelector('.density-btn[data-density="increase"]');
  
  if (decreaseBtn) {
    decreaseBtn.disabled = currentIdx <= 0;
  }
  if (increaseBtn) {
    increaseBtn.disabled = currentIdx >= densityLevels.length - 1;
  }
}

/**
 * Updates tabs visibility
 * @param {boolean} showTabs 
 */
export function updateTabsVisibility(showTabs) {
  const tabs = document.getElementById('main-tabs');
  if (tabs) {
    tabs.hidden = !showTabs;
  }
}

/**
 * Updates filters visibility based on tab
 * @param {boolean} showFilters - Whether we're on players tab
 */
export function updateFiltersVisibility(showFilters) {
  const container = document.getElementById('player-filters');
  if (container) {
    container.style.display = showFilters ? 'flex' : 'none';
  }
}

/**
 * Updates available filter visibility (shown only when teams sheet is connected)
 * @param {boolean} hasTeamsSheet
 */
export function updateAvailableFilterVisibility(hasTeamsSheet) {
  const filterAvailable = document.getElementById('filter-available');
  if (filterAvailable) {
    filterAvailable.hidden = !hasTeamsSheet;
  }
}

/**
 * Updates role filters visibility (shown only when at least one role column is configured)
 * @param {boolean} hasRoleColumns
 */
export function updateRoleFiltersVisibility(hasRoleColumns) {
  const filterRoles = document.getElementById('filter-roles');
  if (filterRoles) {
    filterRoles.hidden = !hasRoleColumns;
  }
}

/**
 * Updates filter button states based on current filter state
 */
export function updateFilterButtonStates() {
  const filters = store.getFilters();
  
  document.querySelectorAll('.filter-btn').forEach(btn => {
    const filterType = btn.dataset.filter;
    
    if (filterType === 'available') {
      btn.classList.toggle('active', filters.availableOnly);
    } else if (filterType === 'tank' || filterType === 'dps' || filterType === 'support') {
      btn.classList.toggle('active', filters.role === filterType);
    }
  });
}

/**
 * Shows a specific tab content
 * @param {'players'|'teams'} tab 
 */
export function showTab(tab) {
  const playersDisplay = document.getElementById('data-display');
  const teamsDisplay = document.getElementById('teams-display');
  
  if (playersDisplay) {
    playersDisplay.hidden = tab !== 'players';
  }
  if (teamsDisplay) {
    teamsDisplay.hidden = tab !== 'teams';
  }
  
  // Update tab button states
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
}

/**
 * Renders teams data with validation
 * @param {string[]} headers 
 * @param {string[][]} data 
 * @param {import('../storage/persistence.js').TeamsLayoutConfig} [layoutConfig] - Optional layout config
 */
export async function renderTeamsView(headers, data, layoutConfig) {
  const container = document.getElementById('teams-container');
  const errorBox = document.getElementById('teams-validation-error');
  const errorMessage = document.getElementById('teams-error-message');
  const schemaDocs = document.getElementById('schema-docs');
  
  if (!container) return;
  
  // Validate data against schema with provided config
  const validationResult = validateTeamsData(headers, data, layoutConfig);
  
  if (!validationResult.valid) {
    // Show validation error
    if (errorBox) errorBox.hidden = false;
    if (errorMessage) {
      errorMessage.textContent = formatValidationErrors(validationResult.errors);
    }
    if (schemaDocs) {
      schemaDocs.textContent = getSchemaDocumentation();
    }
    container.innerHTML = '';
    return;
  }
  
  // Hide error, show teams
  if (errorBox) errorBox.hidden = true;
  
  const teamsData = validationResult.data;
  if (!teamsData || !teamsData.teams) {
    container.innerHTML = `<p class="teams-not-configured">${t('teams.noData')}</p>`;
    return;
  }
  
  // Render teams grid
  container.innerHTML = '';
  
  // Import getPlayerByNickname dynamically to avoid circular dependency
  const { getPlayerByNickname } = await import('../state/store.js');
  
  teamsData.teams.forEach(team => {
    const card = createTeamCard(team, getPlayerByNickname);
    container.appendChild(card);
  });
}

/**
 * Renders teams view with dynamic column configuration
 * @param {string[]} headers - Teams sheet headers
 * @param {string[][]} data - Teams sheet data
 * @param {import('../storage/persistence.js').TeamsLayoutConfig} [layoutConfig] - Optional layout config
 * @param {string[]} playerHeaders - Players sheet headers
 * @param {import('../storage/persistence.js').ColumnsConfiguration} [columnsConfig] - Optional columns config
 * @param {import('../storage/persistence.js').TeamsDisplayConfig} [displayConfig] - Optional display config
 */
export async function renderTeamsViewWithConfig(headers, data, layoutConfig, playerHeaders, columnsConfig, displayConfig) {
  const container = document.getElementById('teams-container');
  const errorBox = document.getElementById('teams-validation-error');
  const errorMessage = document.getElementById('teams-error-message');
  const schemaDocs = document.getElementById('schema-docs');
  
  if (!container) return;
  
  // Validate data against schema with provided config
  const validationResult = validateTeamsData(headers, data, layoutConfig);
  
  if (!validationResult.valid) {
    // Show validation error
    if (errorBox) errorBox.hidden = false;
    if (errorMessage) {
      errorMessage.textContent = formatValidationErrors(validationResult.errors);
    }
    if (schemaDocs) {
      schemaDocs.textContent = getSchemaDocumentation();
    }
    container.innerHTML = '';
    return;
  }
  
  // Hide error, show teams
  if (errorBox) errorBox.hidden = true;
  
  const teamsData = validationResult.data;
  if (!teamsData || !teamsData.teams) {
    container.innerHTML = `<p class="teams-not-configured">${t('teams.noData')}</p>`;
    return;
  }
  
  // Render teams grid
  container.innerHTML = '';
  
  // Import getPlayerByNickname dynamically to avoid circular dependency
  const { getPlayerByNickname } = await import('../state/store.js');
  
  // Use dynamic config if provided, otherwise fallback to legacy
  if (columnsConfig && columnsConfig.columns && columnsConfig.columns.length > 0) {
    teamsData.teams.forEach(team => {
      const card = createTeamCardWithConfig(team, getPlayerByNickname, playerHeaders, columnsConfig, displayConfig);
      container.appendChild(card);
    });
  } else {
    teamsData.teams.forEach(team => {
      const card = createTeamCard(team, getPlayerByNickname);
      container.appendChild(card);
    });
  }
}

/**
 * Creates a team card element
 * @param {import('../validation/schema.js').Team} team 
 * @param {function(string): import('../state/store.js').Player|null} getPlayerFn - Function to get player by nickname
 * @returns {HTMLElement}
 */
function createTeamCard(team, getPlayerFn) {
  const card = createElement('div', { className: 'team-card' });
  
  // Header
  const header = createElement('div', { className: 'team-card-header' });
  const name = createElement('span', { className: 'team-name' }, team.name);
  header.appendChild(name);
  
  // Calculate avg rating from players
  const teamPlayers = team.playerNicknames
    .map(nick => getPlayerFn(nick))
    .filter(p => p !== null);
  
  if (teamPlayers.length > 0) {
    const avgRating = Math.round(
      teamPlayers.reduce((sum, p) => sum + (p.rating || 0), 0) / teamPlayers.length
    );
    if (avgRating > 0) {
      const rankBadge = createRankBadge(avgRating, { showNumber: true, size: 'sm' });
      rankBadge.classList.add('team-rating');
      header.appendChild(rankBadge);
    }
  }
  
  card.appendChild(header);
  
  // Players
  const playersContainer = createElement('div', { className: 'team-players' });
  
  team.playerNicknames.forEach(nickname => {
    const player = getPlayerFn(nickname);
    
    const playerRow = createElement('div', { 
      className: 'team-player',
      dataset: { nickname }
    });
    
    if (player) {
      // Role icon
      const roleIcon = createRoleIcon(player.role, { size: 'sm' });
      const roleWrapper = createElement('span', { className: `player-role ${player.role}` });
      roleWrapper.appendChild(roleIcon);
      playerRow.appendChild(roleWrapper);
      
      // Nickname
      const nickEl = createElement('span', { className: 'player-nickname' }, player.nickname);
      playerRow.appendChild(nickEl);
      
      // Rating with rank icon
      const rankBadge = createRankBadge(player.rating, { showNumber: true, size: 'sm' });
      rankBadge.classList.add('player-rating');
      playerRow.appendChild(rankBadge);
    } else {
      // Player not found in players table
      const unknownIcon = createElement('span', { className: 'player-role unknown' }, '?');
      playerRow.appendChild(unknownIcon);
      
      const nickEl = createElement('span', { className: 'player-nickname player-unknown' }, nickname);
      playerRow.appendChild(nickEl);
      
      const unknownRating = createElement('span', { className: 'player-rating unknown' }, '—');
      playerRow.appendChild(unknownRating);
    }
    
    playersContainer.appendChild(playerRow);
  });
  
  card.appendChild(playersContainer);
  
  return card;
}

/**
 * Creates a team card with dynamic columns configuration
 * @param {import('../validation/schema.js').Team} team
 * @param {function(string): import('../state/store.js').Player|null} getPlayerFn
 * @param {string[]} headers - All sheet headers
 * @param {import('../storage/persistence.js').ColumnsConfiguration} columnsConfig
 * @param {import('../storage/persistence.js').TeamsDisplayConfig|null} displayConfig
 * @returns {HTMLElement}
 */
function createTeamCardWithConfig(team, getPlayerFn, headers, columnsConfig, displayConfig) {
  const card = createElement('div', { className: 'team-card' });
  
  // Header
  const header = createElement('div', { className: 'team-card-header' });
  const name = createElement('span', { className: 'team-name' }, team.name);
  header.appendChild(name);
  
  // Calculate avg rating from players
  const teamPlayers = team.playerNicknames
    .map(nick => getPlayerFn(nick))
    .filter(p => p !== null);
  
  if (teamPlayers.length > 0) {
    const avgRating = Math.round(
      teamPlayers.reduce((sum, p) => sum + (p.rating || 0), 0) / teamPlayers.length
    );
    if (avgRating > 0) {
      const rankBadge = createRankBadge(avgRating, { showNumber: true, size: 'sm' });
      rankBadge.classList.add('team-rating');
      header.appendChild(rankBadge);
    }
  }
  
  card.appendChild(header);
  
  // Get visible columns from config
  const orderedColumns = getOrderedColumns(columnsConfig);
  const visibleIds = new Set(displayConfig?.visibleColumnIds || orderedColumns.map(c => c.id));
  
  // Filter to visible columns (name is always visible)
  const visibleColumns = orderedColumns.filter(c => 
    c.columnType === 'name' || visibleIds.has(c.id)
  );
  
  // Build column info with indices
  const columnInfo = visibleColumns.map(col => ({
    config: col,
    index: headers.indexOf(col.sheetColumn),
    key: col.columnType
  })).filter(col => col.index !== -1 || col.key === 'name');
  
  // Players
  const playersContainer = createElement('div', { className: 'team-players' });
  
  team.playerNicknames.forEach(nickname => {
    const player = getPlayerFn(nickname);
    
    const playerRow = createElement('div', { 
      className: 'team-player',
      dataset: { nickname }
    });
    
    if (player) {
      // Render each visible column
      for (const col of columnInfo) {
        switch (col.key) {
          case 'name': {
            const nickEl = createElement('span', { className: 'player-nickname' }, player.nickname);
            playerRow.appendChild(nickEl);
            break;
          }
          
          case 'role': {
            const roleIcon = createRoleIcon(player.role, { size: 'sm' });
            const roleWrapper = createElement('span', { className: `player-role ${player.role}` });
            roleWrapper.appendChild(roleIcon);
            playerRow.appendChild(roleWrapper);
            break;
          }
          
          case 'rating': {
            const rankBadge = createRankBadge(player.rating, { showNumber: true, size: 'sm' });
            rankBadge.classList.add('player-rating');
            playerRow.appendChild(rankBadge);
            break;
          }
          
          case 'heroes': {
            if (player.heroes) {
              const heroIcons = createHeroIconsContainer(player.heroes, { size: 'sm', maxIcons: 3 });
              heroIcons.classList.add('player-heroes');
              playerRow.appendChild(heroIcons);
            }
            break;
          }
          
          case 'text': {
            const value = player.rawRow?.[col.index] || '';
            const textEl = createElement('span', { className: 'player-text' }, value);
            playerRow.appendChild(textEl);
            break;
          }
        }
      }
    } else {
      // Player not found in players table - show only name
      const unknownIcon = createElement('span', { className: 'player-role unknown' }, '?');
      playerRow.appendChild(unknownIcon);
      
      const nickEl = createElement('span', { className: 'player-nickname player-unknown' }, nickname);
      playerRow.appendChild(nickEl);
      
      const unknownRating = createElement('span', { className: 'player-rating unknown' }, '—');
      playerRow.appendChild(unknownRating);
    }
    
    playersContainer.appendChild(playerRow);
  });
  
  card.appendChild(playersContainer);
  
  return card;
}

/**
 * Gets short role label for badge
 * @param {string} role 
 * @returns {string}
 */
function getRoleBadgeLabel(role) {
  switch (role) {
    case 'tank': return 'T';
    case 'dps': return 'D';
    case 'support': return 'S';
    default: return '?';
  }
}

/**
 * Shows teams not configured message
 */
export function showTeamsNotConfigured() {
  const container = document.getElementById('teams-container');
  const errorBox = document.getElementById('teams-validation-error');
  
  if (errorBox) errorBox.hidden = true;
  
  if (container) {
    container.innerHTML = `
      <div class="teams-not-configured">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        <p>${t('teams.notConfigured')}</p>
        <button id="configure-teams-btn" class="btn btn-secondary">${t('teams.configure')}</button>
      </div>
    `;
    
    // Add click handler for configure button
    const configureBtn = document.getElementById('configure-teams-btn');
    configureBtn?.addEventListener('click', () => {
      const settingsBtn = document.getElementById('settings-btn');
      settingsBtn?.click();
    });
  }
}

/**
 * Renders player details in the teams tab right panel
 * Uses the same dynamic columns configuration as the players tab
 * @param {import('../state/store.js').Player} player
 * @param {string[]} headers - All headers from the players sheet
 * @param {import('../storage/persistence.js').ColumnsConfiguration} [config] - Dynamic columns configuration
 */
export function renderTeamsPlayerDetailsPanel(player, headers, config) {
  if (config && config.columns && config.columns.length > 0) {
    // Use dynamic config with teams container
    renderPlayerDetailsPanelWithConfig(player, headers, config, 'teams-player-details-content');
  } else {
    // Fallback to legacy rendering
    renderPlayerDetailsPanel(player, headers, 'teams-player-details-content');
  }
}

/**
 * Clears the teams player details panel
 */
export function clearTeamsPlayerDetailsPanel() {
  const container = document.getElementById('teams-player-details-content');
  if (!container) return;
  
  container.innerHTML = `
    <div class="player-details-empty">
      <p>${t('players.notSelected')}</p>
    </div>
  `;
  container.classList.remove('has-player');
}

/**
 * Updates selected player highlight in teams view
 * @param {string|null} nickname - Selected player nickname or null to clear
 */
export function updateTeamsPlayerSelection(nickname) {
  // Clear previous selection
  document.querySelectorAll('.team-player.selected').forEach(el => {
    el.classList.remove('selected');
  });
  
  if (!nickname) return;
  
  // Highlight player row with this nickname
  document.querySelectorAll(`.team-player[data-nickname="${CSS.escape(nickname)}"]`).forEach(el => {
    el.classList.add('selected');
  });
}

// ============================================================================
// Column Mapping Modal
// ============================================================================

/**
 * Renders the column mapping modal content
 * @param {string[]} sheetHeaders - Headers from the sheet
 * @param {import('../storage/persistence.js').ColumnMapping} detectedMapping - Auto-detected mapping
 * @param {string[]} missingColumns - Keys of missing required columns
 * @param {import('../state/store.js').ColumnValidationError[]} errors - Validation errors
 */
export function renderColumnMappingModal(sheetHeaders, detectedMapping, missingColumns, errors) {
  const container = document.getElementById('column-mapping-table');
  const errorContainer = document.getElementById('column-mapping-error');
  const description = document.getElementById('column-mapping-description');
  
  if (!container) return;
  
  container.innerHTML = '';
  
  // Update description based on what's missing
  if (description) {
    if (missingColumns.length > 0) {
      description.textContent = 'Некоторые обязательные колонки не найдены автоматически. Укажите соответствие колонок в вашей таблице:';
    } else if (errors.length > 0) {
      description.textContent = 'Обнаружены ошибки в данных. Проверьте соответствие колонок:';
    } else {
      description.textContent = 'Проверьте соответствие колонок:';
    }
  }
  
  // Build error map for quick lookup
  const errorMap = new Map();
  for (const error of errors) {
    errorMap.set(error.column, error.message);
  }
  
  // Render each required column row
  for (const columnKey of store.REQUIRED_COLUMNS) {
    const row = createElement('div', { className: 'column-mapping-row' });
    
    // Label
    const label = createElement('span', { 
      className: 'column-mapping-label required' 
    }, store.REQUIRED_COLUMN_LABELS[columnKey]);
    row.appendChild(label);
    
    // Select dropdown
    const select = createElement('select', { 
      className: 'column-mapping-select',
      dataset: { columnKey }
    });
    
    // Empty option
    const emptyOption = createElement('option', { value: '' }, '-- не выбрано --');
    select.appendChild(emptyOption);
    
    // Options for each header
    for (const header of sheetHeaders) {
      const option = createElement('option', { value: header }, header);
      // Pre-select if detected
      if (detectedMapping[columnKey] === header) {
        option.selected = true;
      }
      select.appendChild(option);
    }
    
    // Mark as error if validation failed
    const hasError = errorMap.has(columnKey);
    const isMissing = missingColumns.includes(columnKey) && !detectedMapping[columnKey];
    
    if (hasError) {
      select.classList.add('error');
    } else if (!isMissing && detectedMapping[columnKey]) {
      select.classList.add('success');
    }
    
    row.appendChild(select);
    
    // Status indicator
    const status = createElement('span', { className: 'column-mapping-status' });
    if (hasError) {
      status.classList.add('invalid');
      status.textContent = '✗';
    } else if (isMissing) {
      status.classList.add('warning');
      status.textContent = '⚠';
    } else if (detectedMapping[columnKey]) {
      status.classList.add('valid');
      status.textContent = '✓';
    }
    row.appendChild(status);
    
    container.appendChild(row);
    
    // Add error message if present
    if (hasError) {
      const errorRow = createElement('div', { 
        className: 'column-mapping-row-error',
        dataset: { columnKey }
      }, errorMap.get(columnKey));
      container.appendChild(errorRow);
    }
  }
  
  // Update confirm button state
  updateColumnMappingConfirmButton();
  
  // Hide general error container by default
  if (errorContainer) {
    errorContainer.hidden = true;
  }
}

/**
 * Gets current mapping from the modal form
 * @returns {import('../storage/persistence.js').ColumnMapping}
 */
export function getColumnMappingFromModal() {
  /** @type {import('../storage/persistence.js').ColumnMapping} */
  const mapping = {
    nickname: null,
    role: null,
    rating: null,
    heroes: null
  };
  
  const selects = document.querySelectorAll('.column-mapping-select');
  for (const select of selects) {
    const key = select.dataset.columnKey;
    const value = select.value;
    if (key && value) {
      mapping[key] = value;
    }
  }
  
  return mapping;
}

/**
 * Updates the confirm button state based on current selections
 */
export function updateColumnMappingConfirmButton() {
  const confirmBtn = document.getElementById('confirm-column-mapping');
  if (!confirmBtn) return;
  
  const mapping = getColumnMappingFromModal();
  
  // Check all required columns are selected
  let allSelected = true;
  for (const key of store.REQUIRED_COLUMNS) {
    if (!mapping[key]) {
      allSelected = false;
      break;
    }
  }
  
  // Check no error indicators are present
  const hasErrors = document.querySelectorAll('.column-mapping-select.error').length > 0;
  
  confirmBtn.disabled = !allSelected || hasErrors;
}

/**
 * Updates a single column row status based on validation
 * @param {string} columnKey
 * @param {boolean} isValid
 * @param {string} [errorMessage]
 */
export function updateColumnMappingRowStatus(columnKey, isValid, errorMessage) {
  const select = document.querySelector(`.column-mapping-select[data-column-key="${columnKey}"]`);
  const status = select?.parentElement?.querySelector('.column-mapping-status');
  const existingError = document.querySelector(`.column-mapping-row-error[data-column-key="${columnKey}"]`);
  
  if (!select || !status) return;
  
  // Remove existing error row
  if (existingError) {
    existingError.remove();
  }
  
  // Update select and status
  select.classList.remove('error', 'success');
  status.classList.remove('valid', 'invalid', 'warning');
  status.textContent = '';
  
  if (!select.value) {
    status.classList.add('warning');
    status.textContent = '⚠';
  } else if (isValid) {
    select.classList.add('success');
    status.classList.add('valid');
    status.textContent = '✓';
  } else {
    select.classList.add('error');
    status.classList.add('invalid');
    status.textContent = '✗';
    
    // Add error message
    if (errorMessage) {
      const errorRow = createElement('div', { 
        className: 'column-mapping-row-error',
        dataset: { columnKey }
      }, errorMessage);
      select.parentElement.insertAdjacentElement('afterend', errorRow);
    }
  }
  
  updateColumnMappingConfirmButton();
}

/**
 * Shows the column mapping modal
 */
export function showColumnMappingModal() {
  const modal = document.getElementById('column-mapping-modal');
  if (modal) {
    modal.hidden = false;
  }
}

/**
 * Hides the column mapping modal
 * @deprecated Use hideColumnConfigModal instead
 */
export function hideColumnMappingModal() {
  const modal = document.getElementById('column-mapping-modal');
  if (modal) {
    modal.hidden = true;
  }
}


/* ============================================================================
   Column Configuration Modal (new dynamic system)
   ============================================================================ */

/**
 * @typedef {import('../storage/persistence.js').ColumnConfig} ColumnConfig
 * @typedef {import('../storage/persistence.js').ColumnsConfiguration} ColumnsConfiguration
 * @typedef {import('../storage/persistence.js').ColumnType} ColumnType
 */

/** Column type labels for display */
const COLUMN_TYPE_LABELS = {
  name: 'Имя',
  role: 'Роль',
  rating: 'Рейтинг',
  heroes: 'Герои',
  text: 'Текст'
};

/** Available column types for selection (excluding name which is locked) */
const SELECTABLE_COLUMN_TYPES = ['role', 'rating', 'heroes', 'text'];

/** @type {string[]} Cached sheet headers for column config modal */
let cachedConfigHeaders = [];

/** @type {ColumnsConfiguration|null} Current configuration being edited */
let editingColumnsConfig = null;

/**
 * Renders a single column configuration row
 * @param {ColumnConfig} column
 * @param {string[]} sheetHeaders
 * @param {number} index
 * @param {number} totalColumns
 * @returns {HTMLElement}
 */
function renderColumnConfigRow(column, sheetHeaders, index, totalColumns) {
  const isNameColumn = column.columnType === 'name';
  
  const row = createElement('div', { 
    className: `column-config-row ${isNameColumn ? 'is-name' : ''}`,
    dataset: { columnId: column.id },
    draggable: !isNameColumn // Name column cannot be reordered
  });
  
  // Drag handle
  const dragHandle = createElement('div', { className: 'column-config-drag-handle' });
  dragHandle.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <line x1="8" y1="6" x2="16" y2="6"/>
    <line x1="8" y1="12" x2="16" y2="12"/>
    <line x1="8" y1="18" x2="16" y2="18"/>
  </svg>`;
  row.appendChild(dragHandle);
  
  // Display name input
  const nameInput = createElement('input', {
    className: 'column-config-input',
    type: 'text',
    value: column.displayName,
    dataset: { field: 'displayName', columnId: column.id }
  });
  if (isNameColumn) {
    nameInput.disabled = true;
  }
  row.appendChild(nameInput);
  
  // Sheet column select
  const sheetSelect = createElement('select', {
    className: 'column-config-select',
    dataset: { field: 'sheetColumn', columnId: column.id }
  });
  
  const emptyOption = createElement('option', { value: '' }, '-- выбрать столбец --');
  sheetSelect.appendChild(emptyOption);
  
  for (const header of sheetHeaders) {
    const option = createElement('option', { value: header }, header);
    if (column.sheetColumn === header) {
      option.selected = true;
    }
    sheetSelect.appendChild(option);
  }
  row.appendChild(sheetSelect);
  
  // Column type select
  const typeSelect = createElement('select', {
    className: 'column-config-select',
    dataset: { field: 'columnType', columnId: column.id }
  });
  
  if (isNameColumn) {
    // Only show 'name' type for name column
    const nameOption = createElement('option', { value: 'name', selected: true }, COLUMN_TYPE_LABELS.name);
    typeSelect.appendChild(nameOption);
    typeSelect.disabled = true;
  } else {
    for (const type of SELECTABLE_COLUMN_TYPES) {
      const option = createElement('option', { value: type }, COLUMN_TYPE_LABELS[type]);
      if (column.columnType === type) {
        option.selected = true;
      }
      typeSelect.appendChild(option);
    }
  }
  row.appendChild(typeSelect);
  
  // Delete button
  const deleteBtn = createElement('button', {
    className: 'column-config-delete-btn',
    dataset: { action: 'delete', columnId: column.id }
  });
  deleteBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M18 6L6 18M6 6l12 12"/>
  </svg>`;
  row.appendChild(deleteBtn);
  
  return row;
}

/**
 * Renders the column configuration modal
 * @param {string[]} sheetHeaders - Available headers from the sheet
 * @param {ColumnsConfiguration} config - Current configuration
 */
export function renderColumnConfigModal(sheetHeaders, config) {
  const container = document.getElementById('column-config-list');
  const errorContainer = document.getElementById('column-config-error');
  
  if (!container) return;
  
  // Cache headers and config for updates
  cachedConfigHeaders = sheetHeaders;
  editingColumnsConfig = JSON.parse(JSON.stringify(config)); // Deep clone
  
  container.innerHTML = '';
  
  // Get ordered columns
  const orderedColumns = [...editingColumnsConfig.columns].sort((a, b) => a.order - b.order);
  
  // Render each column row
  orderedColumns.forEach((column, index) => {
    const row = renderColumnConfigRow(column, sheetHeaders, index, orderedColumns.length);
    container.appendChild(row);
  });
  
  // Update confirm button state
  updateColumnConfigConfirmButton();
  
  // Hide error container
  if (errorContainer) {
    errorContainer.hidden = true;
  }
}

/**
 * Gets the current configuration from the modal
 * @returns {ColumnsConfiguration}
 */
export function getColumnConfigFromModal() {
  return editingColumnsConfig || { columns: [] };
}

/**
 * Updates the editing configuration when a field changes
 * @param {string} columnId
 * @param {string} field
 * @param {string} value
 */
export function updateColumnConfigField(columnId, field, value) {
  if (!editingColumnsConfig) return;
  
  const column = editingColumnsConfig.columns.find(c => c.id === columnId);
  if (!column) return;
  
  column[field] = value;
  updateColumnConfigConfirmButton();
}

/**
 * Reorders a column by drag and drop
 * @param {string} draggedId - ID of the dragged column
 * @param {string} targetId - ID of the target column (drop position)
 */
export function reorderColumnByDrag(draggedId, targetId) {
  if (!editingColumnsConfig) return;
  
  const columns = editingColumnsConfig.columns;
  const orderedColumns = [...columns].sort((a, b) => a.order - b.order);
  
  const draggedColumn = orderedColumns.find(c => c.id === draggedId);
  const targetColumn = orderedColumns.find(c => c.id === targetId);
  
  if (!draggedColumn || !targetColumn) return;
  
  // Don't allow dragging name column or dropping onto name column
  if (draggedColumn.columnType === 'name' || targetColumn.columnType === 'name') return;
  
  const draggedIndex = orderedColumns.indexOf(draggedColumn);
  const targetIndex = orderedColumns.indexOf(targetColumn);
  
  // Remove dragged from array and insert at target position
  orderedColumns.splice(draggedIndex, 1);
  orderedColumns.splice(targetIndex, 0, draggedColumn);
  
  // Update order values
  orderedColumns.forEach((c, i) => c.order = i);
  
  // Re-render
  renderColumnConfigModal(cachedConfigHeaders, editingColumnsConfig);
}

/**
 * Deletes a column from the configuration
 * @param {string} columnId
 */
export function deleteColumnFromConfig(columnId) {
  if (!editingColumnsConfig) return;
  
  // Don't delete name column
  const column = editingColumnsConfig.columns.find(c => c.id === columnId);
  if (!column || column.columnType === 'name') return;
  
  editingColumnsConfig.columns = editingColumnsConfig.columns.filter(c => c.id !== columnId);
  
  // Re-order remaining columns
  const orderedColumns = [...editingColumnsConfig.columns].sort((a, b) => a.order - b.order);
  orderedColumns.forEach((c, i) => c.order = i);
  
  // Re-render
  renderColumnConfigModal(cachedConfigHeaders, editingColumnsConfig);
}

/**
 * Adds a new column to the configuration
 * @param {ColumnConfig} column
 */
export function addColumnToConfig(column) {
  if (!editingColumnsConfig) return;
  
  editingColumnsConfig.columns.push(column);
  
  // Re-render
  renderColumnConfigModal(cachedConfigHeaders, editingColumnsConfig);
}

/**
 * Updates the confirm button state
 */
export function updateColumnConfigConfirmButton() {
  const confirmBtn = document.getElementById('confirm-column-config');
  if (!confirmBtn || !editingColumnsConfig) return;
  
  // Must have at least the name column with a sheet column selected
  const nameColumn = editingColumnsConfig.columns.find(c => c.columnType === 'name');
  const hasValidNameColumn = nameColumn && nameColumn.sheetColumn;
  
  // Only the name column is required - other columns are optional
  // But if other columns exist, they must have sheetColumn selected to be included
  confirmBtn.disabled = !hasValidNameColumn;
}

/**
 * Gets the valid configuration (filters out incomplete columns except name)
 * @returns {ColumnsConfiguration}
 */
export function getValidColumnConfig() {
  if (!editingColumnsConfig) return { columns: [] };
  
  // Filter out incomplete non-name columns
  const validColumns = editingColumnsConfig.columns.filter(col => {
    // Name column is always included (but must have sheetColumn)
    if (col.columnType === 'name') {
      return col.sheetColumn;
    }
    // Other columns need both displayName and sheetColumn
    return col.sheetColumn && col.displayName;
  });
  
  // Re-order
  const ordered = [...validColumns].sort((a, b) => a.order - b.order);
  ordered.forEach((c, i) => c.order = i);
  
  return { columns: ordered };
}

/**
 * Shows error in column config modal
 * @param {string} message
 */
export function showColumnConfigError(message) {
  const errorContainer = document.getElementById('column-config-error');
  if (errorContainer) {
    errorContainer.textContent = message;
    errorContainer.hidden = false;
  }
}

/**
 * Hides error in column config modal
 */
export function hideColumnConfigError() {
  const errorContainer = document.getElementById('column-config-error');
  if (errorContainer) {
    errorContainer.hidden = true;
  }
}

/**
 * Shows the column configuration modal
 */
export function showColumnConfigModal() {
  const modal = document.getElementById('column-config-modal');
  if (modal) {
    modal.hidden = false;
  }
}

/**
 * Hides the column configuration modal
 */
export function hideColumnConfigModal() {
  const modal = document.getElementById('column-config-modal');
  if (modal) {
    modal.hidden = true;
  }
  editingColumnsConfig = null;
}


/* ============================================================================
   Teams Display Columns Modal
   ============================================================================ */

/** @type {import('../storage/persistence.js').TeamsDisplayConfig|null} */
let editingTeamsDisplayConfig = null;

/**
 * Renders the teams display columns modal
 * @param {import('../storage/persistence.js').ColumnsConfiguration} columnsConfig - All configured columns
 * @param {import('../storage/persistence.js').TeamsDisplayConfig|null} displayConfig - Current display config
 */
export function renderTeamsDisplayModal(columnsConfig, displayConfig) {
  const container = document.getElementById('teams-display-columns');
  if (!container) return;
  
  container.innerHTML = '';
  
  const orderedColumns = getOrderedColumns(columnsConfig);
  const nonNameColumnIds = orderedColumns
    .filter(c => c.columnType !== 'name')
    .map(c => c.id);
  
  // Initialize editing config
  if (!displayConfig) {
    // No existing config - all non-name columns visible by default
    editingTeamsDisplayConfig = {
      visibleColumnIds: [...nonNameColumnIds]
    };
  } else {
    // Existing config - keep previous selections, but add any NEW columns as visible by default
    const previousVisibleIds = new Set(displayConfig.visibleColumnIds);
    const allCurrentColumnIds = new Set(orderedColumns.map(c => c.id));
    
    // Start with previous visible IDs that still exist in current config
    const validPreviousIds = displayConfig.visibleColumnIds.filter(id => allCurrentColumnIds.has(id));
    
    // Add any new column IDs that weren't in the previous config (default to visible)
    const newColumnIds = nonNameColumnIds.filter(id => !previousVisibleIds.has(id));
    
    editingTeamsDisplayConfig = {
      visibleColumnIds: [...validPreviousIds, ...newColumnIds]
    };
  }
  
  // Use editing config for visibility (so checkboxes match initialized state)
  const visibleIds = new Set(editingTeamsDisplayConfig.visibleColumnIds);
  
  for (const column of orderedColumns) {
    const isNameColumn = column.columnType === 'name';
    const isChecked = isNameColumn || visibleIds.has(column.id);
    
    const row = createElement('div', {
      className: `teams-display-column-row ${isChecked ? 'checked' : ''} ${isNameColumn ? 'is-name' : ''}`,
      dataset: { columnId: column.id }
    });
    
    const checkbox = createElement('input', {
      type: 'checkbox',
      className: 'teams-display-checkbox',
      checked: isChecked,
      disabled: isNameColumn,
      dataset: { columnId: column.id }
    });
    row.appendChild(checkbox);
    
    const name = createElement('span', { className: 'teams-display-column-name' }, column.displayName);
    row.appendChild(name);
    
    const typeClass = `column-type-${column.columnType}`;
    const type = createElement('span', { 
      className: `teams-display-column-type ${typeClass}` 
    }, COLUMN_TYPE_LABELS[column.columnType] || column.columnType);
    row.appendChild(type);
    
    container.appendChild(row);
  }
}

/**
 * Gets the current teams display config from the modal
 * @returns {import('../storage/persistence.js').TeamsDisplayConfig}
 */
export function getTeamsDisplayConfigFromModal() {
  return editingTeamsDisplayConfig || { visibleColumnIds: [] };
}

/**
 * Updates the editing teams display config when a checkbox changes
 * @param {string} columnId
 * @param {boolean} isChecked
 */
export function updateTeamsDisplayColumn(columnId, isChecked) {
  if (!editingTeamsDisplayConfig) return;
  
  const row = document.querySelector(`.teams-display-column-row[data-column-id="${columnId}"]`);
  
  if (isChecked) {
    if (!editingTeamsDisplayConfig.visibleColumnIds.includes(columnId)) {
      editingTeamsDisplayConfig.visibleColumnIds.push(columnId);
    }
    row?.classList.add('checked');
  } else {
    editingTeamsDisplayConfig.visibleColumnIds = 
      editingTeamsDisplayConfig.visibleColumnIds.filter(id => id !== columnId);
    row?.classList.remove('checked');
  }
}

/**
 * Shows the teams display modal
 */
export function showTeamsDisplayModal() {
  const modal = document.getElementById('teams-display-modal');
  if (modal) {
    modal.hidden = false;
  }
}

/**
 * Hides the teams display modal
 */
export function hideTeamsDisplayModal() {
  const modal = document.getElementById('teams-display-modal');
  if (modal) {
    modal.hidden = true;
  }
  editingTeamsDisplayConfig = null;
}


/* ============================================================================
   Teams Layout Configuration Modal
   ============================================================================ */

/**
 * @typedef {import('../storage/persistence.js').TeamsLayoutConfig} TeamsLayoutConfig
 * @typedef {import('../validation/schema.js').ParseError} ParseError
 */

/**
 * Converts column index to Excel-style label (A, B, ..., Z, AA, AB, ...)
 * @param {number} index - 0-based column index
 * @returns {string}
 */
function getColumnLabel(index) {
  let label = '';
  let n = index;
  while (n >= 0) {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  }
  return label;
}

/**
 * Calculates team block width
 * @param {TeamsLayoutConfig} config
 * @returns {number}
 */
function getBlockWidth(config) {
  return config.columnsPerTeam + config.separatorColumns;
}

/**
 * Calculates team block height (including separator rows)
 * @param {TeamsLayoutConfig} config
 * @returns {number}
 */
function getBlockHeight(config) {
  return config.headerRows + config.playersPerTeam + config.rowsBetweenBlocks;
}

/**
 * @typedef {Object} CellInfo
 * @property {string} type - Cell type (header, role, nickname, rating, data, separator, offset)
 * @property {number} teamIdx - Team index in row (-1 if in offset area)
 * @property {number} blockRow - Block row index (0-based, -1 if in offset area)
 * @property {boolean} isTeamTop - Is first row of team data
 * @property {boolean} isTeamBottom - Is last row of team data
 * @property {boolean} isTeamLeft - Is first column of team data
 * @property {boolean} isTeamRight - Is last column of team data
 * @property {boolean} isSeparator - Is in separator area
 * @property {boolean} isOffset - Is in initial offset area
 */

/**
 * Determines cell type for styling
 * @param {number} row - Row index in the data
 * @param {number} col - Column index in the data
 * @param {TeamsLayoutConfig} config
 * @returns {CellInfo}
 */
function getCellType(row, col, config) {
  const startRow = config.startRow ?? 0;
  const startCol = config.startCol ?? 0;
  
  // Check if in offset area
  if (row < startRow || col < startCol) {
    return {
      type: 'offset',
      teamIdx: -1,
      blockRow: -1,
      isTeamTop: false,
      isTeamBottom: false,
      isTeamLeft: false,
      isTeamRight: false,
      isSeparator: false,
      isOffset: true
    };
  }
  
  // Adjust coordinates relative to start position
  const adjRow = row - startRow;
  const adjCol = col - startCol;
  
  const blockWidth = getBlockWidth(config);
  const blockHeight = getBlockHeight(config);
  
  const teamIdx = Math.floor(adjCol / blockWidth);
  const colInTeam = adjCol % blockWidth;
  const blockRow = Math.floor(adjRow / blockHeight);
  const rowInBlock = adjRow % blockHeight;
  
  // Check if beyond the configured teams per row (excess columns)
  const isOutsideTeamGrid = teamIdx >= config.teamsPerRow;
  
  const teamDataHeight = config.headerRows + config.playersPerTeam;
  
  const isSeparatorCol = colInTeam >= config.columnsPerTeam || isOutsideTeamGrid;
  const isSeparatorRow = rowInBlock >= teamDataHeight;
  const isSeparator = isSeparatorCol || isSeparatorRow;
  
  // Team rectangle boundaries (within team data area only, and within teamsPerRow)
  const isValidTeam = teamIdx < config.teamsPerRow;
  const isTeamTop = rowInBlock === 0 && !isSeparator && isValidTeam;
  const isTeamBottom = rowInBlock === teamDataHeight - 1 && !isSeparator && isValidTeam;
  const isTeamLeft = colInTeam === 0 && !isSeparator && isValidTeam;
  const isTeamRight = colInTeam === config.columnsPerTeam - 1 && !isSeparator && isValidTeam;
  
  let type = 'data';
  
  if (isSeparator) {
    type = 'separator';
  } else if (rowInBlock < config.headerRows) {
    type = 'header';
  } else {
    // Player row - only nickname column (index 1) is important
    // Other columns are ignored (data comes from players table)
    if (colInTeam === 1) type = 'nickname';
    else type = 'ignored';
  }
  
  return {
    type,
    teamIdx,
    blockRow,
    isTeamTop,
    isTeamBottom,
    isTeamLeft,
    isTeamRight,
    isSeparator,
    isOffset: false
  };
}

/**
 * Renders the teams layout preview table
 * @param {string[][]} rawData - All rows from the sheet
 * @param {TeamsLayoutConfig} config
 * @param {ParseError|null} parseError
 */
export function renderTeamsLayoutPreview(rawData, config, parseError = null) {
  const container = document.getElementById('teams-layout-preview');
  if (!container) return;
  
  // Show all rows and columns - user can scroll
  const rowsToShow = rawData.length;
  const colsToShow = rawData.reduce((max, row) => Math.max(max, row?.length || 0), 0);
  
  const table = createElement('table', { className: 'teams-preview-table' });
  
  // Column headers row (A, B, C, ... AA, AB, ...)
  const headerRow = createElement('tr');
  headerRow.appendChild(createElement('td', { className: 'col-header row-number' }, ''));
  for (let c = 0; c < colsToShow; c++) {
    const colLabel = getColumnLabel(c);
    headerRow.appendChild(createElement('td', { className: 'col-header' }, colLabel));
  }
  table.appendChild(headerRow);
  
  // Data rows
  for (let r = 0; r < rowsToShow; r++) {
    const tr = createElement('tr');
    
    // Row number
    tr.appendChild(createElement('td', { className: 'row-number' }, String(r + 1)));
    
    const row = rawData[r] || [];
    
    for (let c = 0; c < colsToShow; c++) {
      const value = row[c] || '';
      const cellInfo = getCellType(r, c, config);
      
      const classes = [];
      
      // Cell type styling
      if (cellInfo.isOffset) {
        classes.push('offset-cell');
      } else if (cellInfo.type === 'separator') {
        classes.push('separator-cell');
      } else if (cellInfo.type === 'header') {
        classes.push('team-header-cell');
      } else if (cellInfo.type === 'nickname') {
        classes.push('player-nickname-cell');
      } else if (cellInfo.type === 'ignored') {
        classes.push('ignored-cell');
      }
      
      if (!value.trim()) {
        classes.push('empty-cell');
      }
      
      // Team rectangle boundaries
      if (cellInfo.isTeamTop) {
        classes.push('team-border-top');
      }
      if (cellInfo.isTeamBottom) {
        classes.push('team-border-bottom');
      }
      if (cellInfo.isTeamLeft) {
        classes.push('team-border-left');
      }
      if (cellInfo.isTeamRight) {
        classes.push('team-border-right');
      }
      
      // Error highlighting
      if (parseError && parseError.row === r && parseError.col === c) {
        classes.push('error-cell');
      }
      
      const td = createElement('td', { className: classes.join(' ') });
      td.textContent = value.length > 15 ? value.substring(0, 12) + '...' : value;
      td.title = value; // Full value on hover
      tr.appendChild(td);
    }
    
    table.appendChild(tr);
  }
  
  container.innerHTML = '';
  container.appendChild(table);
}

/**
 * Sets the layout parameters in the modal inputs
 * @param {TeamsLayoutConfig} config
 */
export function setTeamsLayoutParams(config) {
  const setInput = (id, value) => {
    const input = /** @type {HTMLInputElement} */ (document.getElementById(id));
    if (input) input.value = String(value);
  };
  
  setInput('param-start-row', config.startRow ?? 0);
  setInput('param-start-col', config.startCol ?? 0);
  setInput('param-teams-per-row', config.teamsPerRow);
  setInput('param-columns-per-team', config.columnsPerTeam);
  setInput('param-separator-columns', config.separatorColumns);
  setInput('param-header-rows', config.headerRows);
  setInput('param-players-per-team', config.playersPerTeam);
  setInput('param-rows-between-blocks', config.rowsBetweenBlocks);
}

/**
 * Gets the layout parameters from the modal inputs
 * @returns {TeamsLayoutConfig}
 */
export function getTeamsLayoutParams() {
  const getInput = (id, defaultVal) => {
    const input = /** @type {HTMLInputElement} */ (document.getElementById(id));
    const val = input ? parseInt(input.value, 10) : defaultVal;
    return isNaN(val) ? defaultVal : val;
  };
  
  return {
    startRow: getInput('param-start-row', 0),
    startCol: getInput('param-start-col', 0),
    teamsPerRow: getInput('param-teams-per-row', 3),
    columnsPerTeam: getInput('param-columns-per-team', 4),
    separatorColumns: getInput('param-separator-columns', 1),
    headerRows: getInput('param-header-rows', 2),
    playersPerTeam: getInput('param-players-per-team', 5),
    rowsBetweenBlocks: getInput('param-rows-between-blocks', 1)
  };
}

/**
 * Shows the teams layout error message
 * @param {string} message
 */
export function showTeamsLayoutError(message) {
  const errorDiv = document.getElementById('teams-layout-error');
  const errorMsg = document.getElementById('teams-layout-error-message');
  
  if (errorDiv && errorMsg) {
    errorMsg.textContent = message;
    errorDiv.hidden = false;
  }
}

/**
 * Hides the teams layout error message
 */
export function hideTeamsLayoutError() {
  const errorDiv = document.getElementById('teams-layout-error');
  if (errorDiv) {
    errorDiv.hidden = true;
  }
}

/**
 * Enables or disables the confirm button
 * @param {boolean} enabled
 */
export function setTeamsLayoutConfirmEnabled(enabled) {
  const btn = /** @type {HTMLButtonElement} */ (document.getElementById('confirm-teams-layout'));
  if (btn) {
    btn.disabled = !enabled;
  }
}

/**
 * Shows the teams layout modal
 */
export function showTeamsLayoutModal() {
  const modal = document.getElementById('teams-layout-modal');
  if (modal) {
    modal.hidden = false;
  }
}

/**
 * Hides the teams layout modal
 */
export function hideTeamsLayoutModal() {
  const modal = document.getElementById('teams-layout-modal');
  if (modal) {
    modal.hidden = true;
  }
}

/**
 * Renders the full teams layout modal
 * @param {string[][]} rawData - All rows from the sheet
 * @param {TeamsLayoutConfig} config - Initial config
 * @param {ParseError|null} parseError - Parse error to highlight
 */
export function renderTeamsLayoutModal(rawData, config, parseError = null) {
  setTeamsLayoutParams(config);
  renderTeamsLayoutPreview(rawData, config, parseError);
  
  if (parseError) {
    showTeamsLayoutError(parseError.message);
    setTeamsLayoutConfirmEnabled(false);
  } else {
    hideTeamsLayoutError();
    setTeamsLayoutConfirmEnabled(true);
  }
}

