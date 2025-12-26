/**
 * UI component utilities
 */

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


