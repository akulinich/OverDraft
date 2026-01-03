/**
 * Local CSV file client
 * Handles loading and storing local CSV files
 */

import { parseCSV } from '../utils/csv.js';

/**
 * @typedef {import('./sheets.js').SheetData} SheetData
 */

/**
 * Error types for local file operations
 */
export class LocalFileError extends Error {
  /**
   * @param {'READ_ERROR'|'PARSE_ERROR'|'EMPTY_FILE'|'INVALID_TYPE'} type
   * @param {string} message
   * @param {string} [fileName]
   */
  constructor(type, message, fileName) {
    super(message);
    this.name = 'LocalFileError';
    this.type = type;
    this.fileName = fileName;
  }
}

/**
 * Reads a File object as text
 * @param {File} file
 * @returns {Promise<string>}
 */
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(/** @type {string} */ (reader.result));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

/**
 * Loads and parses a local CSV file
 * @param {File} file - File object from input[type=file]
 * @returns {Promise<SheetData>}
 */
export async function loadLocalCSV(file) {
  // Validate file type
  if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
    throw new LocalFileError('INVALID_TYPE', 'File must be a CSV', file.name);
  }
  
  let text;
  try {
    text = await readFileAsText(file);
  } catch (err) {
    throw new LocalFileError('READ_ERROR', `Failed to read file: ${err.message}`, file.name);
  }
  
  let rows;
  try {
    rows = parseCSV(text);
  } catch (err) {
    throw new LocalFileError('PARSE_ERROR', `Failed to parse CSV: ${err.message}`, file.name);
  }
  
  if (rows.length === 0) {
    throw new LocalFileError('EMPTY_FILE', 'CSV file is empty', file.name);
  }
  
  // First row is headers
  const headers = rows[0];
  const data = rows.slice(1);
  
  return {
    spreadsheetId: 'local',
    gid: file.name,
    headers,
    data,
    lastUpdated: new Date()
  };
}

/**
 * Parses CSV data from a stored string (from localStorage)
 * @param {string} csvText - Raw CSV text
 * @param {string} fileName - Original file name
 * @returns {SheetData}
 */
export function parseStoredCSV(csvText, fileName) {
  const rows = parseCSV(csvText);
  
  if (rows.length === 0) {
    throw new LocalFileError('EMPTY_FILE', 'CSV data is empty', fileName);
  }
  
  const headers = rows[0];
  const data = rows.slice(1);
  
  return {
    spreadsheetId: 'local',
    gid: fileName,
    headers,
    data,
    lastUpdated: new Date()
  };
}

/**
 * Encodes CSV text to base64 for storage
 * @param {string} text
 * @returns {string}
 */
export function encodeCSVForStorage(text) {
  return btoa(unescape(encodeURIComponent(text)));
}

/**
 * Decodes base64 CSV text from storage
 * @param {string} encoded
 * @returns {string}
 */
export function decodeCSVFromStorage(encoded) {
  return decodeURIComponent(escape(atob(encoded)));
}

/**
 * Gets the raw CSV text from a File object
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function getCSVText(file) {
  return readFileAsText(file);
}






