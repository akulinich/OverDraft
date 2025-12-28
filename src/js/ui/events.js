/**
 * Event handlers and DOM interactions
 */

import { parseSheetUrl, validateSheetUrl } from '../utils/parser.js';
import { fetchSheet, SheetError } from '../api/sheets.js';
import { loadLocalCSV, getCSVText, encodeCSVForStorage } from '../api/local.js';
import * as store from '../state/store.js';
import * as renderer from './renderer.js';
import { validateTeamsDataWithConfig } from '../validation/schema.js';
import { exportConfiguration, isExportAvailable } from '../utils/export.js';

/** @type {'google'|'local'} Current source type in setup modal */
let currentSourceType = 'google';

/** @type {File|null} Selected local CSV file for players */
let selectedLocalFile = null;

/** @type {File|null} Selected local CSV file for teams */
let selectedLocalTeamsFile = null;

/** @type {function|null} */
let onSheetConfigured = null;

/** @type {function|null} */
let onPollingIntervalChange = null;

/** @type {function|null} */
let onFilterChange = null;

/** @type {function|null} */
let onPlayerRowSelect = null;

/** @type {function|null} */
let onTeamPlayerSelect = null;

/** @type {function|null} */
let onColumnMappingConfirmed = null;

/** @type {function|null} */
let onTeamsLayoutConfirmed = null;

/** @type {function|null} */
let onTeamsLayoutCancelled = null;

/** @type {function|null} */
let onConfigureTeamsLayout = null;

/** @type {string[]} Cached sheet headers for column mapping validation */
let cachedSheetHeaders = [];

/** @type {string[][]} Cached sheet data for column mapping validation */
let cachedSheetData = [];

/** @type {string[][]} Cached raw data for teams layout validation */
let cachedTeamsRawData = [];

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
  const localCsvFeedback = document.getElementById('local-csv-feedback');
  const fileLabel = document.getElementById('file-input-label');
  
  // Hide header when editing existing config
  if (header) {
    header.hidden = true;
  }
  
  // Pre-fill players sheet
  const sheet = store.getFirstSheet();
  if (sheet) {
    // Set source type based on current config
    const isLocal = store.isLocalSheet(sheet);
    currentSourceType = isLocal ? 'local' : 'google';
    updateSourceTypeUI(currentSourceType);
    
    if (isLocal) {
      // For local files, show filename
      if (fileLabel) {
        fileLabel.textContent = sheet.gid; // gid contains filename for local
      }
      if (localCsvFeedback) {
        localCsvFeedback.textContent = '✓ Файл загружен';
        localCsvFeedback.className = 'feedback success';
      }
      if (confirmBtn) {
        confirmBtn.disabled = false;
      }
    } else if (urlInput) {
      urlInput.value = buildSheetUrl(sheet.spreadsheetId, sheet.gid);
      if (feedback) {
        feedback.textContent = `✓ URL корректный (gid: ${sheet.gid})`;
        feedback.className = 'feedback success';
      }
      if (confirmBtn) {
        confirmBtn.disabled = false;
      }
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
 * Updates the UI based on selected source type
 * @param {'google'|'local'} sourceType
 */
function updateSourceTypeUI(sourceType) {
  const googleFields = document.getElementById('google-source-fields');
  const localFields = document.getElementById('local-source-fields');
  const teamsUrlSection = document.getElementById('teams-url-section');
  const localTeamsSection = document.getElementById('local-teams-source-fields');
  const googleRadio = /** @type {HTMLInputElement} */ (document.querySelector('input[name="source-type"][value="google"]'));
  const localRadio = /** @type {HTMLInputElement} */ (document.querySelector('input[name="source-type"][value="local"]'));
  
  // Toggle players data source fields
  if (googleFields) googleFields.hidden = sourceType !== 'google';
  if (localFields) localFields.hidden = sourceType !== 'local';
  
  // Toggle teams data source fields
  if (teamsUrlSection) teamsUrlSection.hidden = sourceType !== 'google';
  if (localTeamsSection) localTeamsSection.hidden = sourceType !== 'local';
  
  // Update radio buttons
  if (googleRadio) googleRadio.checked = sourceType === 'google';
  if (localRadio) localRadio.checked = sourceType === 'local';
}

/**
 * Resets setup modal to initial state (for first-time setup)
 */
function resetSetupModal() {
  const urlInput = /** @type {HTMLInputElement} */ (document.getElementById('sheet-url'));
  const teamsUrlInput = /** @type {HTMLInputElement} */ (document.getElementById('teams-url'));
  const localFileInput = /** @type {HTMLInputElement} */ (document.getElementById('local-csv-file'));
  const localTeamsFileInput = /** @type {HTMLInputElement} */ (document.getElementById('local-teams-csv-file'));
  const feedback = document.getElementById('url-feedback');
  const teamsFeedback = document.getElementById('teams-url-feedback');
  const localCsvFeedback = document.getElementById('local-csv-feedback');
  const localTeamsCsvFeedback = document.getElementById('local-teams-csv-feedback');
  const fileLabel = document.getElementById('file-input-label');
  const teamsFileLabel = document.getElementById('teams-file-input-label');
  const playersFileDisplay = document.getElementById('players-file-display');
  const teamsFileDisplay = document.getElementById('teams-file-display');
  const confirmBtn = /** @type {HTMLButtonElement} */ (document.getElementById('confirm-sheet'));
  const header = document.getElementById('setup-modal-header');
  
  // Show header for first-time setup
  if (header) {
    header.hidden = false;
  }
  
  // Reset source type to Google
  currentSourceType = 'google';
  selectedLocalFile = null;
  selectedLocalTeamsFile = null;
  updateSourceTypeUI('google');
  
  // Clear all inputs
  if (urlInput) urlInput.value = '';
  if (teamsUrlInput) teamsUrlInput.value = '';
  if (localFileInput) localFileInput.value = '';
  if (localTeamsFileInput) localTeamsFileInput.value = '';
  if (fileLabel) fileLabel.textContent = 'Выберите файл...';
  if (teamsFileLabel) teamsFileLabel.textContent = 'Выберите файл...';
  if (playersFileDisplay) playersFileDisplay.classList.remove('has-file');
  if (teamsFileDisplay) teamsFileDisplay.classList.remove('has-file');
  
  if (feedback) {
    feedback.textContent = '';
    feedback.className = 'feedback';
  }
  if (teamsFeedback) {
    teamsFeedback.textContent = '';
    teamsFeedback.className = 'feedback';
  }
  if (localCsvFeedback) {
    localCsvFeedback.textContent = '';
    localCsvFeedback.className = 'feedback';
  }
  if (localTeamsCsvFeedback) {
    localTeamsCsvFeedback.textContent = '';
    localTeamsCsvFeedback.className = 'feedback';
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
 * Updates confirm button state based on source type and inputs
 */
function updateConfirmButtonState() {
  const urlInput = /** @type {HTMLInputElement} */ (document.getElementById('sheet-url'));
  const urlFeedback = document.getElementById('url-feedback');
  const localCsvFeedback = document.getElementById('local-csv-feedback');
  const confirmBtn = /** @type {HTMLButtonElement} */ (document.getElementById('confirm-sheet'));
  
  if (!confirmBtn) return;
  
  if (currentSourceType === 'google') {
    // Google Sheets: URL is required
    const isMainUrlValid = urlInput?.value.trim() && urlFeedback?.classList.contains('success');
    confirmBtn.disabled = !isMainUrlValid;
  } else {
    // Local CSV: file must be selected and valid
    const isFileValid = selectedLocalFile !== null && localCsvFeedback?.classList.contains('success');
    confirmBtn.disabled = !isFileValid;
  }
}

/**
 * Sets up source type toggle
 */
function setupSourceTypeToggle() {
  const sourceRadios = document.querySelectorAll('input[name="source-type"]');
  
  sourceRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      const target = /** @type {HTMLInputElement} */ (e.target);
      currentSourceType = /** @type {'google'|'local'} */ (target.value);
      updateSourceTypeUI(currentSourceType);
      updateConfirmButtonState();
    });
  });
}

/**
 * Sets up local file input handling
 */
function setupLocalFileInput() {
  // Players CSV file input
  const fileInput = /** @type {HTMLInputElement} */ (document.getElementById('local-csv-file'));
  const fileLabel = document.getElementById('file-input-label');
  const playersFileDisplay = document.getElementById('players-file-display');
  const feedback = document.getElementById('local-csv-feedback');
  
  if (fileInput) {
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      
      if (!file) {
        selectedLocalFile = null;
        if (fileLabel) fileLabel.textContent = 'Выберите файл...';
        if (playersFileDisplay) playersFileDisplay.classList.remove('has-file');
        if (feedback) {
          feedback.textContent = '';
          feedback.className = 'feedback';
        }
        updateConfirmButtonState();
        return;
      }
      
      // Update display
      if (fileLabel) fileLabel.textContent = file.name;
      
      // Validate CSV
      try {
        const data = await loadLocalCSV(file);
        
        if (data.data.length === 0) {
          throw new Error('Файл не содержит данных');
        }
        
        selectedLocalFile = file;
        if (playersFileDisplay) playersFileDisplay.classList.add('has-file');
        if (feedback) {
          feedback.textContent = `✓ ${data.headers.length} колонок, ${data.data.length} строк`;
          feedback.className = 'feedback success';
        }
      } catch (err) {
        selectedLocalFile = null;
        if (playersFileDisplay) playersFileDisplay.classList.remove('has-file');
        if (feedback) {
          feedback.textContent = err.message || 'Ошибка чтения файла';
          feedback.className = 'feedback error';
        }
      }
      
      updateConfirmButtonState();
    });
  }
  
  // Teams CSV file input
  const teamsFileInput = /** @type {HTMLInputElement} */ (document.getElementById('local-teams-csv-file'));
  const teamsFileLabel = document.getElementById('teams-file-input-label');
  const teamsFileDisplay = document.getElementById('teams-file-display');
  const teamsFeedback = document.getElementById('local-teams-csv-feedback');
  
  if (teamsFileInput) {
    teamsFileInput.addEventListener('change', async () => {
      const file = teamsFileInput.files?.[0];
      
      if (!file) {
        selectedLocalTeamsFile = null;
        if (teamsFileLabel) teamsFileLabel.textContent = 'Выберите файл...';
        if (teamsFileDisplay) teamsFileDisplay.classList.remove('has-file');
        if (teamsFeedback) {
          teamsFeedback.textContent = '';
          teamsFeedback.className = 'feedback';
        }
        return;
      }
      
      // Update display
      if (teamsFileLabel) teamsFileLabel.textContent = file.name;
      
      // Validate CSV
      try {
        const data = await loadLocalCSV(file);
        
        if (data.data.length === 0) {
          throw new Error('Файл не содержит данных');
        }
        
        selectedLocalTeamsFile = file;
        if (teamsFileDisplay) teamsFileDisplay.classList.add('has-file');
        if (teamsFeedback) {
          teamsFeedback.textContent = `✓ ${data.headers.length} колонок, ${data.data.length} строк`;
          teamsFeedback.className = 'feedback success';
        }
      } catch (err) {
        selectedLocalTeamsFile = null;
        if (teamsFileDisplay) teamsFileDisplay.classList.remove('has-file');
        if (teamsFeedback) {
          teamsFeedback.textContent = err.message || 'Ошибка чтения файла';
          teamsFeedback.className = 'feedback error';
        }
      }
    });
  }
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
  
  // Setup source type toggle and file input
  setupSourceTypeToggle();
  setupLocalFileInput();
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
  const localFileInput = /** @type {HTMLInputElement} */ (document.getElementById('local-csv-file'));
  const localTeamsFileInput = /** @type {HTMLInputElement} */ (document.getElementById('local-teams-csv-file'));
  const feedback = document.getElementById('url-feedback');
  const teamsFeedback = document.getElementById('teams-url-feedback');
  const localCsvFeedback = document.getElementById('local-csv-feedback');
  const localTeamsCsvFeedback = document.getElementById('local-teams-csv-feedback');
  const fileLabel = document.getElementById('file-input-label');
  const teamsFileLabel = document.getElementById('teams-file-input-label');
  const playersFileDisplay = document.getElementById('players-file-display');
  const teamsFileDisplay = document.getElementById('teams-file-display');
  const btnText = confirmBtn?.querySelector('.btn-text');
  const btnLoader = confirmBtn?.querySelector('.btn-loader');
  
  if (!confirmBtn) return;
  
  confirmBtn.addEventListener('click', async () => {
    // Clear previous errors
    clearSetupError();
    
    // Show loading state
    if (btnText) btnText.textContent = 'Проверка...';
    if (btnLoader) /** @type {HTMLElement} */ (btnLoader).hidden = false;
    confirmBtn.setAttribute('disabled', 'true');
    
    try {
      if (currentSourceType === 'local') {
        // Handle local CSV file for players
        if (!selectedLocalFile) {
          throw new Error('Файл игроков не выбран');
        }
        
        // Read and store players CSV data
        const csvText = await getCSVText(selectedLocalFile);
        const base64Data = encodeCSVForStorage(csvText);
        
        // Save to localStorage
        store.setLocalCSVData(selectedLocalFile.name, base64Data);
        
        // Configure players sheet with local source
        /** @type {import('../storage/persistence.js').SheetConfig} */
        const localConfig = {
          sourceType: 'local',
          spreadsheetId: 'local',
          gid: selectedLocalFile.name,
          addedAt: new Date().toISOString()
        };
        
        if (store.hasConfiguredSheets()) {
          store.replaceSheet(localConfig);
        } else {
          store.addSheet(localConfig);
        }
        
        // Handle local CSV file for teams (optional)
        if (selectedLocalTeamsFile) {
          const teamsCsvText = await getCSVText(selectedLocalTeamsFile);
          const teamsBase64Data = encodeCSVForStorage(teamsCsvText);
          
          // Save teams data to localStorage
          store.setLocalCSVData(selectedLocalTeamsFile.name, teamsBase64Data);
          
          // Configure teams sheet with local source
          /** @type {import('../storage/persistence.js').SheetConfig} */
          const localTeamsConfig = {
            sourceType: 'local',
            spreadsheetId: 'local',
            gid: selectedLocalTeamsFile.name,
            addedAt: new Date().toISOString()
          };
          
          store.setTeamsSheet(localTeamsConfig);
        }
        
        // Clear inputs
        if (localFileInput) localFileInput.value = '';
        if (localTeamsFileInput) localTeamsFileInput.value = '';
        if (fileLabel) fileLabel.textContent = 'Выберите файл...';
        if (teamsFileLabel) teamsFileLabel.textContent = 'Выберите файл...';
        if (playersFileDisplay) playersFileDisplay.classList.remove('has-file');
        if (teamsFileDisplay) teamsFileDisplay.classList.remove('has-file');
        if (localCsvFeedback) {
          localCsvFeedback.textContent = '';
          localCsvFeedback.className = 'feedback';
        }
        if (localTeamsCsvFeedback) {
          localTeamsCsvFeedback.textContent = '';
          localTeamsCsvFeedback.className = 'feedback';
        }
        selectedLocalFile = null;
        selectedLocalTeamsFile = null;
        
      } else {
        // Handle Google Sheets URL
        const url = urlInput?.value.trim();
        const teamsUrl = teamsUrlInput?.value.trim();
        
        const parsed = parseSheetUrl(url || '');
        if (!parsed) return;
        
        const teamsParsed = teamsUrl ? parseSheetUrl(teamsUrl) : null;
        
        // Try to fetch the sheet to validate access
        await fetchSheet(parsed.spreadsheetId, parsed.gid);
        
        // Validate teams sheet if provided
        if (teamsParsed) {
          try {
            await fetchSheet(teamsParsed.spreadsheetId, teamsParsed.gid);
            store.setTeamsSheet({ ...teamsParsed, sourceType: 'google' });
          } catch (teamsErr) {
            console.warn('[Setup] Teams sheet validation failed:', teamsErr);
            if (teamsFeedback) {
              teamsFeedback.textContent = 'Не удалось подключить таблицу команд';
              teamsFeedback.className = 'feedback error';
            }
          }
        }
        
        // Configure main sheet with google source
        /** @type {import('../storage/persistence.js').SheetConfig} */
        const googleConfig = {
          sourceType: 'google',
          spreadsheetId: parsed.spreadsheetId,
          gid: parsed.gid,
          addedAt: new Date().toISOString()
        };
        
        if (store.hasConfiguredSheets()) {
          store.replaceSheet(googleConfig);
        } else {
          store.addSheet(googleConfig);
        }
        
        // Clear inputs
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
      }
      
      // Hide modal
      hideModal('setup-modal');
      
      // Show tabs if teams sheet configured
      renderer.updateTabsVisibility(store.hasTeamsSheet());
      
      // Trigger callback
      if (onSheetConfigured) onSheetConfigured();
      
    } catch (err) {
      console.error('[Setup] Validation error:', err);
      
      if (currentSourceType === 'local') {
        showSetupError(err.message || 'Ошибка загрузки файла', false);
      } else {
        // Network errors are almost always caused by unpublished sheets
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
  const configureTeamsLayoutBtn = document.getElementById('configure-teams-layout');
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
    
    // Show/hide teams layout button based on whether teams sheet is configured
    if (configureTeamsLayoutBtn) {
      configureTeamsLayoutBtn.hidden = !teamsSheet;
    }
    
    showModal('settings-modal');
  });
  
  // Configure teams layout button
  configureTeamsLayoutBtn?.addEventListener('click', () => {
    hideModal('settings-modal');
    if (onConfigureTeamsLayout) {
      onConfigureTeamsLayout();
    }
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
 * Sets up export button
 */
function setupExportButton() {
  const exportBtn = document.getElementById('export-btn');
  
  if (!exportBtn) return;
  
  // Update button visibility based on export availability
  function updateExportButtonVisibility() {
    const available = isExportAvailable();
    exportBtn.hidden = !available;
  }
  
  // Initial update
  updateExportButtonVisibility();
  
  // Update on state changes
  const unsubscribe = store.subscribe((state, changedKey) => {
    if (changedKey === 'configuredSheets' || changedKey === 'teamsSheet' || changedKey === 'init') {
      updateExportButtonVisibility();
    }
  });
  
  // Store unsubscribe function (could be used for cleanup if needed)
  // For now, we keep the subscription active for the app lifetime
  
  // Export button click handler
  exportBtn.addEventListener('click', async () => {
    const url = exportConfiguration();
    
    if (!url) {
      alert('Экспорт недоступен. Убедитесь, что используются Google Таблицы, а не локальные CSV файлы.');
      return;
    }
    
    try {
      // Copy to clipboard
      await navigator.clipboard.writeText(url);
      
      // Show success notification
      const originalTitle = exportBtn.getAttribute('title') || '';
      exportBtn.setAttribute('title', 'Ссылка скопирована!');
      exportBtn.style.opacity = '0.7';
      
      setTimeout(() => {
        exportBtn.setAttribute('title', originalTitle);
        exportBtn.style.opacity = '1';
      }, 2000);
    } catch (err) {
      console.error('[Export] Failed to copy to clipboard:', err);
      // Fallback: show URL in prompt
      prompt('Скопируйте эту ссылку:', url);
    }
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
 * Sets up team player click handlers for teams view
 */
function setupTeamPlayerClicks() {
  const teamsContainer = document.getElementById('teams-container');
  if (!teamsContainer) return;
  
  teamsContainer.addEventListener('click', (e) => {
    const playerRow = e.target.closest('.team-player');
    if (!playerRow) return;
    
    const nickname = playerRow.dataset.nickname;
    if (nickname && onTeamPlayerSelect) {
      onTeamPlayerSelect(nickname);
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

// ============================================================================
// Column Mapping Modal
// ============================================================================

/**
 * Opens the column mapping modal with data
 * @param {string[]} headers - Sheet headers
 * @param {string[][]} data - Sheet data for validation
 * @param {import('../storage/persistence.js').ColumnMapping} detectedMapping - Auto-detected mapping
 * @param {string[]} missingColumns - Missing required columns
 * @param {import('../state/store.js').ColumnValidationError[]} errors - Validation errors
 */
export function openColumnMappingModal(headers, data, detectedMapping, missingColumns, errors) {
  // Cache data for validation during selection changes
  cachedSheetHeaders = headers;
  cachedSheetData = data;
  
  renderer.renderColumnMappingModal(headers, detectedMapping, missingColumns, errors);
  renderer.showColumnMappingModal();
}

/**
 * Validates the current column mapping selection
 */
function validateCurrentMappingSelection() {
  const mapping = renderer.getColumnMappingFromModal();
  
  // Validate each selected column
  for (const key of store.REQUIRED_COLUMNS) {
    const columnName = mapping[key];
    
    if (!columnName) {
      renderer.updateColumnMappingRowStatus(key, false);
      continue;
    }
    
    // Find column index
    const columnIndex = cachedSheetHeaders.indexOf(columnName);
    
    if (columnIndex === -1) {
      renderer.updateColumnMappingRowStatus(key, false, 'Колонка не найдена');
      continue;
    }
    
    // Special validation for rating column
    if (key === 'rating') {
      const isNumeric = store.validateRatingColumn(cachedSheetData, columnIndex);
      if (!isNumeric) {
        renderer.updateColumnMappingRowStatus(key, false, `Колонка "${columnName}" не содержит числовых данных`);
        continue;
      }
    }
    
    renderer.updateColumnMappingRowStatus(key, true);
  }
}

/**
 * Sets up column mapping modal event handlers
 */
function setupColumnMappingModal() {
  const modal = document.getElementById('column-mapping-modal');
  const closeBtn = document.getElementById('close-column-mapping');
  const confirmBtn = document.getElementById('confirm-column-mapping');
  const mappingTable = document.getElementById('column-mapping-table');
  
  // Close button
  closeBtn?.addEventListener('click', () => {
    renderer.hideColumnMappingModal();
  });
  
  // Backdrop click (only close if sheets are configured)
  modal?.addEventListener('click', (e) => {
    if (e.target?.classList?.contains('modal-backdrop') && store.hasConfiguredSheets()) {
      renderer.hideColumnMappingModal();
    }
  });
  
  // Handle select changes for live validation
  mappingTable?.addEventListener('change', (e) => {
    if (e.target?.classList?.contains('column-mapping-select')) {
      validateCurrentMappingSelection();
    }
  });
  
  // Confirm button
  confirmBtn?.addEventListener('click', () => {
    const mapping = renderer.getColumnMappingFromModal();
    
    // Save mapping
    const sheet = store.getFirstSheet();
    if (sheet) {
      const sheetKey = `${sheet.spreadsheetId}_${sheet.gid}`;
      store.setColumnMapping(sheetKey, mapping);
    }
    
    // Hide modal
    renderer.hideColumnMappingModal();
    
    // Trigger callback
    if (onColumnMappingConfirmed) {
      onColumnMappingConfirmed(mapping);
    }
  });
}

// ============================================================================
// Teams Layout Configuration Modal
// ============================================================================

/**
 * Opens the teams layout modal
 * @param {string[][]} rawData - All rows from the teams sheet
 * @param {import('../storage/persistence.js').TeamsLayoutConfig} initialConfig
 * @param {import('../validation/schema.js').ParseError|null} parseError
 * @param {function(import('../storage/persistence.js').TeamsLayoutConfig): void} onConfirm
 * @param {function(): void} onCancel
 */
export function openTeamsLayoutModal(rawData, initialConfig, parseError, onConfirm, onCancel) {
  cachedTeamsRawData = rawData;
  onTeamsLayoutConfirmed = onConfirm;
  onTeamsLayoutCancelled = onCancel;
  
  renderer.renderTeamsLayoutModal(rawData, initialConfig, parseError);
  renderer.showTeamsLayoutModal();
}

/**
 * Validates current layout params and updates UI
 */
function validateAndUpdateTeamsLayout() {
  const config = renderer.getTeamsLayoutParams();
  const result = validateTeamsDataWithConfig(cachedTeamsRawData, config);
  
  renderer.renderTeamsLayoutPreview(cachedTeamsRawData, config, result.parseError);
  
  if (result.valid) {
    renderer.hideTeamsLayoutError();
    renderer.setTeamsLayoutConfirmEnabled(true);
  } else if (result.parseError) {
    renderer.showTeamsLayoutError(result.parseError.message);
    renderer.setTeamsLayoutConfirmEnabled(false);
  } else if (result.errors.length > 0) {
    renderer.showTeamsLayoutError(result.errors[0].message);
    // Allow confirm if we at least have some teams
    renderer.setTeamsLayoutConfirmEnabled(result.data !== null && result.data.teams.length > 0);
  }
}

/**
 * Sets up teams layout modal event handlers
 */
function setupTeamsLayoutModal() {
  const modal = document.getElementById('teams-layout-modal');
  const closeBtn = document.getElementById('close-teams-layout');
  const cancelBtn = document.getElementById('cancel-teams-layout');
  const confirmBtn = document.getElementById('confirm-teams-layout');
  const paramsContainer = document.querySelector('.teams-layout-params');
  
  // Close button
  closeBtn?.addEventListener('click', () => {
    renderer.hideTeamsLayoutModal();
    if (onTeamsLayoutCancelled) onTeamsLayoutCancelled();
  });
  
  // Cancel button
  cancelBtn?.addEventListener('click', () => {
    renderer.hideTeamsLayoutModal();
    if (onTeamsLayoutCancelled) onTeamsLayoutCancelled();
  });
  
  // Backdrop click
  modal?.addEventListener('click', (e) => {
    if (e.target?.classList?.contains('modal-backdrop')) {
      renderer.hideTeamsLayoutModal();
      if (onTeamsLayoutCancelled) onTeamsLayoutCancelled();
    }
  });
  
  // Parameter inputs - live validation on change
  paramsContainer?.addEventListener('input', () => {
    validateAndUpdateTeamsLayout();
  });
  
  // Confirm button
  confirmBtn?.addEventListener('click', () => {
    const config = renderer.getTeamsLayoutParams();
    renderer.hideTeamsLayoutModal();
    if (onTeamsLayoutConfirmed) {
      onTeamsLayoutConfirmed(config);
    }
  });
}

/**
 * Initializes all event handlers
 * @param {Object} callbacks
 * @param {function} callbacks.onSheetConfigured - Called when sheet is configured
 * @param {function} callbacks.onPollingIntervalChange - Called when polling interval changes
 * @param {function} [callbacks.onTabChange] - Called when tab changes
 * @param {function} [callbacks.onFilterChange] - Called when a filter is toggled
 * @param {function} [callbacks.onPlayerRowSelect] - Called when a player row is clicked in players table
 * @param {function} [callbacks.onTeamPlayerSelect] - Called when a player is clicked in teams view
 * @param {function} [callbacks.onColumnMappingConfirmed] - Called when column mapping is confirmed
 * @param {function} [callbacks.onConfigureTeamsLayout] - Called when teams layout config is requested
 */
export function initializeEvents(callbacks) {
  onSheetConfigured = callbacks.onSheetConfigured || null;
  onPollingIntervalChange = callbacks.onPollingIntervalChange || null;
  onFilterChange = callbacks.onFilterChange || null;
  onPlayerRowSelect = callbacks.onPlayerRowSelect || null;
  onTeamPlayerSelect = callbacks.onTeamPlayerSelect || null;
  onColumnMappingConfirmed = callbacks.onColumnMappingConfirmed || null;
  onConfigureTeamsLayout = callbacks.onConfigureTeamsLayout || null;
  
  setupUrlValidation();
  setupSheetForm();
  setupSettingsModal();
  setupExportButton();
  setupRetryButton();
  setupModalBackdrops();
  setupTabs(callbacks.onTabChange);
  setupTeamPlayerClicks();
  setupFilterButtons();
  setupPlayerRowClicks();
  setupColumnMappingModal();
  setupTeamsLayoutModal();
}

