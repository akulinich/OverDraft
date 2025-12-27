/**
 * Rating to Rank Tier Mapping
 * 
 * Based on Overwatch 2 ranking system:
 * - Each tier has 5 grades (5 = lowest, 1 = highest)
 * - Step between grades = 100 rating points
 * 
 * Rating thresholds (Grade 5):
 * - Bronze: 1000
 * - Silver: 1500
 * - Gold: 2000
 * - Platinum: 2500
 * - Diamond: 3000
 * - Master: 3500
 * - Grandmaster: 4000
 * - Champion: 4500
 */

/**
 * @typedef {'bronze'|'silver'|'gold'|'platinum'|'diamond'|'master'|'grandmaster'|'champion'} RankTier
 */

/**
 * @typedef {Object} RankInfo
 * @property {RankTier} tier - Rank tier name
 * @property {number} grade - Grade within tier (1-5, lower is better)
 * @property {string} label - Human-readable label (e.g., "Diamond 4")
 * @property {string} tierIcon - URL to tier icon
 * @property {string} gradeIcon - URL to grade icon (if available)
 */

/**
 * Tier definitions with rating thresholds
 * @type {Array<{tier: RankTier, minRating: number, label: string, labelRu: string}>}
 */
const TIER_DEFINITIONS = [
  { tier: 'champion', minRating: 4500, label: 'Champion', labelRu: 'Чемпион' },
  { tier: 'grandmaster', minRating: 4000, label: 'Grandmaster', labelRu: 'Грандмастер' },
  { tier: 'master', minRating: 3500, label: 'Master', labelRu: 'Мастер' },
  { tier: 'diamond', minRating: 3000, label: 'Diamond', labelRu: 'Бриллиант' },
  { tier: 'platinum', minRating: 2500, label: 'Platinum', labelRu: 'Платина' },
  { tier: 'gold', minRating: 2000, label: 'Gold', labelRu: 'Золото' },
  { tier: 'silver', minRating: 1500, label: 'Silver', labelRu: 'Серебро' },
  { tier: 'bronze', minRating: 1000, label: 'Bronze', labelRu: 'Бронза' }
];

/**
 * Gets local tier icon URL
 * @param {string} tier 
 * @returns {string}
 */
function getLocalTierIcon(tier) {
  // Assets in public/ are served at the root URL
  const base = import.meta.env.BASE_URL || './';
  return `${base}icons/ranks/${tier}.svg`;
}

/** Rating step per grade */
const GRADE_STEP = 100;

/** Number of grades per tier */
const GRADES_PER_TIER = 5;

/**
 * Rounds rating to nearest 100
 * @param {number} rating 
 * @returns {number}
 */
export function roundRating(rating) {
  return Math.round(rating / 100) * 100;
}

/**
 * Gets rank tier and grade from numeric rating
 * @param {number|string} rating - Numeric rating value
 * @returns {RankInfo|null} Rank info or null if rating is invalid
 */
export function getRankFromRating(rating) {
  const numRating = typeof rating === 'string' ? parseInt(rating, 10) : rating;
  
  if (isNaN(numRating) || numRating < 0) {
    return null;
  }
  
  // Round to nearest 100
  const rounded = roundRating(numRating);
  
  // Find matching tier (tiers are sorted from highest to lowest)
  let matchedTier = TIER_DEFINITIONS[TIER_DEFINITIONS.length - 1]; // Default to bronze
  
  for (const tierDef of TIER_DEFINITIONS) {
    if (rounded >= tierDef.minRating) {
      matchedTier = tierDef;
      break;
    }
  }
  
  // Calculate grade within tier
  // Grade 5 is at minRating, Grade 1 is at minRating + 400
  const ratingInTier = rounded - matchedTier.minRating;
  const gradeIndex = Math.floor(ratingInTier / GRADE_STEP);
  
  // Grade 5 = index 0, Grade 1 = index 4
  // But we need to clamp to valid range [1, 5]
  const grade = Math.max(1, Math.min(5, 5 - gradeIndex));
  
  return {
    tier: matchedTier.tier,
    grade,
    label: `${matchedTier.label} ${grade}`,
    labelRu: `${matchedTier.labelRu} ${grade}`,
    tierIcon: getLocalTierIcon(matchedTier.tier),
    gradeIcon: '' // Grade icons not implemented for local assets
  };
}

/**
 * Gets tier icon URL for a tier name
 * @param {RankTier} tier 
 * @returns {string}
 */
export function getTierIcon(tier) {
  return getLocalTierIcon(tier);
}

/**
 * Gets tier display label
 * @param {RankTier} tier 
 * @param {boolean} [russian=false] 
 * @returns {string}
 */
export function getTierLabel(tier, russian = false) {
  const tierDef = TIER_DEFINITIONS.find(t => t.tier === tier);
  if (!tierDef) return tier;
  return russian ? tierDef.labelRu : tierDef.label;
}

/**
 * Gets CSS class for tier coloring
 * @param {RankTier} tier 
 * @returns {string}
 */
export function getTierClass(tier) {
  return `rank-${tier}`;
}

/**
 * Gets all tier definitions
 * @returns {typeof TIER_DEFINITIONS}
 */
export function getAllTiers() {
  return TIER_DEFINITIONS;
}

