/**
 * DOM rendering functions
 */

import { createElement, escapeHtml, getRoleClass, getRatingClass, formatRelativeTime } from './components.js';

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
 * Updates the current sheet info in settings
 * @param {Object} sheet 
 * @param {string} sheet.spreadsheetId
 * @param {string} sheet.gid
 * @param {string} [sheet.alias]
 */
export function updateSheetInfo(sheet) {
  const infoEl = document.getElementById('current-sheet-info');
  if (!infoEl) return;
  
  if (sheet.alias) {
    infoEl.innerHTML = `<strong>${escapeHtml(sheet.alias)}</strong><br><small>ID: ${escapeHtml(sheet.spreadsheetId)}</small>`;
  } else {
    infoEl.textContent = `ID: ${sheet.spreadsheetId}`;
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

