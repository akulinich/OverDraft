import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock store before importing export
const mockGetState = vi.fn();
const mockGetTeamsSheet = vi.fn();
const mockIsLocalSheet = vi.fn();
const mockGetColumnMapping = vi.fn();
const mockReplaceSheet = vi.fn();
const mockSetTeamsSheet = vi.fn();
const mockSetColumnMapping = vi.fn();
const mockGetColumnsConfiguration = vi.fn();
const mockSetColumnsConfiguration = vi.fn();
const mockGetTeamsDisplayConfiguration = vi.fn();
const mockSetTeamsDisplayConfiguration = vi.fn();

vi.mock('../../js/state/store.js', () => ({
  getState: () => mockGetState(),
  getTeamsSheet: () => mockGetTeamsSheet(),
  isLocalSheet: (config) => mockIsLocalSheet(config),
  getColumnMapping: (key) => mockGetColumnMapping(key),
  replaceSheet: (config) => mockReplaceSheet(config),
  setTeamsSheet: (config) => mockSetTeamsSheet(config),
  setColumnMapping: (key, mapping) => mockSetColumnMapping(key, mapping),
  getColumnsConfiguration: (key) => mockGetColumnsConfiguration(key),
  setColumnsConfiguration: (key, config) => mockSetColumnsConfiguration(key, config),
  getTeamsDisplayConfiguration: (key) => mockGetTeamsDisplayConfiguration(key),
  setTeamsDisplayConfiguration: (key, config) => mockSetTeamsDisplayConfiguration(key, config)
}));

// Mock persistence
const mockLoadTeamsLayoutConfig = vi.fn();
const mockSaveTeamsLayoutConfig = vi.fn();
const mockSaveColumnsConfiguration = vi.fn();
const mockSaveTeamsDisplayConfig = vi.fn();

vi.mock('../../js/storage/persistence.js', () => ({
  loadTeamsLayoutConfig: (key) => mockLoadTeamsLayoutConfig(key),
  saveTeamsLayoutConfig: (key, config) => mockSaveTeamsLayoutConfig(key, config),
  saveColumnsConfiguration: (key, config) => mockSaveColumnsConfiguration(key, config),
  saveTeamsDisplayConfig: (key, config) => mockSaveTeamsDisplayConfig(key, config)
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

// Mock config
vi.mock('../../js/config.js', () => ({
  config: {
    apiBaseUrl: 'http://localhost:8000',
    isDev: true
  }
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import after mocks
import { 
  isExportAvailable, 
  exportConfiguration, 
  importConfiguration,
  exportConfigToFile,
  importConfigFromFile,
  shareConfigViaServer,
  loadSharedConfig
} from '../../js/utils/export.js';

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
    mockGetColumnsConfiguration.mockReturnValue(null);
    mockGetTeamsDisplayConfiguration.mockReturnValue(null);
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
      
      expect(decoded.version).toBe(2);
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
      
      expect(decoded.version).toBe(2);
      expect(decoded.playersSheet.spreadsheetId).toBe('abc123');
      expect(decoded.teamsSheet.spreadsheetId).toBe('def456');
      expect(decoded.teamsLayout).toEqual(teamsLayout);
      expect(decoded.columnMappings['abc123_0']).toEqual(playersMapping);
      expect(decoded.columnMappings['def456_1']).toEqual(teamsMapping);
    });

    it('exports configuration with columns configuration', () => {
      mockGetState.mockReturnValue({
        configuredSheets: [
          { sourceType: 'google', spreadsheetId: 'abc123', gid: '0' }
        ]
      });
      mockIsLocalSheet.mockReturnValue(false);
      
      const columnsConfig = {
        columns: [
          { id: 'col_name', displayName: 'Имя', sheetColumn: 'Nick', columnType: 'name', order: 0 },
          { id: 'col_role', displayName: 'Роль', sheetColumn: 'Role', columnType: 'role', order: 1 },
          { id: 'col_rating', displayName: 'Рейтинг', sheetColumn: 'SR', columnType: 'rating', order: 2 }
        ]
      };
      mockGetColumnsConfiguration.mockReturnValue(columnsConfig);
      
      const url = exportConfiguration();
      
      expect(url).toBeTruthy();
      const urlObj = new URL(url);
      const configParam = urlObj.searchParams.get('config');
      const decoded = JSON.parse(decodeURIComponent(escape(atob(configParam))));
      
      expect(decoded.columnsConfig).toBeDefined();
      expect(decoded.columnsConfig.columns).toHaveLength(3);
      expect(decoded.columnsConfig.columns[0].columnType).toBe('name');
      expect(decoded.columnsConfig.columns[1].columnType).toBe('role');
      expect(decoded.columnsConfig.columns[2].columnType).toBe('rating');
    });

    it('exports configuration with teams display config', () => {
      mockGetState.mockReturnValue({
        configuredSheets: [
          { sourceType: 'google', spreadsheetId: 'abc123', gid: '0' }
        ]
      });
      mockIsLocalSheet.mockReturnValue(false);
      
      const teamsDisplayConfig = {
        visibleColumnIds: ['col_role', 'col_rating']
      };
      mockGetTeamsDisplayConfiguration.mockReturnValue(teamsDisplayConfig);
      
      const url = exportConfiguration();
      
      expect(url).toBeTruthy();
      const urlObj = new URL(url);
      const configParam = urlObj.searchParams.get('config');
      const decoded = JSON.parse(decodeURIComponent(escape(atob(configParam))));
      
      expect(decoded.teamsDisplayConfig).toBeDefined();
      expect(decoded.teamsDisplayConfig.visibleColumnIds).toEqual(['col_role', 'col_rating']);
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

    it('imports configuration with columns configuration', () => {
      const columnsConfig = {
        columns: [
          { id: 'col_name', displayName: 'Имя', sheetColumn: 'Nick', columnType: 'name', order: 0 },
          { id: 'col_role', displayName: 'Роль', sheetColumn: 'Role', columnType: 'role', order: 1 }
        ]
      };
      
      const config = {
        version: 2,
        playersSheet: {
          spreadsheetId: 'abc123',
          gid: '0',
          url: 'https://docs.google.com/spreadsheets/d/abc123/edit#gid=0'
        },
        columnMappings: {},
        columnsConfig
      };
      
      const result = importConfiguration(createConfigString(config));
      
      expect(result.success).toBe(true);
      expect(mockSaveColumnsConfiguration).toHaveBeenCalledWith('abc123_0', columnsConfig);
      expect(mockSetColumnsConfiguration).toHaveBeenCalledWith('abc123_0', columnsConfig);
    });

    it('imports configuration with teams display config', () => {
      const teamsDisplayConfig = {
        visibleColumnIds: ['col_role', 'col_rating']
      };
      
      const config = {
        version: 2,
        playersSheet: {
          spreadsheetId: 'abc123',
          gid: '0',
          url: 'https://docs.google.com/spreadsheets/d/abc123/edit#gid=0'
        },
        columnMappings: {},
        teamsDisplayConfig
      };
      
      const result = importConfiguration(createConfigString(config));
      
      expect(result.success).toBe(true);
      expect(mockSaveTeamsDisplayConfig).toHaveBeenCalledWith('abc123_0', teamsDisplayConfig);
      expect(mockSetTeamsDisplayConfiguration).toHaveBeenCalledWith('abc123_0', teamsDisplayConfig);
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

  describe('exportConfigToFile', () => {
    it('returns error when no configuration to export', () => {
      mockGetState.mockReturnValue({
        configuredSheets: []
      });
      
      const result = exportConfigToFile();
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('No configuration to export');
    });

    it('triggers download when configuration is available', () => {
      mockGetState.mockReturnValue({
        configuredSheets: [
          { sourceType: 'google', spreadsheetId: 'abc123', gid: '0' }
        ]
      });
      mockIsLocalSheet.mockReturnValue(false);
      
      // Mock createElement and related DOM operations
      const mockAnchor = {
        href: '',
        download: '',
        click: vi.fn()
      };
      const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor);
      const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
      const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => {});
      
      // Mock URL APIs
      const mockUrl = 'blob:http://localhost/test-blob';
      const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue(mockUrl);
      const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      
      const result = exportConfigToFile();
      
      expect(result.success).toBe(true);
      expect(mockAnchor.download).toBe('overdraft_config.bin');
      expect(mockAnchor.click).toHaveBeenCalled();
      expect(createObjectURLSpy).toHaveBeenCalled();
      expect(revokeObjectURLSpy).toHaveBeenCalledWith(mockUrl);
      
      // Cleanup
      createElementSpy.mockRestore();
      appendChildSpy.mockRestore();
      removeChildSpy.mockRestore();
      createObjectURLSpy.mockRestore();
      revokeObjectURLSpy.mockRestore();
    });
  });

  describe('importConfigFromFile', () => {
    function createMockFileWithArrayBuffer(bytes) {
      // Create a mock file object that has arrayBuffer method
      // since jsdom's File doesn't support arrayBuffer
      return {
        name: 'overdraft_config.bin',
        type: 'application/octet-stream',
        arrayBuffer: () => Promise.resolve(bytes.buffer)
      };
    }

    function createValidConfigBytes() {
      // Create config, encode it the same way exportConfigToFile does
      const config = {
        version: 2,
        playersSheet: {
          spreadsheetId: 'abc123',
          gid: '0',
          url: 'https://docs.google.com/spreadsheets/d/abc123/edit#gid=0'
        },
        columnMappings: {}
      };
      
      // Encode to base64 (same as buildExportConfig + encodeConfig)
      const jsonString = JSON.stringify(config);
      const base64 = btoa(unescape(encodeURIComponent(jsonString)));
      
      // Convert base64 to binary (same as exportConfigToFile)
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      return bytes;
    }

    it('imports valid configuration from file', async () => {
      const bytes = createValidConfigBytes();
      const mockFile = createMockFileWithArrayBuffer(bytes);
      
      const result = await importConfigFromFile(mockFile);
      
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(mockReplaceSheet).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceType: 'google',
          spreadsheetId: 'abc123',
          gid: '0'
        })
      );
    });

    it('returns error for invalid file content', async () => {
      const invalidBytes = new Uint8Array([0, 1, 2, 3, 4, 5]);
      const mockFile = createMockFileWithArrayBuffer(invalidBytes);
      
      const result = await importConfigFromFile(mockFile);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('shareConfigViaServer', () => {
    beforeEach(() => {
      mockFetch.mockReset();
    });

    it('returns error when no configuration to share', async () => {
      mockGetState.mockReturnValue({
        configuredSheets: []
      });
      
      const result = await shareConfigViaServer();
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('No configuration to share');
    });

    it('shares configuration and returns URL', async () => {
      mockGetState.mockReturnValue({
        configuredSheets: [
          { sourceType: 'google', spreadsheetId: 'abc123', gid: '0' }
        ]
      });
      mockIsLocalSheet.mockReturnValue(false);
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          guid: 'test-guid-12345',
          expiresAt: '2024-12-31T23:59:59Z'
        })
      });
      
      const result = await shareConfigViaServer();
      
      expect(result.success).toBe(true);
      expect(result.shareUrl).toContain('share=test-guid-12345');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/config/share',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
      );
    });

    it('returns error on server failure', async () => {
      mockGetState.mockReturnValue({
        configuredSheets: [
          { sourceType: 'google', spreadsheetId: 'abc123', gid: '0' }
        ]
      });
      mockIsLocalSheet.mockReturnValue(false);
      
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ detail: 'Internal server error' })
      });
      
      const result = await shareConfigViaServer();
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Internal server error');
    });

    it('returns error on network failure', async () => {
      mockGetState.mockReturnValue({
        configuredSheets: [
          { sourceType: 'google', spreadsheetId: 'abc123', gid: '0' }
        ]
      });
      mockIsLocalSheet.mockReturnValue(false);
      
      mockFetch.mockRejectedValue(new Error('Network error'));
      
      const result = await shareConfigViaServer();
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('loadSharedConfig', () => {
    beforeEach(() => {
      mockFetch.mockReset();
    });

    it('loads and imports shared configuration', async () => {
      const config = {
        version: 2,
        playersSheet: {
          spreadsheetId: 'abc123',
          gid: '0',
          url: 'https://docs.google.com/spreadsheets/d/abc123/edit#gid=0'
        },
        columnMappings: {}
      };
      const jsonString = JSON.stringify(config);
      const base64 = btoa(unescape(encodeURIComponent(jsonString)));
      
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          config: base64,
          createdAt: '2024-01-01T00:00:00Z',
          expiresAt: '2024-12-31T23:59:59Z'
        })
      });
      
      const result = await loadSharedConfig('test-guid-12345');
      
      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8000/api/config/test-guid-12345');
      expect(mockReplaceSheet).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceType: 'google',
          spreadsheetId: 'abc123',
          gid: '0'
        })
      );
    });

    it('returns error for 404 (not found)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ detail: 'Not found' })
      });
      
      const result = await loadSharedConfig('invalid-guid');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('returns error for 410 (expired)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 410,
        json: () => Promise.resolve({ detail: 'Expired' })
      });
      
      const result = await loadSharedConfig('expired-guid');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('returns error on network failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      
      const result = await loadSharedConfig('test-guid');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });
});




