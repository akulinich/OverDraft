import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('Translation files integrity', () => {
  const enTranslations = JSON.parse(
    readFileSync(join(__dirname, '../../public/locales/en.json'), 'utf-8')
  );
  const ruTranslations = JSON.parse(
    readFileSync(join(__dirname, '../../public/locales/ru.json'), 'utf-8')
  );

  /**
   * Recursively extracts all keys from an object
   * @param {object} obj
   * @param {string} prefix
   * @returns {string[]}
   */
  function getAllKeys(obj, prefix = '') {
    const keys = [];
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'object' && value !== null) {
        keys.push(...getAllKeys(value, fullKey));
      } else {
        keys.push(fullKey);
      }
    }
    return keys;
  }

  /**
   * Gets value by dot-notation key
   * @param {object} obj
   * @param {string} key
   * @returns {string}
   */
  function getValue(obj, key) {
    return key.split('.').reduce((o, k) => o?.[k], obj);
  }

  /**
   * Extracts interpolation parameters from a string
   * @param {string} str
   * @returns {string[]}
   */
  function getInterpolationParams(str) {
    if (typeof str !== 'string') return [];
    const matches = str.match(/\{(\w+)\}/g) || [];
    return matches.map(m => m.slice(1, -1)).sort();
  }

  describe('Key consistency', () => {
    it('has same keys in both language files', () => {
      const enKeys = getAllKeys(enTranslations).sort();
      const ruKeys = getAllKeys(ruTranslations).sort();

      expect(enKeys).toEqual(ruKeys);
    });

    it('English file has all expected top-level sections', () => {
      const expectedSections = [
        'app', 'header', 'setup', 'settings', 'columnMapping',
        'teamsLayout', 'filters', 'players', 'teams', 'roles',
        'columns', 'status', 'errors', 'validation', 'export', 'language'
      ];

      for (const section of expectedSections) {
        expect(enTranslations, `Missing section: ${section}`).toHaveProperty(section);
      }
    });

    it('Russian file has all expected top-level sections', () => {
      const expectedSections = [
        'app', 'header', 'setup', 'settings', 'columnMapping',
        'teamsLayout', 'filters', 'players', 'teams', 'roles',
        'columns', 'status', 'errors', 'validation', 'export', 'language'
      ];

      for (const section of expectedSections) {
        expect(ruTranslations, `Missing section: ${section}`).toHaveProperty(section);
      }
    });
  });

  describe('Value validation', () => {
    it('has no empty translation values in English', () => {
      const enKeys = getAllKeys(enTranslations);

      for (const key of enKeys) {
        const value = getValue(enTranslations, key);
        expect(value, `Empty value for key: ${key}`).not.toBe('');
      }
    });

    it('has no empty translation values in Russian', () => {
      const ruKeys = getAllKeys(ruTranslations);

      for (const key of ruKeys) {
        const value = getValue(ruTranslations, key);
        expect(value, `Empty value for key: ${key}`).not.toBe('');
      }
    });

    it('all values are strings', () => {
      const enKeys = getAllKeys(enTranslations);

      for (const key of enKeys) {
        const enValue = getValue(enTranslations, key);
        const ruValue = getValue(ruTranslations, key);

        expect(typeof enValue, `EN key ${key} is not a string`).toBe('string');
        expect(typeof ruValue, `RU key ${key} is not a string`).toBe('string');
      }
    });
  });

  describe('Interpolation parameters', () => {
    it('has consistent interpolation parameters between languages', () => {
      const enKeys = getAllKeys(enTranslations);

      for (const key of enKeys) {
        const enValue = getValue(enTranslations, key);
        const ruValue = getValue(ruTranslations, key);

        const enParams = getInterpolationParams(enValue);
        const ruParams = getInterpolationParams(ruValue);

        expect(enParams, `Mismatched params for key: ${key}`).toEqual(ruParams);
      }
    });

    it('status messages have correct parameters', () => {
      expect(getInterpolationParams(enTranslations.status.secondsAgo)).toEqual(['count']);
      expect(getInterpolationParams(enTranslations.status.minutesAgo)).toEqual(['count']);
      expect(getInterpolationParams(enTranslations.status.hoursAgo)).toEqual(['count']);
      expect(getInterpolationParams(enTranslations.status.updated)).toEqual(['time']);
    });

    it('validation messages have correct parameters', () => {
      expect(getInterpolationParams(enTranslations.validation.urlValid)).toEqual(['gid']);
      expect(getInterpolationParams(enTranslations.validation.fileValid)).toEqual(['columns', 'rows']);
    });

    it('error messages have correct parameters', () => {
      expect(getInterpolationParams(enTranslations.errors.importFailed)).toEqual(['error']);
      expect(getInterpolationParams(enTranslations.columnMapping.columnNotNumeric)).toEqual(['column']);
    });
  });

  describe('Translation quality', () => {
    it('does not have untranslated English strings in Russian file', () => {
      // Keys that should definitely be different between languages
      const keysToCheck = [
        'settings.title',
        'setup.title',
        'setup.connect',
        'columnMapping.title',
        'teamsLayout.title',
        'errors.notFound',
        'errors.network',
        'players.panelTitle',
        'teams.notConfigured',
        'roles.tank',
        'roles.dps',
        'roles.support'
      ];

      for (const key of keysToCheck) {
        const enValue = getValue(enTranslations, key);
        const ruValue = getValue(ruTranslations, key);

        // Skip if key doesn't exist
        if (!enValue || !ruValue) continue;

        expect(ruValue, `Key "${key}" might not be translated`).not.toBe(enValue);
      }
    });

    it('language codes are correct', () => {
      expect(enTranslations.language.ru).toBe('RU');
      expect(enTranslations.language.en).toBe('EN');
      expect(ruTranslations.language.ru).toBe('RU');
      expect(ruTranslations.language.en).toBe('EN');
    });

    it('app title is consistent', () => {
      // App title should be the same in both languages (it's a brand name)
      expect(enTranslations.app.title).toBe(ruTranslations.app.title);
    });
  });

  describe('JSON structure', () => {
    it('has valid JSON structure for English', () => {
      expect(() => JSON.stringify(enTranslations)).not.toThrow();
    });

    it('has valid JSON structure for Russian', () => {
      expect(() => JSON.stringify(ruTranslations)).not.toThrow();
    });

    it('files are not empty', () => {
      expect(Object.keys(enTranslations).length).toBeGreaterThan(0);
      expect(Object.keys(ruTranslations).length).toBeGreaterThan(0);
    });
  });

  describe('Specific translations', () => {
    it('has all role translations', () => {
      expect(enTranslations.roles.tank).toBe('Tank');
      expect(enTranslations.roles.dps).toBe('DPS');
      expect(enTranslations.roles.support).toBe('Support');

      expect(ruTranslations.roles.tank).toBe('Танк');
      expect(ruTranslations.roles.dps).toBe('ДД');
      expect(ruTranslations.roles.support).toBe('Саппорт');
    });

    it('has all column translations', () => {
      expect(enTranslations.columns.nickname).toBe('Nickname');
      expect(enTranslations.columns.role).toBe('Role');
      expect(enTranslations.columns.rating).toBe('Rating');
      expect(enTranslations.columns.heroes).toBe('Heroes');

      expect(ruTranslations.columns.nickname).toBe('Ник игрока');
      expect(ruTranslations.columns.role).toBe('Роль');
      expect(ruTranslations.columns.rating).toBe('Рейтинг');
      expect(ruTranslations.columns.heroes).toBe('Герои');
    });

    it('has tab translations', () => {
      expect(enTranslations.header.players).toBe('Players');
      expect(enTranslations.header.teams).toBe('Teams');

      expect(ruTranslations.header.players).toBe('Игроки');
      expect(ruTranslations.header.teams).toBe('Команды');
    });
  });
});





