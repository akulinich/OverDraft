/**
 * DOM rendering functions
 */

import { createElement, escapeHtml, getRoleClass, getRatingClass, formatRelativeTime, createRoleIcon, createHeroIconsContainer, createRankBadge } from './components.js';
import { validateTeamsData, formatValidationErrors, getSchemaDocumentation } from '../validation/schema.js';
import { isLoaded as isOverfastLoaded } from '../api/overfast.js';
import * as store from '../state/store.js';

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

/** @type {Map<string, string>} Cache of previous row data for change detection */
const previousRowData = new Map();

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
 * Determines if a column contains rating data based on header
 * @param {string} header 
 * @returns {boolean}
 */
function isRatingColumn(header) {
  const lower = header.toLowerCase();
  return lower.includes('рейтинг') || lower.includes('rating') || lower.includes('sr');
}

/**
 * Determines if a column contains role data based on header
 * @param {string} header 
 * @returns {boolean}
 */
function isRoleColumn(header) {
  const lower = header.toLowerCase();
  return lower.includes('роль') || lower.includes('role');
}

/**
 * Determines if a column contains heroes data based on header
 * @param {string} header 
 * @returns {boolean}
 */
function isHeroesColumn(header) {
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
 * @returns {HTMLElement}
 */
function renderCell(value, header, colIndex) {
  const td = createElement('td');
  
  // Skip icon rendering for comment columns
  if (isCommentColumn(header)) {
    td.textContent = value;
    return td;
  }
  
  // Apply role-specific styling with icon
  if (isRoleColumn(header)) {
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
  if (isRatingColumn(header)) {
    td.classList.add('cell-rating');
    const rankBadge = createRankBadge(value, { showNumber: true, size: 'sm' });
    td.appendChild(rankBadge);
    return td;
  }
  
  // Apply heroes column with icons
  if (isHeroesColumn(header) && value) {
    td.classList.add('cell-heroes');
    const heroIcons = createHeroIconsContainer(value, { size: 'sm', maxIcons: 5 });
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
  
  // Find nickname column index
  const nicknameIdx = headers.findIndex(h => 
    /^(ник|никнейм|nickname|nick|имя|name|игрок|player)/i.test(h.trim())
  );
  
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
 * Finds column indices for mandatory columns
 * @param {string[]} headers
 * @returns {{key: string, index: number, header: string}[]}
 */
function findMandatoryColumnIndices(headers) {
  const result = [];
  
  for (const key of MANDATORY_COLUMNS) {
    const pattern = MANDATORY_HEADER_PATTERNS[key];
    const index = headers.findIndex(h => pattern.test(h.trim()));
    if (index !== -1) {
      result.push({ key, index, header: headers[index] });
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
      const td = renderCell(value, col.header, col.index);
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
  
  // Find nickname column index
  const nicknameIdx = headers.findIndex(h => 
    MANDATORY_HEADER_PATTERNS.nickname.test(h.trim())
  );
  
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
  ratingStat.appendChild(createElement('span', { className: 'stat-label' }, 'Рейтинг'));
  const rankBadge = createRankBadge(player.rating, { showNumber: true, size: 'md' });
  rankBadge.classList.add('stat-value');
  ratingStat.appendChild(rankBadge);
  mainStats.appendChild(ratingStat);
  
  // Role stat
  const roleStat = createElement('div', { className: 'player-info-stat' });
  roleStat.appendChild(createElement('span', { className: 'stat-label' }, 'Роль'));
  const roleValue = createElement('span', { className: 'stat-value stat-role' });
  roleValue.appendChild(createRoleIcon(player.role, { size: 'sm' }));
  roleValue.appendChild(document.createTextNode(' ' + getRoleDisplayName(player.role)));
  roleStat.appendChild(roleValue);
  mainStats.appendChild(roleStat);
  
  card.appendChild(mainStats);
  
  // Heroes section with icons
  if (player.heroes) {
    const heroesSection = createElement('div', { className: 'player-info-heroes' });
    heroesSection.appendChild(createElement('span', { className: 'stat-label' }, 'Герои'));
    const heroIcons = createHeroIconsContainer(player.heroes, { size: 'md', maxIcons: 10 });
    heroIcons.classList.add('heroes-list');
    heroesSection.appendChild(heroIcons);
    card.appendChild(heroesSection);
  }
  
  // Additional fields from rawRow (all original columns)
  if (player.rawRow && player.rawRow.length > 0 && headers.length > 0) {
    const additionalSection = createElement('div', { className: 'player-info-additional' });
    additionalSection.appendChild(createElement('span', { className: 'section-label' }, 'Все данные'));
    
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
      <p>Игрок не выбран</p>
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
    case 'tank': return 'Танк';
    case 'dps': return 'ДД';
    case 'support': return 'Саппорт';
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
    lastUpdateEl.textContent = `Updated ${formatRelativeTime(lastUpdate)}`;
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
    infoEl.textContent = 'Не настроено';
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
 * @param {'players'|'teams'|'draft'} tab 
 */
export function showTab(tab) {
  const playersDisplay = document.getElementById('data-display');
  const teamsDisplay = document.getElementById('teams-display');
  const draftDisplay = document.getElementById('draft-display');
  
  if (playersDisplay) {
    playersDisplay.hidden = tab !== 'players';
  }
  if (teamsDisplay) {
    teamsDisplay.hidden = tab !== 'teams';
  }
  if (draftDisplay) {
    draftDisplay.hidden = tab !== 'draft';
  }
  
  // Update tab button states (draft has no tab button, only accessible via team click)
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
}

/**
 * Renders teams data with validation
 * @param {string[]} headers 
 * @param {string[][]} data 
 */
export function renderTeamsView(headers, data) {
  const container = document.getElementById('teams-container');
  const errorBox = document.getElementById('teams-validation-error');
  const errorMessage = document.getElementById('teams-error-message');
  const schemaDocs = document.getElementById('schema-docs');
  
  if (!container) return;
  
  // Validate data against schema
  const validationResult = validateTeamsData(headers, data);
  
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
    container.innerHTML = '<p class="teams-not-configured">Данные команд не найдены</p>';
    return;
  }
  
  // Render teams grid
  container.innerHTML = '';
  
  teamsData.teams.forEach(team => {
    const card = createTeamCard(team);
    container.appendChild(card);
  });
}

/**
 * Creates a team card element
 * @param {import('../validation/schema.js').Team} team 
 * @returns {HTMLElement}
 */
function createTeamCard(team) {
  const card = createElement('div', { className: 'team-card' });
  
  // Header
  const header = createElement('div', { className: 'team-card-header' });
  const name = createElement('span', { className: 'team-name' }, team.name);
  header.appendChild(name);
  
  if (team.avgRating) {
    const rankBadge = createRankBadge(team.avgRating, { showNumber: true, size: 'sm' });
    rankBadge.classList.add('team-rating');
    header.appendChild(rankBadge);
  }
  
  card.appendChild(header);
  
  // Players
  const playersContainer = createElement('div', { className: 'team-players' });
  
  team.players.forEach(player => {
    const playerRow = createElement('div', { className: 'team-player' });
    
    // Role icon
    const roleIcon = createRoleIcon(player.role, { size: 'sm' });
    const roleWrapper = createElement('span', { className: `player-role ${player.role}` });
    roleWrapper.appendChild(roleIcon);
    playerRow.appendChild(roleWrapper);
    
    // Nickname
    const nickname = createElement('span', { className: 'player-nickname' }, player.nickname);
    playerRow.appendChild(nickname);
    
    // Rating with rank icon
    const rankBadge = createRankBadge(player.rating, { showNumber: true, size: 'sm' });
    rankBadge.classList.add('player-rating');
    playerRow.appendChild(rankBadge);
    
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
        <p>Таблица команд не настроена</p>
        <button id="configure-teams-btn" class="btn btn-secondary">Настроить</button>
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

// ============================================================================
// Draft View Rendering
// ============================================================================

/**
 * @typedef {import('../state/store.js').Player} Player
 * @typedef {import('../validation/schema.js').Team} Team
 * @typedef {import('../validation/schema.js').TeamPlayer} TeamPlayer
 */

/**
 * Renders the complete draft view for a team
 * @param {Team} team - The selected team
 * @param {{tank: Player[], dps: Player[], support: Player[]}} unselectedByRole - Unselected players grouped by role
 */
export function renderDraftView(team, unselectedByRole) {
  renderDraftHeader(team);
  renderDraftTeamPanel(team);
  renderDraftPlayerPool(unselectedByRole);
  clearDraftPlayerDescription();
}

/**
 * Creates a unified player row element (used in both team panel and player pool)
 * @param {Player|TeamPlayer} player - Player data
 * @param {'tank'|'dps'|'support'} role - Player role
 * @param {Object} [options]
 * @param {boolean} [options.showRoleBadge=true] - Show role badge
 * @param {boolean} [options.isTeamSlot=false] - Is this a team slot (vs pool)
 * @returns {HTMLElement}
 */
function createPlayerRow(player, role, options = {}) {
  const { showRoleBadge = true, isTeamSlot = false } = options;
  
  const row = createElement('div', {
    className: `player-row ${isTeamSlot ? 'team-slot' : 'pool-item'}`,
    dataset: { nickname: player.nickname, role }
  });
  
  // Role icon (optional)
  if (showRoleBadge) {
    const roleWrapper = createElement('span', { className: `player-row-role ${role}` });
    const roleIcon = createRoleIcon(role, { size: 'sm' });
    roleWrapper.appendChild(roleIcon);
    row.appendChild(roleWrapper);
  }
  
  // Name
  const nameEl = createElement('span', { className: 'player-row-name' }, player.nickname);
  row.appendChild(nameEl);
  
  // Rating with rank icon
  const rankBadge = createRankBadge(player.rating, { showNumber: true, size: 'sm' });
  rankBadge.classList.add('player-row-rating');
  row.appendChild(rankBadge);
  
  // Heroes with icons (if available)
  const heroes = player.heroes || '';
  if (heroes) {
    const heroesEl = createHeroIconsContainer(heroes, { size: 'sm', maxIcons: 3 });
    heroesEl.classList.add('player-row-heroes');
    row.appendChild(heroesEl);
  } else {
    row.appendChild(createElement('span', { className: 'player-row-heroes' }, ''));
  }
  
  return row;
}

/**
 * Creates an empty team slot placeholder
 * @param {'tank'|'dps'|'support'} role
 * @returns {HTMLElement}
 */
function createEmptySlot(role) {
  const row = createElement('div', {
    className: 'player-row team-slot empty',
    dataset: { role }
  });
  
  const roleWrapper = createElement('span', { className: `player-row-role ${role}` });
  const roleIcon = createRoleIcon(role, { size: 'sm' });
  roleWrapper.appendChild(roleIcon);
  row.appendChild(roleWrapper);
  
  const nameEl = createElement('span', { className: 'player-row-name empty' }, '—');
  row.appendChild(nameEl);
  
  row.appendChild(createElement('span', { className: 'player-row-rating' }, ''));
  row.appendChild(createElement('span', { className: 'player-row-heroes' }, ''));
  
  return row;
}

/**
 * Renders the draft view header with team name
 * @param {Team} team
 */
function renderDraftHeader(team) {
  const nameEl = document.getElementById('draft-team-name');
  const ratingEl = document.getElementById('draft-team-rating');
  
  if (nameEl) {
    nameEl.textContent = team.name;
  }
  if (ratingEl) {
    ratingEl.textContent = team.avgRating ? `Avg: ${team.avgRating}` : '';
  }
}

/**
 * Renders the current team panel with 5 slots
 * @param {Team} team
 */
function renderDraftTeamPanel(team) {
  const slotsContainer = document.getElementById('draft-team-slots');
  if (!slotsContainer) return;
  
  // Expected slot structure: 1 tank, 2 dps, 2 support
  const expectedSlots = [
    { role: 'tank', index: 0 },
    { role: 'dps', index: 0 },
    { role: 'dps', index: 1 },
    { role: 'support', index: 0 },
    { role: 'support', index: 1 }
  ];
  
  // Group players by role
  const playersByRole = {
    tank: team.players.filter(p => p.role === 'tank'),
    dps: team.players.filter(p => p.role === 'dps'),
    support: team.players.filter(p => p.role === 'support')
  };
  
  slotsContainer.innerHTML = '';
  
  expectedSlots.forEach(slot => {
    const player = playersByRole[slot.role][slot.index];
    const slotEl = player 
      ? createPlayerRow(player, slot.role, { isTeamSlot: true })
      : createEmptySlot(slot.role);
    slotsContainer.appendChild(slotEl);
  });
}

/**
 * Renders the player description panel
 * @param {Player} player
 */
export function renderDraftPlayerDescription(player) {
  const container = document.getElementById('draft-player-details');
  if (!container) return;
  
  container.innerHTML = '';
  
  const card = createElement('div', { className: 'player-details-card' });
  
  // Header with role icon and name
  const header = createElement('div', { className: 'player-details-header' });
  const roleWrapper = createElement('span', { className: `player-role-large ${player.role}` });
  const roleIcon = createRoleIcon(player.role, { size: 'lg' });
  roleWrapper.appendChild(roleIcon);
  header.appendChild(roleWrapper);
  header.appendChild(createElement('h4', { className: 'player-details-name' }, player.nickname));
  card.appendChild(header);
  
  // Stats section
  const stats = createElement('div', { className: 'player-details-stats' });
  
  // Rating stat with rank badge
  const ratingStat = createElement('div', { className: 'player-stat' });
  ratingStat.appendChild(createElement('span', { className: 'stat-label' }, 'Рейтинг'));
  const rankBadge = createRankBadge(player.rating, { showNumber: true, size: 'md' });
  rankBadge.classList.add('stat-value');
  ratingStat.appendChild(rankBadge);
  stats.appendChild(ratingStat);
  
  // Role stat with icon
  const roleStat = createElement('div', { className: 'player-stat' });
  roleStat.appendChild(createElement('span', { className: 'stat-label' }, 'Роль'));
  const roleStatValue = createElement('span', { className: 'stat-value' });
  roleStatValue.appendChild(createRoleIcon(player.role, { size: 'sm' }));
  roleStatValue.appendChild(document.createTextNode(' ' + getRoleLabel(player.role)));
  roleStat.appendChild(roleStatValue);
  stats.appendChild(roleStat);
  
  card.appendChild(stats);
  
  // Heroes section with icons
  if (player.heroes) {
    const heroesSection = createElement('div', { className: 'player-details-heroes' });
    heroesSection.appendChild(createElement('span', { className: 'stat-label' }, 'Герои'));
    const heroIcons = createHeroIconsContainer(player.heroes, { size: 'md', maxIcons: 8 });
    heroIcons.classList.add('heroes-list');
    heroesSection.appendChild(heroIcons);
    card.appendChild(heroesSection);
  }
  
  container.appendChild(card);
  container.classList.add('has-player');
}

/**
 * Clears the player description panel
 */
export function clearDraftPlayerDescription() {
  const container = document.getElementById('draft-player-details');
  if (!container) return;
  
  container.innerHTML = `
    <div class="player-details-empty">
      <p>Выберите игрока для просмотра информации</p>
    </div>
  `;
  container.classList.remove('has-player');
}

/**
 * Gets human-readable role label
 * @param {'tank'|'dps'|'support'} role
 * @returns {string}
 */
function getRoleLabel(role) {
  switch (role) {
    case 'tank': return 'Танк';
    case 'dps': return 'ДД';
    case 'support': return 'Саппорт';
    default: return role;
  }
}

/**
 * Renders the available players pool (single sorted list)
 * @param {{tank: Player[], dps: Player[], support: Player[]}} playersByRole
 */
function renderDraftPlayerPool(playersByRole) {
  const container = document.getElementById('draft-player-pool');
  if (!container) return;
  
  container.innerHTML = '';
  
  // Get current role filter
  const filters = store.getFilters();
  const roleFilter = filters.role;
  
  // Combine players based on role filter
  let allPlayers;
  if (roleFilter) {
    // Only show players of the filtered role
    allPlayers = [...playersByRole[roleFilter]];
  } else {
    // Show all players
    allPlayers = [
      ...playersByRole.tank,
      ...playersByRole.dps,
      ...playersByRole.support
    ];
  }
  
  // Sort by rating descending
  allPlayers.sort((a, b) => b.rating - a.rating);
  
  if (allPlayers.length === 0) {
    container.innerHTML = '<div class="pool-empty">Нет доступных игроков</div>';
    return;
  }
  
  // Create rows for each player
  allPlayers.forEach(player => {
    const row = createPlayerRow(player, player.role, { isTeamSlot: false });
    container.appendChild(row);
  });
}

/**
 * Updates selected player highlight in draft view
 * @param {string|null} nickname - Selected player nickname or null to clear
 */
export function updateDraftPlayerSelection(nickname) {
  // Clear previous selection
  document.querySelectorAll('.player-row.selected').forEach(el => {
    el.classList.remove('selected');
  });
  
  if (!nickname) return;
  
  // Highlight all rows with this nickname (team slot and/or pool item)
  document.querySelectorAll(`.player-row[data-nickname="${CSS.escape(nickname)}"]`).forEach(el => {
    el.classList.add('selected');
  });
}

