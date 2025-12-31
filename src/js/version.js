/**
 * Application version information.
 * Values are injected at build time by Vite from version.txt.
 */

// These globals are defined in vite.config.js
export const APP_VERSION = __APP_VERSION__;
export const BUILD_TIME = __BUILD_TIME__;

/**
 * Returns formatted version string for display.
 * @returns {string} Version string (e.g., "v0.1.1")
 */
export function getVersionString() {
  return `v${APP_VERSION}`;
}

/**
 * Returns formatted build info for display.
 * @returns {string} Build info string
 */
export function getBuildInfo() {
  const buildDate = new Date(BUILD_TIME);
  const formatted = buildDate.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  return `Build: ${formatted}`;
}

