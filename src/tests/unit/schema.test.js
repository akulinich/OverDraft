import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  validateTeamsData, 
  validateTeamsDataWithConfig,
  tryAutoDetectLayout,
  formatValidationErrors,
  formatParseError
} from '../../js/validation/schema.js';

// Mock the persistence module to avoid localStorage dependencies
vi.mock('../../js/storage/persistence.js', () => ({
  getDefaultTeamsLayoutConfig: () => ({
    teamsPerRow: 2,
    columnsPerTeam: 4,
    separatorColumns: 1,
    rowsBetweenBlocks: 1,
    playersPerTeam: 5,
    headerRows: 2,
    startRow: 0,
    startCol: 0
  })
}));

describe('validateTeamsDataWithConfig', () => {
  const defaultConfig = {
    teamsPerRow: 2,
    columnsPerTeam: 4,
    separatorColumns: 1,
    rowsBetweenBlocks: 1,
    playersPerTeam: 5,
    headerRows: 2,
    startRow: 0,
    startCol: 0
  };

  it('parses valid team data', () => {
    const allRows = [
      ['', 'Team Alpha', '', '', '', 'Team Beta', '', ''],
      ['1', '', '', '', '', '2', '', ''],
      ['Танки', 'Player1', '3500', '3400', '', 'Танки', 'Player6', '2900'],
      ['ДД', 'Player2', '4200', '', '', 'ДД', 'Player7', '3100'],
      ['', 'Player3', '3000', '', '', '', 'Player8', '3200'],
      ['Сапы', 'Player4', '3800', '', '', 'Сапы', 'Player9', '3500'],
      ['', 'Player5', '3500', '', '', '', 'Player10', '3300']
    ];

    const result = validateTeamsDataWithConfig(allRows, defaultConfig);
    expect(result.data?.teams.length).toBe(2);
    expect(result.data?.teams[0].name).toBe('Team Alpha');
    expect(result.data?.teams[0].teamNumber).toBe(1);
    expect(result.data?.teams[0].playerNicknames).toContain('Player1');
  });

  it('parses teams without names (number only)', () => {
    const allRows = [
      ['', '', '', '', '', '', '', ''],
      ['1', '', '', '', '', '2', '', ''],
      ['Танки', 'Player1', '3500', '', '', 'Танки', 'Player2', '2900'],
      ['', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', '']
    ];

    const result = validateTeamsDataWithConfig(allRows, defaultConfig);
    expect(result.data?.teams.length).toBe(2);
    expect(result.data?.teams[0].name).toBe('Team 1');
    expect(result.data?.teams[1].name).toBe('Team 2');
  });

  it('returns error for insufficient data', () => {
    const allRows = [['a', 'b']];

    const result = validateTeamsDataWithConfig(allRows, defaultConfig);
    expect(result.valid).toBe(false);
    expect(result.parseError).not.toBeNull();
    expect(result.parseError?.type).toBe('data_error');
  });

  it('skips teams without team number', () => {
    const allRows = [
      ['', 'Team Alpha', '', '', '', 'Team Beta', '', ''],
      ['', '', '', '', '', '2', '', ''], // First team has no number
      ['Танки', 'Player1', '3500', '', '', 'Танки', 'Player2', '2900'],
      ['', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', '']
    ];

    const result = validateTeamsDataWithConfig(allRows, defaultConfig);
    expect(result.data?.teams.length).toBe(1);
    expect(result.data?.teams[0].teamNumber).toBe(2);
  });

  it('handles empty teams (no players)', () => {
    const allRows = [
      ['', 'Team Alpha', '', '', '', '', '', ''],
      ['1', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', '']
    ];

    const result = validateTeamsDataWithConfig(allRows, defaultConfig);
    expect(result.data?.teams.length).toBe(1);
    expect(result.data?.teams[0].playerNicknames.length).toBe(0);
  });
});

describe('validateTeamsData (legacy wrapper)', () => {
  it('combines headers and rows correctly', () => {
    const headers = ['', 'Team Alpha', '', '', ''];
    const rows = [
      ['1', '', '', '', ''],
      ['Танки', 'Player1', '3500', '', ''],
      ['', '', '', '', ''],
      ['', '', '', '', ''],
      ['', '', '', '', ''],
      ['', '', '', '', '']
    ];

    const config = {
      teamsPerRow: 1,
      columnsPerTeam: 4,
      separatorColumns: 1,
      rowsBetweenBlocks: 1,
      playersPerTeam: 5,
      headerRows: 2,
      startRow: 0,
      startCol: 0
    };

    const result = validateTeamsData(headers, rows, config);
    expect(result.data?.teams.length).toBe(1);
  });
});

describe('tryAutoDetectLayout', () => {
  it('detects basic layout from role markers', () => {
    const allRows = [
      ['', 'Team Alpha', '', ''],
      ['1', '', '', ''],
      ['Танки', 'Player1', '3500', ''],
      ['ДД', 'Player2', '4200', ''],
      ['Сапы', 'Player3', '3800', '']
    ];

    const { config, confidence } = tryAutoDetectLayout(allRows);
    expect(config.teamsPerRow).toBeGreaterThanOrEqual(1);
    expect(confidence).toBeGreaterThan(0);
  });

  it('returns default config when no roles found', () => {
    const allRows = [
      ['a', 'b', 'c'],
      ['1', '2', '3']
    ];

    const { config, confidence } = tryAutoDetectLayout(allRows);
    expect(confidence).toBe(0);
  });
});

describe('formatValidationErrors', () => {
  it('formats errors with row numbers', () => {
    const errors = [
      { field: 'name', message: 'Name is required', row: 3 },
      { field: 'rating', message: 'Invalid rating' }
    ];

    const formatted = formatValidationErrors(errors);
    expect(formatted).toContain('[Строка 3]');
    expect(formatted).toContain('Name is required');
    expect(formatted).toContain('Invalid rating');
  });

  it('returns empty string for no errors', () => {
    expect(formatValidationErrors([])).toBe('');
  });
});

describe('formatParseError', () => {
  it('formats parse error with cell reference', () => {
    const error = {
      type: 'cell_error',
      row: 2,
      col: 1,
      expected: 'player_nickname',
      actual: '',
      message: 'Missing player name'
    };

    const formatted = formatParseError(error);
    expect(formatted).toContain('[Строка 3, Колонка 2]');
    expect(formatted).toContain('Missing player name');
  });
});

