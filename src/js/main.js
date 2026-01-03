/**
 * OverDraft — Main Application Entry Point
 */

import { config } from './config.js';
import { fetchSheet, SheetError } from './api/sheets.js';
import { parseStoredCSV, decodeCSVFromStorage } from './api/local.js';
import { initOverFastData } from './api/overfast.js';
import * as store from './state/store.js';
import * as renderer from './ui/renderer.js';
import * as events from './ui/events.js';
import { createPollingManager } from './utils/polling.js';
import { getVersionString, getBuildInfo } from './version.js';
import { validateTeamsData, validateTeamsDataWithConfig } from './validation/schema.js';
import { getSheetKey } from './utils/parser.js';
import { 
  loadTeamsLayoutConfig, 
  saveTeamsLayoutConfig, 
  getDefaultTeamsLayoutConfig,
  createDefaultColumnsConfiguration
} from './storage/persistence.js';
import { init as initI18n, t, subscribe as subscribeToLanguage } from './i18n/index.js';

/** @type {ReturnType<typeof createPollingManager>|null} */
let pollingManager = null;

/** @type {number|null} Current selected row index in players table */
let selectedPlayerRowIndex = null;

/** @type {string|null} Last rendered player details hash for change detection */
let lastPlayerDetailsHash = null;

/** @type {boolean} Flag indicating if column mapping modal is currently shown */
let isColumnMappingPending = false;

/** @type {{headers: string[], data: string[][]}|null} Pending sheet data waiting for column mapping */
let pendingSheetData = null;

/** @type {boolean} Flag indicating if teams layout modal is currently shown */
let isTeamsLayoutPending = false;

/** @type {{headers: string[], data: string[][], allRows: string[][]}|null} Pending teams data waiting for layout config */
let pendingTeamsData = null;

/** @type {boolean} Flag indicating if we're in "reconfigure all" mode (show all config modals) */
let isReconfigureAllMode = false;

/**
 * Renders teams with dynamic column configuration
 * @param {string[]} headers - Teams sheet headers
 * @param {string[][]} data - Teams sheet data
 * @param {import('./storage/persistence.js').TeamsLayoutConfig} layoutConfig
 */
async function renderTeamsWithConfig(headers, data, layoutConfig) {
  const sheet = store.getFirstSheet();
  if (!sheet) {
    await renderer.renderTeamsView(headers, data, layoutConfig);
    return;
  }
  
  const playerSheetKey = getSheetKey(sheet.spreadsheetId, sheet.gid);
  const columnsConfig = store.getColumnsConfiguration(playerSheetKey);
  const displayConfig = store.getTeamsDisplayConfiguration(playerSheetKey);
  
  if (columnsConfig) {
    const cachedPlayerData = store.getSheetData(sheet.spreadsheetId, sheet.gid);
    const playerHeaders = cachedPlayerData?.headers || [];
    await renderer.renderTeamsViewWithConfig(headers, data, layoutConfig, playerHeaders, columnsConfig, displayConfig);
  } else {
    await renderer.renderTeamsView(headers, data, layoutConfig);
  }
}

/**
 * Loads local CSV data from localStorage
 * @param {import('./storage/persistence.js').SheetConfig} sheet
 * @returns {import('./api/sheets.js').SheetData|null}
 */
function loadLocalSheetData(sheet) {
  const base64Data = store.getLocalCSVData(sheet.gid); // gid contains filename for local
  if (!base64Data) {
    console.error('[App] Local CSV data not found for:', sheet.gid);
    return null;
  }
  
  try {
    const csvText = decodeCSVFromStorage(base64Data);
    return parseStoredCSV(csvText, sheet.gid);
  } catch (err) {
    console.error('[App] Failed to parse stored CSV:', err);
    return null;
  }
}

/**
 * Fetches and renders players sheet data
 * @param {boolean} [skipColumnValidation=false] - Skip column validation (used after mapping confirmed)
 * @param {boolean} [forceShowConfigModal=false] - Force show config modal even if config exists
 */
async function fetchAndRenderPlayers(skipColumnValidation = false, forceShowConfigModal = false) {
  const sheet = store.getFirstSheet();
  if (!sheet) return;
  
  // Don't fetch if we're waiting for column mapping
  if (isColumnMappingPending) return;
  
  try {
    let data;
    
    // Handle local vs Google Sheets source
    if (store.isLocalSheet(sheet)) {
      // Load from localStorage
      data = loadLocalSheetData(sheet);
      if (!data) {
        throw new Error(t('errors.localDataNotFound'));
      }
    } else {
      // Fetch from Google Sheets
      data = await fetchSheet(sheet.spreadsheetId, sheet.gid);
      
      // Handle pending state (server is still fetching data)
      if (data.pending) {
        if (config.isDev) {
          console.log('[App] Players data pending, waiting for next poll');
        }
        return;
      }
    }
    
    const sheetKey = getSheetKey(sheet.spreadsheetId, sheet.gid);
    const existingConfig = store.getColumnsConfiguration(sheetKey);
    
    // Show config modal if:
    // 1. forceShowConfigModal is true (user clicked "Connect and Configure")
    // 2. OR no config exists and not skipping validation
    const shouldShowModal = forceShowConfigModal || (!skipColumnValidation && !existingConfig);
    
    if (shouldShowModal) {
      isColumnMappingPending = true;
      pendingSheetData = { headers: data.headers, data: data.data };
      
      if (config.isDev) {
        console.log('[App] Column configuration modal opening', existingConfig ? '(existing config)' : '(new config)');
      }
      
      // Use existing config if available, otherwise create default
      const configToShow = existingConfig || createDefaultColumnsConfiguration();
      
      events.openColumnConfigModal(
        data.headers, 
        data.data, 
        configToShow
      );
      return;
    }
    
    store.updateSheetData(data);
    
    // Render table if on players tab
    if (store.getActiveTab() === 'players') {
      const teams = getParsedTeams();
      renderPlayersPanel(data.headers, data.data, teams);
      renderer.showDataDisplay();
    }
    renderer.updateStatusBar(data.lastUpdated, !store.isLocalSheet(sheet));
    renderer.showStatusError(null);
    
  } catch (err) {
    console.error('[App] Players fetch error:', err);
    
    const isLikelyNotPublished = 
      (err instanceof SheetError && (err.type === 'NOT_PUBLISHED' || err.type === 'NETWORK')) ||
      err.name === 'TypeError';
    
    const cached = store.getSheetData(sheet.spreadsheetId, sheet.gid);
    if (cached) {
      renderer.showStatusError(err instanceof SheetError ? getErrorMessage(err) : t('errors.loadError'));
    } else {
      const message = isLikelyNotPublished 
        ? t('errors.connectionFailed')
        : (err instanceof SheetError ? getErrorMessage(err) : err.message || t('errors.unknown'));
      renderer.showError(message, isLikelyNotPublished);
    }
    
    store.setError(sheet.spreadsheetId, sheet.gid, err);
  }
}

/**
 * Computes a hash for player details to detect changes
 * @param {import('./state/store.js').Player|null} player
 * @returns {string}
 */
function computePlayerDetailsHash(player) {
  if (!player) return '';
  return JSON.stringify(player.rawRow);
}

/**
 * Updates filter visibility based on current configuration
 */
function updateFilterVisibility() {
  const sheet = store.getFirstSheet();
  const sheetKey = sheet ? getSheetKey(sheet.spreadsheetId, sheet.gid) : null;
  
  // Available filter only shown when teams sheet is connected
  renderer.updateAvailableFilterVisibility(store.hasTeamsSheet());
  
  // Role filters only shown when at least one role column is configured
  const hasRoles = sheetKey ? store.hasRoleColumns(sheetKey) : false;
  renderer.updateRoleFiltersVisibility(hasRoles);
  
  renderer.updateFilterButtonStates();
}

/**
 * Renders players panel with table and details
 * @param {string[]} headers
 * @param {string[][]} data
 * @param {import('./validation/schema.js').Team[]} teams
 */
function renderPlayersPanel(headers, data, teams) {
  // Get columns configuration for current sheet
  const sheet = store.getFirstSheet();
  const sheetKey = sheet ? getSheetKey(sheet.spreadsheetId, sheet.gid) : null;
  const columnsConfig = sheetKey ? store.getColumnsConfiguration(sheetKey) : null;
  
  // Update filter visibility based on config
  updateFilterVisibility();
  
  if (columnsConfig && columnsConfig.columns.length > 0) {
    // Use new dynamic columns configuration
    renderer.renderPlayersTableWithConfig(headers, data, columnsConfig, teams);
  } else {
    // Fallback to legacy rendering
    renderer.renderPlayersTable(headers, data, teams);
  }
  
  // Try to keep currently selected player
  const currentPlayer = store.getSelectedPlayer();
  const filteredData = getFilteredTableData(headers, data, teams);
  
  // Find nickname column
  const nicknameIdx = headers.findIndex(h => 
    /^(ник|никнейм|nickname|nick|имя|name|игрок|player)/i.test(h.trim())
  );
  
  if (currentPlayer && nicknameIdx !== -1) {
    // Check if current player is still in filtered data
    const currentRowIndex = filteredData.findIndex(row => 
      row[nicknameIdx]?.trim()?.toLowerCase() === currentPlayer.nickname.toLowerCase()
    );
    
    if (currentRowIndex !== -1) {
      // Player still exists, keep selection
      selectedPlayerRowIndex = currentRowIndex;
      
      // Get fresh player data from store
      const freshPlayer = store.getPlayerByNickname(currentPlayer.nickname);
      const newHash = computePlayerDetailsHash(freshPlayer);
      
      // Only re-render details if data changed
      if (newHash !== lastPlayerDetailsHash) {
        lastPlayerDetailsHash = newHash;
        if (columnsConfig && columnsConfig.columns.length > 0) {
          renderer.renderPlayerDetailsPanelWithConfig(freshPlayer || currentPlayer, headers, columnsConfig);
        } else {
          renderer.renderPlayerDetailsPanel(freshPlayer || currentPlayer, headers);
        }
      }
      
      renderer.updatePlayerRowSelection(currentRowIndex);
      return;
    }
  }
  
  // Auto-select first player if none selected or previous selection not found
  const firstPlayer = renderer.getFirstFilteredPlayer(headers, data, teams);
  if (firstPlayer) {
    store.setSelectedPlayer(firstPlayer);
    selectedPlayerRowIndex = 0;
    
    const newHash = computePlayerDetailsHash(firstPlayer);
    if (newHash !== lastPlayerDetailsHash) {
      lastPlayerDetailsHash = newHash;
      if (columnsConfig && columnsConfig.columns.length > 0) {
        renderer.renderPlayerDetailsPanelWithConfig(firstPlayer, headers, columnsConfig);
      } else {
        renderer.renderPlayerDetailsPanel(firstPlayer, headers);
      }
    }
    
    renderer.updatePlayerRowSelection(0);
  } else {
    store.setSelectedPlayer(null);
    selectedPlayerRowIndex = null;
    lastPlayerDetailsHash = null;
    renderer.clearPlayerDetailsPanel();
    renderer.updatePlayerRowSelection(null);
  }
}

/**
 * Loads local teams CSV data from localStorage
 * @param {import('./storage/persistence.js').SheetConfig} teamsSheet
 * @returns {import('./api/sheets.js').SheetData|null}
 */
function loadLocalTeamsSheetData(teamsSheet) {
  const base64Data = store.getLocalCSVData(teamsSheet.gid); // gid contains filename for local
  if (!base64Data) {
    console.error('[App] Local teams CSV data not found for:', teamsSheet.gid);
    return null;
  }
  
  try {
    const csvText = decodeCSVFromStorage(base64Data);
    return parseStoredCSV(csvText, teamsSheet.gid);
  } catch (err) {
    console.error('[App] Failed to parse stored teams CSV:', err);
    return null;
  }
}

/**
 * Fetches and renders teams sheet data
 * @param {boolean} [skipLayoutValidation=false] - Skip layout validation (used after config confirmed)
 */
async function fetchAndRenderTeams(skipLayoutValidation = false) {
  const teamsSheet = store.getTeamsSheet();
  if (!teamsSheet) {
    if (store.getActiveTab() === 'teams') {
      renderer.showTeamsNotConfigured();
    }
    return;
  }
  
  // Don't fetch if we're waiting for layout config
  if (isTeamsLayoutPending) return;
  
  try {
    let data;
    
    // Handle local vs Google Sheets source
    if (store.isLocalSheet(teamsSheet)) {
      // Load from localStorage
      data = loadLocalTeamsSheetData(teamsSheet);
      if (!data) {
        throw new Error(t('errors.localTeamsDataNotFound'));
      }
    } else {
      // Fetch from Google Sheets
      data = await fetchSheet(teamsSheet.spreadsheetId, teamsSheet.gid);
      
      // Handle pending state (server is still fetching data)
      if (data.pending) {
        if (config.isDev) {
          console.log('[App] Teams data pending, waiting for next poll');
        }
        return;
      }
    }
    
    const sheetKey = getSheetKey(teamsSheet.spreadsheetId, teamsSheet.gid);
    
    // Load saved config or use defaults
    let layoutConfig = loadTeamsLayoutConfig(sheetKey);
    if (!layoutConfig) {
      layoutConfig = getDefaultTeamsLayoutConfig();
    }
    
    // All rows including headers (for validation)
    const allRows = [data.headers, ...data.data];
    
    if (!skipLayoutValidation) {
      // Validate with config
      const validation = validateTeamsDataWithConfig(allRows, layoutConfig);
      
      if (!validation.valid || (validation.data && validation.data.teams.length === 0)) {
        // Show layout configuration modal
        isTeamsLayoutPending = true;
        pendingTeamsData = { headers: data.headers, data: data.data, allRows };
        
        if (config.isDev) {
          console.log('[App] Teams layout config needed:', validation);
        }
        
        events.openTeamsLayoutModal(
          allRows,
          layoutConfig,
          validation.parseError,
          onTeamsLayoutConfirmed
        );
        return;
      }
      
      // Save the config if not already saved
      if (!loadTeamsLayoutConfig(sheetKey)) {
        saveTeamsLayoutConfig(sheetKey, layoutConfig);
      }
    }
    
    store.updateTeamsData(data);
    
    // Render teams if on teams tab
    if (store.getActiveTab() === 'teams') {
      await renderTeamsWithConfig(data.headers, data.data, layoutConfig);
    }
    
  } catch (err) {
    console.error('[App] Teams fetch error:', err);
    
    if (store.getActiveTab() === 'teams') {
      renderer.showTeamsNotConfigured();
    }
  }
}

/**
 * Called when teams layout configuration is confirmed
 * @param {import('./storage/persistence.js').TeamsLayoutConfig} layoutConfig
 */
async function onTeamsLayoutConfirmed(layoutConfig) {
  isTeamsLayoutPending = false;
  
  const teamsSheet = store.getTeamsSheet();
  if (!teamsSheet || !pendingTeamsData) return;
  
  const teamsSheetKey = getSheetKey(teamsSheet.spreadsheetId, teamsSheet.gid);
  
  // Save the layout config
  saveTeamsLayoutConfig(teamsSheetKey, layoutConfig);
  
  // Update teams data in store
  store.updateTeamsData({
    spreadsheetId: teamsSheet.spreadsheetId,
    gid: teamsSheet.gid,
    headers: pendingTeamsData.headers,
    data: pendingTeamsData.data,
    lastUpdated: new Date()
  });
  
  pendingTeamsData = null;
  
  // Check if teams display config exists, if not - open the modal
  const sheet = store.getFirstSheet();
  const playerSheetKey = sheet ? getSheetKey(sheet.spreadsheetId, sheet.gid) : null;
  const columnsConfig = playerSheetKey ? store.getColumnsConfiguration(playerSheetKey) : null;
  const existingDisplayConfig = playerSheetKey ? store.getTeamsDisplayConfiguration(playerSheetKey) : null;
  
  // Open display modal if no config exists OR if in reconfigure mode
  if (columnsConfig && (!existingDisplayConfig || isReconfigureAllMode)) {
    // Open teams display modal to select which columns to show in team cards
    // Pass existing config for pre-fill if available
    events.openTeamsDisplayModal(columnsConfig, existingDisplayConfig);
    return; // Rendering and polling will happen after display config is confirmed
  }
  
  // Reset reconfigure mode
  isReconfigureAllMode = false;
  
  // Render teams if on teams tab
  if (store.getActiveTab() === 'teams') {
    const teamsData = store.getTeamsData();
    if (teamsData) {
      await renderTeamsWithConfig(teamsData.headers, teamsData.data, layoutConfig);
    }
  }
  
  // Start polling if not already running
  if (!pollingManager?.isRunning()) {
    startPolling();
  }
}

/**
 * Called when teams display configuration is confirmed
 * @param {import('./storage/persistence.js').TeamsDisplayConfig} displayConfig
 */
async function onTeamsDisplayConfigConfirmed(displayConfig) {
  // Reset reconfigure mode - this is the last modal in the chain
  isReconfigureAllMode = false;
  
  const sheet = store.getFirstSheet();
  if (!sheet) return;
  
  const sheetKey = getSheetKey(sheet.spreadsheetId, sheet.gid);
  
  // Save the display config
  store.setTeamsDisplayConfiguration(sheetKey, displayConfig);
  
  // Render teams if on teams tab
  if (store.getActiveTab() === 'teams') {
    const teamsSheet = store.getTeamsSheet();
    const teamsData = store.getTeamsData();
    if (teamsSheet && teamsData) {
      const teamsSheetKey = getSheetKey(teamsSheet.spreadsheetId, teamsSheet.gid);
      const layoutConfig = loadTeamsLayoutConfig(teamsSheetKey);
      await renderTeamsWithConfig(teamsData.headers, teamsData.data, layoutConfig);
    }
  }
  
  // Start polling if not already running
  if (!pollingManager?.isRunning()) {
    startPolling();
  }
}

/**
 * Fetches and renders all data
 * @param {boolean} [forceShowConfigModal=false] - Force show config modal for players sheet
 */
async function fetchAndRender(forceShowConfigModal = false) {
  if (config.isDev) {
    console.log('[App] fetchAndRender() called', { forceShowConfigModal });
  }
  
  // When forcing config modal, only fetch players first
  // Teams will be configured after player config is confirmed
  if (forceShowConfigModal) {
    await fetchAndRenderPlayers(false, true);
    // Teams configuration happens in onColumnConfigConfirmed
    return;
  }
  
  // Normal flow: fetch both in parallel
  await Promise.all([
    fetchAndRenderPlayers(),
    store.hasTeamsSheet() ? fetchAndRenderTeams() : Promise.resolve()
  ]);
}

/**
 * Gets user-friendly error message
 * @param {SheetError} err 
 * @returns {string}
 */
function getErrorMessage(err) {
  switch (err.type) {
    case 'NOT_PUBLISHED':
      return t('errors.notPublished');
    case 'NOT_FOUND':
      return t('errors.notFound');
    case 'NETWORK':
      return t('errors.network');
    case 'PARSE_ERROR':
      return t('errors.parseError');
    default:
      return t('errors.unknown');
  }
}

/**
 * Starts polling for data updates
 */
/**
 * Checks if polling should be enabled for the current configuration
 * @returns {boolean}
 */
function shouldEnablePolling() {
  const sheet = store.getFirstSheet();
  // Don't poll for local files - they don't change
  if (sheet && store.isLocalSheet(sheet)) {
    return false;
  }
  return true;
}

function startPolling() {
  if (pollingManager) {
    pollingManager.stop();
  }
  
  // Skip polling for local sources
  if (!shouldEnablePolling()) {
    if (config.isDev) {
      console.log('[App] Polling disabled for local source');
    }
    return;
  }
  
  pollingManager = createPollingManager(fetchAndRender, config.pollingInterval);
  pollingManager.start();
}

/**
 * Called when sheet is configured (user clicked "Connect and Configure")
 */
async function onSheetConfigured() {
  renderer.showLoading();
  renderer.updateTabsVisibility(store.hasTeamsSheet());
  // Set reconfigure mode to show all config modals (pre-filled with existing values)
  isReconfigureAllMode = true;
  // Force show config modal since user explicitly clicked "Connect and Configure"
  // Polling will be started after configuration is complete (in onColumnConfigConfirmed or onTeamsLayoutConfirmed)
  await fetchAndRender(true);
}

/**
 * Called when tab changes
 * @param {'players'|'teams'} tab 
 */
async function onTabChange(tab) {
  renderer.showTab(tab);
  
  // Show filters only on players tab
  renderer.updateFiltersVisibility(tab === 'players');
  if (tab === 'players') {
    updateFilterVisibility();
  }
  
  if (tab === 'players') {
    const sheet = store.getFirstSheet();
    if (sheet) {
      const cached = store.getSheetData(sheet.spreadsheetId, sheet.gid);
      if (cached) {
        const teams = getParsedTeams();
        renderPlayersPanel(cached.headers, cached.data, teams);
        renderer.showDataDisplay();
      }
    }
  } else if (tab === 'teams') {
    // Clear player selection for teams tab
    store.setSelectedPlayer(null);
    renderer.clearTeamsPlayerDetailsPanel();
    
    const teamsData = store.getTeamsData();
    if (teamsData) {
      const teamsSheet = store.getTeamsSheet();
      const layoutConfig = teamsSheet 
        ? loadTeamsLayoutConfig(getSheetKey(teamsSheet.spreadsheetId, teamsSheet.gid))
        : null;
      await renderTeamsWithConfig(teamsData.headers, teamsData.data, layoutConfig);
    } else if (store.hasTeamsSheet()) {
      await fetchAndRenderTeams();
    } else {
      renderer.showTeamsNotConfigured();
    }
  }
}

/**
 * Gets parsed teams from cached teams data
 * @returns {import('./validation/schema.js').Team[]}
 */
function getParsedTeams() {
  const teamsData = store.getTeamsData();
  if (!teamsData) return [];
  
  // Get saved layout config for this sheet
  const teamsSheet = store.getTeamsSheet();
  let layoutConfig = null;
  if (teamsSheet) {
    const sheetKey = getSheetKey(teamsSheet.spreadsheetId, teamsSheet.gid);
    layoutConfig = loadTeamsLayoutConfig(sheetKey);
  }
  
  const result = validateTeamsData(teamsData.headers, teamsData.data, layoutConfig || undefined);
  return result.data ? result.data.teams : [];
}

/**
 * Called when a filter is toggled
 */
function onFilterChange() {
  const activeTab = store.getActiveTab();
  const teams = getParsedTeams();
  
  if (activeTab === 'players') {
    const sheet = store.getFirstSheet();
    if (sheet) {
      const cached = store.getSheetData(sheet.spreadsheetId, sheet.gid);
      if (cached) {
        renderPlayersPanel(cached.headers, cached.data, teams);
      }
    }
  }
}

/**
 * Called when a player is clicked in a team card
 * @param {string} nickname
 */
function onTeamPlayerSelect(nickname) {
  const sheet = store.getFirstSheet();
  const cached = sheet ? store.getSheetData(sheet.spreadsheetId, sheet.gid) : null;
  const headers = cached?.headers || [];
  
  // Get columns configuration for dynamic rendering
  const sheetKey = sheet ? getSheetKey(sheet.spreadsheetId, sheet.gid) : null;
  const columnsConfig = sheetKey ? store.getColumnsConfiguration(sheetKey) : null;
  
  const player = store.getPlayerByNickname(nickname);
  
  if (player) {
    store.setSelectedPlayer(player);
    renderer.renderTeamsPlayerDetailsPanel(player, headers, columnsConfig);
    renderer.updateTeamsPlayerSelection(nickname);
  } else {
    // Player not found in players sheet, show minimal info with just nickname
    const playerLike = {
      nickname,
      battleTag: '',
      role: 'unknown',
      rating: 0,
      heroes: '',
      rawRow: []
    };
    store.setSelectedPlayer(playerLike);
    renderer.renderTeamsPlayerDetailsPanel(playerLike, headers, columnsConfig);
    renderer.updateTeamsPlayerSelection(nickname);
  }
}

/**
 * Called when a player row is clicked in the players table
 * @param {number} rowIndex
 */
function onPlayerRowSelect(rowIndex) {
  const sheet = store.getFirstSheet();
  if (!sheet) return;
  
  const cached = store.getSheetData(sheet.spreadsheetId, sheet.gid);
  if (!cached) return;
  
  const teams = getParsedTeams();
  
  // Apply filters to get the actual data being displayed
  const filteredData = getFilteredTableData(cached.headers, cached.data, teams);
  if (rowIndex < 0 || rowIndex >= filteredData.length) return;
  
  // Find nickname column to look up player
  const nicknameIdx = cached.headers.findIndex(h => 
    /^(ник|никнейм|nickname|nick|имя|name|игрок|player)/i.test(h.trim())
  );
  
  if (nicknameIdx === -1) return;
  
  const nickname = filteredData[rowIndex][nicknameIdx]?.trim();
  if (!nickname) return;
  
  const player = store.getPlayerByNickname(nickname);
  if (player) {
    store.setSelectedPlayer(player);
    selectedPlayerRowIndex = rowIndex;
    lastPlayerDetailsHash = computePlayerDetailsHash(player);
    
    // Use dynamic config if available
    const sheetKey = getSheetKey(sheet.spreadsheetId, sheet.gid);
    const columnsConfig = store.getColumnsConfiguration(sheetKey);
    
    if (columnsConfig && columnsConfig.columns.length > 0) {
      renderer.renderPlayerDetailsPanelWithConfig(player, cached.headers, columnsConfig);
    } else {
      renderer.renderPlayerDetailsPanel(player, cached.headers);
    }
    renderer.updatePlayerRowSelection(rowIndex);
  }
}

/**
 * Gets filtered table data based on current filters
 * @param {string[]} headers
 * @param {string[][]} data
 * @param {import('./validation/schema.js').Team[]} teams
 * @returns {string[][]}
 */
function getFilteredTableData(headers, data, teams) {
  const filters = store.getFilters();
  
  if (!filters.availableOnly && filters.role === null) {
    return data;
  }
  
  const filteredPlayers = store.getFilteredPlayers(teams);
  const filteredNicknames = new Set(filteredPlayers.map(p => p.nickname.toLowerCase()));
  
  const nicknameIdx = headers.findIndex(h => 
    /^(ник|никнейм|nickname|nick|имя|name|игрок|player)/i.test(h.trim())
  );
  
  if (nicknameIdx === -1) {
    return data;
  }
  
  return data.filter(row => {
    const nickname = row[nicknameIdx]?.trim()?.toLowerCase();
    return nickname && filteredNicknames.has(nickname);
  });
}

/**
 * Called when user clicks "Configure teams layout" button in settings
 */
async function onConfigureTeamsLayout() {
  const teamsSheet = store.getTeamsSheet();
  if (!teamsSheet) return;
  
  try {
    let data;
    
    // Handle local vs Google Sheets source
    if (store.isLocalSheet(teamsSheet)) {
      // Load from localStorage
      data = loadLocalTeamsSheetData(teamsSheet);
      if (!data) {
        console.error('[App] Local teams data not found');
        return;
      }
    } else {
      // Fetch from Google Sheets
      data = await fetchSheet(teamsSheet.spreadsheetId, teamsSheet.gid);
    }
    
    const sheetKey = getSheetKey(teamsSheet.spreadsheetId, teamsSheet.gid);
    const allRows = [data.headers, ...data.data];
    
    // Load saved config or use defaults
    let layoutConfig = loadTeamsLayoutConfig(sheetKey) || getDefaultTeamsLayoutConfig();
    
    // Validate to get any errors
    const validation = validateTeamsDataWithConfig(allRows, layoutConfig);
    
    // Cache the data for when config is confirmed
    pendingTeamsData = { headers: data.headers, data: data.data, allRows };
    isTeamsLayoutPending = true;
    
    // Open the modal
    events.openTeamsLayoutModal(
      allRows,
      layoutConfig,
      validation.parseError,
      onTeamsLayoutConfirmed
    );
  } catch (err) {
    console.error('[App] Failed to load teams data for layout config:', err);
  }
}

/**
 * Called when column mapping is confirmed in the modal (legacy)
 * @param {import('./storage/persistence.js').ColumnMapping} mapping
 */
async function onColumnMappingConfirmed(mapping) {
  isColumnMappingPending = false;
  
  const sheet = store.getFirstSheet();
  if (!sheet || !pendingSheetData) return;
  
  const sheetKey = getSheetKey(sheet.spreadsheetId, sheet.gid);
  
  // Update sheet data with new mapping
  store.updateSheetData({
    spreadsheetId: sheet.spreadsheetId,
    gid: sheet.gid,
    headers: pendingSheetData.headers,
    data: pendingSheetData.data,
    lastUpdated: new Date()
  }, mapping);
  
  pendingSheetData = null;
  
  // Render the data
  if (store.getActiveTab() === 'players') {
    const teams = getParsedTeams();
    const cached = store.getSheetData(sheet.spreadsheetId, sheet.gid);
    if (cached) {
      renderPlayersPanel(cached.headers, cached.data, teams);
      renderer.showDataDisplay();
    }
  }
  
  renderer.updateStatusBar(new Date(), true);
  
  // Start polling if not already running
  if (!pollingManager?.isRunning()) {
    startPolling();
  }
}

/**
 * Called when column configuration is confirmed in the modal
 * @param {import('./storage/persistence.js').ColumnsConfiguration} columnsConfig
 */
async function onColumnConfigConfirmed(columnsConfig) {
  isColumnMappingPending = false;
  
  const sheet = store.getFirstSheet();
  if (!sheet || !pendingSheetData) return;
  
  const sheetKey = getSheetKey(sheet.spreadsheetId, sheet.gid);
  
  // Save the columns configuration
  store.setColumnsConfiguration(sheetKey, columnsConfig);
  
  // Update sheet data
  store.updateSheetData({
    spreadsheetId: sheet.spreadsheetId,
    gid: sheet.gid,
    headers: pendingSheetData.headers,
    data: pendingSheetData.data,
    lastUpdated: new Date()
  });
  
  pendingSheetData = null;
  
  // Render the data
  if (store.getActiveTab() === 'players') {
    const teams = getParsedTeams();
    const cached = store.getSheetData(sheet.spreadsheetId, sheet.gid);
    if (cached) {
      renderPlayersPanel(cached.headers, cached.data, teams);
      renderer.showDataDisplay();
    }
  }
  
  renderer.updateStatusBar(new Date(), true);
  
  // Check if teams sheet is configured and needs layout configuration
  const teamsSheet = store.getTeamsSheet();
  if (teamsSheet) {
    const teamsSheetKey = getSheetKey(teamsSheet.spreadsheetId, teamsSheet.gid);
    const existingTeamsLayout = loadTeamsLayoutConfig(teamsSheetKey);
    
    // Open teams layout modal if no config exists OR if in reconfigure mode
    if (!existingTeamsLayout || isReconfigureAllMode) {
      await onConfigureTeamsLayout();
      return; // Polling will be started after teams layout is confirmed
    }
  }
  
  // Reset reconfigure mode
  isReconfigureAllMode = false;
  
  // Start polling if not already running
  if (!pollingManager?.isRunning()) {
    startPolling();
  }
}

/**
 * Initializes the application
 */
async function init() {
  if (config.isDev) {
    console.log('[OverDraft] Initializing in development mode');
  }
  
  // Initialize i18n (translations)
  await initI18n();
  if (config.isDev) {
    console.log('[OverDraft] i18n initialized');
  }
  
  // Display version
  const versionEl = document.getElementById('app-version');
  if (versionEl) {
    versionEl.textContent = getVersionString();
  }
  
  // Display version in settings
  const settingsVersionEl = document.getElementById('settings-version');
  const settingsBuildEl = document.getElementById('settings-build-time');
  if (settingsVersionEl) {
    settingsVersionEl.textContent = getVersionString();
  }
  if (settingsBuildEl) {
    settingsBuildEl.textContent = getBuildInfo();
  }
  
  // Check for import configuration from URL (legacy base64 config or share GUID)
  const urlParams = new URLSearchParams(window.location.search);
  const configParam = urlParams.get('config');
  const shareGuid = urlParams.get('share');
  
  if (shareGuid) {
    // Load shared configuration from server
    const { loadSharedConfig } = await import('./utils/export.js');
    const result = await loadSharedConfig(shareGuid);
    
    if (result.success) {
      // Remove share parameter from URL without reload
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('share');
      window.history.replaceState({}, '', newUrl.toString());
      
      if (config.isDev) {
        console.log('[OverDraft] Shared configuration loaded from server');
      }
    } else {
      console.error('[OverDraft] Failed to load shared configuration:', result.error);
      alert(t('export.expiredLink') + ': ' + (result.error || 'Unknown error'));
      
      // Remove invalid share parameter from URL
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('share');
      window.history.replaceState({}, '', newUrl.toString());
    }
  } else if (configParam) {
    // Legacy: import base64-encoded configuration
    const { importConfiguration } = await import('./utils/export.js');
    const result = importConfiguration(configParam);
    
    if (result.success) {
      // Remove config parameter from URL without reload
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('config');
      window.history.replaceState({}, '', newUrl.toString());
      
      if (config.isDev) {
        console.log('[OverDraft] Configuration imported from URL');
      }
    } else {
      console.error('[OverDraft] Failed to import configuration:', result.error);
      alert(t('errors.importFailed', { error: result.error || 'Unknown error' }));
    }
  }
  
  // Initialize state from localStorage
  store.initializeState();
  
  // Initialize local icons data (heroes, roles, ranks)
  // This is synchronous since we use local assets
  await initOverFastData();
  store.setOverfastLoaded(true);
  if (config.isDev) {
    console.log('[OverDraft] Icons data loaded (local assets)');
  }
  
  // Apply saved theme and table density
  renderer.applyTheme(store.getState().theme);
  renderer.applyTableDensity(store.getState().tableDensity);
  
  // Initialize event handlers
  events.initializeEvents({
    onSheetConfigured,
    onTabChange,
    onFilterChange,
    onPlayerRowSelect,
    onTeamPlayerSelect,
    onColumnMappingConfirmed,
    onColumnConfigConfirmed,
    onTeamsDisplayConfigConfirmed,
    onConfigureTeamsLayout,
    onSortChange: onFilterChange // Reuse filter change handler - it re-renders the table
  });
  
  // Subscribe to language changes to re-render data
  subscribeToLanguage(() => {
    // Re-render the current view with new translations
    const sheet = store.getFirstSheet();
    if (sheet) {
      const cached = store.getSheetData(sheet.spreadsheetId, sheet.gid);
      if (cached) {
        const teamsSheet = store.getTeamsSheet();
        const teamsData = teamsSheet 
          ? store.getSheetData(teamsSheet.spreadsheetId, teamsSheet.gid)
          : null;
        
        const selectedPlayer = store.getSelectedPlayer();
        const activeTab = store.getActiveTab();
        
        // Re-render players table with dynamic config if available
        const sheetKey = getSheetKey(sheet.spreadsheetId, sheet.gid);
        const columnsConfig = store.getColumnsConfiguration(sheetKey);
        
        if (columnsConfig && columnsConfig.columns.length > 0) {
          renderer.renderPlayersTableWithConfig(
            cached.headers, 
            cached.data,
            columnsConfig,
            teamsData?.parsedTeams || []
          );
        } else {
          renderer.renderPlayersTable(
            cached.headers, 
            cached.data,
            teamsData?.parsedTeams || []
          );
        }
        
        // Re-render player details panel based on active tab
        if (selectedPlayer) {
          if (activeTab === 'teams') {
            renderer.renderTeamsPlayerDetailsPanel(selectedPlayer, cached.headers, columnsConfig);
          } else if (columnsConfig && columnsConfig.columns.length > 0) {
            renderer.renderPlayerDetailsPanelWithConfig(selectedPlayer, cached.headers, columnsConfig);
          } else {
            renderer.renderPlayerDetailsPanel(selectedPlayer, cached.headers);
          }
        }
        
        // Re-render teams grid if on teams tab
        if (activeTab === 'teams' && teamsData) {
          renderer.renderTeamsGrid(teamsData.parsedTeams || [], cached.headers, cached.data);
        }
        
        // Update status bar
        renderer.updateStatusBar(cached.lastUpdated, pollingManager?.isRunning() ?? false);
      }
    }
  });
  
  // Show tabs if teams sheet is configured
  renderer.updateTabsVisibility(store.hasTeamsSheet());
  
  // Show filters on players tab by default
  renderer.updateFiltersVisibility(store.getActiveTab() === 'players');
  updateFilterVisibility();
  
  // Check if sheets are configured
  if (store.hasConfiguredSheets()) {
    // Show loading and fetch data
    renderer.showLoading();
    await fetchAndRender();
    startPolling();
  } else {
    // Show setup modal
    events.showModal('setup-modal');
  }
  
  // Update status bar periodically
  setInterval(() => {
    const sheet = store.getFirstSheet();
    if (sheet) {
      const cached = store.getSheetData(sheet.spreadsheetId, sheet.gid);
      if (cached) {
        renderer.updateStatusBar(cached.lastUpdated, pollingManager?.isRunning() ?? false);
      }
    }
  }, 1000);
}

// Start application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

