/**
 * Integration tests for advanced team layouts
 * - Non-zero offsets (startRow, startCol)
 * - Noise data between teams that should be ignored
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'fs';
import { parseCSV } from '../../js/utils/csv.js';
import { parseStoredCSV } from '../../js/api/local.js';
import { validateTeamsDataWithConfig } from '../../js/validation/schema.js';

// Mock persistence for schema.js
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

describe('Advanced Team Layouts', () => {
  
  describe('Teams with Row/Column Offset (5 teams, 2 per row)', () => {
    let teamsRows;
    
    // Config for offset layout:
    // - startRow: 3 (skip header rows: "Турнир", "Дата", empty)
    // - startCol: 3 (skip left margin: 3 empty columns)
    // - 2 teams per row, 5 columns per team (4 data + 1 separator)
    // - 1 empty row between blocks
    const OFFSET_CONFIG = {
      teamsPerRow: 2,
      columnsPerTeam: 4,
      separatorColumns: 1,
      rowsBetweenBlocks: 1,
      playersPerTeam: 5,
      headerRows: 2,
      startRow: 3,
      startCol: 3
    };

    beforeAll(() => {
      const csv = readFileSync('tests/fixtures/teams-offset.csv', 'utf-8');
      teamsRows = parseCSV(csv);
    });

    it('parses CSV with offset data', () => {
      expect(teamsRows.length).toBeGreaterThan(10);
    });

    it('has header info in first rows (to be skipped)', () => {
      expect(teamsRows[0][0]).toContain('Турнир');
      expect(teamsRows[1][0]).toContain('Дата');
    });

    it('validates 5 teams with offset config', () => {
      const result = validateTeamsDataWithConfig(teamsRows, OFFSET_CONFIG);
      
      expect(result.data?.teams.length).toBe(5);
    });

    it('extracts correct team names', () => {
      const result = validateTeamsDataWithConfig(teamsRows, OFFSET_CONFIG);
      const teamNames = result.data?.teams.map(t => t.name);
      
      expect(teamNames).toContain('Alpha Squad');
      expect(teamNames).toContain('Beta Force');
      expect(teamNames).toContain('Gamma Team');
      expect(teamNames).toContain('Delta Unit');
      expect(teamNames).toContain('Epsilon Five');
    });

    it('extracts correct team numbers 1-5', () => {
      const result = validateTeamsDataWithConfig(teamsRows, OFFSET_CONFIG);
      const teamNumbers = result.data?.teams.map(t => t.teamNumber).sort((a, b) => a - b);
      
      expect(teamNumbers).toEqual([1, 2, 3, 4, 5]);
    });

    it('extracts players from first block (teams 1-2)', () => {
      const result = validateTeamsDataWithConfig(teamsRows, OFFSET_CONFIG);
      
      const team1 = result.data?.teams.find(t => t.teamNumber === 1);
      const team2 = result.data?.teams.find(t => t.teamNumber === 2);
      
      expect(team1?.playerNicknames).toContain('Player1');
      expect(team1?.playerNicknames).toContain('Player2');
      expect(team2?.playerNicknames).toContain('Player6');
      expect(team2?.playerNicknames).toContain('Player7');
    });

    it('extracts players from second block (teams 3-4)', () => {
      const result = validateTeamsDataWithConfig(teamsRows, OFFSET_CONFIG);
      
      const team3 = result.data?.teams.find(t => t.teamNumber === 3);
      const team4 = result.data?.teams.find(t => t.teamNumber === 4);
      
      expect(team3?.playerNicknames).toContain('Player11');
      expect(team4?.playerNicknames).toContain('Player16');
    });

    it('extracts players from third block (team 5 alone)', () => {
      const result = validateTeamsDataWithConfig(teamsRows, OFFSET_CONFIG);
      
      const team5 = result.data?.teams.find(t => t.teamNumber === 5);
      
      expect(team5?.playerNicknames).toContain('Player21');
      expect(team5?.playerNicknames).toContain('Player22');
      expect(team5?.playerNicknames).toContain('Player24');
    });

    it('each team has 5 players', () => {
      const result = validateTeamsDataWithConfig(teamsRows, OFFSET_CONFIG);
      
      result.data?.teams.forEach(team => {
        expect(team.playerNicknames.length).toBe(5);
      });
    });
  });

  describe('Teams with Noise Data (6 teams, 3 per row)', () => {
    let teamsRows;
    
    // Config for noisy layout:
    // - 3 teams per row with 6 columns each (4 data + 2 separator)
    // - Noise data appears in some cells but correct column alignment ignores it
    const NOISE_CONFIG = {
      teamsPerRow: 3,
      columnsPerTeam: 4,
      separatorColumns: 2,
      rowsBetweenBlocks: 1,
      playersPerTeam: 5,
      headerRows: 2,
      startRow: 0,
      startCol: 0
    };

    beforeAll(() => {
      const csv = readFileSync('tests/fixtures/teams-with-noise.csv', 'utf-8');
      teamsRows = parseCSV(csv);
    });

    it('parses CSV with noise data', () => {
      expect(teamsRows.length).toBeGreaterThan(10);
    });

    it('has extra data in some cells', () => {
      // Row 4 has "Extra1" and "Extra2" in some cells (noise data)
      const row = teamsRows[4];
      expect(row.some(cell => cell.includes('Extra'))).toBe(true);
    });

    it('validates 6 teams ignoring noise', () => {
      const result = validateTeamsDataWithConfig(teamsRows, NOISE_CONFIG);
      
      expect(result.data?.teams.length).toBe(6);
    });

    it('extracts correct team names from noisy data', () => {
      const result = validateTeamsDataWithConfig(teamsRows, NOISE_CONFIG);
      const teamNames = result.data?.teams.map(t => t.name);
      
      expect(teamNames).toContain('Team One');
      expect(teamNames).toContain('Team Two');
      expect(teamNames).toContain('Team Three');
      expect(teamNames).toContain('Team Four');
      expect(teamNames).toContain('Team Five');
      expect(teamNames).toContain('Team Six');
    });

    it('extracts correct team numbers 1-6', () => {
      const result = validateTeamsDataWithConfig(teamsRows, NOISE_CONFIG);
      const teamNumbers = result.data?.teams.map(t => t.teamNumber).sort((a, b) => a - b);
      
      expect(teamNumbers).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('noise columns do not affect player extraction', () => {
      const result = validateTeamsDataWithConfig(teamsRows, NOISE_CONFIG);
      
      const team1 = result.data?.teams.find(t => t.teamNumber === 1);
      
      // Should have real players, not noise data
      expect(team1?.playerNicknames).toContain('NoisePlayer1');
      expect(team1?.playerNicknames).toContain('NoisePlayer2');
      expect(team1?.playerNicknames).not.toContain('STATS');
      expect(team1?.playerNicknames).not.toContain('Win Rate');
    });

    it('extracts players from all 6 teams', () => {
      const result = validateTeamsDataWithConfig(teamsRows, NOISE_CONFIG);
      
      for (let i = 1; i <= 6; i++) {
        const team = result.data?.teams.find(t => t.teamNumber === i);
        expect(team).toBeDefined();
        expect(team?.playerNicknames.length).toBeGreaterThan(0);
      }
    });

    it('team 6 has correct players despite surrounding noise', () => {
      const result = validateTeamsDataWithConfig(teamsRows, NOISE_CONFIG);
      
      const team6 = result.data?.teams.find(t => t.teamNumber === 6);
      
      expect(team6?.playerNicknames).toContain('NoisePlayer30');
      expect(team6?.playerNicknames).toContain('NoisePlayer31');
      expect(team6?.playerNicknames).toContain('NoisePlayer33');
    });

    it('ignores text notes in separator columns', () => {
      const result = validateTeamsDataWithConfig(teamsRows, NOISE_CONFIG);
      
      // Check that noise text is not captured as player names
      const allPlayers = result.data?.teams.flatMap(t => t.playerNicknames) || [];
      
      expect(allPlayers).not.toContain('STATS');
      expect(allPlayers).not.toContain('NOTES');
      expect(allPlayers).not.toContain('RANKINGS');
      expect(allPlayers).not.toContain('INFO');
      expect(allPlayers).not.toContain('Win Rate: 65%');
      expect(allPlayers).not.toContain('Random note here');
    });
  });

  describe('Cross-reference: Offset Teams with Players', () => {
    let teamsRows;
    let playersData;
    
    const OFFSET_CONFIG = {
      teamsPerRow: 2,
      columnsPerTeam: 4,
      separatorColumns: 1,
      rowsBetweenBlocks: 1,
      playersPerTeam: 5,
      headerRows: 2,
      startRow: 3,
      startCol: 3
    };

    beforeAll(() => {
      const teamsCSV = readFileSync('tests/fixtures/teams-offset.csv', 'utf-8');
      const playersCSV = readFileSync('tests/fixtures/players-offset.csv', 'utf-8');
      teamsRows = parseCSV(teamsCSV);
      playersData = parseStoredCSV(playersCSV, 'players-offset.csv');
    });

    it('players file has 25 players', () => {
      expect(playersData.data.length).toBe(25);
    });

    it('all team players exist in player pool', () => {
      const teamsResult = validateTeamsDataWithConfig(teamsRows, OFFSET_CONFIG);
      const playerNicks = new Set(
        playersData.data.map(row => row[0].toLowerCase())
      );

      const teamPlayerNicks = teamsResult.data?.teams
        .flatMap(t => t.playerNicknames)
        .map(n => n.toLowerCase()) || [];

      // All players from teams should be in player pool
      const allFound = teamPlayerNicks.every(nick => playerNicks.has(nick));
      expect(allFound).toBe(true);
    });

    it('can look up player ratings from player pool', () => {
      const teamsResult = validateTeamsDataWithConfig(teamsRows, OFFSET_CONFIG);
      const team1 = teamsResult.data?.teams.find(t => t.teamNumber === 1);
      
      // Find Player1 in players data
      const player1Row = playersData.data.find(row => row[0] === 'Player1');
      expect(player1Row).toBeDefined();
      expect(player1Row?.[2]).toBe('3200'); // Rating
      expect(player1Row?.[1]).toBe('Танк'); // Role
      
      // Verify Player1 is in team 1
      expect(team1?.playerNicknames).toContain('Player1');
    });

    it('each team has correct role composition from player pool', () => {
      const teamsResult = validateTeamsDataWithConfig(teamsRows, OFFSET_CONFIG);
      const playerMap = new Map(
        playersData.data.map(row => [row[0].toLowerCase(), { role: row[1], rating: parseInt(row[2]) }])
      );

      // Check team 1 composition
      const team1 = teamsResult.data?.teams.find(t => t.teamNumber === 1);
      const team1Players = team1?.playerNicknames.map(n => ({
        nick: n,
        ...playerMap.get(n.toLowerCase())
      })) || [];

      // Should have tank, dps, support
      const roles = team1Players.map(p => p.role);
      expect(roles).toContain('Танк');
      expect(roles).toContain('ДД');
      expect(roles).toContain('Сапы');
    });
  });

  describe('Cross-reference: Noise Teams with Players', () => {
    let teamsRows;
    let playersData;
    
    const NOISE_CONFIG = {
      teamsPerRow: 3,
      columnsPerTeam: 4,
      separatorColumns: 2,
      rowsBetweenBlocks: 1,
      playersPerTeam: 5,
      headerRows: 2,
      startRow: 0,
      startCol: 0
    };

    beforeAll(() => {
      const teamsCSV = readFileSync('tests/fixtures/teams-with-noise.csv', 'utf-8');
      const playersCSV = readFileSync('tests/fixtures/players-noise.csv', 'utf-8');
      teamsRows = parseCSV(teamsCSV);
      playersData = parseStoredCSV(playersCSV, 'players-noise.csv');
    });

    it('players file has 30 players', () => {
      expect(playersData.data.length).toBe(30);
    });

    it('most team players exist in player pool', () => {
      const teamsResult = validateTeamsDataWithConfig(teamsRows, NOISE_CONFIG);
      const playerNicks = new Set(
        playersData.data.map(row => row[0].toLowerCase())
      );

      const teamPlayerNicks = teamsResult.data?.teams
        .flatMap(t => t.playerNicknames)
        .map(n => n.toLowerCase()) || [];

      // At least 80% of players should be found (some may be reserves)
      const found = teamPlayerNicks.filter(nick => playerNicks.has(nick));
      expect(found.length / teamPlayerNicks.length).toBeGreaterThan(0.8);
    });

    it('can calculate team average rating from player pool', () => {
      const teamsResult = validateTeamsDataWithConfig(teamsRows, NOISE_CONFIG);
      const playerMap = new Map(
        playersData.data.map(row => [row[0].toLowerCase(), parseInt(row[2])])
      );

      const team1 = teamsResult.data?.teams.find(t => t.teamNumber === 1);
      const ratings = team1?.playerNicknames
        .map(n => playerMap.get(n.toLowerCase()))
        .filter(r => r !== undefined) || [];

      const avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
      
      // Average should be reasonable (3000-4000 range)
      expect(avgRating).toBeGreaterThan(3000);
      expect(avgRating).toBeLessThan(4000);
    });

    it('player ratings from pool match expected ranges', () => {
      // All ratings should be valid
      const ratings = playersData.data.map(row => parseInt(row[2]));
      expect(ratings.every(r => r >= 2500 && r <= 4000)).toBe(true);
    });
  });
});

