/**
 * Sheets API client
 * Fetches data from OverDraft API server with ETag caching support
 * Server returns CSV format for compatibility with existing code
 */

import { config } from '../config.js';
import { parseCSV } from '../utils/csv.js';

/**
 * @typedef {Object} SheetData
 * @property {string} spreadsheetId
 * @property {string} gid
 * @property {string[][]} data - 2D array of cell values
 * @property {string[]} headers - Column headers
 * @property {Date} lastUpdated
 * @property {boolean} [pending] - True if data is still being fetched (HTTP 202)
 */

/**
 * Error types for sheet operations
 */
export class SheetError extends Error {
  /**
   * @param {'NOT_PUBLISHED'|'NOT_FOUND'|'NETWORK'|'PARSE_ERROR'|'SERVER_ERROR'} type
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
 * In-memory cache for sheet data and ETags
 * @type {Map<string, {data: SheetData, etag: string}>}
 */
const sheetCache = new Map();

/**
 * Generate cache key for spreadsheet/gid pair
 * @param {string} spreadsheetId 
 * @param {string} gid 
 * @returns {string}
 */
function getCacheKey(spreadsheetId, gid) {
  return `${spreadsheetId}_${gid}`;
}

/**
 * Fetches sheet data from API server with ETag support
 * @param {string} spreadsheetId - Google Sheets document ID
 * @param {string} gid - Sheet tab ID (gid parameter)
 * @returns {Promise<SheetData>}
 */
export async function fetchSheet(spreadsheetId, gid) {
  // Debug: trace where this call originates from
  console.trace('[Sheets] fetchSheet called:', spreadsheetId.slice(0, 12) + '...', 'gid:', gid);
  
  const cacheKey = getCacheKey(spreadsheetId, gid);
  const cached = sheetCache.get(cacheKey);
  
  const url = `${config.apiBaseUrl}/api/sheets?spreadsheetId=${encodeURIComponent(spreadsheetId)}&gid=${encodeURIComponent(gid)}`;
  
  if (config.isDev) {
    console.log('[Sheets] Fetching from API:', url);
  }
  
  const headers = {
    'Accept': 'text/csv'
  };
  
  // Send ETag if we have cached data
  if (cached?.etag) {
    headers['If-None-Match'] = cached.etag;
  }
  
  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers,
      mode: 'cors',
      credentials: 'omit'
    });
  } catch (err) {
    console.error('[Sheets] Fetch failed:', err);
    
    // If we have cached data, return it on network error
    if (cached) {
      console.warn('[Sheets] Using cached data due to network error');
      return cached.data;
    }
    
    throw new SheetError('NETWORK', `Network error: ${err.message}`, spreadsheetId, gid);
  }
  
  if (config.isDev) {
    console.log('[Sheets] Response status:', response.status);
  }
  
  // Handle 304 Not Modified - return cached data
  if (response.status === 304) {
    if (config.isDev) {
      console.log('[Sheets] Data unchanged (304), using cache');
    }
    if (cached) {
      return cached.data;
    }
    // This shouldn't happen, but handle it gracefully
    throw new SheetError('PARSE_ERROR', 'Received 304 but no cached data', spreadsheetId, gid);
  }
  
  // Handle 202 Accepted - data is being fetched, return pending marker
  if (response.status === 202) {
    if (config.isDev) {
      console.log('[Sheets] Data pending (202), will retry');
    }
    // Return special object indicating data is pending
    // Caller should retry after a short delay
    return {
      pending: true,
      spreadsheetId,
      gid,
      headers: [],
      data: [],
      lastUpdated: new Date()
    };
  }
  
  // Handle errors
  if (!response.ok) {
    console.error('[Sheets] HTTP error:', response.status, response.statusText);
    
    if (response.status === 404) {
      throw new SheetError('NOT_FOUND', 'Sheet not found', spreadsheetId, gid);
    }
    if (response.status === 403) {
      throw new SheetError('NOT_PUBLISHED', 'Sheet is not public', spreadsheetId, gid);
    }
    
    // Rate limited - use cached data if available
    if (response.status === 429) {
      if (cached) {
        console.warn('[Sheets] Rate limited (429), using cached data');
        return cached.data;
      }
      throw new SheetError('SERVER_ERROR', 'Rate limit exceeded', spreadsheetId, gid);
    }
    
    if (response.status >= 500) {
      // On server error, try to use cached data
      if (cached) {
        console.warn('[Sheets] Server error, using cached data');
        return cached.data;
      }
      throw new SheetError('SERVER_ERROR', `Server error: ${response.status}`, spreadsheetId, gid);
    }
    
    throw new SheetError('NETWORK', `HTTP error: ${response.status}`, spreadsheetId, gid);
  }
  
  // Parse CSV response
  let csvText;
  try {
    csvText = await response.text();
  } catch (err) {
    throw new SheetError('PARSE_ERROR', 'Failed to read response', spreadsheetId, gid);
  }
  
  // Parse CSV to rows
  let rows;
  try {
    rows = parseCSV(csvText);
  } catch (err) {
    throw new SheetError('PARSE_ERROR', 'Failed to parse CSV', spreadsheetId, gid);
  }
  
  // First row is headers, rest is data
  const headers_row = rows.length > 0 ? rows[0] : [];
  const data_rows = rows.length > 1 ? rows.slice(1) : [];
  
  // Build SheetData object
  const sheetData = {
    spreadsheetId: spreadsheetId,
    gid: gid,
    headers: headers_row,
    data: data_rows,
    lastUpdated: new Date()
  };
  
  // Store in cache with ETag
  const etag = response.headers.get('ETag');
  if (etag) {
    sheetCache.set(cacheKey, { data: sheetData, etag });
    if (config.isDev) {
      console.log('[Sheets] Cached with ETag:', etag);
    }
  }
  
  return sheetData;
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

/**
 * Clear the sheet cache
 */
export function clearCache() {
  sheetCache.clear();
}

/**
 * Get cache statistics
 * @returns {{size: number, keys: string[]}}
 */
export function getCacheStats() {
  return {
    size: sheetCache.size,
    keys: Array.from(sheetCache.keys())
  };
}
