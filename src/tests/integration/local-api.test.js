import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { 
  parseStoredCSV, 
  encodeCSVForStorage, 
  decodeCSVFromStorage,
  LocalFileError
} from '../../js/api/local.js';

describe('Local CSV API', () => {
  let playersCSV;
  let teamsCSV;

  beforeAll(() => {
    playersCSV = readFileSync('tests/fixtures/players.csv', 'utf-8');
    teamsCSV = readFileSync('tests/fixtures/teams.csv', 'utf-8');
  });

  describe('parseStoredCSV', () => {
    it('parses player CSV correctly', () => {
      const data = parseStoredCSV(playersCSV, 'players.csv');
      
      expect(data.spreadsheetId).toBe('local');
      expect(data.gid).toBe('players.csv');
      expect(data.headers).toContain('Ник');
      expect(data.headers).toContain('Роль');
      expect(data.headers).toContain('Рейтинг');
      expect(data.headers).toContain('Герои');
      expect(data.data.length).toBeGreaterThan(0);
      expect(data.lastUpdated).toBeInstanceOf(Date);
    });

    it('parses teams CSV correctly', () => {
      const data = parseStoredCSV(teamsCSV, 'teams.csv');
      
      expect(data.spreadsheetId).toBe('local');
      expect(data.gid).toBe('teams.csv');
      expect(data.headers.length).toBeGreaterThan(0);
      expect(data.data.length).toBeGreaterThan(0);
    });

    it('separates headers from data', () => {
      const data = parseStoredCSV(playersCSV, 'players.csv');
      
      // Headers should be first row
      expect(data.headers[0]).toBe('Ник');
      
      // Data should not include headers
      expect(data.data[0][0]).not.toBe('Ник');
    });

    it('throws for empty CSV', () => {
      expect(() => parseStoredCSV('', 'empty.csv'))
        .toThrow(LocalFileError);
    });

    it('throws with correct error type for empty CSV', () => {
      try {
        parseStoredCSV('', 'empty.csv');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(LocalFileError);
        expect(err.type).toBe('EMPTY_FILE');
        expect(err.fileName).toBe('empty.csv');
      }
    });
  });

  describe('encodeCSVForStorage / decodeCSVFromStorage', () => {
    it('round-trips simple ASCII text', () => {
      const original = 'a,b,c\n1,2,3';
      const encoded = encodeCSVForStorage(original);
      const decoded = decodeCSVFromStorage(encoded);
      expect(decoded).toBe(original);
    });

    it('round-trips Cyrillic text', () => {
      const original = 'Ник,Роль,Рейтинг\nИгрок1,Танк,3500';
      const encoded = encodeCSVForStorage(original);
      const decoded = decodeCSVFromStorage(encoded);
      expect(decoded).toBe(original);
    });

    it('round-trips special characters', () => {
      const original = 'name,note\nPlayer,"Said ""hello"", bye"';
      const encoded = encodeCSVForStorage(original);
      const decoded = decodeCSVFromStorage(encoded);
      expect(decoded).toBe(original);
    });

    it('round-trips full fixture file', () => {
      const encoded = encodeCSVForStorage(playersCSV);
      const decoded = decodeCSVFromStorage(encoded);
      expect(decoded).toBe(playersCSV);
    });

    it('produces base64 string', () => {
      const encoded = encodeCSVForStorage('test');
      // Base64 should only contain valid characters
      expect(encoded).toMatch(/^[A-Za-z0-9+/=]+$/);
    });
  });
});

