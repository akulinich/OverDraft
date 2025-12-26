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

/**
 * Shows a modal
 * @param {string} modalId 
 */
export function showModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.hidden = false;
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
 * Sets up URL input validation
 */
function setupUrlValidation() {
  const urlInput = /** @type {HTMLInputElement} */ (document.getElementById('sheet-url'));
  const feedback = document.getElementById('url-feedback');
  const confirmBtn = /** @type {HTMLButtonElement} */ (document.getElementById('confirm-sheet'));
  
  if (!urlInput || !feedback || !confirmBtn) return;
  
  urlInput.addEventListener('input', () => {
    const url = urlInput.value.trim();
    
    // Clear instructions when user types
    clearSetupError();
    
    if (!url) {
      feedback.textContent = '';
      feedback.className = 'feedback';
      confirmBtn.disabled = true;
      return;
    }
    
    const result = validateSheetUrl(url);
    
    if (result.valid) {
      const parsed = parseSheetUrl(url);
      feedback.textContent = `✓ URL корректный (gid: ${parsed?.gid || '0'})`;
      feedback.className = 'feedback success';
      confirmBtn.disabled = false;
    } else {
      feedback.textContent = getUrlValidationError(result.error);
      feedback.className = 'feedback error';
      confirmBtn.disabled = true;
    }
  });
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
  const aliasInput = /** @type {HTMLInputElement} */ (document.getElementById('sheet-alias'));
  const feedback = document.getElementById('url-feedback');
  const btnText = confirmBtn?.querySelector('.btn-text');
  const btnLoader = confirmBtn?.querySelector('.btn-loader');
  
  if (!confirmBtn || !urlInput) return;
  
  confirmBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    const alias = aliasInput?.value.trim() || undefined;
    
    const parsed = parseSheetUrl(url);
    if (!parsed) return;
    
    // Clear previous errors
    clearSetupError();
    
    // Show loading state
    if (btnText) btnText.textContent = 'Проверка...';
    if (btnLoader) /** @type {HTMLElement} */ (btnLoader).hidden = false;
    confirmBtn.setAttribute('disabled', 'true');
    
    // Try to fetch the sheet to validate access
    try {
      await fetchSheet(parsed.spreadsheetId, parsed.gid);
      
      // Success - configure sheet
      if (store.hasConfiguredSheets()) {
        store.replaceSheet({ ...parsed, alias });
      } else {
        store.addSheet({ ...parsed, alias });
      }
      
      // Clear inputs
      urlInput.value = '';
      if (aliasInput) aliasInput.value = '';
      if (feedback) {
        feedback.textContent = '';
        feedback.className = 'feedback';
      }
      
      // Hide modal
      hideModal('setup-modal');
      
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
  
  // Change sheet
  changeSheetBtn?.addEventListener('click', () => {
    hideModal('settings-modal');
    showModal('setup-modal');
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
 * Initializes all event handlers
 * @param {Object} callbacks
 * @param {function} callbacks.onSheetConfigured - Called when sheet is configured
 * @param {function} callbacks.onPollingIntervalChange - Called when polling interval changes
 */
export function initializeEvents(callbacks) {
  onSheetConfigured = callbacks.onSheetConfigured || null;
  onPollingIntervalChange = callbacks.onPollingIntervalChange || null;
  
  setupUrlValidation();
  setupSheetForm();
  setupSettingsModal();
  setupRetryButton();
  setupModalBackdrops();
}

