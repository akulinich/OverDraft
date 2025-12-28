/**
 * Internationalization (i18n) module
 * Provides translation support for Russian and English languages
 */

import { loadLanguage, saveLanguage } from '../storage/persistence.js';

/** @type {'ru'|'en'} */
let currentLanguage = 'ru';

/** @type {Object<string, any>} */
let translations = {};

/** @type {boolean} */
let initialized = false;

/** @type {Set<function>} */
const subscribers = new Set();

/**
 * Detects the preferred language from browser settings
 * @returns {'ru'|'en'}
 */
function detectBrowserLanguage() {
  const browserLang = navigator.language || navigator.userLanguage || '';
  const primary = browserLang.split('-')[0].toLowerCase();
  
  if (primary === 'ru') return 'ru';
  if (primary === 'en') return 'en';
  
  // Default to Russian
  return 'ru';
}

/**
 * Loads translation file for the specified language
 * @param {'ru'|'en'} lang
 * @returns {Promise<Object>}
 */
async function loadTranslations(lang) {
  try {
    const response = await fetch(`./public/locales/${lang}.json`);
    if (!response.ok) {
      throw new Error(`Failed to load ${lang}.json: ${response.status}`);
    }
    return await response.json();
  } catch (err) {
    console.error(`[i18n] Failed to load translations for ${lang}:`, err);
    return {};
  }
}

/**
 * Gets a nested value from an object using dot notation
 * @param {Object} obj
 * @param {string} path - Dot-separated path (e.g., "settings.title")
 * @returns {string|undefined}
 */
function getNestedValue(obj, path) {
  const keys = path.split('.');
  let result = obj;
  
  for (const key of keys) {
    if (result === null || result === undefined) return undefined;
    result = result[key];
  }
  
  return typeof result === 'string' ? result : undefined;
}

/**
 * Replaces placeholders in a string with provided values
 * Placeholders use {name} syntax
 * @param {string} str
 * @param {Object<string, string|number>} [params]
 * @returns {string}
 */
function interpolate(str, params) {
  if (!params) return str;
  
  return str.replace(/\{(\w+)\}/g, (match, key) => {
    return params.hasOwnProperty(key) ? String(params[key]) : match;
  });
}

/**
 * Initializes the i18n module
 * Loads stored language preference or detects from browser
 * @returns {Promise<void>}
 */
export async function init() {
  if (initialized) return;
  
  // Load stored language or detect from browser
  const storedLang = loadLanguage();
  currentLanguage = storedLang || detectBrowserLanguage();
  
  // Load translations
  translations = await loadTranslations(currentLanguage);
  
  initialized = true;
  
  // Translate the page
  translatePage();
}

/**
 * Gets a translated string by key
 * @param {string} key - Dot-separated key (e.g., "settings.title")
 * @param {Object<string, string|number>} [params] - Interpolation parameters
 * @returns {string} - Translated string or the key if not found
 */
export function t(key, params) {
  const value = getNestedValue(translations, key);
  
  if (value === undefined) {
    console.warn(`[i18n] Missing translation for key: ${key}`);
    return key;
  }
  
  return interpolate(value, params);
}

/**
 * Gets the current language
 * @returns {'ru'|'en'}
 */
export function getLanguage() {
  return currentLanguage;
}

/**
 * Sets the current language and reloads translations
 * @param {'ru'|'en'} lang
 * @returns {Promise<void>}
 */
export async function setLanguage(lang) {
  if (lang !== 'ru' && lang !== 'en') {
    console.error(`[i18n] Invalid language: ${lang}`);
    return;
  }
  
  if (lang === currentLanguage && initialized) return;
  
  currentLanguage = lang;
  saveLanguage(lang);
  
  // Load new translations
  translations = await loadTranslations(lang);
  
  // Translate the page
  translatePage();
  
  // Notify subscribers
  notifySubscribers();
}

/**
 * Toggles between Russian and English
 * @returns {Promise<void>}
 */
export async function toggleLanguage() {
  const newLang = currentLanguage === 'ru' ? 'en' : 'ru';
  await setLanguage(newLang);
}

/**
 * Translates all DOM elements with data-i18n attribute
 */
export function translatePage() {
  // Translate elements with data-i18n attribute
  const elements = document.querySelectorAll('[data-i18n]');
  
  for (const el of elements) {
    const key = el.getAttribute('data-i18n');
    if (!key) continue;
    
    const translation = getNestedValue(translations, key);
    if (translation === undefined) continue;
    
    // Check if the element has data-i18n-html attribute for HTML content
    if (el.hasAttribute('data-i18n-html')) {
      el.innerHTML = translation;
    } else {
      el.textContent = translation;
    }
  }
  
  // Translate elements with data-i18n-placeholder attribute
  const placeholderElements = document.querySelectorAll('[data-i18n-placeholder]');
  
  for (const el of placeholderElements) {
    const key = el.getAttribute('data-i18n-placeholder');
    if (!key) continue;
    
    const translation = getNestedValue(translations, key);
    if (translation === undefined) continue;
    
    el.setAttribute('placeholder', translation);
  }
  
  // Translate elements with data-i18n-title attribute
  const titleElements = document.querySelectorAll('[data-i18n-title]');
  
  for (const el of titleElements) {
    const key = el.getAttribute('data-i18n-title');
    if (!key) continue;
    
    const translation = getNestedValue(translations, key);
    if (translation === undefined) continue;
    
    el.setAttribute('title', translation);
  }
  
  // Update html lang attribute
  document.documentElement.lang = currentLanguage;
}

/**
 * Subscribe to language changes
 * @param {function} callback - Called when language changes
 * @returns {function} - Unsubscribe function
 */
export function subscribe(callback) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

/**
 * Notifies all subscribers of a language change
 */
function notifySubscribers() {
  for (const callback of subscribers) {
    try {
      callback(currentLanguage);
    } catch (err) {
      console.error('[i18n] Subscriber error:', err);
    }
  }
}

/**
 * Checks if the i18n module is initialized
 * @returns {boolean}
 */
export function isInitialized() {
  return initialized;
}

