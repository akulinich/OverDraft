/**
 * Local icons data provider
 * Uses locally stored icons instead of fetching from OverFast API
 */

import heroesData from '../../assets/icons/heroes.json';

/**
 * @typedef {Object} HeroData
 * @property {string} key - Hero key (e.g., 'ana', 'dva')
 * @property {string} name - Hero display name
 * @property {string} portrait - URL to hero portrait image (local path)
 * @property {string} role - Hero role ('tank', 'damage', 'support')
 */

/**
 * @typedef {Object} RoleData
 * @property {string} key - Role key ('tank', 'damage', 'support')
 * @property {string} name - Role display name
 * @property {string} icon - URL to role icon (local path)
 */

/**
 * Hero aliases mapping: alias -> hero key
 * Includes: Russian names, abbreviations, slang, old names, common typos
 */
const HERO_ALIASES = {
  // Ana
  'ана': 'ana', 'анна': 'ana',
  // Ashe
  'эш': 'ashe', 'эшли': 'ashe',
  // Baptiste
  'батист': 'baptiste', 'бап': 'baptiste', 'баптист': 'baptiste',
  // Bastion
  'бастион': 'bastion', 'баст': 'bastion',
  // Brigitte
  'бригитта': 'brigitte', 'бриг': 'brigitte', 'бригита': 'brigitte', 'брига': 'brigitte',
  // Cassidy (formerly McCree)
  'кэссиди': 'cassidy', 'кессиди': 'cassidy', 'касиди': 'cassidy', 'маккри': 'cassidy',
  'мккри': 'cassidy', 'макри': 'cassidy', 'коул': 'cassidy', 'mccree': 'cassidy',
  // D.Va
  'дива': 'dva', 'два': 'dva', 'd.va': 'dva', 'diva': 'dva',
  // Doomfist
  'думфист': 'doomfist', 'дум': 'doomfist', 'doom': 'doomfist', 'кулак': 'doomfist',
  // Echo
  'эхо': 'echo', 'эко': 'echo',
  // Genji
  'гендзи': 'genji', 'генджи': 'genji', 'гэндзи': 'genji', 'ген': 'genji',
  // Hanzo
  'хандзо': 'hanzo', 'ханзо': 'hanzo', 'хандза': 'hanzo',
  // Hazard
  'хазард': 'hazard',
  // Illari
  'иллари': 'illari', 'илари': 'illari', 'илларий': 'illari',
  // Junker Queen
  'джанкер квин': 'junker-queen', 'королева': 'junker-queen', 'квин': 'junker-queen',
  'jq': 'junker-queen', 'джанкерквин': 'junker-queen',
  // Junkrat
  'джанкрат': 'junkrat', 'крыса': 'junkrat', 'джанк': 'junkrat', 'junk': 'junkrat',
  // Juno
  'юнона': 'juno', 'джуно': 'juno', 'юно': 'juno',
  // Kiriko
  'кирико': 'kiriko', 'кири': 'kiriko',
  // Lifeweaver
  'лайфвивер': 'lifeweaver', 'вивер': 'lifeweaver', 'лв': 'lifeweaver',
  'lw': 'lifeweaver', 'ткач': 'lifeweaver',
  // Lucio
  'лусио': 'lucio', 'люсио': 'lucio', 'лусиу': 'lucio',
  // Mauga
  'мауга': 'mauga',
  // Mei
  'мей': 'mei', 'мэй': 'mei',
  // Mercy
  'мерси': 'mercy', 'ангел': 'mercy', 'мерс': 'mercy',
  // Moira
  'мойра': 'moira', 'мойр': 'moira',
  // Orisa
  'ориса': 'orisa', 'орис': 'orisa',
  // Pharah
  'фара': 'pharah', 'фарра': 'pharah',
  // Ramattra
  'раматтра': 'ramattra', 'рам': 'ramattra', 'раматра': 'ramattra',
  // Reaper
  'рипер': 'reaper', 'жнец': 'reaper',
  // Reinhardt
  'рейнхардт': 'reinhardt', 'райн': 'reinhardt', 'рейн': 'reinhardt', 'рейнхард': 'reinhardt',
  // Roadhog
  'роадхог': 'roadhog', 'хог': 'roadhog', 'кабан': 'roadhog', 'свин': 'roadhog', 'hog': 'roadhog',
  // Sigma
  'сигма': 'sigma', 'сиг': 'sigma', 'sig': 'sigma',
  // Sojourn
  'соджорн': 'sojourn', 'содж': 'sojourn', 'соджерн': 'sojourn', 'soj': 'sojourn',
  // Soldier: 76
  'солдат': 'soldier-76', 'солдат 76': 'soldier-76', 'солд': 'soldier-76',
  's76': 'soldier-76', 'soldier': 'soldier-76', '76': 'soldier-76',
  // Sombra
  'сомбра': 'sombra', 'сомб': 'sombra',
  // Symmetra
  'симметра': 'symmetra', 'сима': 'symmetra', 'симетра': 'symmetra', 'sym': 'symmetra',
  // Torbjorn
  'торбьорн': 'torbjorn', 'торб': 'torbjorn', 'торбик': 'torbjorn', 'дед': 'torbjorn',
  // Tracer
  'трейсер': 'tracer', 'трейс': 'tracer', 'трэйсер': 'tracer',
  // Venture
  'венчур': 'venture', 'вентура': 'venture',
  // Widowmaker
  'вдова': 'widowmaker', 'видоу': 'widowmaker', 'видоумейкер': 'widowmaker', 'widow': 'widowmaker',
  // Winston
  'уинстон': 'winston', 'винстон': 'winston', 'обезьяна': 'winston', 'манки': 'winston', 'monkey': 'winston',
  // Wrecking Ball (Hammond)
  'хомяк': 'wrecking-ball', 'болл': 'wrecking-ball', 'хаммонд': 'wrecking-ball',
  'шар': 'wrecking-ball', 'ball': 'wrecking-ball', 'hammond': 'wrecking-ball', 'wb': 'wrecking-ball',
  // Zarya
  'заря': 'zarya', 'зар': 'zarya',
  // Zenyatta
  'дзенъятта': 'zenyatta', 'зенъятта': 'zenyatta', 'дзен': 'zenyatta', 'зен': 'zenyatta',
  'дзенята': 'zenyatta', 'зенята': 'zenyatta', 'zen': 'zenyatta',
  // New heroes
  'фрея': 'freja', 'фрейа': 'freja',
  'вуян': 'wuyang', 'уян': 'wuyang',
  'вендетта': 'vendetta'
};

/** @type {Map<string, HeroData>} Hero data by key */
const heroesMap = new Map();

/** @type {Map<string, HeroData>} Hero data by normalized name/alias */
const heroesByName = new Map();

/** @type {Map<string, RoleData>} Role data by key */
const rolesMap = new Map();

/** @type {boolean} */
let initialized = false;

/**
 * Role definitions with local icons
 */
const ROLES = [
  { key: 'tank', name: 'Tank', nameRu: 'Танк' },
  { key: 'damage', name: 'Damage', nameRu: 'ДД' },
  { key: 'support', name: 'Support', nameRu: 'Саппорт' }
];

/**
 * Role aliases mapping: alias -> role key
 * Includes: Russian names, abbreviations, slang, common typos
 */
const ROLE_ALIASES = {
  // Tank
  'танк': 'tank',
  'т': 'tank',
  'танки': 'tank',
  'main tank': 'tank',
  'mt': 'tank',
  'off tank': 'tank',
  'ot': 'tank',
  
  // Damage / DPS
  'damage': 'damage',
  'dps': 'damage',
  'дпс': 'damage',
  'дд': 'damage',
  'дамаг': 'damage',
  'дамагер': 'damage',
  'дамагеры': 'damage',
  'урон': 'damage',
  'д': 'damage',
  'hitscan': 'damage',
  'хитскан': 'damage',
  'flex dps': 'damage',
  'projectile': 'damage',
  
  // Support
  'support': 'support',
  'саппорт': 'support',
  'саппорты': 'support',
  'сап': 'support',
  'суппорт': 'support',
  'суп': 'support',
  'хил': 'support',
  'хилер': 'support',
  'хилы': 'support',
  'лекарь': 'support',
  'с': 'support',
  'main support': 'support',
  'ms': 'support',
  'flex support': 'support',
  'fs': 'support'
};

/**
 * Normalizes a hero name for lookup
 * Handles various formats: "D.Va" -> "dva", "Soldier: 76" -> "soldier-76"
 * @param {string} name 
 * @returns {string}
 */
export function normalizeHeroName(name) {
  if (!name || typeof name !== 'string') return '';
  
  return name
    .toLowerCase()
    .trim()
    // Remove special characters except hyphens
    .replace(/[.:]/g, '')
    // Replace spaces with hyphens
    .replace(/\s+/g, '-')
    // Remove multiple hyphens
    .replace(/-+/g, '-')
    // Remove leading/trailing hyphens
    .replace(/^-|-$/g, '');
}

/**
 * Gets the base path for assets from the public folder
 * @returns {string}
 */
function getAssetsBasePath() {
  // Assets in public/ are served at the root URL
  // Use import.meta.env.BASE_URL for correct base path in production
  const base = import.meta.env.BASE_URL || './';
  return `${base}icons/`;
}

/**
 * Initializes local icons data
 * No network requests needed - uses imported JSON
 * @returns {Promise<boolean>} Always returns true
 */
export async function initOverFastData() {
  if (initialized) {
    return true;
  }
  
  const basePath = getAssetsBasePath();
  
  // Build heroes maps from imported JSON
  for (const hero of heroesData) {
    const heroWithPortrait = {
      ...hero,
      portrait: `${basePath}heroes/${hero.key}.png`
    };
    
    heroesMap.set(hero.key, heroWithPortrait);
    
    // Index by normalized name for flexible lookup
    const normalizedName = normalizeHeroName(hero.name);
    heroesByName.set(normalizedName, heroWithPortrait);
    heroesByName.set(hero.key, heroWithPortrait);
  }
  
  // Register all aliases
  for (const [alias, heroKey] of Object.entries(HERO_ALIASES)) {
    const hero = heroesMap.get(heroKey);
    if (hero) {
      heroesByName.set(alias, hero);
      heroesByName.set(normalizeHeroName(alias), hero);
    }
  }
  
  // Build roles map
  for (const role of ROLES) {
    const roleWithIcon = {
      ...role,
      icon: `${basePath}roles/${role.key}.svg`
    };
    rolesMap.set(role.key, roleWithIcon);
    
    // Also index by Russian name
    rolesMap.set(role.nameRu.toLowerCase(), roleWithIcon);
  }
  
  // Register all role aliases
  for (const [alias, roleKey] of Object.entries(ROLE_ALIASES)) {
    const role = rolesMap.get(roleKey);
    if (role) {
      rolesMap.set(alias, role);
      rolesMap.set(normalizeHeroName(alias), role);
    }
  }
  
  initialized = true;
  console.log(`[Icons] Loaded ${heroesMap.size} heroes and ${rolesMap.size} roles (local assets)`);
  
  return true;
}

/**
 * Gets hero data by key or name
 * @param {string} keyOrName - Hero key (e.g., 'ana') or name (e.g., 'Ana', 'D.Va')
 * @returns {HeroData|null}
 */
export function getHero(keyOrName) {
  if (!keyOrName || !initialized) return null;
  
  // Try direct key lookup first
  const byKey = heroesMap.get(keyOrName.toLowerCase());
  if (byKey) return byKey;
  
  // Try normalized name lookup
  const normalized = normalizeHeroName(keyOrName);
  return heroesByName.get(normalized) || null;
}

/**
 * Gets role data by key
 * @param {string} key - Role key ('tank', 'damage', 'support', 'dps')
 * @returns {RoleData|null}
 */
export function getRole(key) {
  if (!key || !initialized) return null;
  return rolesMap.get(key.toLowerCase()) || null;
}

/**
 * Gets all heroes
 * @returns {HeroData[]}
 */
export function getAllHeroes() {
  return Array.from(heroesMap.values());
}

/**
 * Gets all roles
 * @returns {RoleData[]}
 */
export function getAllRoles() {
  return Array.from(rolesMap.values()).filter(r => r.key !== 'dps'); // Exclude alias
}

/**
 * Checks if icons data is loaded
 * @returns {boolean}
 */
export function isLoaded() {
  return initialized;
}

/**
 * Gets loading error if any (always null for local assets)
 * @returns {Error|null}
 */
export function getError() {
  return null;
}

/**
 * Parses a heroes string and returns hero data
 * Handles: comma-separated, semicolon-separated, and space-separated lists
 * Filters out non-hero words
 * @param {string} heroesString - e.g., "Ana, D.Va", "Люсио Бап Бриг", "Ханзо, Соджорн, хз"
 * @returns {HeroData[]}
 */
export function parseHeroesString(heroesString) {
  if (!heroesString || typeof heroesString !== 'string') {
    return [];
  }
  
  // First try splitting by commas/semicolons
  let heroNames = heroesString.split(/[,;]+/).map(s => s.trim()).filter(Boolean);
  
  // If only one result and it contains spaces, try splitting by spaces too
  // But be careful with multi-word hero names like "Soldier 76", "Junker Queen"
  if (heroNames.length === 1 && heroNames[0].includes(' ')) {
    const spaceTokens = heroNames[0].split(/\s+/);
    // Check if any space tokens are valid heroes
    const validSpaceTokens = spaceTokens.filter(t => getHero(t) !== null);
    if (validSpaceTokens.length > 1) {
      // More heroes found by splitting - use space split
      heroNames = spaceTokens;
    }
  }
  
  const result = [];
  const seen = new Set();
  
  for (const name of heroNames) {
    const hero = getHero(name);
    if (hero && !seen.has(hero.key)) {
      result.push(hero);
      seen.add(hero.key);
    }
  }
  
  return result;
}
