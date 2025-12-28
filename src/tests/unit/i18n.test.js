import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock translations for testing
const mockTranslations = {
  en: {
    app: { title: 'OverDraft' },
    settings: { title: 'Settings', notConfigured: 'Not configured' },
    status: {
      justNow: 'just now',
      secondsAgo: '{count}s ago',
      minutesAgo: '{count}m ago',
      hoursAgo: '{count}h ago',
      updated: 'Updated {time}'
    },
    errors: { notFound: 'Not found' },
    columns: {
      nickname: 'Nickname',
      role: 'Role',
      rating: 'Rating',
      heroes: 'Heroes'
    },
    validation: {
      urlValid: '✓ URL valid (gid: {gid})',
      fileValid: '✓ {columns} columns, {rows} rows'
    }
  },
  ru: {
    app: { title: 'OverDraft' },
    settings: { title: 'Настройки', notConfigured: 'Не настроено' },
    status: {
      justNow: 'только что',
      secondsAgo: '{count}с назад',
      minutesAgo: '{count}м назад',
      hoursAgo: '{count}ч назад',
      updated: 'Обновлено {time}'
    },
    errors: { notFound: 'Не найдено' },
    columns: {
      nickname: 'Ник игрока',
      role: 'Роль',
      rating: 'Рейтинг',
      heroes: 'Герои'
    },
    validation: {
      urlValid: '✓ URL корректный (gid: {gid})',
      fileValid: '✓ {columns} колонок, {rows} строк'
    }
  }
};

describe('i18n module', () => {
  let mockStorage;

  beforeEach(async () => {
    // Reset modules to get fresh i18n state
    vi.resetModules();

    // Mock localStorage
    mockStorage = {};
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key) => mockStorage[key] || null),
      setItem: vi.fn((key, value) => { mockStorage[key] = value; }),
      removeItem: vi.fn((key) => { delete mockStorage[key]; })
    });

    // Mock fetch to return translations
    vi.stubGlobal('fetch', vi.fn((url) => {
      const lang = url.includes('en.json') ? 'en' : 'ru';
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockTranslations[lang])
      });
    }));

    // Mock navigator.language
    vi.stubGlobal('navigator', { language: 'ru-RU' });

    // Mock document for translatePage
    vi.stubGlobal('document', {
      querySelectorAll: vi.fn(() => []),
      documentElement: { lang: 'en' }
    });
  });

  describe('init()', () => {
    it('initializes with stored language preference', async () => {
      mockStorage['overdraft_language'] = 'en';

      const { init, getLanguage } = await import('../../js/i18n/index.js');
      await init();

      expect(getLanguage()).toBe('en');
    });

    it('detects browser language when no stored preference', async () => {
      const { init, getLanguage } = await import('../../js/i18n/index.js');
      await init();

      expect(getLanguage()).toBe('ru');
    });

    it('detects English from browser language', async () => {
      vi.stubGlobal('navigator', { language: 'en-US' });

      const { init, getLanguage } = await import('../../js/i18n/index.js');
      await init();

      expect(getLanguage()).toBe('en');
    });

    it('defaults to Russian for unsupported browser languages', async () => {
      vi.stubGlobal('navigator', { language: 'de-DE' });

      const { init, getLanguage } = await import('../../js/i18n/index.js');
      await init();

      expect(getLanguage()).toBe('ru');
    });

    it('only initializes once', async () => {
      const { init, isInitialized } = await import('../../js/i18n/index.js');
      
      await init();
      expect(isInitialized()).toBe(true);
      
      // Second call should be a no-op
      await init();
      expect(isInitialized()).toBe(true);
      
      // fetch should only be called once
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('t()', () => {
    it('returns translated string by key', async () => {
      mockStorage['overdraft_language'] = 'en';

      const { init, t } = await import('../../js/i18n/index.js');
      await init();

      expect(t('settings.title')).toBe('Settings');
    });

    it('returns translated string for Russian', async () => {
      mockStorage['overdraft_language'] = 'ru';

      const { init, t } = await import('../../js/i18n/index.js');
      await init();

      expect(t('settings.title')).toBe('Настройки');
    });

    it('returns nested keys correctly', async () => {
      mockStorage['overdraft_language'] = 'en';

      const { init, t } = await import('../../js/i18n/index.js');
      await init();

      expect(t('columns.nickname')).toBe('Nickname');
      expect(t('columns.role')).toBe('Role');
      expect(t('columns.rating')).toBe('Rating');
      expect(t('columns.heroes')).toBe('Heroes');
    });

    it('interpolates single parameter', async () => {
      mockStorage['overdraft_language'] = 'en';

      const { init, t } = await import('../../js/i18n/index.js');
      await init();

      expect(t('status.secondsAgo', { count: 30 })).toBe('30s ago');
      expect(t('status.minutesAgo', { count: 5 })).toBe('5m ago');
      expect(t('status.hoursAgo', { count: 2 })).toBe('2h ago');
    });

    it('interpolates multiple parameters', async () => {
      mockStorage['overdraft_language'] = 'en';

      const { init, t } = await import('../../js/i18n/index.js');
      await init();

      expect(t('validation.fileValid', { columns: 5, rows: 10 })).toBe('✓ 5 columns, 10 rows');
      expect(t('validation.urlValid', { gid: '123' })).toBe('✓ URL valid (gid: 123)');
    });

    it('interpolates in Russian', async () => {
      mockStorage['overdraft_language'] = 'ru';

      const { init, t } = await import('../../js/i18n/index.js');
      await init();

      expect(t('status.secondsAgo', { count: 30 })).toBe('30с назад');
      expect(t('status.updated', { time: '5с назад' })).toBe('Обновлено 5с назад');
    });

    it('returns key when translation is missing', async () => {
      mockStorage['overdraft_language'] = 'en';

      const { init, t } = await import('../../js/i18n/index.js');
      await init();

      expect(t('nonexistent.key')).toBe('nonexistent.key');
      expect(t('deeply.nested.missing.key')).toBe('deeply.nested.missing.key');
    });

    it('keeps unmatched placeholders when params missing', async () => {
      mockStorage['overdraft_language'] = 'en';

      const { init, t } = await import('../../js/i18n/index.js');
      await init();

      expect(t('status.updated')).toBe('Updated {time}');
      expect(t('status.secondsAgo')).toBe('{count}s ago');
    });
  });

  describe('setLanguage()', () => {
    it('changes language and saves to localStorage', async () => {
      mockStorage['overdraft_language'] = 'ru';

      const { init, setLanguage, getLanguage } = await import('../../js/i18n/index.js');
      await init();

      await setLanguage('en');

      expect(getLanguage()).toBe('en');
      expect(mockStorage['overdraft_language']).toBe('en');
    });

    it('loads new translations when language changes', async () => {
      mockStorage['overdraft_language'] = 'ru';

      const { init, setLanguage, t } = await import('../../js/i18n/index.js');
      await init();

      expect(t('settings.title')).toBe('Настройки');

      await setLanguage('en');

      expect(t('settings.title')).toBe('Settings');
    });

    it('rejects invalid languages', async () => {
      mockStorage['overdraft_language'] = 'ru';

      const { init, setLanguage, getLanguage } = await import('../../js/i18n/index.js');
      await init();

      await setLanguage('de');

      expect(getLanguage()).toBe('ru'); // unchanged
    });

    it('does nothing when setting same language', async () => {
      mockStorage['overdraft_language'] = 'en';

      const { init, setLanguage, getLanguage } = await import('../../js/i18n/index.js');
      await init();
      
      const fetchCallsBefore = fetch.mock.calls.length;
      
      await setLanguage('en');

      expect(getLanguage()).toBe('en');
      // Should not fetch again
      expect(fetch.mock.calls.length).toBe(fetchCallsBefore);
    });
  });

  describe('toggleLanguage()', () => {
    it('switches from Russian to English', async () => {
      mockStorage['overdraft_language'] = 'ru';

      const { init, toggleLanguage, getLanguage } = await import('../../js/i18n/index.js');
      await init();

      await toggleLanguage();

      expect(getLanguage()).toBe('en');
    });

    it('switches from English to Russian', async () => {
      mockStorage['overdraft_language'] = 'en';

      const { init, toggleLanguage, getLanguage } = await import('../../js/i18n/index.js');
      await init();

      await toggleLanguage();

      expect(getLanguage()).toBe('ru');
    });

    it('updates translations after toggle', async () => {
      mockStorage['overdraft_language'] = 'ru';

      const { init, toggleLanguage, t } = await import('../../js/i18n/index.js');
      await init();

      expect(t('settings.notConfigured')).toBe('Не настроено');

      await toggleLanguage();

      expect(t('settings.notConfigured')).toBe('Not configured');
    });
  });

  describe('subscribe()', () => {
    it('calls subscribers when language changes', async () => {
      mockStorage['overdraft_language'] = 'ru';

      const { init, setLanguage, subscribe } = await import('../../js/i18n/index.js');
      await init();

      const callback = vi.fn();
      subscribe(callback);

      await setLanguage('en');

      expect(callback).toHaveBeenCalledWith('en');
    });

    it('calls multiple subscribers', async () => {
      mockStorage['overdraft_language'] = 'ru';

      const { init, setLanguage, subscribe } = await import('../../js/i18n/index.js');
      await init();

      const callback1 = vi.fn();
      const callback2 = vi.fn();
      subscribe(callback1);
      subscribe(callback2);

      await setLanguage('en');

      expect(callback1).toHaveBeenCalledWith('en');
      expect(callback2).toHaveBeenCalledWith('en');
    });

    it('returns unsubscribe function', async () => {
      mockStorage['overdraft_language'] = 'ru';

      const { init, setLanguage, subscribe } = await import('../../js/i18n/index.js');
      await init();

      const callback = vi.fn();
      const unsubscribe = subscribe(callback);

      unsubscribe();
      await setLanguage('en');

      expect(callback).not.toHaveBeenCalled();
    });

    it('does not call subscribers when setting same language', async () => {
      mockStorage['overdraft_language'] = 'en';

      const { init, setLanguage, subscribe } = await import('../../js/i18n/index.js');
      await init();

      const callback = vi.fn();
      subscribe(callback);

      await setLanguage('en');

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('getLanguage()', () => {
    it('returns current language', async () => {
      mockStorage['overdraft_language'] = 'en';

      const { init, getLanguage } = await import('../../js/i18n/index.js');
      await init();

      expect(getLanguage()).toBe('en');
    });

    it('returns ru by default before init', async () => {
      const { getLanguage } = await import('../../js/i18n/index.js');
      
      // Default value before init
      expect(getLanguage()).toBe('ru');
    });
  });
});

