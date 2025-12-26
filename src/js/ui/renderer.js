/**
 * DOM rendering functions
 */

import { createElement, escapeHtml, getRoleClass, getRatingClass, formatRelativeTime } from './components.js';
import { validateTeamsData, formatValidationErrors, getSchemaDocumentation } from '../validation/schema.js';

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
 * Renders a single cell with appropriate styling
 * @param {string} value 
 * @param {string} header 
 * @param {number} colIndex 
 * @returns {HTMLElement}
 */
function renderCell(value, header, colIndex) {
  const td = createElement('td');
  
  // Apply role-specific styling
  if (isRoleColumn(header)) {
    const roleClass = getRoleClass(value);
    if (roleClass) td.classList.add(roleClass);
    td.textContent = value;
    return td;
  }
  
  // Apply rating-specific styling
  if (isRatingColumn(header)) {
    const ratingClass = getRatingClass(value);
    if (ratingClass) {
      const badge = createElement('span', { className: `rating-badge ${ratingClass}` }, value);
      td.appendChild(badge);
      return td;
    }
  }
  
  // Default: escape and display text
  td.textContent = value;
  return td;
}

/**
 * Renders table body with data rows
 * @param {string[][]} data 
 * @param {string[]} headers 
 */
export function renderTableBody(data, headers) {
  const tbody = document.getElementById('table-body');
  if (!tbody) return;
  
  // Create document fragment for efficient DOM updates
  const fragment = document.createDocumentFragment();
  const newRowData = new Map();
  
  data.forEach((row, rowIndex) => {
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
 * Renders the full table
 * @param {string[]} headers 
 * @param {string[][]} data 
 */
export function renderTable(headers, data) {
  renderTableHeader(headers);
  renderTableBody(data, headers);
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
    const rating = createElement('span', { className: 'team-rating' }, String(team.avgRating));
    header.appendChild(rating);
  }
  
  card.appendChild(header);
  
  // Players
  const playersContainer = createElement('div', { className: 'team-players' });
  
  team.players.forEach(player => {
    const playerRow = createElement('div', { className: 'team-player' });
    
    // Role badge
    const roleLabel = getRoleBadgeLabel(player.role);
    const roleBadge = createElement('span', { 
      className: `player-role ${player.role}` 
    }, roleLabel);
    playerRow.appendChild(roleBadge);
    
    // Nickname
    const nickname = createElement('span', { className: 'player-nickname' }, player.nickname);
    playerRow.appendChild(nickname);
    
    // Rating
    const ratingClass = getRatingClass(String(player.rating));
    const rating = createElement('span', { 
      className: `player-rating ${ratingClass}` 
    }, String(player.rating));
    playerRow.appendChild(rating);
    
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
  renderDraftPlayerLists(unselectedByRole);
  clearDraftPlayerDescription();
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
    const slotEl = createDraftSlot(slot.role, player);
    slotsContainer.appendChild(slotEl);
  });
}

/**
 * Creates a draft slot element
 * @param {'tank'|'dps'|'support'} role
 * @param {TeamPlayer|undefined} player
 * @returns {HTMLElement}
 */
function createDraftSlot(role, player) {
  const slotEl = createElement('div', { 
    className: `draft-slot ${player ? 'filled' : 'empty'}`,
    dataset: { role }
  });
  
  if (player) {
    slotEl.dataset.nickname = player.nickname;
  }
  
  // Role badge
  const roleBadge = createElement('span', { 
    className: `slot-role-badge ${role}` 
  }, getRoleBadgeLabel(role));
  slotEl.appendChild(roleBadge);
  
  // Player name
  const nameEl = createElement('span', { className: 'slot-player-name' }, 
    player ? player.nickname : '-');
  slotEl.appendChild(nameEl);
  
  // Rating
  if (player) {
    const ratingClass = getRatingClass(String(player.rating));
    const ratingEl = createElement('span', { 
      className: `slot-player-rating ${ratingClass}` 
    }, String(player.rating));
    slotEl.appendChild(ratingEl);
  } else {
    slotEl.appendChild(createElement('span', { className: 'slot-player-rating' }, ''));
  }
  
  return slotEl;
}

/**
 * Renders the player description panel
 * @param {Player} player
 */
export function renderDraftPlayerDescription(player) {
  const container = document.getElementById('draft-player-details');
  if (!container) return;
  
  const ratingClass = getRatingClass(String(player.rating));
  
  container.innerHTML = `
    <div class="player-details-card">
      <div class="player-details-header">
        <span class="player-role-large ${player.role}">${getRoleBadgeLabel(player.role)}</span>
        <h4 class="player-details-name">${escapeHtml(player.nickname)}</h4>
      </div>
      <div class="player-details-stats">
        <div class="player-stat">
          <span class="stat-label">Рейтинг</span>
          <span class="stat-value ${ratingClass}">${player.rating}</span>
        </div>
        <div class="player-stat">
          <span class="stat-label">Роль</span>
          <span class="stat-value">${getRoleLabel(player.role)}</span>
        </div>
      </div>
      ${player.heroes ? `
        <div class="player-details-heroes">
          <span class="stat-label">Герои</span>
          <div class="heroes-list">${escapeHtml(player.heroes)}</div>
        </div>
      ` : ''}
    </div>
  `;
  
  // Mark as selected in the container
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
 * Renders the unselected players lists
 * @param {{tank: Player[], dps: Player[], support: Player[]}} playersByRole
 */
function renderDraftPlayerLists(playersByRole) {
  renderPlayerPoolColumn('draft-pool-tank', playersByRole.tank);
  renderPlayerPoolColumn('draft-pool-dps', playersByRole.dps);
  renderPlayerPoolColumn('draft-pool-support', playersByRole.support);
}

/**
 * Renders a single player pool column
 * @param {string} containerId
 * @param {Player[]} players
 */
function renderPlayerPoolColumn(containerId, players) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  container.innerHTML = '';
  
  if (players.length === 0) {
    container.innerHTML = '<div class="pool-empty">Нет игроков</div>';
    return;
  }
  
  players.forEach(player => {
    const card = createPoolPlayerCard(player);
    container.appendChild(card);
  });
}

/**
 * Creates a player card for the pool list
 * @param {Player} player
 * @returns {HTMLElement}
 */
function createPoolPlayerCard(player) {
  const ratingClass = getRatingClass(String(player.rating));
  
  const card = createElement('div', { 
    className: 'pool-player-card',
    dataset: { nickname: player.nickname }
  });
  
  // Nickname
  const nameEl = createElement('span', { className: 'pool-player-name' }, player.nickname);
  card.appendChild(nameEl);
  
  // Rating
  const ratingEl = createElement('span', { 
    className: `pool-player-rating ${ratingClass}` 
  }, String(player.rating));
  card.appendChild(ratingEl);
  
  return card;
}

/**
 * Updates selected player highlight in draft view
 * @param {string|null} nickname - Selected player nickname or null to clear
 */
export function updateDraftPlayerSelection(nickname) {
  // Clear previous selection
  document.querySelectorAll('.draft-slot.selected, .pool-player-card.selected').forEach(el => {
    el.classList.remove('selected');
  });
  
  if (!nickname) return;
  
  // Highlight in team slots
  const teamSlot = document.querySelector(`.draft-slot[data-nickname="${CSS.escape(nickname)}"]`);
  if (teamSlot) {
    teamSlot.classList.add('selected');
  }
  
  // Highlight in pool lists
  const poolCard = document.querySelector(`.pool-player-card[data-nickname="${CSS.escape(nickname)}"]`);
  if (poolCard) {
    poolCard.classList.add('selected');
  }
}

