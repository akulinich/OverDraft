/**
 * Export/Import configuration utilities
 */

import * as store from '../state/store.js';
import { config } from '../config.js';
import { 
  loadTeamsLayoutConfig, 
  saveTeamsLayoutConfig,
  saveColumnsConfiguration,
  saveTeamsDisplayConfig
} from '../storage/persistence.js';
import { getSheetKey } from './parser.js';

const EXPORT_VERSION = 2;
const CONFIG_FILE_NAME = 'overdraft_config.bin';

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
 * Checks if export is available (all sheets must be Google Sheets)
 * @returns {boolean}
 */
export function isExportAvailable() {
  const configuredSheets = store.getState().configuredSheets;
  if (configuredSheets.length === 0) {
    return false;
  }
  
  // Check all player sheets
  for (const sheet of configuredSheets) {
    if (store.isLocalSheet(sheet)) {
      return false;
    }
  }
  
  // Check teams sheet if exists
  const teamsSheet = store.getTeamsSheet();
  if (teamsSheet && store.isLocalSheet(teamsSheet)) {
    return false;
  }
  
  return true;
}

/**
 * Builds export config object from current state
 * @returns {Object|null} Export config or null if not available
 */
function buildExportConfig() {
  if (!isExportAvailable()) {
    return null;
  }
  
  const state = store.getState();
  const configuredSheets = state.configuredSheets;
  
  if (configuredSheets.length === 0) {
    return null;
  }
  
  // Get first player sheet (primary sheet)
  const playersSheet = configuredSheets[0];
  
  // Build export config
  /** @type {any} */
  const exportConfig = {
    version: EXPORT_VERSION,
    playersSheet: {
      spreadsheetId: playersSheet.spreadsheetId,
      gid: playersSheet.gid,
      url: buildSheetUrl(playersSheet.spreadsheetId, playersSheet.gid)
    },
    columnMappings: {}
  };
  
  // Add teams sheet if exists
  const teamsSheet = store.getTeamsSheet();
  if (teamsSheet) {
    exportConfig.teamsSheet = {
      spreadsheetId: teamsSheet.spreadsheetId,
      gid: teamsSheet.gid,
      url: buildSheetUrl(teamsSheet.spreadsheetId, teamsSheet.gid)
    };
    
    // Add teams layout if exists
    const teamsSheetKey = getSheetKey(teamsSheet.spreadsheetId, teamsSheet.gid);
    const teamsLayout = loadTeamsLayoutConfig(teamsSheetKey);
    if (teamsLayout) {
      exportConfig.teamsLayout = teamsLayout;
    }
  }
  
  // Collect column mappings for all sheets (legacy format for backward compatibility)
  const playersSheetKey = getSheetKey(playersSheet.spreadsheetId, playersSheet.gid);
  const playersMapping = store.getColumnMapping(playersSheetKey);
  if (playersMapping) {
    exportConfig.columnMappings[playersSheetKey] = playersMapping;
  }
  
  if (teamsSheet) {
    const teamsSheetKey = getSheetKey(teamsSheet.spreadsheetId, teamsSheet.gid);
    const teamsMapping = store.getColumnMapping(teamsSheetKey);
    if (teamsMapping) {
      exportConfig.columnMappings[teamsSheetKey] = teamsMapping;
    }
  }
  
  // Add columns configuration (new format with types and order)
  const columnsConfig = store.getColumnsConfiguration(playersSheetKey);
  if (columnsConfig) {
    exportConfig.columnsConfig = columnsConfig;
  }
  
  // Add teams display config (which columns to show in team cards)
  const teamsDisplayConfig = store.getTeamsDisplayConfiguration(playersSheetKey);
  if (teamsDisplayConfig) {
    exportConfig.teamsDisplayConfig = teamsDisplayConfig;
  }
  
  return exportConfig;
}

/**
 * Encodes config object to base64 string
 * @param {Object} configObj 
 * @returns {string|null}
 */
function encodeConfig(configObj) {
  try {
    const jsonString = JSON.stringify(configObj);
    return btoa(unescape(encodeURIComponent(jsonString)));
  } catch (err) {
    return null;
  }
}

/**
 * Decodes base64 config string to object
 * @param {string} base64String 
 * @returns {Object|null}
 */
function decodeConfig(base64String) {
  try {
    const jsonString = decodeURIComponent(escape(atob(base64String)));
    return JSON.parse(jsonString);
  } catch (err) {
    return null;
  }
}

/**
 * Exports current configuration to a shareable URL (legacy function)
 * @returns {string|null} Shareable URL or null if export is not available
 */
export function exportConfiguration() {
  const exportConfig = buildExportConfig();
  if (!exportConfig) {
    return null;
  }
  
  const base64 = encodeConfig(exportConfig);
  if (!base64) {
    return null;
  }
  
  // Build shareable URL
  const currentUrl = new URL(window.location.href);
  currentUrl.searchParams.set('config', base64);
  
  return currentUrl.toString();
}

/**
 * Exports configuration to a downloadable binary file
 * @returns {{success: boolean, error?: string}}
 */
export function exportConfigToFile() {
  const exportConfig = buildExportConfig();
  if (!exportConfig) {
    return { success: false, error: 'No configuration to export' };
  }
  
  const base64 = encodeConfig(exportConfig);
  if (!base64) {
    return { success: false, error: 'Failed to encode configuration' };
  }
  
  try {
    // Convert base64 to binary
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Create blob and download
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = CONFIG_FILE_NAME;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || 'Failed to export file' };
  }
}

/**
 * Imports configuration from a file
 * @param {File} file - The file to import
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function importConfigFromFile(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    
    // Convert binary to base64
    let binaryString = '';
    for (let i = 0; i < bytes.length; i++) {
      binaryString += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binaryString);
    
    // Import using existing function
    return importConfiguration(base64);
  } catch (err) {
    return { success: false, error: err.message || 'Failed to read file' };
  }
}

/**
 * Shares configuration via server API
 * @returns {Promise<{success: boolean, shareUrl?: string, error?: string}>}
 */
export async function shareConfigViaServer() {
  const exportConfig = buildExportConfig();
  if (!exportConfig) {
    return { success: false, error: 'No configuration to share' };
  }
  
  const base64 = encodeConfig(exportConfig);
  if (!base64) {
    return { success: false, error: 'Failed to encode configuration' };
  }
  
  try {
    const response = await fetch(`${config.apiBaseUrl}/api/config/share`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ config: base64 }),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { 
        success: false, 
        error: errorData.detail || `Server error: ${response.status}` 
      };
    }
    
    const data = await response.json();
    
    // Build share URL
    const shareUrl = new URL(window.location.href);
    shareUrl.search = ''; // Clear existing params
    shareUrl.searchParams.set('share', data.guid);
    
    return { 
      success: true, 
      shareUrl: shareUrl.toString(),
      expiresAt: data.expiresAt
    };
  } catch (err) {
    return { success: false, error: err.message || 'Failed to connect to server' };
  }
}

/**
 * Loads shared configuration from server
 * @param {string} guid - The share GUID
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function loadSharedConfig(guid) {
  try {
    const response = await fetch(`${config.apiBaseUrl}/api/config/${guid}`);
    
    if (response.status === 404) {
      return { success: false, error: 'Share link not found. It may have expired or is invalid.' };
    }
    
    if (response.status === 410) {
      return { success: false, error: 'Share link has expired. Please request a new one.' };
    }
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { 
        success: false, 
        error: errorData.detail || `Server error: ${response.status}` 
      };
    }
    
    const data = await response.json();
    
    // Import the configuration
    return importConfiguration(data.config);
  } catch (err) {
    return { success: false, error: err.message || 'Failed to load shared configuration' };
  }
}

/**
 * Imports configuration from base64-encoded string
 * @param {string} configString - Base64-encoded JSON string
 * @returns {{success: boolean, error?: string}}
 */
export function importConfiguration(configString) {
  try {
    // Decode base64
    const config = decodeConfig(configString);
    if (!config) {
      return { success: false, error: 'Failed to decode configuration' };
    }
    
    // Validate structure
    if (!config.version || typeof config.version !== 'number') {
      return { success: false, error: 'Invalid config format: missing version' };
    }
    
    if (!config.playersSheet || !config.playersSheet.spreadsheetId || !config.playersSheet.gid) {
      return { success: false, error: 'Invalid config format: missing players sheet' };
    }
    
    // Import players sheet
    const playersConfig = {
      sourceType: 'google',
      spreadsheetId: config.playersSheet.spreadsheetId,
      gid: config.playersSheet.gid,
      addedAt: new Date().toISOString()
    };
    
    store.replaceSheet(playersConfig);
    
    // Import teams sheet if exists
    if (config.teamsSheet) {
      const teamsConfig = {
        sourceType: 'google',
        spreadsheetId: config.teamsSheet.spreadsheetId,
        gid: config.teamsSheet.gid,
        addedAt: new Date().toISOString()
      };
      
      store.setTeamsSheet(teamsConfig);
      
      // Import teams layout if exists
      if (config.teamsLayout) {
        const teamsSheetKey = getSheetKey(teamsConfig.spreadsheetId, teamsConfig.gid);
        saveTeamsLayoutConfig(teamsSheetKey, config.teamsLayout);
      }
    } else {
      // Clear teams sheet if not in config
      store.setTeamsSheet(null);
    }
    
    // Import column mappings (legacy format)
    if (config.columnMappings && typeof config.columnMappings === 'object') {
      for (const [sheetKey, mapping] of Object.entries(config.columnMappings)) {
        if (mapping && typeof mapping === 'object') {
          store.setColumnMapping(sheetKey, mapping);
        }
      }
    }
    
    // Import columns configuration (new format)
    const playersSheetKey = getSheetKey(config.playersSheet.spreadsheetId, config.playersSheet.gid);
    if (config.columnsConfig) {
      saveColumnsConfiguration(playersSheetKey, config.columnsConfig);
      store.setColumnsConfiguration(playersSheetKey, config.columnsConfig);
    }
    
    // Import teams display config
    if (config.teamsDisplayConfig) {
      saveTeamsDisplayConfig(playersSheetKey, config.teamsDisplayConfig);
      store.setTeamsDisplayConfiguration(playersSheetKey, config.teamsDisplayConfig);
    }
    
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || 'Failed to decode configuration' };
  }
}
