/**
 * UI component utilities
 */

import { getRole, getHero, parseHeroesString, isLoaded as isOverfastLoaded } from '../api/overfast.js';
import { getRankFromRating } from '../utils/ranks.js';

/**
 * Creates an HTML element with attributes and content
 * @param {string} tag 
 * @param {Object} [attrs] 
 * @param {string|HTMLElement|HTMLElement[]} [content] 
 * @returns {HTMLElement}
 */
export function createElement(tag, attrs = {}, content = null) {
  const el = document.createElement(tag);
  
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'className') {
      el.className = value;
    } else if (key === 'dataset') {
      Object.assign(el.dataset, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      el.setAttribute(key, value);
    }
  }
  
  if (content !== null) {
    if (typeof content === 'string') {
      el.textContent = content;
    } else if (Array.isArray(content)) {
      content.forEach(child => el.appendChild(child));
    } else {
      el.appendChild(content);
    }
  }
  
  return el;
}

/**
 * Escapes HTML to prevent XSS
 * @param {string} text 
 * @returns {string}
 */
export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Gets role class based on role name (Overwatch-specific)
 * @param {string} role 
 * @returns {string}
 */
export function getRoleClass(role) {
  const roleLower = role.toLowerCase().trim();
  if (roleLower.includes('tank')) return 'role-tank';
  if (roleLower.includes('dps') || roleLower.includes('damage')) return 'role-dps';
  if (roleLower.includes('support') || roleLower.includes('heal')) return 'role-support';
  return '';
}

/**
 * Gets rating badge class based on rating value
 * @param {string} rating 
 * @returns {string}
 */
export function getRatingClass(rating) {
  const num = parseInt(rating, 10);
  if (isNaN(num)) return '';
  
  // Overwatch 2 rating tiers (approximate)
  if (num < 1500) return 'rating-bronze';
  if (num < 2000) return 'rating-silver';
  if (num < 2500) return 'rating-gold';
  if (num < 3000) return 'rating-platinum';
  if (num < 3500) return 'rating-diamond';
  if (num < 4000) return 'rating-master';
  if (num < 4500) return 'rating-grandmaster';
  return 'rating-champion';
}

/**
 * Formats a date as relative time
 * @param {Date} date 
 * @returns {string}
 */
export function formatRelativeTime(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

/**
 * Creates a role icon element
 * @param {string} role - Role key ('tank', 'dps', 'damage', 'support')
 * @param {Object} [options]
 * @param {string} [options.size='sm'] - Icon size ('sm', 'md', 'lg')
 * @returns {HTMLElement}
 */
export function createRoleIcon(role, options = {}) {
  const { size = 'sm' } = options;
  const normalizedRole = role === 'dps' ? 'damage' : role;
  const roleData = getRole(normalizedRole);
  
  if (roleData && isOverfastLoaded()) {
    const img = createElement('img', {
      src: roleData.icon,
      alt: roleData.name,
      title: roleData.name,
      className: `role-icon role-icon-${size}`
    });
    return img;
  }
  
  // Fallback to text if OverFast not loaded
  const fallbackLabel = role === 'tank' ? 'T' : role === 'support' ? 'S' : 'D';
  return createElement('span', { className: `role-badge-text role-${normalizedRole}` }, fallbackLabel);
}

/**
 * Creates a hero icon element
 * @param {string} heroNameOrKey - Hero name or key
 * @param {Object} [options]
 * @param {string} [options.size='sm'] - Icon size ('sm', 'md', 'lg')
 * @returns {HTMLElement|null}
 */
export function createHeroIcon(heroNameOrKey, options = {}) {
  const { size = 'sm' } = options;
  const heroData = getHero(heroNameOrKey);
  
  if (heroData && isOverfastLoaded()) {
    const img = createElement('img', {
      src: heroData.portrait,
      alt: heroData.name,
      title: heroData.name,
      className: `hero-icon hero-icon-${size}`
    });
    return img;
  }
  
  return null;
}

/**
 * Creates hero icons from a comma-separated string
 * @param {string} heroesString - e.g., "Ana, D.Va, Soldier: 76"
 * @param {Object} [options]
 * @param {string} [options.size='sm'] - Icon size
 * @param {number} [options.maxIcons=5] - Maximum icons to show
 * @returns {HTMLElement}
 */
export function createHeroIconsContainer(heroesString, options = {}) {
  const { size = 'sm', maxIcons = 5 } = options;
  const container = createElement('span', { className: 'hero-icons-container' });
  
  if (!heroesString || !isOverfastLoaded()) {
    // Fallback to text
    container.textContent = heroesString || '';
    return container;
  }
  
  const heroes = parseHeroesString(heroesString);
  const displayHeroes = heroes.slice(0, maxIcons);
  const remaining = heroes.length - maxIcons;
  
  for (const hero of displayHeroes) {
    const img = createElement('img', {
      src: hero.portrait,
      alt: hero.name,
      title: hero.name,
      className: `hero-icon hero-icon-${size}`
    });
    container.appendChild(img);
  }
  
  if (remaining > 0) {
    const more = createElement('span', { className: 'hero-icons-more' }, `+${remaining}`);
    container.appendChild(more);
  }
  
  // If no heroes were matched, show original text
  if (displayHeroes.length === 0 && heroesString) {
    container.textContent = heroesString;
  }
  
  return container;
}

/**
 * Creates a rank tier icon with rating
 * @param {number|string} rating - Numeric rating
 * @param {Object} [options]
 * @param {boolean} [options.showNumber=true] - Show rating number
 * @param {string} [options.size='sm'] - Icon size ('sm', 'md', 'lg')
 * @returns {HTMLElement}
 */
export function createRankBadge(rating, options = {}) {
  const { showNumber = true, size = 'sm' } = options;
  const rankInfo = getRankFromRating(rating);
  
  // Add tier class for styling
  const tierClass = rankInfo ? `rank-${rankInfo.tier}` : '';
  const container = createElement('span', { 
    className: `rank-badge rank-badge-${size} ${tierClass}`.trim() 
  });
  
  if (rankInfo && rankInfo.tierIcon) {
    const img = createElement('img', {
      src: rankInfo.tierIcon,
      alt: rankInfo.label,
      title: rankInfo.label,
      className: `rank-icon rank-icon-${size}`
    });
    container.appendChild(img);
  }
  
  if (showNumber) {
    const numSpan = createElement('span', { 
      className: 'rank-number'
    }, String(rating));
    container.appendChild(numSpan);
  }
  
  return container;
}


