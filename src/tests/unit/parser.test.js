import { describe, it, expect } from 'vitest';
import { parseSheetUrl, validateSheetUrl, getSheetKey, validateSameDocument } from '../../js/utils/parser.js';

describe('parseSheetUrl', () => {
  it('extracts spreadsheetId and gid from full URL', () => {
    const url = 'https://docs.google.com/spreadsheets/d/1ABC123xyz/edit#gid=456';
    const result = parseSheetUrl(url);
    expect(result).toEqual({ spreadsheetId: '1ABC123xyz', gid: '456' });
  });

  it('extracts spreadsheetId and gid with query param format', () => {
    const url = 'https://docs.google.com/spreadsheets/d/1ABC123xyz/edit?gid=789';
    const result = parseSheetUrl(url);
    expect(result).toEqual({ spreadsheetId: '1ABC123xyz', gid: '789' });
  });

  it('defaults gid to 0 if missing', () => {
    const url = 'https://docs.google.com/spreadsheets/d/1ABC123xyz/edit';
    const result = parseSheetUrl(url);
    expect(result).toEqual({ spreadsheetId: '1ABC123xyz', gid: '0' });
  });

  it('handles URL with view mode', () => {
    const url = 'https://docs.google.com/spreadsheets/d/1ABC123xyz/view#gid=123';
    const result = parseSheetUrl(url);
    expect(result).toEqual({ spreadsheetId: '1ABC123xyz', gid: '123' });
  });

  it('returns null for invalid URL', () => {
    expect(parseSheetUrl('https://example.com')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseSheetUrl('')).toBeNull();
  });

  it('returns null for null input', () => {
    expect(parseSheetUrl(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(parseSheetUrl(undefined)).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(parseSheetUrl(123)).toBeNull();
  });

  it('handles spreadsheetId with underscores and hyphens', () => {
    const url = 'https://docs.google.com/spreadsheets/d/ABC_123-xyz/edit#gid=0';
    const result = parseSheetUrl(url);
    expect(result?.spreadsheetId).toBe('ABC_123-xyz');
  });
});

describe('validateSheetUrl', () => {
  it('returns valid for correct Google Sheets URL', () => {
    const url = 'https://docs.google.com/spreadsheets/d/1ABC123xyz/edit#gid=456';
    const result = validateSheetUrl(url);
    expect(result).toEqual({ valid: true });
  });

  it('returns error for empty URL', () => {
    const result = validateSheetUrl('');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('URL is required');
  });

  it('returns error for non-Google Sheets URL', () => {
    const result = validateSheetUrl('https://example.com/sheet');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Not a Google Sheets URL');
  });

  it('returns error for malformed Google Sheets URL', () => {
    const result = validateSheetUrl('https://docs.google.com/spreadsheets/');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Could not parse spreadsheet ID');
  });
});

describe('getSheetKey', () => {
  it('generates unique key from spreadsheetId and gid', () => {
    const key = getSheetKey('ABC123', '456');
    expect(key).toBe('ABC123_456');
  });

  it('handles empty gid', () => {
    const key = getSheetKey('ABC123', '');
    expect(key).toBe('ABC123_');
  });
});

describe('validateSameDocument', () => {
  it('returns valid when spreadsheetIds are the same', () => {
    const result = validateSameDocument('ABC123', 'ABC123');
    expect(result).toEqual({ valid: true });
  });

  it('returns error when spreadsheetIds are different', () => {
    const result = validateSameDocument('ABC123', 'DEF456');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('sheetsMustBeSameDocument');
  });

  it('returns error for empty vs non-empty spreadsheetId', () => {
    const result = validateSameDocument('ABC123', '');
    expect(result.valid).toBe(false);
  });

  it('returns valid for both empty spreadsheetIds', () => {
    const result = validateSameDocument('', '');
    expect(result).toEqual({ valid: true });
  });
});





