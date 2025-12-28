/**
 * DOM rendering functions
 */

import { createElement, escapeHtml, getRoleClass, getRatingClass, formatRelativeTime, createRoleIcon, createHeroIconsContainer, createRankBadge } from './components.js';
import { validateTeamsData, formatValidationErrors, getSchemaDocumentation } from '../validation/schema.js';
import { isLoaded as isOverfastLoaded } from '../api/overfast.js';
import * as store from '../state/store.js';
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
 * Renders players table with only mandatory columns
 * @param {string[]} headers 
 * @param {string[][]} data 
 * @param {import('../validation/schema.js').Team[]} [teams] - Optional teams for filtering
 */
export function renderPlayersTable(headers, data, teams = []) {
  const mandatoryCols = findMandatoryColumnIndices(headers);
  
  // Render header with mandatory columns only
  const thead = document.getElementById('table-header');
  if (thead) {
    thead.innerHTML = '';
    const tr = createElement('tr');
    
    for (const col of mandatoryCols) {
      const th = createElement('th', {}, escapeHtml(col.header));
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
 * Renders full player details in the right panel
 * @param {import('../state/store.js').Player} player
 * @param {string[]} headers - All headers from the sheet
 */
export function renderPlayerDetailsPanel(player, headers) {
  const container = document.getElementById('player-details-content');
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
 * Updates polling interval display
 * @param {number} ms 
 */
export function updatePollingDisplay(ms) {
  const slider = /** @type {HTMLInputElement} */ (document.getElementById('polling-interval'));
  const display = document.getElementById('polling-value');
  
  if (slider) slider.value = String(ms);
  if (display) display.textContent = `${ms / 1000}s`;
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
 * Updates filters visibility
 * @param {boolean} showFilters 
 */
export function updateFiltersVisibility(showFilters) {
  const filters = document.getElementById('player-filters');
  if (filters) {
    filters.hidden = !showFilters;
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
 * @param {import('../state/store.js').Player} player
 * @param {string[]} headers - All headers from the players sheet
 */
export function renderTeamsPlayerDetailsPanel(player, headers) {
  const container = document.getElementById('teams-player-details-content');
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
 */
export function hideColumnMappingModal() {
  const modal = document.getElementById('column-mapping-modal');
  if (modal) {
    modal.hidden = true;
  }
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

