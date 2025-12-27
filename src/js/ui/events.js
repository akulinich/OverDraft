/**
 * Event handlers and DOM interactions
 */

import { parseSheetUrl, validateSheetUrl } from '../utils/parser.js';
import { fetchSheet, SheetError } from '../api/sheets.js';
import * as store from '../state/store.js';
import * as renderer from './renderer.js';

/** @type {function|null} */
let onSheetConfigured = null;

/** @type {function|null} */
let onPollingIntervalChange = null;

/** @type {function|null} */
let onTeamSelect = null;

/** @type {function|null} */
let onPlayerSelect = null;

/** @type {function|null} */
let onDraftBack = null;

/** @type {function|null} */
let onFilterChange = null;

/** @type {function|null} */
let onPlayerRowSelect = null;

/**
 * Shows a modal
 * @param {string} modalId 
 * @param {Object} [options]
 * @param {boolean} [options.prefill] - Pre-fill setup modal with current config
 */
export function showModal(modalId, options = {}) {
  const modal = document.getElementById(modalId);
  if (modal) {
    // Handle setup modal special cases
    if (modalId === 'setup-modal') {
      if (options.prefill) {
        prefillSetupModal();
      } else {
        resetSetupModal();
      }
    }
    modal.hidden = false;
  }
}

/**
 * Builds Google Sheets URL from spreadsheetId and gid
 * @param {string} spreadsheetId 
 * @param {string} gid 
 * @returns {string}
 */
function buildSheetUrl(spreadsheetId, gid) {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${gid}`;
}

/**
 * Pre-fills setup modal with current configuration
 */
function prefillSetupModal() {
  const urlInput = /** @type {HTMLInputElement} */ (document.getElementById('sheet-url'));
  const teamsUrlInput = /** @type {HTMLInputElement} */ (document.getElementById('teams-url'));
  const feedback = document.getElementById('url-feedback');
  const teamsFeedback = document.getElementById('teams-url-feedback');
  const confirmBtn = /** @type {HTMLButtonElement} */ (document.getElementById('confirm-sheet'));
  const header = document.getElementById('setup-modal-header');
  
  // Hide header when editing existing config
  if (header) {
    header.hidden = true;
  }
  
  // Pre-fill players sheet
  const sheet = store.getFirstSheet();
  if (sheet && urlInput) {
    urlInput.value = buildSheetUrl(sheet.spreadsheetId, sheet.gid);
    if (feedback) {
      feedback.textContent = `✓ URL корректный (gid: ${sheet.gid})`;
      feedback.className = 'feedback success';
    }
    if (confirmBtn) {
      confirmBtn.disabled = false;
    }
  }
  
  // Pre-fill teams sheet
  const teamsSheet = store.getTeamsSheet();
  if (teamsSheet && teamsUrlInput) {
    teamsUrlInput.value = buildSheetUrl(teamsSheet.spreadsheetId, teamsSheet.gid);
    if (teamsFeedback) {
      teamsFeedback.textContent = `✓ URL корректный (gid: ${teamsSheet.gid})`;
      teamsFeedback.className = 'feedback success';
    }
  }
}

/**
 * Resets setup modal to initial state (for first-time setup)
 */
function resetSetupModal() {
  const urlInput = /** @type {HTMLInputElement} */ (document.getElementById('sheet-url'));
  const teamsUrlInput = /** @type {HTMLInputElement} */ (document.getElementById('teams-url'));
  const feedback = document.getElementById('url-feedback');
  const teamsFeedback = document.getElementById('teams-url-feedback');
  const confirmBtn = /** @type {HTMLButtonElement} */ (document.getElementById('confirm-sheet'));
  const header = document.getElementById('setup-modal-header');
  
  // Show header for first-time setup
  if (header) {
    header.hidden = false;
  }
  
  // Clear all inputs
  if (urlInput) urlInput.value = '';
  if (teamsUrlInput) teamsUrlInput.value = '';
  
  if (feedback) {
    feedback.textContent = '';
    feedback.className = 'feedback';
  }
  if (teamsFeedback) {
    teamsFeedback.textContent = '';
    teamsFeedback.className = 'feedback';
  }
  if (confirmBtn) {
    confirmBtn.disabled = true;
  }
}

/**
 * Hides a modal
 * @param {string} modalId 
 */
export function hideModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.hidden = true;
}

/**
 * Gets Russian error message for URL validation
 * @param {string} [error]
 * @returns {string}
 */
function getUrlValidationError(error) {
  switch (error) {
    case 'URL is required':
      return 'Введите URL';
    case 'Not a Google Sheets URL':
      return 'Это не ссылка на Google Таблицу';
    case 'Could not parse spreadsheet ID':
      return 'Не удалось определить ID таблицы';
    default:
      return error || 'Некорректный URL';
  }
}

/**
 * Validates a URL input field
 * @param {HTMLInputElement} urlInput 
 * @param {HTMLElement} feedback 
 * @returns {boolean} Whether the URL is valid
 */
function validateUrlInput(urlInput, feedback) {
  const url = urlInput.value.trim();
  
  if (!url) {
    feedback.textContent = '';
    feedback.className = 'feedback';
    return false;
  }
  
  const result = validateSheetUrl(url);
  
  if (result.valid) {
    const parsed = parseSheetUrl(url);
    feedback.textContent = `✓ URL корректный (gid: ${parsed?.gid || '0'})`;
    feedback.className = 'feedback success';
    return true;
  } else {
    feedback.textContent = getUrlValidationError(result.error);
    feedback.className = 'feedback error';
    return false;
  }
}

/**
 * Updates confirm button state based on both URL inputs
 */
function updateConfirmButtonState() {
  const urlInput = /** @type {HTMLInputElement} */ (document.getElementById('sheet-url'));
  const urlFeedback = document.getElementById('url-feedback');
  const confirmBtn = /** @type {HTMLButtonElement} */ (document.getElementById('confirm-sheet'));
  
  if (!urlInput || !confirmBtn) return;
  
  // Main sheet URL is required
  const isMainUrlValid = urlInput.value.trim() && urlFeedback?.classList.contains('success');
  confirmBtn.disabled = !isMainUrlValid;
}

/**
 * Sets up URL input validation
 */
function setupUrlValidation() {
  const urlInput = /** @type {HTMLInputElement} */ (document.getElementById('sheet-url'));
  const feedback = document.getElementById('url-feedback');
  const teamsUrlInput = /** @type {HTMLInputElement} */ (document.getElementById('teams-url'));
  const teamsFeedback = document.getElementById('teams-url-feedback');
  
  if (!urlInput || !feedback) return;
  
  urlInput.addEventListener('input', () => {
    clearSetupError();
    validateUrlInput(urlInput, feedback);
    updateConfirmButtonState();
  });
  
  // Teams URL validation (optional field)
  if (teamsUrlInput && teamsFeedback) {
    teamsUrlInput.addEventListener('input', () => {
      const url = teamsUrlInput.value.trim();
      if (!url) {
        teamsFeedback.textContent = '';
        teamsFeedback.className = 'feedback';
        return;
      }
      validateUrlInput(teamsUrlInput, teamsFeedback);
    });
  }
}

/**
 * Shows setup error with optional publish instructions
 * @param {string} message 
 * @param {boolean} showInstructions 
 */
function showSetupError(message, showInstructions = false) {
  const feedback = document.getElementById('url-feedback');
  const instructions = document.getElementById('setup-instructions');
  
  if (feedback) {
    feedback.textContent = message;
    feedback.className = 'feedback error';
  }
  
  if (instructions) {
    instructions.hidden = !showInstructions;
  }
}

/**
 * Clears setup error
 */
function clearSetupError() {
  const instructions = document.getElementById('setup-instructions');
  if (instructions) {
    instructions.hidden = true;
  }
}

/**
 * Sets up sheet configuration form
 */
function setupSheetForm() {
  const confirmBtn = document.getElementById('confirm-sheet');
  const urlInput = /** @type {HTMLInputElement} */ (document.getElementById('sheet-url'));
  const teamsUrlInput = /** @type {HTMLInputElement} */ (document.getElementById('teams-url'));
  const feedback = document.getElementById('url-feedback');
  const teamsFeedback = document.getElementById('teams-url-feedback');
  const btnText = confirmBtn?.querySelector('.btn-text');
  const btnLoader = confirmBtn?.querySelector('.btn-loader');
  
  if (!confirmBtn || !urlInput) return;
  
  confirmBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    const teamsUrl = teamsUrlInput?.value.trim();
    
    const parsed = parseSheetUrl(url);
    if (!parsed) return;
    
    const teamsParsed = teamsUrl ? parseSheetUrl(teamsUrl) : null;
    
    // Clear previous errors
    clearSetupError();
    
    // Show loading state
    if (btnText) btnText.textContent = 'Проверка...';
    if (btnLoader) /** @type {HTMLElement} */ (btnLoader).hidden = false;
    confirmBtn.setAttribute('disabled', 'true');
    
    // Try to fetch the sheet to validate access
    try {
      await fetchSheet(parsed.spreadsheetId, parsed.gid);
      
      // Validate teams sheet if provided
      if (teamsParsed) {
        try {
          await fetchSheet(teamsParsed.spreadsheetId, teamsParsed.gid);
          store.setTeamsSheet(teamsParsed);
        } catch (teamsErr) {
          console.warn('[Setup] Teams sheet validation failed:', teamsErr);
          // Don't block main sheet setup, just warn
          if (teamsFeedback) {
            teamsFeedback.textContent = 'Не удалось подключить таблицу команд';
            teamsFeedback.className = 'feedback error';
          }
        }
      }
      
      // Success - configure main sheet
      if (store.hasConfiguredSheets()) {
        store.replaceSheet(parsed);
      } else {
        store.addSheet(parsed);
      }
      
      // Clear inputs
      urlInput.value = '';
      if (teamsUrlInput) teamsUrlInput.value = '';
      if (feedback) {
        feedback.textContent = '';
        feedback.className = 'feedback';
      }
      if (teamsFeedback) {
        teamsFeedback.textContent = '';
        teamsFeedback.className = 'feedback';
      }
      
      // Hide modal
      hideModal('setup-modal');
      
      // Show tabs if teams sheet configured
      renderer.updateTabsVisibility(store.hasTeamsSheet());
      
      // Trigger callback
      if (onSheetConfigured) onSheetConfigured();
      
    } catch (err) {
      console.error('[Setup] Validation error:', err);
      
      // Network errors are almost always caused by unpublished sheets (CORS blocked by Google)
      // TypeError is thrown by fetch() when CORS blocks the response
      const isLikelyNotPublished = 
        (err instanceof SheetError && (err.type === 'NOT_PUBLISHED' || err.type === 'NETWORK')) ||
        err.name === 'TypeError';
      
      if (isLikelyNotPublished) {
        showSetupError('Не удалось подключиться. Вероятно, таблица не опубликована.', true);
      } else if (err instanceof SheetError && err.type === 'NOT_FOUND') {
        showSetupError('Таблица не найдена. Проверьте URL.', false);
      } else {
        showSetupError('Не удалось подключиться к таблице.', false);
      }
    } finally {
      // Reset button
      if (btnText) btnText.textContent = 'Подключить';
      if (btnLoader) /** @type {HTMLElement} */ (btnLoader).hidden = true;
      confirmBtn.removeAttribute('disabled');
    }
  });
}

/**
 * Sets up settings modal
 */
function setupSettingsModal() {
  const settingsBtn = document.getElementById('settings-btn');
  const closeBtn = document.getElementById('close-settings');
  const changeSheetBtn = document.getElementById('change-sheet');
  const pollingSlider = /** @type {HTMLInputElement} */ (document.getElementById('polling-interval'));
  const pollingValue = document.getElementById('polling-value');
  
  // Open settings
  settingsBtn?.addEventListener('click', () => {
    const sheet = store.getFirstSheet();
    if (sheet) {
      renderer.updateSheetInfo(sheet);
    }
    const teamsSheet = store.getTeamsSheet();
    renderer.updateTeamsSheetInfo(teamsSheet);
    renderer.updatePollingDisplay(store.getState().pollingInterval);
    showModal('settings-modal');
  });
  
  // Close settings
  closeBtn?.addEventListener('click', () => hideModal('settings-modal'));
  
  // Close on backdrop click
  document.getElementById('settings-modal')?.addEventListener('click', (e) => {
    if (e.target?.classList?.contains('modal-backdrop')) {
      hideModal('settings-modal');
    }
  });
  
  // Change sheet - pre-fill with current values
  changeSheetBtn?.addEventListener('click', () => {
    hideModal('settings-modal');
    showModal('setup-modal', { prefill: true });
  });
  
  // Polling interval
  pollingSlider?.addEventListener('input', () => {
    const value = parseInt(pollingSlider.value, 10);
    if (pollingValue) pollingValue.textContent = `${value / 1000}s`;
  });
  
  pollingSlider?.addEventListener('change', () => {
    const value = parseInt(pollingSlider.value, 10);
    store.setPollingInterval(value);
    if (onPollingIntervalChange) onPollingIntervalChange(value);
  });
  
  // Theme toggle
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = /** @type {'light'|'dark'} */ (btn.getAttribute('data-theme'));
      store.setTheme(theme);
      renderer.applyTheme(theme);
    });
  });
  
  // Force refresh button - clears cache and reloads
  document.getElementById('force-refresh')?.addEventListener('click', () => {
    // Clear service worker caches if any
    if ('caches' in window) {
      caches.keys().then(names => names.forEach(name => caches.delete(name)));
    }
    // Force reload with cache-busting query parameter
    const url = new URL(window.location.href);
    url.searchParams.set('_refresh', Date.now().toString());
    window.location.href = url.toString();
  });
}

/**
 * Sets up retry button
 */
function setupRetryButton() {
  const retryBtn = document.getElementById('retry-btn');
  
  retryBtn?.addEventListener('click', () => {
    if (onSheetConfigured) onSheetConfigured();
  });
}

/**
 * Sets up close modal on backdrop click for setup modal
 */
function setupModalBackdrops() {
  // Setup modal should not close on backdrop click if no sheets configured
  document.getElementById('setup-modal')?.addEventListener('click', (e) => {
    if (e.target?.classList?.contains('modal-backdrop') && store.hasConfiguredSheets()) {
      hideModal('setup-modal');
    }
  });
}

/**
 * Sets up tab navigation
 * @param {function} onTabChange - Called when tab changes
 */
function setupTabs(onTabChange) {
  const tabsNav = document.getElementById('main-tabs');
  if (!tabsNav) return;
  
  tabsNav.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    
    const tab = btn.dataset.tab;
    if (!tab) return;
    
    // Update active state
    tabsNav.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.toggle('active', b === btn);
    });
    
    // Update store and trigger callback
    store.setActiveTab(tab);
    if (onTabChange) onTabChange(tab);
  });
}

/**
 * Sets up team card click handlers for draft view
 */
function setupTeamCardClicks() {
  const teamsContainer = document.getElementById('teams-container');
  if (!teamsContainer) return;
  
  teamsContainer.addEventListener('click', (e) => {
    const card = e.target.closest('.team-card');
    if (!card) return;
    
    // Get team name from card
    const teamNameEl = card.querySelector('.team-name');
    if (!teamNameEl) return;
    
    const teamName = teamNameEl.textContent;
    if (onTeamSelect) {
      onTeamSelect(teamName);
    }
  });
}

/**
 * Sets up draft view event handlers
 */
function setupDraftViewEvents() {
  // Back button
  const backBtn = document.getElementById('draft-back-btn');
  backBtn?.addEventListener('click', () => {
    if (onDraftBack) onDraftBack();
  });
  
  // Team slot clicks (using unified player-row class)
  const teamSlots = document.getElementById('draft-team-slots');
  teamSlots?.addEventListener('click', (e) => {
    const row = e.target.closest('.player-row');
    if (!row || row.classList.contains('empty')) return;
    
    const nickname = row.dataset.nickname;
    if (nickname && onPlayerSelect) {
      onPlayerSelect(nickname);
    }
  });
  
  // Pool player clicks (single list container)
  const playerPool = document.getElementById('draft-player-pool');
  playerPool?.addEventListener('click', (e) => {
    const row = e.target.closest('.player-row');
    if (!row) return;
    
    const nickname = row.dataset.nickname;
    if (nickname && onPlayerSelect) {
      onPlayerSelect(nickname);
    }
  });
}

/**
 * Sets up filter button event handlers
 */
function setupFilterButtons() {
  const filtersContainer = document.getElementById('player-filters');
  if (!filtersContainer) return;
  
  filtersContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    
    const filterType = btn.dataset.filter;
    if (!filterType) return;
    
    if (filterType === 'available') {
      store.toggleFilterAvailableOnly();
    } else if (filterType === 'tank' || filterType === 'dps' || filterType === 'support') {
      store.toggleFilterRole(filterType);
    }
    
    // Update button states
    renderer.updateFilterButtonStates();
    
    // Trigger callback to re-render
    if (onFilterChange) {
      onFilterChange();
    }
  });
}

/**
 * Sets up player row click handlers in the players table
 */
function setupPlayerRowClicks() {
  const tableBody = document.getElementById('table-body');
  if (!tableBody) return;
  
  tableBody.addEventListener('click', (e) => {
    const row = e.target.closest('.player-table-row');
    if (!row) return;
    
    const rowIndex = parseInt(row.dataset.rowIndex, 10);
    if (isNaN(rowIndex)) return;
    
    if (onPlayerRowSelect) {
      onPlayerRowSelect(rowIndex);
    }
  });
}

/**
 * Initializes all event handlers
 * @param {Object} callbacks
 * @param {function} callbacks.onSheetConfigured - Called when sheet is configured
 * @param {function} callbacks.onPollingIntervalChange - Called when polling interval changes
 * @param {function} [callbacks.onTabChange] - Called when tab changes
 * @param {function} [callbacks.onTeamSelect] - Called when a team card is clicked
 * @param {function} [callbacks.onPlayerSelect] - Called when a player is selected in draft view
 * @param {function} [callbacks.onDraftBack] - Called when back button in draft view is clicked
 * @param {function} [callbacks.onFilterChange] - Called when a filter is toggled
 * @param {function} [callbacks.onPlayerRowSelect] - Called when a player row is clicked in players table
 */
export function initializeEvents(callbacks) {
  onSheetConfigured = callbacks.onSheetConfigured || null;
  onPollingIntervalChange = callbacks.onPollingIntervalChange || null;
  onTeamSelect = callbacks.onTeamSelect || null;
  onPlayerSelect = callbacks.onPlayerSelect || null;
  onDraftBack = callbacks.onDraftBack || null;
  onFilterChange = callbacks.onFilterChange || null;
  onPlayerRowSelect = callbacks.onPlayerRowSelect || null;
  
  setupUrlValidation();
  setupSheetForm();
  setupSettingsModal();
  setupRetryButton();
  setupModalBackdrops();
  setupTabs(callbacks.onTabChange);
  setupTeamCardClicks();
  setupDraftViewEvents();
  setupFilterButtons();
  setupPlayerRowClicks();
}

