/**
 * URL parsing utilities for Google Sheets URLs
 */

/**
 * @typedef {Object} ParsedSheetUrl
 * @property {string} spreadsheetId - The document ID
 * @property {string} gid - The sheet tab ID
 */

/**
 * Regular expressions for parsing Google Sheets URLs
 */
const SHEET_URL_REGEX = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/;
const GID_REGEX = /[?#&]gid=(\d+)/;

/**
 * Parses a Google Sheets URL to extract spreadsheetId and gid
 * @param {string} url - Full Google Sheets URL
 * @returns {ParsedSheetUrl|null} Parsed components or null if invalid
 * 
 * @example
 * parseSheetUrl('https://docs.google.com/spreadsheets/d/1ABC123/edit?gid=456')
 * // Returns: { spreadsheetId: '1ABC123', gid: '456' }
 */
export function parseSheetUrl(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }
  
  const spreadsheetMatch = url.match(SHEET_URL_REGEX);
  if (!spreadsheetMatch) {
    return null;
  }
  
  const spreadsheetId = spreadsheetMatch[1];
  
  // Extract gid, default to '0' (first sheet) if not specified
  const gidMatch = url.match(GID_REGEX);
  const gid = gidMatch ? gidMatch[1] : '0';
  
  return { spreadsheetId, gid };
}

/**
 * Validates if a URL is a valid Google Sheets URL
 * @param {string} url 
 * @returns {{valid: boolean, error?: string}}
 */
export function validateSheetUrl(url) {
  if (!url) {
    return { valid: false, error: 'URL is required' };
  }
  
  if (!url.includes('docs.google.com/spreadsheets')) {
    return { valid: false, error: 'Not a Google Sheets URL' };
  }
  
  const parsed = parseSheetUrl(url);
  if (!parsed) {
    return { valid: false, error: 'Could not parse spreadsheet ID' };
  }
  
  return { valid: true };
}

/**
 * Generates a unique key for a sheet configuration
 * @param {string} spreadsheetId 
 * @param {string} gid 
 * @returns {string}
 */
export function getSheetKey(spreadsheetId, gid) {
  return `${spreadsheetId}_${gid}`;
}


