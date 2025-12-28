/**
 * Google Sheets CSV API client
 * Fetches data from published Google Sheets using CSV export
 */

import { config } from '../config.js';

/**
 * @typedef {Object} SheetData
 * @property {string} spreadsheetId
 * @property {string} gid
 * @property {string[][]} data - 2D array of cell values
 * @property {string[]} headers - Column headers
 * @property {Date} lastUpdated
 */

/**
 * Error types for sheet operations
 */
export class SheetError extends Error {
  /**
   * @param {'NOT_PUBLISHED'|'NOT_FOUND'|'NETWORK'|'PARSE_ERROR'} type
   * @param {string} message
   * @param {string} [sheetId]
   * @param {string} [gid]
   */
  constructor(type, message, sheetId, gid) {
    super(message);
    this.name = 'SheetError';
    this.type = type;
    this.sheetId = sheetId;
    this.gid = gid;
  }
}

/**
 * Parses CSV text into 2D array
 * Handles quoted fields with commas and newlines
 * @param {string} csv - Raw CSV text
 * @returns {string[][]}
 */
function parseCSV(csv) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;
  
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    const nextChar = csv[i + 1];
    
    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote
          currentField += '"';
          i++; // Skip next quote
        } else {
          // End of quoted field
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\r') {
        // Skip carriage return
      } else if (char === '\n') {
        currentRow.push(currentField.trim());
        // Keep all rows including empty ones to preserve row indices
        if (currentRow.length > 0) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }
  
  // Don't forget the last field/row
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    rows.push(currentRow);
  }
  
  return rows;
}

/**
 * Fetches sheet data using CSV export
 * @param {string} spreadsheetId - Google Sheets document ID
 * @param {string} gid - Sheet tab ID (gid parameter)
 * @returns {Promise<SheetData>}
 */
export async function fetchSheet(spreadsheetId, gid) {
  // Use CSV export URL format
  const url = `${config.gvizBaseUrl}/${spreadsheetId}/export?format=csv&gid=${gid}`;
  
  if (config.isDev) {
    console.log('[Sheets] Fetching CSV:', url);
  }
  
  let response;
  try {
    response = await fetch(url, {
      mode: 'cors',
      credentials: 'omit', // Don't send cookies - allows CORS for public sheets
      headers: {
        'Accept': 'text/csv, text/plain, */*'
      }
    });
  } catch (err) {
    console.error('[Sheets] Fetch failed:', err);
    throw new SheetError('NETWORK', `Network error: ${err.message}`, spreadsheetId, gid);
  }
  
  if (config.isDev) {
    console.log('[Sheets] Response status:', response.status, response.statusText);
    console.log('[Sheets] Response URL:', response.url);
  }
  
  if (!response.ok) {
    console.error('[Sheets] HTTP error:', response.status, response.statusText);
    if (response.status === 404) {
      throw new SheetError('NOT_FOUND', 'Sheet not found', spreadsheetId, gid);
    }
    // Google returns redirect or error page for unauthorized access
    throw new SheetError('NOT_PUBLISHED', 'Sheet is not published to web', spreadsheetId, gid);
  }
  
  let text;
  try {
    text = await response.text();
  } catch (err) {
    throw new SheetError('NETWORK', 'Failed to read response', spreadsheetId, gid);
  }
  
  if (config.isDev) {
    console.log('[Sheets] Response text (first 500 chars):', text.substring(0, 500));
  }
  
  // Check if we got HTML instead of CSV (indicates auth error)
  if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
    throw new SheetError('NOT_PUBLISHED', 'Sheet is not published to web', spreadsheetId, gid);
  }
  
  let rows;
  try {
    rows = parseCSV(text);
  } catch (err) {
    console.error('[Sheets] CSV parse error:', err);
    throw new SheetError('PARSE_ERROR', `Failed to parse CSV: ${err.message}`, spreadsheetId, gid);
  }
  
  if (rows.length === 0) {
    throw new SheetError('PARSE_ERROR', 'Sheet is empty', spreadsheetId, gid);
  }
  
  // First row is headers
  const headers = rows[0];
  const data = rows.slice(1);
  
  return {
    spreadsheetId,
    gid,
    headers,
    data,
    lastUpdated: new Date()
  };
}

/**
 * Fetches multiple sheets in parallel
 * @param {Array<{spreadsheetId: string, gid: string}>} sheets
 * @returns {Promise<SheetData[]>}
 */
export async function fetchMultiple(sheets) {
  return Promise.all(
    sheets.map(sheet => fetchSheet(sheet.spreadsheetId, sheet.gid))
  );
}

