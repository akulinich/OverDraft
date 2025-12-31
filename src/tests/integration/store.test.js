import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock persistence before importing store
vi.mock('../../js/storage/persistence.js', () => ({
  loadConfiguredSheets: vi.fn(() => []),
  loadSettings: vi.fn(() => ({ version: 1, pollingInterval: 1000, theme: 'dark' })),
  loadTeamsSheet: vi.fn(() => null),
  saveConfiguredSheets: vi.fn(),
  saveSettings: vi.fn(),
  saveTeamsSheet: vi.fn(),
  loadColumnMapping: vi.fn(() => null),
  saveColumnMapping: vi.fn(),
  loadLocalCSVData: vi.fn(() => null),
  saveLocalCSVData: vi.fn(),
  removeLocalCSVData: vi.fn()
}));

// Import store after mocking
import {
  getState,
  initializeState,
  subscribe,
  addSheet,
  removeSheet,
  replaceSheet,
  updateSheetData,
  setLoading,
  setError,
  clearError,
  setPollingInterval,
  setTheme,
  hasConfiguredSheets,
  getFirstSheet,
  isLocalSheet,
  getSheetData,
  setTeamsSheet,
  getTeamsSheet,
  updateTeamsData,
  getTeamsData,
  hasTeamsSheet,
  setActiveTab,
  getActiveTab,
  getParsedPlayers,
  getPlayerByNickname,
  setSelectedTeam,
  getSelectedTeam,
  setSelectedPlayer,
  getSelectedPlayer,
  detectColumnMapping,
  validateRequiredColumns,
  getFilters,
  setFilterRole,
  setFilterAvailableOnly,
  toggleFilterRole,
  resetFilters,
  getFilteredPlayers,
  REQUIRED_COLUMNS
} from '../../js/state/store.js';

describe('Store', () => {
  beforeEach(() => {
    // Reset state between tests by re-initializing
    initializeState();
  });

  describe('initializeState', () => {
    it('initializes with defaults when no stored data', () => {
      initializeState();
      const state = getState();
      
      expect(state.configuredSheets).toEqual([]);
      expect(state.teamsSheet).toBeNull();
      expect(state.pollingInterval).toBe(1000);
      expect(state.theme).toBe('dark');
    });
  });

  describe('subscribe', () => {
    it('notifies listeners on state change', () => {
      const listener = vi.fn();
      const unsubscribe = subscribe(listener);
      
      setLoading(true);
      
      expect(listener).toHaveBeenCalledWith(
        expect.any(Object),
        'isLoading'
      );
      
      unsubscribe();
    });

    it('stops notifying after unsubscribe', () => {
      const listener = vi.fn();
      const unsubscribe = subscribe(listener);
      
      unsubscribe();
      setLoading(true);
      
      // Called once during the first setLoading, but not after unsubscribe
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('Sheet Configuration', () => {
    it('adds sheet configuration', () => {
      addSheet({ 
        sourceType: 'google',
        spreadsheetId: 'test123', 
        gid: '0'
      });
      
      expect(hasConfiguredSheets()).toBe(true);
      expect(getFirstSheet()?.spreadsheetId).toBe('test123');
    });

    it('removes sheet configuration', () => {
      addSheet({ spreadsheetId: 'test123', gid: '0' });
      removeSheet('test123', '0');
      
      expect(hasConfiguredSheets()).toBe(false);
    });

    it('replaces all sheets with new one', () => {
      addSheet({ spreadsheetId: 'sheet1', gid: '0' });
      addSheet({ spreadsheetId: 'sheet2', gid: '1' });
      
      replaceSheet({ spreadsheetId: 'newsheet', gid: '0' });
      
      const state = getState();
      expect(state.configuredSheets.length).toBe(1);
      expect(state.configuredSheets[0].spreadsheetId).toBe('newsheet');
    });
  });

  describe('isLocalSheet', () => {
    it('returns true for local source type', () => {
      const config = { sourceType: 'local', spreadsheetId: 'local', gid: 'file.csv' };
      expect(isLocalSheet(config)).toBe(true);
    });

    it('returns false for google source type', () => {
      const config = { sourceType: 'google', spreadsheetId: 'abc', gid: '0' };
      expect(isLocalSheet(config)).toBe(false);
    });

    it('returns false for undefined config', () => {
      expect(isLocalSheet(undefined)).toBe(false);
    });
  });

  describe('Sheet Data', () => {
    it('updates and retrieves sheet data', () => {
      const data = {
        spreadsheetId: 'test123',
        gid: '0',
        headers: ['Ник', 'Роль', 'Рейтинг', 'Герои'],
        data: [['Player1', 'Танк', '3500', 'Reinhardt']],
        lastUpdated: new Date()
      };
      
      updateSheetData(data);
      const retrieved = getSheetData('test123', '0');
      
      expect(retrieved?.headers).toEqual(data.headers);
    });

    it('parses players when updating sheet data', () => {
      const data = {
        spreadsheetId: 'test123',
        gid: '0',
        headers: ['Ник', 'Роль', 'Рейтинг', 'Герои'],
        data: [
          ['Player1', 'Танк', '3500', 'Reinhardt'],
          ['Player2', 'ДД', '4000', 'Tracer']
        ],
        lastUpdated: new Date()
      };
      
      updateSheetData(data);
      const players = getParsedPlayers();
      
      expect(players.size).toBe(2);
      expect(players.get('player1')?.role).toBe('tank');
      expect(players.get('player2')?.role).toBe('dps');
    });
  });

  describe('Teams Sheet', () => {
    it('sets and gets teams sheet', () => {
      setTeamsSheet({ spreadsheetId: 'teams123', gid: '0' });
      
      expect(hasTeamsSheet()).toBe(true);
      expect(getTeamsSheet()?.spreadsheetId).toBe('teams123');
    });

    it('updates teams data', () => {
      const data = {
        spreadsheetId: 'teams123',
        gid: '0',
        headers: ['Team'],
        data: [['Alpha']],
        lastUpdated: new Date()
      };
      
      updateTeamsData(data);
      
      expect(getTeamsData()?.headers).toEqual(['Team']);
    });
  });

  describe('Loading and Errors', () => {
    it('sets loading state', () => {
      setLoading(true);
      expect(getState().isLoading).toBe(true);
      
      setLoading(false);
      expect(getState().isLoading).toBe(false);
    });

    it('sets and clears errors', () => {
      const error = new Error('Test error');
      setError('sheet1', '0', error);
      
      expect(getState().errors.get('sheet1_0')).toBe(error);
      
      clearError('sheet1', '0');
      expect(getState().errors.has('sheet1_0')).toBe(false);
    });
  });

  describe('Settings', () => {
    it('sets polling interval', () => {
      setPollingInterval(5000);
      expect(getState().pollingInterval).toBe(5000);
    });

    it('sets theme', () => {
      setTheme('light');
      expect(getState().theme).toBe('light');
    });
  });

  describe('Tabs', () => {
    it('sets and gets active tab', () => {
      setActiveTab('teams');
      expect(getActiveTab()).toBe('teams');
      
      setActiveTab('draft');
      expect(getActiveTab()).toBe('draft');
    });
  });

  describe('Player Selection', () => {
    it('gets player by nickname (case-insensitive)', () => {
      const data = {
        spreadsheetId: 'test',
        gid: '0',
        headers: ['Ник', 'Роль', 'Рейтинг', 'Герои'],
        data: [['TestPlayer', 'Танк', '3500', 'Rein']],
        lastUpdated: new Date()
      };
      updateSheetData(data);
      
      expect(getPlayerByNickname('testplayer')).toBeDefined();
      expect(getPlayerByNickname('TESTPLAYER')).toBeDefined();
    });

    it('sets and gets selected player', () => {
      const player = { nickname: 'Test', role: 'tank', rating: 3000, heroes: '', rawRow: [] };
      
      setSelectedPlayer(player);
      expect(getSelectedPlayer()).toBe(player);
      
      setSelectedPlayer(null);
      expect(getSelectedPlayer()).toBeNull();
    });
  });

  describe('Team Selection', () => {
    it('sets and gets selected team', () => {
      const team = { name: 'Alpha', teamNumber: 1, playerNicknames: [] };
      
      setSelectedTeam(team);
      expect(getSelectedTeam()).toBe(team);
    });

    it('clears selected player when selecting team', () => {
      const player = { nickname: 'Test', role: 'tank', rating: 3000, heroes: '', rawRow: [] };
      const team = { name: 'Alpha', teamNumber: 1, playerNicknames: [] };
      
      setSelectedPlayer(player);
      setSelectedTeam(team);
      
      expect(getSelectedPlayer()).toBeNull();
    });
  });

  describe('Column Mapping', () => {
    it('detects column mapping from headers', () => {
      const headers = ['Ник', 'Роль', 'Рейтинг', 'Герои'];
      const mapping = detectColumnMapping(headers);
      
      expect(mapping.nickname).toBe('Ник');
      expect(mapping.role).toBe('Роль');
      expect(mapping.rating).toBe('Рейтинг');
      expect(mapping.heroes).toBe('Герои');
    });

    it('detects English column names', () => {
      const headers = ['Nickname', 'Role', 'Rating', 'Heroes'];
      const mapping = detectColumnMapping(headers);
      
      expect(mapping.nickname).toBe('Nickname');
      expect(mapping.role).toBe('Role');
      expect(mapping.rating).toBe('Rating');
      expect(mapping.heroes).toBe('Heroes');
    });

    it('returns null for missing columns', () => {
      const headers = ['Column1', 'Column2'];
      const mapping = detectColumnMapping(headers);
      
      expect(mapping.nickname).toBeNull();
      expect(mapping.role).toBeNull();
    });
  });

  describe('validateRequiredColumns', () => {
    it('returns valid when all columns present', () => {
      const headers = ['Ник', 'Роль', 'Рейтинг', 'Герои'];
      const data = [['Player1', 'Танк', '3500', 'Rein']];
      
      const result = validateRequiredColumns(headers, data);
      
      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('returns missing columns', () => {
      const headers = ['Ник', 'Роль'];
      const data = [['Player1', 'Танк']];
      
      const result = validateRequiredColumns(headers, data);
      
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('rating');
      expect(result.missing).toContain('heroes');
    });

    it('validates rating column contains numbers', () => {
      const headers = ['Ник', 'Роль', 'Рейтинг', 'Герои'];
      const data = [
        ['Player1', 'Танк', 'not-a-number', 'Rein'],
        ['Player2', 'ДД', 'also-not', 'Tracer']
      ];
      
      const result = validateRequiredColumns(headers, data);
      
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].column).toBe('rating');
    });
  });

  describe('Filters', () => {
    beforeEach(() => {
      // Setup test players
      const data = {
        spreadsheetId: 'test',
        gid: '0',
        headers: ['Ник', 'Роль', 'Рейтинг', 'Герои'],
        data: [
          ['Tank1', 'Танк', '3500', 'Rein'],
          ['Tank2', 'Танк', '3000', 'Winston'],
          ['DPS1', 'ДД', '4000', 'Tracer'],
          ['Support1', 'Сапы', '3800', 'Ana']
        ],
        lastUpdated: new Date()
      };
      updateSheetData(data);
      resetFilters();
    });

    it('gets default filters', () => {
      const filters = getFilters();
      expect(filters.availableOnly).toBe(false);
      expect(filters.role).toBeNull();
    });

    it('sets role filter', () => {
      setFilterRole('tank');
      expect(getFilters().role).toBe('tank');
    });

    it('sets available-only filter', () => {
      setFilterAvailableOnly(true);
      expect(getFilters().availableOnly).toBe(true);
    });

    it('toggles role filter', () => {
      toggleFilterRole('tank');
      expect(getFilters().role).toBe('tank');
      
      toggleFilterRole('tank'); // Toggle same role = clear
      expect(getFilters().role).toBeNull();
      
      toggleFilterRole('dps');
      expect(getFilters().role).toBe('dps');
    });

    it('resets filters', () => {
      setFilterRole('tank');
      setFilterAvailableOnly(true);
      
      resetFilters();
      
      const filters = getFilters();
      expect(filters.role).toBeNull();
      expect(filters.availableOnly).toBe(false);
    });

    it('filters players by role', () => {
      setFilterRole('tank');
      const players = getFilteredPlayers([]);
      
      expect(players.length).toBe(2);
      expect(players.every(p => p.role === 'tank')).toBe(true);
    });

    it('filters out assigned players', () => {
      const teams = [{ name: 'Team1', teamNumber: 1, playerNicknames: ['Tank1'] }];
      
      setFilterAvailableOnly(true);
      const players = getFilteredPlayers(teams);
      
      expect(players.find(p => p.nickname === 'Tank1')).toBeUndefined();
    });

    it('combines role and availability filters', () => {
      const teams = [{ name: 'Team1', teamNumber: 1, playerNicknames: ['Tank1'] }];
      
      setFilterRole('tank');
      setFilterAvailableOnly(true);
      const players = getFilteredPlayers(teams);
      
      expect(players.length).toBe(1);
      expect(players[0].nickname).toBe('Tank2');
    });
  });
});




