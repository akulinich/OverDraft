import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock store before importing export
const mockGetState = vi.fn();
const mockGetTeamsSheet = vi.fn();
const mockIsLocalSheet = vi.fn();
const mockGetColumnMapping = vi.fn();
const mockReplaceSheet = vi.fn();
const mockSetTeamsSheet = vi.fn();
const mockSetColumnMapping = vi.fn();

vi.mock('../../js/state/store.js', () => ({
  getState: () => mockGetState(),
  getTeamsSheet: () => mockGetTeamsSheet(),
  isLocalSheet: (config) => mockIsLocalSheet(config),
  getColumnMapping: (key) => mockGetColumnMapping(key),
  replaceSheet: (config) => mockReplaceSheet(config),
  setTeamsSheet: (config) => mockSetTeamsSheet(config),
  setColumnMapping: (key, mapping) => mockSetColumnMapping(key, mapping)
}));

// Mock persistence
const mockLoadTeamsLayoutConfig = vi.fn();
const mockSaveTeamsLayoutConfig = vi.fn();

vi.mock('../../js/storage/persistence.js', () => ({
  loadTeamsLayoutConfig: (key) => mockLoadTeamsLayoutConfig(key),
  saveTeamsLayoutConfig: (key, config) => mockSaveTeamsLayoutConfig(key, config)
}));

// Mock parser
vi.mock('../../js/utils/parser.js', () => ({
  getSheetKey: (spreadsheetId, gid) => `${spreadsheetId}_${gid}`
}));

// Mock window.location
const mockLocation = {
  href: 'https://example.com/',
  search: ''
};

Object.defineProperty(window, 'location', {
  value: mockLocation,
  writable: true
});

// Import after mocks
import { isExportAvailable, exportConfiguration, importConfiguration } from '../../js/utils/export.js';

describe('Export Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocation.href = 'https://example.com/';
    mockLocation.search = '';
    
    // Default mocks
    mockGetState.mockReturnValue({
      configuredSheets: []
    });
    mockGetTeamsSheet.mockReturnValue(null);
    mockIsLocalSheet.mockReturnValue(false);
    mockGetColumnMapping.mockReturnValue(null);
    mockLoadTeamsLayoutConfig.mockReturnValue(null);
  });

  describe('isExportAvailable', () => {
    it('returns false when no sheets configured', () => {
      mockGetState.mockReturnValue({
        configuredSheets: []
      });
      
      expect(isExportAvailable()).toBe(false);
    });

    it('returns true when Google Sheets are configured', () => {
      mockGetState.mockReturnValue({
        configuredSheets: [
          { sourceType: 'google', spreadsheetId: 'abc123', gid: '0' }
        ]
      });
      mockIsLocalSheet.mockReturnValue(false);
      
      expect(isExportAvailable()).toBe(true);
    });

    it('returns false when local CSV is configured', () => {
      mockGetState.mockReturnValue({
        configuredSheets: [
          { sourceType: 'local', spreadsheetId: 'local', gid: 'file.csv' }
        ]
      });
      mockIsLocalSheet.mockImplementation((config) => config.sourceType === 'local');
      
      expect(isExportAvailable()).toBe(false);
    });

    it('returns false when teams sheet is local', () => {
      mockGetState.mockReturnValue({
        configuredSheets: [
          { sourceType: 'google', spreadsheetId: 'abc123', gid: '0' }
        ]
      });
      mockGetTeamsSheet.mockReturnValue({
        sourceType: 'local',
        spreadsheetId: 'local',
        gid: 'teams.csv'
      });
      mockIsLocalSheet.mockImplementation((config) => config.sourceType === 'local');
      
      expect(isExportAvailable()).toBe(false);
    });

    it('returns true when both players and teams sheets are Google Sheets', () => {
      mockGetState.mockReturnValue({
        configuredSheets: [
          { sourceType: 'google', spreadsheetId: 'abc123', gid: '0' }
        ]
      });
      mockGetTeamsSheet.mockReturnValue({
        sourceType: 'google',
        spreadsheetId: 'def456',
        gid: '1'
      });
      mockIsLocalSheet.mockReturnValue(false);
      
      expect(isExportAvailable()).toBe(true);
    });
  });

  describe('exportConfiguration', () => {
    it('returns null when export is not available', () => {
      mockGetState.mockReturnValue({
        configuredSheets: []
      });
      
      expect(exportConfiguration()).toBeNull();
    });

    it('exports configuration with players sheet only', () => {
      mockGetState.mockReturnValue({
        configuredSheets: [
          { sourceType: 'google', spreadsheetId: 'abc123', gid: '0' }
        ]
      });
      mockIsLocalSheet.mockReturnValue(false);
      mockGetColumnMapping.mockReturnValue(null);
      
      const url = exportConfiguration();
      
      expect(url).toBeTruthy();
      expect(url).toContain('config=');
      
      // Decode and verify
      const urlObj = new URL(url);
      const configParam = urlObj.searchParams.get('config');
      const decoded = JSON.parse(decodeURIComponent(escape(atob(configParam))));
      
      expect(decoded.version).toBe(1);
      expect(decoded.playersSheet.spreadsheetId).toBe('abc123');
      expect(decoded.playersSheet.gid).toBe('0');
      expect(decoded.playersSheet.url).toBe('https://docs.google.com/spreadsheets/d/abc123/edit#gid=0');
      expect(decoded.teamsSheet).toBeUndefined();
      expect(Object.keys(decoded.columnMappings)).toHaveLength(0);
    });

    it('exports configuration with teams sheet', () => {
      mockGetState.mockReturnValue({
        configuredSheets: [
          { sourceType: 'google', spreadsheetId: 'abc123', gid: '0' }
        ]
      });
      mockGetTeamsSheet.mockReturnValue({
        sourceType: 'google',
        spreadsheetId: 'def456',
        gid: '1'
      });
      mockIsLocalSheet.mockReturnValue(false);
      mockGetColumnMapping.mockReturnValue(null);
      
      const url = exportConfiguration();
      
      expect(url).toBeTruthy();
      const urlObj = new URL(url);
      const configParam = urlObj.searchParams.get('config');
      const decoded = JSON.parse(decodeURIComponent(escape(atob(configParam))));
      
      expect(decoded.teamsSheet).toBeDefined();
      expect(decoded.teamsSheet.spreadsheetId).toBe('def456');
      expect(decoded.teamsSheet.gid).toBe('1');
      expect(decoded.teamsSheet.url).toBe('https://docs.google.com/spreadsheets/d/def456/edit#gid=1');
    });

    it('exports configuration with teams layout', () => {
      mockGetState.mockReturnValue({
        configuredSheets: [
          { sourceType: 'google', spreadsheetId: 'abc123', gid: '0' }
        ]
      });
      mockGetTeamsSheet.mockReturnValue({
        sourceType: 'google',
        spreadsheetId: 'def456',
        gid: '1'
      });
      mockIsLocalSheet.mockReturnValue(false);
      mockGetColumnMapping.mockReturnValue(null);
      
      const mockLayout = {
        startRow: 2,
        startCol: 1,
        teamsPerRow: 3,
        columnsPerTeam: 4,
        separatorColumns: 1,
        rowsBetweenBlocks: 1,
        playersPerTeam: 5,
        headerRows: 2
      };
      mockLoadTeamsLayoutConfig.mockReturnValue(mockLayout);
      
      const url = exportConfiguration();
      
      expect(url).toBeTruthy();
      const urlObj = new URL(url);
      const configParam = urlObj.searchParams.get('config');
      const decoded = JSON.parse(decodeURIComponent(escape(atob(configParam))));
      
      expect(decoded.teamsLayout).toBeDefined();
      expect(decoded.teamsLayout).toEqual(mockLayout);
    });

    it('exports configuration with column mappings', () => {
      mockGetState.mockReturnValue({
        configuredSheets: [
          { sourceType: 'google', spreadsheetId: 'abc123', gid: '0' }
        ]
      });
      mockIsLocalSheet.mockReturnValue(false);
      
      const playersMapping = {
        nickname: 'Ник',
        role: 'Роль',
        rating: 'Рейтинг',
        heroes: 'Герои'
      };
      mockGetColumnMapping.mockImplementation((key) => {
        if (key === 'abc123_0') return playersMapping;
        return null;
      });
      
      const url = exportConfiguration();
      
      expect(url).toBeTruthy();
      const urlObj = new URL(url);
      const configParam = urlObj.searchParams.get('config');
      const decoded = JSON.parse(decodeURIComponent(escape(atob(configParam))));
      
      expect(decoded.columnMappings).toBeDefined();
      expect(decoded.columnMappings['abc123_0']).toEqual(playersMapping);
    });

    it('exports full configuration with all options', () => {
      mockGetState.mockReturnValue({
        configuredSheets: [
          { sourceType: 'google', spreadsheetId: 'abc123', gid: '0' }
        ]
      });
      mockGetTeamsSheet.mockReturnValue({
        sourceType: 'google',
        spreadsheetId: 'def456',
        gid: '1'
      });
      mockIsLocalSheet.mockReturnValue(false);
      
      const playersMapping = { nickname: 'Ник', role: 'Роль', rating: 'Рейтинг', heroes: 'Герои' };
      const teamsMapping = { nickname: 'Игрок', role: 'Роль', rating: 'SR', heroes: 'Heroes' };
      const teamsLayout = {
        startRow: 2,
        startCol: 1,
        teamsPerRow: 3,
        columnsPerTeam: 4,
        separatorColumns: 1,
        rowsBetweenBlocks: 1,
        playersPerTeam: 5,
        headerRows: 2
      };
      
      mockGetColumnMapping.mockImplementation((key) => {
        if (key === 'abc123_0') return playersMapping;
        if (key === 'def456_1') return teamsMapping;
        return null;
      });
      mockLoadTeamsLayoutConfig.mockReturnValue(teamsLayout);
      
      const url = exportConfiguration();
      
      expect(url).toBeTruthy();
      const urlObj = new URL(url);
      const configParam = urlObj.searchParams.get('config');
      const decoded = JSON.parse(decodeURIComponent(escape(atob(configParam))));
      
      expect(decoded.version).toBe(1);
      expect(decoded.playersSheet.spreadsheetId).toBe('abc123');
      expect(decoded.teamsSheet.spreadsheetId).toBe('def456');
      expect(decoded.teamsLayout).toEqual(teamsLayout);
      expect(decoded.columnMappings['abc123_0']).toEqual(playersMapping);
      expect(decoded.columnMappings['def456_1']).toEqual(teamsMapping);
    });
  });

  describe('importConfiguration', () => {
    function createConfigString(config) {
      const jsonString = JSON.stringify(config);
      return btoa(unescape(encodeURIComponent(jsonString)));
    }

    it('imports basic configuration with players sheet', () => {
      const config = {
        version: 1,
        playersSheet: {
          spreadsheetId: 'abc123',
          gid: '0',
          url: 'https://docs.google.com/spreadsheets/d/abc123/edit#gid=0'
        },
        columnMappings: {}
      };
      
      const result = importConfiguration(createConfigString(config));
      
      expect(result.success).toBe(true);
      expect(mockReplaceSheet).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceType: 'google',
          spreadsheetId: 'abc123',
          gid: '0'
        })
      );
    });

    it('imports configuration with teams sheet', () => {
      const config = {
        version: 1,
        playersSheet: {
          spreadsheetId: 'abc123',
          gid: '0',
          url: 'https://docs.google.com/spreadsheets/d/abc123/edit#gid=0'
        },
        teamsSheet: {
          spreadsheetId: 'def456',
          gid: '1',
          url: 'https://docs.google.com/spreadsheets/d/def456/edit#gid=1'
        },
        columnMappings: {}
      };
      
      const result = importConfiguration(createConfigString(config));
      
      expect(result.success).toBe(true);
      expect(mockSetTeamsSheet).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceType: 'google',
          spreadsheetId: 'def456',
          gid: '1'
        })
      );
    });

    it('imports configuration with teams layout', () => {
      const teamsLayout = {
        startRow: 2,
        startCol: 1,
        teamsPerRow: 3,
        columnsPerTeam: 4,
        separatorColumns: 1,
        rowsBetweenBlocks: 1,
        playersPerTeam: 5,
        headerRows: 2
      };
      
      const config = {
        version: 1,
        playersSheet: {
          spreadsheetId: 'abc123',
          gid: '0',
          url: 'https://docs.google.com/spreadsheets/d/abc123/edit#gid=0'
        },
        teamsSheet: {
          spreadsheetId: 'def456',
          gid: '1',
          url: 'https://docs.google.com/spreadsheets/d/def456/edit#gid=1'
        },
        teamsLayout,
        columnMappings: {}
      };
      
      const result = importConfiguration(createConfigString(config));
      
      expect(result.success).toBe(true);
      expect(mockSaveTeamsLayoutConfig).toHaveBeenCalledWith('def456_1', teamsLayout);
    });

    it('imports configuration with column mappings', () => {
      const config = {
        version: 1,
        playersSheet: {
          spreadsheetId: 'abc123',
          gid: '0',
          url: 'https://docs.google.com/spreadsheets/d/abc123/edit#gid=0'
        },
        columnMappings: {
          'abc123_0': {
            nickname: 'Ник',
            role: 'Роль',
            rating: 'Рейтинг',
            heroes: 'Герои'
          }
        }
      };
      
      const result = importConfiguration(createConfigString(config));
      
      expect(result.success).toBe(true);
      expect(mockSetColumnMapping).toHaveBeenCalledWith(
        'abc123_0',
        expect.objectContaining({
          nickname: 'Ник',
          role: 'Роль',
          rating: 'Рейтинг',
          heroes: 'Герои'
        })
      );
    });

    it('clears teams sheet when not in config', () => {
      const config = {
        version: 1,
        playersSheet: {
          spreadsheetId: 'abc123',
          gid: '0',
          url: 'https://docs.google.com/spreadsheets/d/abc123/edit#gid=0'
        },
        columnMappings: {}
      };
      
      const result = importConfiguration(createConfigString(config));
      
      expect(result.success).toBe(true);
      expect(mockSetTeamsSheet).toHaveBeenCalledWith(null);
    });

    it('returns error for invalid base64 string', () => {
      const result = importConfiguration('invalid-base64!!!');
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('returns error for missing version', () => {
      const config = {
        playersSheet: {
          spreadsheetId: 'abc123',
          gid: '0'
        }
      };
      
      const result = importConfiguration(createConfigString(config));
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('version');
    });

    it('returns error for missing players sheet', () => {
      const config = {
        version: 1
      };
      
      const result = importConfiguration(createConfigString(config));
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('players sheet');
    });

    it('returns error for invalid JSON', () => {
      const invalidBase64 = btoa('invalid json {');
      
      const result = importConfiguration(invalidBase64);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('imports full configuration with all options', () => {
      const config = {
        version: 1,
        playersSheet: {
          spreadsheetId: 'abc123',
          gid: '0',
          url: 'https://docs.google.com/spreadsheets/d/abc123/edit#gid=0'
        },
        teamsSheet: {
          spreadsheetId: 'def456',
          gid: '1',
          url: 'https://docs.google.com/spreadsheets/d/def456/edit#gid=1'
        },
        teamsLayout: {
          startRow: 2,
          startCol: 1,
          teamsPerRow: 3,
          columnsPerTeam: 4,
          separatorColumns: 1,
          rowsBetweenBlocks: 1,
          playersPerTeam: 5,
          headerRows: 2
        },
        columnMappings: {
          'abc123_0': {
            nickname: 'Ник',
            role: 'Роль',
            rating: 'Рейтинг',
            heroes: 'Герои'
          },
          'def456_1': {
            nickname: 'Игрок',
            role: 'Роль',
            rating: 'SR',
            heroes: 'Heroes'
          }
        }
      };
      
      const result = importConfiguration(createConfigString(config));
      
      expect(result.success).toBe(true);
      expect(mockReplaceSheet).toHaveBeenCalled();
      expect(mockSetTeamsSheet).toHaveBeenCalled();
      expect(mockSaveTeamsLayoutConfig).toHaveBeenCalled();
      expect(mockSetColumnMapping).toHaveBeenCalledTimes(2);
    });
  });

  describe('Export/Import round-trip', () => {
    it('preserves configuration through export and import', () => {
      // Setup for export
      mockGetState.mockReturnValue({
        configuredSheets: [
          { sourceType: 'google', spreadsheetId: 'abc123', gid: '0' }
        ]
      });
      mockGetTeamsSheet.mockReturnValue({
        sourceType: 'google',
        spreadsheetId: 'def456',
        gid: '1'
      });
      mockIsLocalSheet.mockReturnValue(false);
      
      const playersMapping = { nickname: 'Ник', role: 'Роль', rating: 'Рейтинг', heroes: 'Герои' };
      const teamsMapping = { nickname: 'Игрок', role: 'Роль', rating: 'SR', heroes: 'Heroes' };
      const teamsLayout = {
        startRow: 2,
        startCol: 1,
        teamsPerRow: 3,
        columnsPerTeam: 4,
        separatorColumns: 1,
        rowsBetweenBlocks: 1,
        playersPerTeam: 5,
        headerRows: 2
      };
      
      mockGetColumnMapping.mockImplementation((key) => {
        if (key === 'abc123_0') return playersMapping;
        if (key === 'def456_1') return teamsMapping;
        return null;
      });
      mockLoadTeamsLayoutConfig.mockReturnValue(teamsLayout);
      
      // Export
      const url = exportConfiguration();
      expect(url).toBeTruthy();
      
      // Extract config from URL
      const urlObj = new URL(url);
      const configParam = urlObj.searchParams.get('config');
      
      // Import
      const result = importConfiguration(configParam);
      
      expect(result.success).toBe(true);
      expect(mockReplaceSheet).toHaveBeenCalled();
      expect(mockSetTeamsSheet).toHaveBeenCalled();
      expect(mockSaveTeamsLayoutConfig).toHaveBeenCalledWith('def456_1', teamsLayout);
      expect(mockSetColumnMapping).toHaveBeenCalledWith('abc123_0', playersMapping);
      expect(mockSetColumnMapping).toHaveBeenCalledWith('def456_1', teamsMapping);
    });
  });
});




