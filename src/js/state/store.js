/**
 * In-memory state management
 */

import { loadConfiguredSheets, loadSettings, loadTeamsSheet, saveConfiguredSheets, saveSettings, saveTeamsSheet } from '../storage/persistence.js';
import { getSheetKey } from '../utils/parser.js';

/**
 * @typedef {import('../api/sheets.js').SheetData} SheetData
 * @typedef {import('../storage/persistence.js').SheetConfig} SheetConfig
 * @typedef {import('../validation/schema.js').Team} Team
 * @typedef {import('../validation/schema.js').TeamPlayer} TeamPlayer
 */

/**
 * @typedef {Object} Player
 * @property {string} nickname - Player nickname (Discord or display name)
 * @property {string} battleTag - Player BattleTag (if available)
 * @property {'tank'|'dps'|'support'} role - Player role
 * @property {number} rating - Player rating
 * @property {string} heroes - Player heroes (comma-separated)
 * @property {string[]} rawRow - Original row data from sheet
 */

/**
 * @typedef {Object} AppState
 * @property {Map<string, SheetData>} sheets - Cached sheet data
 * @property {SheetConfig[]} configuredSheets - User-configured sheets
 * @property {SheetConfig|null} teamsSheet - Teams sheet configuration
 * @property {SheetData|null} teamsData - Cached teams sheet data
 * @property {Map<string, Player>} parsedPlayers - Parsed players by nickname
 * @property {Team|null} selectedTeam - Currently selected team for draft view
 * @property {Player|null} selectedPlayer - Currently selected player for details
 * @property {boolean} isLoading
 * @property {Map<string, Error>} errors
 * @property {number} pollingInterval
 * @property {'light'|'dark'} theme
 * @property {'players'|'teams'|'draft'} activeTab - Currently active tab
 * @property {boolean} overfastLoaded - Whether OverFast API data is loaded
 * @property {boolean} overfastLoading - Whether OverFast API data is currently loading
 */

/**
 * State change callback type
 * @callback StateListener
 * @param {AppState} state
 * @param {string} changedKey
 */

/** @type {AppState} */
let state = {
  sheets: new Map(),
  configuredSheets: [],
  teamsSheet: null,
  teamsData: null,
  parsedPlayers: new Map(),
  selectedTeam: null,
  selectedPlayer: null,
  isLoading: false,
  errors: new Map(),
  pollingInterval: 1000,
  theme: 'dark',
  activeTab: 'players',
  overfastLoaded: false,
  overfastLoading: false
};

/** Column header patterns for player data parsing */
const HEADER_PATTERNS = {
  nickname: /^(ник|никнейм|nickname|nick|имя|name|игрок|player)/i,
  battleTag: /^(battletag|battle.?tag|тег|btag)/i,
  role: /^(роль|role)/i,
  rating: /^(рейтинг|rating|sr|ранг|rank)/i,
  heroes: /^(герои|heroes|hero|персонажи|characters)/i
};

/** Role normalization patterns */
const ROLE_PATTERNS = {
  tank: /^(танк|tanks?)/i,
  dps: /^(дд|dd|dps|damage)/i,
  support: /^(сапп?ы?|support|heal|саппорт)/i
};

/** @type {Set<StateListener>} */
const listeners = new Set();

/**
 * Notifies all listeners of state change
 * @param {string} changedKey 
 */
function notify(changedKey) {
  listeners.forEach(listener => {
    try {
      listener(state, changedKey);
    } catch (err) {
      console.error('[Store] Listener error:', err);
    }
  });
}

/**
 * Gets current state (read-only reference)
 * @returns {AppState}
 */
export function getState() {
  return state;
}

/**
 * Subscribes to state changes
 * @param {StateListener} listener 
 * @returns {function(): void} Unsubscribe function
 */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Initializes state from localStorage
 */
export function initializeState() {
  const sheets = loadConfiguredSheets();
  const teamsSheet = loadTeamsSheet();
  const settings = loadSettings();
  
  state = {
    ...state,
    configuredSheets: sheets,
    teamsSheet,
    pollingInterval: settings.pollingInterval,
    theme: settings.theme
  };
  
  notify('init');
}

/**
 * Adds a new sheet configuration
 * @param {SheetConfig} config 
 */
export function addSheet(config) {
  const newConfig = {
    ...config,
    addedAt: new Date().toISOString()
  };
  
  state.configuredSheets = [...state.configuredSheets, newConfig];
  saveConfiguredSheets(state.configuredSheets);
  notify('configuredSheets');
}

/**
 * Removes a sheet configuration
 * @param {string} spreadsheetId 
 * @param {string} gid 
 */
export function removeSheet(spreadsheetId, gid) {
  state.configuredSheets = state.configuredSheets.filter(
    s => !(s.spreadsheetId === spreadsheetId && s.gid === gid)
  );
  
  const key = getSheetKey(spreadsheetId, gid);
  state.sheets.delete(key);
  state.errors.delete(key);
  
  saveConfiguredSheets(state.configuredSheets);
  notify('configuredSheets');
}

/**
 * Replaces all configured sheets with a single new one
 * @param {SheetConfig} config 
 */
export function replaceSheet(config) {
  const newConfig = {
    ...config,
    addedAt: new Date().toISOString()
  };
  
  state.configuredSheets = [newConfig];
  state.sheets.clear();
  state.errors.clear();
  
  saveConfiguredSheets(state.configuredSheets);
  notify('configuredSheets');
}

/**
 * Normalizes role string to standard format
 * @param {string} role
 * @returns {'tank'|'dps'|'support'|null}
 */
function normalizeRole(role) {
  if (!role || typeof role !== 'string') return null;
  const trimmed = role.trim();
  if (ROLE_PATTERNS.tank.test(trimmed)) return 'tank';
  if (ROLE_PATTERNS.dps.test(trimmed)) return 'dps';
  if (ROLE_PATTERNS.support.test(trimmed)) return 'support';
  return null;
}

/**
 * Finds column index by header pattern
 * @param {string[]} headers
 * @param {RegExp} pattern
 * @returns {number} -1 if not found
 */
function findColumnIndex(headers, pattern) {
  return headers.findIndex(h => pattern.test(h.trim()));
}

/**
 * Parses players from sheet data
 * @param {string[]} headers
 * @param {string[][]} data
 * @returns {Map<string, Player>}
 */
function parsePlayersFromSheet(headers, data) {
  const players = new Map();
  
  const nicknameIdx = findColumnIndex(headers, HEADER_PATTERNS.nickname);
  const battleTagIdx = findColumnIndex(headers, HEADER_PATTERNS.battleTag);
  const roleIdx = findColumnIndex(headers, HEADER_PATTERNS.role);
  const ratingIdx = findColumnIndex(headers, HEADER_PATTERNS.rating);
  const heroesIdx = findColumnIndex(headers, HEADER_PATTERNS.heroes);
  
  if (nicknameIdx === -1 && battleTagIdx === -1) {
    console.warn('[Store] Could not find nickname or battletag column in player sheet');
    return players;
  }
  
  for (const row of data) {
    const nickname = nicknameIdx >= 0 ? row[nicknameIdx]?.trim() : '';
    const battleTag = battleTagIdx >= 0 ? row[battleTagIdx]?.trim() : '';
    
    // Need at least one identifier
    if (!nickname && !battleTag) continue;
    
    const roleStr = roleIdx >= 0 ? row[roleIdx]?.trim() : '';
    const role = normalizeRole(roleStr) || 'dps';
    
    const ratingStr = ratingIdx >= 0 ? row[ratingIdx]?.trim() : '0';
    const rating = parseInt(ratingStr, 10) || 0;
    
    const heroes = heroesIdx >= 0 ? row[heroesIdx]?.trim() || '' : '';
    
    const player = {
      nickname: nickname || battleTag,
      battleTag,
      role,
      rating,
      heroes,
      rawRow: row
    };
    
    // Store by nickname (primary key)
    if (nickname) {
      players.set(nickname.toLowerCase(), player);
    }
    
    // Also store by battleTag for lookup (if different from nickname)
    if (battleTag && battleTag.toLowerCase() !== nickname.toLowerCase()) {
      players.set(battleTag.toLowerCase(), player);
    }
  }
  
  return players;
}

/**
 * Updates cached sheet data
 * @param {SheetData} data 
 */
export function updateSheetData(data) {
  const key = getSheetKey(data.spreadsheetId, data.gid);
  const existing = state.sheets.get(key);
  
  // Check if data actually changed
  const hasChanged = !existing || 
    JSON.stringify(existing.data) !== JSON.stringify(data.data) ||
    JSON.stringify(existing.headers) !== JSON.stringify(data.headers);
  
  state.sheets.set(key, data);
  state.errors.delete(key);
  
  // Parse players from the sheet data
  state.parsedPlayers = parsePlayersFromSheet(data.headers, data.data);
  
  if (hasChanged) {
    notify('sheetData');
  }
}

/**
 * Sets loading state
 * @param {boolean} loading 
 */
export function setLoading(loading) {
  state.isLoading = loading;
  notify('isLoading');
}

/**
 * Sets error for a sheet
 * @param {string} spreadsheetId 
 * @param {string} gid 
 * @param {Error} error 
 */
export function setError(spreadsheetId, gid, error) {
  const key = getSheetKey(spreadsheetId, gid);
  state.errors.set(key, error);
  notify('errors');
}

/**
 * Clears error for a sheet
 * @param {string} spreadsheetId 
 * @param {string} gid 
 */
export function clearError(spreadsheetId, gid) {
  const key = getSheetKey(spreadsheetId, gid);
  state.errors.delete(key);
  notify('errors');
}

/**
 * Updates polling interval
 * @param {number} interval 
 */
export function setPollingInterval(interval) {
  state.pollingInterval = interval;
  saveSettings({ pollingInterval: interval });
  notify('pollingInterval');
}

/**
 * Updates theme
 * @param {'light'|'dark'} theme 
 */
export function setTheme(theme) {
  state.theme = theme;
  saveSettings({ theme });
  notify('theme');
}

/**
 * Checks if at least one sheet is configured
 * @returns {boolean}
 */
export function hasConfiguredSheets() {
  return state.configuredSheets.length > 0;
}

/**
 * Gets the first configured sheet
 * @returns {SheetConfig|undefined}
 */
export function getFirstSheet() {
  return state.configuredSheets[0];
}

/**
 * Gets cached data for a sheet
 * @param {string} spreadsheetId 
 * @param {string} gid 
 * @returns {SheetData|undefined}
 */
export function getSheetData(spreadsheetId, gid) {
  return state.sheets.get(getSheetKey(spreadsheetId, gid));
}

/**
 * Sets teams sheet configuration
 * @param {SheetConfig} config 
 */
export function setTeamsSheet(config) {
  state.teamsSheet = {
    ...config,
    addedAt: new Date().toISOString()
  };
  saveTeamsSheet(state.teamsSheet);
  notify('teamsSheet');
}

/**
 * Gets teams sheet configuration
 * @returns {SheetConfig|null}
 */
export function getTeamsSheet() {
  return state.teamsSheet;
}

/**
 * Updates cached teams data
 * @param {SheetData} data 
 */
export function updateTeamsData(data) {
  state.teamsData = data;
  notify('teamsData');
}

/**
 * Gets cached teams data
 * @returns {SheetData|null}
 */
export function getTeamsData() {
  return state.teamsData;
}

/**
 * Checks if teams sheet is configured
 * @returns {boolean}
 */
export function hasTeamsSheet() {
  return state.teamsSheet !== null;
}

/**
 * Sets active tab
 * @param {'players'|'teams'|'draft'} tab 
 */
export function setActiveTab(tab) {
  state.activeTab = tab;
  notify('activeTab');
}

/**
 * Gets active tab
 * @returns {'players'|'teams'|'draft'}
 */
export function getActiveTab() {
  return state.activeTab;
}

/**
 * Gets parsed players map
 * @returns {Map<string, Player>}
 */
export function getParsedPlayers() {
  return state.parsedPlayers;
}

/**
 * Gets a player by nickname (case-insensitive)
 * @param {string} nickname
 * @returns {Player|undefined}
 */
export function getPlayerByNickname(nickname) {
  return state.parsedPlayers.get(nickname.toLowerCase());
}

/**
 * Sets the selected team for draft view
 * @param {Team|null} team
 */
export function setSelectedTeam(team) {
  state.selectedTeam = team;
  state.selectedPlayer = null;
  notify('selectedTeam');
}

/**
 * Gets the selected team
 * @returns {Team|null}
 */
export function getSelectedTeam() {
  return state.selectedTeam;
}

/**
 * Sets the selected player for details panel
 * @param {Player|null} player
 */
export function setSelectedPlayer(player) {
  state.selectedPlayer = player;
  notify('selectedPlayer');
}

/**
 * Gets the selected player
 * @returns {Player|null}
 */
export function getSelectedPlayer() {
  return state.selectedPlayer;
}

/**
 * Gets all player nicknames that are assigned to any team
 * @param {Team[]} teams
 * @returns {Set<string>}
 */
function getAssignedPlayerNicknames(teams) {
  const assigned = new Set();
  for (const team of teams) {
    for (const player of team.players) {
      assigned.add(player.nickname.toLowerCase());
    }
  }
  return assigned;
}

/**
 * Gets unselected players grouped by role
 * @param {Team[]} teams - All teams to check against
 * @returns {{tank: Player[], dps: Player[], support: Player[]}}
 */
export function getUnselectedPlayersByRole(teams) {
  const assigned = getAssignedPlayerNicknames(teams);
  
  const result = {
    tank: [],
    dps: [],
    support: []
  };
  
  // Track already added players to avoid duplicates
  // (same player may be stored under both nickname and battleTag)
  const addedPlayers = new Set();
  
  for (const player of state.parsedPlayers.values()) {
    // Skip if already added (duplicate entry)
    const playerKey = player.nickname.toLowerCase();
    if (addedPlayers.has(playerKey)) continue;
    
    // Check if player is assigned by either nickname or battleTag
    const isAssigned = 
      assigned.has(player.nickname.toLowerCase()) ||
      (player.battleTag && assigned.has(player.battleTag.toLowerCase()));
    
    if (!isAssigned) {
      result[player.role].push(player);
      addedPlayers.add(playerKey);
    }
  }
  
  // Sort each role by rating descending
  result.tank.sort((a, b) => b.rating - a.rating);
  result.dps.sort((a, b) => b.rating - a.rating);
  result.support.sort((a, b) => b.rating - a.rating);
  
  return result;
}

/**
 * Sets OverFast loading state
 * @param {boolean} loading
 */
export function setOverfastLoading(loading) {
  state.overfastLoading = loading;
  notify('overfastLoading');
}

/**
 * Sets OverFast loaded state
 * @param {boolean} loaded
 */
export function setOverfastLoaded(loaded) {
  state.overfastLoaded = loaded;
  state.overfastLoading = false;
  notify('overfastLoaded');
}

/**
 * Checks if OverFast data is loaded
 * @returns {boolean}
 */
export function isOverfastLoaded() {
  return state.overfastLoaded;
}

/**
 * Checks if OverFast data is currently loading
 * @returns {boolean}
 */
export function isOverfastLoading() {
  return state.overfastLoading;
}


