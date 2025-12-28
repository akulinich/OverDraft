/**
 * Integration tests with realistic data structure
 * Based on actual tournament spreadsheet format
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'fs';
import { parseCSV } from '../../js/utils/csv.js';
import { parseStoredCSV } from '../../js/api/local.js';
import { validateTeamsDataWithConfig, tryAutoDetectLayout } from '../../js/validation/schema.js';

// Mock persistence for schema.js
vi.mock('../../js/storage/persistence.js', () => ({
  getDefaultTeamsLayoutConfig: () => ({
    teamsPerRow: 3,
    columnsPerTeam: 4,
    separatorColumns: 1,
    rowsBetweenBlocks: 1,
    playersPerTeam: 5,
    headerRows: 2,
    startRow: 0,
    startCol: 0
  })
}));

// Config matching realistic fixture structure
const REALISTIC_CONFIG = {
  teamsPerRow: 3,
  columnsPerTeam: 4,
  separatorColumns: 1,
  rowsBetweenBlocks: 1,
  playersPerTeam: 5,
  headerRows: 2,
  startRow: 0,
  startCol: 0
};

describe('Realistic Data Integration', () => {
  let playersCSV;
  let teamsCSV;
  let playersData;
  let teamsRows;

  beforeAll(() => {
    playersCSV = readFileSync('tests/fixtures/players-realistic.csv', 'utf-8');
    teamsCSV = readFileSync('tests/fixtures/teams-realistic.csv', 'utf-8');
    playersData = parseStoredCSV(playersCSV, 'players-realistic.csv');
    teamsRows = parseCSV(teamsCSV);
  });

  describe('Players Data', () => {
    it('parses all 14 players correctly', () => {
      // Filter out empty rows
      const validRows = playersData.data.filter(row => row[0]?.trim());
      expect(validRows.length).toBe(14);
    });

    it('has correct headers', () => {
      expect(playersData.headers).toEqual(['Ник', 'Роль', 'Рейтинг', 'Герои']);
    });

    it('contains players from all roles', () => {
      const roles = playersData.data.filter(row => row[0]?.trim()).map(row => row[1]);
      expect(roles.filter(r => r === 'Танк').length).toBe(3);
      expect(roles.filter(r => r === 'ДД').length).toBe(5);
      expect(roles.filter(r => r === 'Сапы').length).toBe(6);
    });

    it('has valid ratings (2000-5000 range)', () => {
      const ratings = playersData.data
        .filter(row => row[0]?.trim())
        .map(row => parseInt(row[2], 10));
      expect(ratings.every(r => !isNaN(r) && r >= 2000 && r <= 5000)).toBe(true);
    });

    it('parses heroes with commas correctly', () => {
      const firstPlayer = playersData.data[0];
      expect(firstPlayer[3]).toBe('Reinhardt, Sigma');
    });
  });

  describe('Teams Data Structure', () => {
    it('parses teams CSV into rows', () => {
      // Should have header rows + player rows
      expect(teamsRows.length).toBeGreaterThanOrEqual(7);
    });

    it('has team names in first row', () => {
      const teamNames = teamsRows[0].filter(cell => cell.trim());
      expect(teamNames).toContain('Legends');
      expect(teamNames).toContain('Guardians');
      expect(teamNames).toContain('Phoenix');
    });

    it('has team numbers in second row', () => {
      const numbers = teamsRows[1].filter(cell => cell.trim());
      expect(numbers).toContain('1');
      expect(numbers).toContain('2');
      expect(numbers).toContain('3');
    });

    it('has role markers in player rows', () => {
      const roleRow = teamsRows[2];
      expect(roleRow[0]).toBe('Танки');
    });
  });

  describe('Teams Validation with Config', () => {
    it('validates teams data successfully', () => {
      const result = validateTeamsDataWithConfig(teamsRows, REALISTIC_CONFIG);
      expect(result.data?.teams.length).toBe(3);
    });

    it('extracts correct team names', () => {
      const result = validateTeamsDataWithConfig(teamsRows, REALISTIC_CONFIG);
      const teamNames = result.data?.teams.map(t => t.name);
      
      // All three teams should be found
      expect(teamNames?.length).toBe(3);
      expect(teamNames).toContain('Legends');
      expect(teamNames).toContain('Guardians');
    });

    it('extracts correct team numbers', () => {
      const result = validateTeamsDataWithConfig(teamsRows, REALISTIC_CONFIG);
      const teamNumbers = result.data?.teams.map(t => t.teamNumber);
      
      expect(teamNumbers).toContain(1);
      expect(teamNumbers).toContain(2);
      expect(teamNumbers).toContain(3);
    });

    it('extracts player nicknames from teams', () => {
      const result = validateTeamsDataWithConfig(teamsRows, REALISTIC_CONFIG);
      const team1 = result.data?.teams.find(t => t.teamNumber === 1);
      
      expect(team1?.playerNicknames).toContain('TankMaster');
      expect(team1?.playerNicknames).toContain('BlazeDPS');
      expect(team1?.playerNicknames).toContain('HealBot');
    });

    it('handles all three teams with their players', () => {
      const result = validateTeamsDataWithConfig(teamsRows, REALISTIC_CONFIG);
      
      result.data?.teams.forEach(team => {
        expect(team.playerNicknames.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Auto-detect Layout', () => {
    it('detects layout from realistic data', () => {
      const { config, confidence } = tryAutoDetectLayout(teamsRows);
      
      expect(confidence).toBeGreaterThan(0);
      expect(config.teamsPerRow).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Cross-reference Players and Teams', () => {
    it('most team players exist in player pool', () => {
      const teamsResult = validateTeamsDataWithConfig(teamsRows, REALISTIC_CONFIG);
      const playerNicks = new Set(
        playersData.data
          .filter(row => row[0]?.trim())
          .map(row => row[0].toLowerCase())
      );

      // Collect all player nicknames from teams
      const teamPlayerNicks = [];
      teamsResult.data?.teams.forEach(team => {
        team.playerNicknames.forEach(nick => {
          teamPlayerNicks.push(nick.toLowerCase());
        });
      });

      // Check that most team players are in the player pool
      // (some may be reserves/substitutes not in main pool)
      const found = teamPlayerNicks.filter(nick => playerNicks.has(nick));
      expect(found.length).toBeGreaterThan(teamPlayerNicks.length * 0.5);
    });
  });
});

