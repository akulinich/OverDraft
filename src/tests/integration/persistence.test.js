import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadConfiguredSheets,
  saveConfiguredSheets,
  loadSettings,
  saveSettings,
  loadTeamsSheet,
  saveTeamsSheet,
  loadColumnMapping,
  saveColumnMapping,
  removeColumnMapping,
  loadTeamsLayoutConfig,
  saveTeamsLayoutConfig,
  removeTeamsLayoutConfig,
  saveLocalCSVData,
  loadLocalCSVData,
  removeLocalCSVData,
  getDefaultTeamsLayoutConfig,
  loadLanguage,
  saveLanguage,
  clearAll
} from '../../js/storage/persistence.js';

describe('Persistence Layer', () => {
  let mockStorage;

  beforeEach(() => {
    // Create mock localStorage
    mockStorage = {};
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key) => mockStorage[key] || null),
      setItem: vi.fn((key, value) => { mockStorage[key] = value; }),
      removeItem: vi.fn((key) => { delete mockStorage[key]; })
    });
  });

  describe('Configured Sheets', () => {
    it('returns empty array when no sheets configured', () => {
      const sheets = loadConfiguredSheets();
      expect(sheets).toEqual([]);
    });

    it('saves and loads sheets', () => {
      const sheets = [
        { 
          sourceType: 'google',
          spreadsheetId: 'abc123', 
          gid: '0', 
          addedAt: new Date().toISOString() 
        }
      ];
      
      saveConfiguredSheets(sheets);
      const loaded = loadConfiguredSheets();
      
      expect(loaded.length).toBe(1);
      expect(loaded[0].spreadsheetId).toBe('abc123');
    });

    it('handles local source type', () => {
      const sheets = [
        { 
          sourceType: 'local',
          spreadsheetId: 'local', 
          gid: 'players.csv', 
          addedAt: new Date().toISOString() 
        }
      ];
      
      saveConfiguredSheets(sheets);
      const loaded = loadConfiguredSheets();
      
      expect(loaded[0].sourceType).toBe('local');
      expect(loaded[0].gid).toBe('players.csv');
    });
  });

  describe('Settings', () => {
    it('returns defaults when no settings saved', () => {
      const settings = loadSettings();
      expect(settings.pollingInterval).toBe(1000);
      expect(settings.theme).toBe('dark');
    });

    it('merges partial settings with defaults', () => {
      saveSettings({ pollingInterval: 5000 });
      const settings = loadSettings();
      
      expect(settings.pollingInterval).toBe(5000);
      expect(settings.theme).toBe('dark'); // Default preserved
    });
  });

  describe('Teams Sheet', () => {
    it('returns null when no teams sheet configured', () => {
      const teamsSheet = loadTeamsSheet();
      expect(teamsSheet).toBeNull();
    });

    it('saves and loads teams sheet', () => {
      const sheet = { 
        sourceType: 'google',
        spreadsheetId: 'teams123', 
        gid: '456', 
        addedAt: new Date().toISOString() 
      };
      
      saveTeamsSheet(sheet);
      const loaded = loadTeamsSheet();
      
      expect(loaded?.spreadsheetId).toBe('teams123');
    });

    it('removes teams sheet when saving null', () => {
      saveTeamsSheet({ spreadsheetId: 'x', gid: '0', addedAt: '' });
      saveTeamsSheet(null);
      
      expect(localStorage.removeItem).toHaveBeenCalled();
    });
  });

  describe('Column Mappings', () => {
    const sheetKey = 'abc123_0';

    it('returns null for non-existent mapping', () => {
      const mapping = loadColumnMapping(sheetKey);
      expect(mapping).toBeNull();
    });

    it('saves and loads column mapping', () => {
      const mapping = {
        nickname: 'Ник',
        role: 'Роль',
        rating: 'Рейтинг',
        heroes: 'Герои'
      };
      
      saveColumnMapping(sheetKey, mapping);
      const loaded = loadColumnMapping(sheetKey);
      
      expect(loaded?.nickname).toBe('Ник');
      expect(loaded?.role).toBe('Роль');
    });

    it('removes column mapping', () => {
      saveColumnMapping(sheetKey, { nickname: 'Test' });
      removeColumnMapping(sheetKey);
      
      expect(loadColumnMapping(sheetKey)).toBeNull();
    });
  });

  describe('Teams Layout Config', () => {
    const sheetKey = 'teams_0';

    it('returns null for non-existent config', () => {
      const config = loadTeamsLayoutConfig(sheetKey);
      expect(config).toBeNull();
    });

    it('saves and loads layout config', () => {
      const config = {
        teamsPerRow: 4,
        columnsPerTeam: 5,
        separatorColumns: 2,
        rowsBetweenBlocks: 1,
        playersPerTeam: 6,
        headerRows: 2,
        startRow: 0,
        startCol: 0
      };
      
      saveTeamsLayoutConfig(sheetKey, config);
      const loaded = loadTeamsLayoutConfig(sheetKey);
      
      expect(loaded?.teamsPerRow).toBe(4);
      expect(loaded?.playersPerTeam).toBe(6);
    });

    it('removes layout config', () => {
      saveTeamsLayoutConfig(sheetKey, { teamsPerRow: 3 });
      removeTeamsLayoutConfig(sheetKey);
      
      expect(loadTeamsLayoutConfig(sheetKey)).toBeNull();
    });
  });

  describe('getDefaultTeamsLayoutConfig', () => {
    it('returns sensible defaults', () => {
      const config = getDefaultTeamsLayoutConfig();
      
      expect(config.teamsPerRow).toBe(3);
      expect(config.columnsPerTeam).toBe(4);
      expect(config.playersPerTeam).toBe(5);
      expect(config.headerRows).toBe(2);
    });
  });

  describe('Local CSV Data', () => {
    const fileName = 'players.csv';
    const base64Data = 'YSxiLGMKMSwyLDM='; // "a,b,c\n1,2,3" in base64

    it('returns null for non-existent file', () => {
      const data = loadLocalCSVData(fileName);
      expect(data).toBeNull();
    });

    it('saves and loads local CSV data', () => {
      saveLocalCSVData(fileName, base64Data);
      const loaded = loadLocalCSVData(fileName);
      
      expect(loaded).toBe(base64Data);
    });

    it('removes local CSV data', () => {
      saveLocalCSVData(fileName, base64Data);
      removeLocalCSVData(fileName);
      
      expect(loadLocalCSVData(fileName)).toBeNull();
    });

    it('handles multiple files', () => {
      saveLocalCSVData('file1.csv', 'data1');
      saveLocalCSVData('file2.csv', 'data2');
      
      expect(loadLocalCSVData('file1.csv')).toBe('data1');
      expect(loadLocalCSVData('file2.csv')).toBe('data2');
    });
  });

  describe('clearAll', () => {
    it('removes all storage keys', () => {
      saveConfiguredSheets([{ spreadsheetId: 'x', gid: '0', addedAt: '' }]);
      saveSettings({ pollingInterval: 5000 });
      saveLocalCSVData('test.csv', 'data');
      
      clearAll();
      
      expect(localStorage.removeItem).toHaveBeenCalledTimes(7); // All keys including language 6 storage keys
    });
  });

  describe('Language Persistence', () => {
    it('returns null when no language stored', () => {
      const lang = loadLanguage();
      expect(lang).toBeNull();
    });

    it('saves and loads Russian language preference', () => {
      saveLanguage('ru');
      expect(loadLanguage()).toBe('ru');
    });

    it('saves and loads English language preference', () => {
      saveLanguage('en');
      expect(loadLanguage()).toBe('en');
    });

    it('overwrites previous language preference', () => {
      saveLanguage('en');
      expect(loadLanguage()).toBe('en');

      saveLanguage('ru');
      expect(loadLanguage()).toBe('ru');
    });

    it('returns null for invalid stored language', () => {
      mockStorage['overdraft_language'] = 'de';
      expect(loadLanguage()).toBeNull();
    });

    it('returns null for empty stored language', () => {
      mockStorage['overdraft_language'] = '';
      expect(loadLanguage()).toBeNull();
    });

    it('clears language on clearAll', () => {
      saveLanguage('en');
      expect(loadLanguage()).toBe('en');

      clearAll();
      expect(loadLanguage()).toBeNull();
    });

    it('handles localStorage errors gracefully on save', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      localStorage.setItem = vi.fn(() => {
        throw new Error('QuotaExceededError');
      });

      // Should not throw
      expect(() => saveLanguage('en')).not.toThrow();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('handles localStorage errors gracefully on load', () => {
      localStorage.getItem = vi.fn(() => {
        throw new Error('SecurityError');
      });

      // Should return null and not throw
      expect(loadLanguage()).toBeNull();
    });
  });

  describe('Error handling', () => {
    it('returns defaults on corrupted JSON', () => {
      mockStorage['overdraft_configured_sheets'] = 'not valid json';
      
      const sheets = loadConfiguredSheets();
      expect(sheets).toEqual([]);
    });

    it('handles localStorage quota errors gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      localStorage.setItem = vi.fn(() => {
        throw new Error('QuotaExceededError');
      });
      
      // Should not throw, just log error
      expect(() => saveLocalCSVData('file.csv', 'data')).not.toThrow();
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });
});

