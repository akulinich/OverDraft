/**
 * Export/Import configuration utilities
 */

import * as store from '../state/store.js';
import { 
  loadTeamsLayoutConfig, 
  saveTeamsLayoutConfig,
  saveColumnsConfiguration,
  saveTeamsDisplayConfig
} from '../storage/persistence.js';
import { getSheetKey } from './parser.js';

const EXPORT_VERSION = 2;

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
 * Exports current configuration to a shareable URL
 * @returns {string|null} Shareable URL or null if export is not available
 */
export function exportConfiguration() {
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
  
  // Encode to base64
  try {
    const jsonString = JSON.stringify(exportConfig);
    const base64 = btoa(unescape(encodeURIComponent(jsonString)));
    
    // Build shareable URL
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('config', base64);
    
    return currentUrl.toString();
  } catch (err) {
    return null;
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
    const jsonString = decodeURIComponent(escape(atob(configString)));
    const config = JSON.parse(jsonString);
    
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

