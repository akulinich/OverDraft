import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock i18n before importing components
vi.mock('../../js/i18n/index.js', () => ({
  t: (key) => key,
  isInitialized: () => true
}));

// Mock ranks utility
vi.mock('../../js/utils/ranks.js', () => ({
  getRankFromRating: () => null
}));

// Mock overfast API with hoisted mock functions
const mockGetRole = vi.fn(() => null);
const mockGetHero = vi.fn(() => null);
const mockParseHeroesString = vi.fn(() => []);
const mockIsLoaded = vi.fn(() => false);

vi.mock('../../js/api/overfast.js', () => ({
  getRole: (...args) => mockGetRole(...args),
  getHero: (...args) => mockGetHero(...args),
  parseHeroesString: (...args) => mockParseHeroesString(...args),
  isLoaded: (...args) => mockIsLoaded(...args)
}));

import { createElement, createHeroIconsContainer } from '../../js/ui/components.js';

describe('createElement', () => {
  describe('basic functionality', () => {
    it('creates element with specified tag', () => {
      const el = createElement('div');
      expect(el.tagName).toBe('DIV');
    });

    it('creates element with className', () => {
      const el = createElement('div', { className: 'my-class' });
      expect(el.className).toBe('my-class');
    });

    it('creates element with text content', () => {
      const el = createElement('span', {}, 'Hello');
      expect(el.textContent).toBe('Hello');
    });

    it('creates element with child element', () => {
      const child = createElement('span', {}, 'Child');
      const parent = createElement('div', {}, child);
      expect(parent.children.length).toBe(1);
      expect(parent.children[0].textContent).toBe('Child');
    });

    it('creates element with multiple children', () => {
      const child1 = createElement('span', {}, 'One');
      const child2 = createElement('span', {}, 'Two');
      const parent = createElement('div', {}, [child1, child2]);
      expect(parent.children.length).toBe(2);
    });

    it('creates element with dataset attributes', () => {
      const el = createElement('div', { dataset: { columnId: 'col_123', type: 'text' } });
      expect(el.dataset.columnId).toBe('col_123');
      expect(el.dataset.type).toBe('text');
    });

    it('creates element with regular attributes', () => {
      const el = createElement('input', { type: 'text', name: 'username' });
      expect(el.getAttribute('type')).toBe('text');
      expect(el.getAttribute('name')).toBe('username');
    });
  });

  describe('boolean properties handling', () => {
    it('sets checked property to true on checkbox', () => {
      const el = createElement('input', { type: 'checkbox', checked: true });
      expect(el.checked).toBe(true);
    });

    it('sets checked property to false on checkbox', () => {
      const el = createElement('input', { type: 'checkbox', checked: false });
      expect(el.checked).toBe(false);
    });

    it('sets disabled property to true', () => {
      const el = createElement('input', { type: 'text', disabled: true });
      expect(el.disabled).toBe(true);
    });

    it('sets disabled property to false', () => {
      const el = createElement('input', { type: 'text', disabled: false });
      expect(el.disabled).toBe(false);
    });

    it('sets selected property to true on option', () => {
      const el = createElement('option', { selected: true }, 'Option 1');
      expect(el.selected).toBe(true);
    });

    it('sets readonly property to true on input', () => {
      const el = createElement('input', { type: 'text', readonly: true });
      expect(el.readOnly).toBe(true);
    });

    it('sets required property to true on input', () => {
      const el = createElement('input', { type: 'text', required: true });
      expect(el.required).toBe(true);
    });

    it('sets multiple property to true on select', () => {
      const el = createElement('select', { multiple: true });
      expect(el.multiple).toBe(true);
    });

    it('sets autofocus property to true on input', () => {
      const el = createElement('input', { type: 'text', autofocus: true });
      expect(el.autofocus).toBe(true);
    });

    it('handles truthy values as true for boolean props', () => {
      const el = createElement('input', { type: 'checkbox', checked: 1 });
      expect(el.checked).toBe(true);
    });

    it('handles falsy values as false for boolean props', () => {
      const el = createElement('input', { type: 'checkbox', checked: 0 });
      expect(el.checked).toBe(false);
    });
  });

  describe('checkbox with dataset', () => {
    it('creates functional checkbox with dataset and checked state', () => {
      const el = createElement('input', {
        type: 'checkbox',
        className: 'teams-display-checkbox',
        checked: true,
        disabled: false,
        dataset: { columnId: 'col_role' }
      });

      expect(el.type).toBe('checkbox');
      expect(el.className).toBe('teams-display-checkbox');
      expect(el.checked).toBe(true);
      expect(el.disabled).toBe(false);
      expect(el.dataset.columnId).toBe('col_role');
    });

    it('creates disabled checkbox that cannot be checked', () => {
      const el = createElement('input', {
        type: 'checkbox',
        checked: true,
        disabled: true
      });

      expect(el.checked).toBe(true);
      expect(el.disabled).toBe(true);
    });
  });

  describe('event handlers', () => {
    it('adds click event listener', () => {
      const handler = vi.fn();
      const el = createElement('button', { onClick: handler });
      
      el.click();
      
      expect(handler).toHaveBeenCalled();
    });

    it('adds change event listener', () => {
      const handler = vi.fn();
      const el = createElement('input', { type: 'text', onChange: handler });
      
      el.dispatchEvent(new Event('change'));
      
      expect(handler).toHaveBeenCalled();
    });
  });
});


describe('createHeroIconsContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('when overfast is not loaded', () => {
    beforeEach(() => {
      mockIsLoaded.mockReturnValue(false);
    });

    it('returns container with text content when given a string', () => {
      const container = createHeroIconsContainer('Ana, D.Va');
      
      expect(container.tagName).toBe('SPAN');
      expect(container.className).toBe('hero-icons-container');
      expect(container.textContent).toBe('Ana, D.Va');
    });

    it('returns empty container when given empty string', () => {
      const container = createHeroIconsContainer('');
      
      expect(container.textContent).toBe('');
    });

    it('returns empty container when given null', () => {
      const container = createHeroIconsContainer(null);
      
      expect(container.textContent).toBe('');
    });
  });

  describe('when overfast is loaded', () => {
    beforeEach(() => {
      mockIsLoaded.mockReturnValue(true);
    });

    it('calls parseHeroesString with the original string value', () => {
      const heroesString = 'Ana, D.Va, Soldier: 76';
      mockParseHeroesString.mockReturnValue([]);
      
      createHeroIconsContainer(heroesString);
      
      // Verify parseHeroesString is called with the string, not an array
      expect(mockParseHeroesString).toHaveBeenCalledWith(heroesString);
      expect(mockParseHeroesString).toHaveBeenCalledTimes(1);
    });

    it('creates hero icon images when heroes are parsed', () => {
      const mockHeroes = [
        { key: 'ana', name: 'Ana', portrait: '/icons/heroes/ana.png' },
        { key: 'dva', name: 'D.Va', portrait: '/icons/heroes/dva.png' }
      ];
      mockParseHeroesString.mockReturnValue(mockHeroes);
      
      const container = createHeroIconsContainer('Ana, D.Va');
      
      const images = container.querySelectorAll('img.hero-icon');
      expect(images.length).toBe(2);
      expect(images[0].getAttribute('src')).toBe('/icons/heroes/ana.png');
      expect(images[1].getAttribute('src')).toBe('/icons/heroes/dva.png');
    });

    it('respects maxIcons option', () => {
      const mockHeroes = [
        { key: 'ana', name: 'Ana', portrait: '/icons/heroes/ana.png' },
        { key: 'dva', name: 'D.Va', portrait: '/icons/heroes/dva.png' },
        { key: 'mercy', name: 'Mercy', portrait: '/icons/heroes/mercy.png' }
      ];
      mockParseHeroesString.mockReturnValue(mockHeroes);
      
      const container = createHeroIconsContainer('Ana, D.Va, Mercy', { maxIcons: 2 });
      
      const images = container.querySelectorAll('img.hero-icon');
      expect(images.length).toBe(2);
      
      const moreIndicator = container.querySelector('.hero-icons-more');
      expect(moreIndicator).not.toBeNull();
      expect(moreIndicator.textContent).toBe('+1');
    });

    it('falls back to text when no heroes are matched', () => {
      mockParseHeroesString.mockReturnValue([]);
      
      const container = createHeroIconsContainer('Unknown Hero');
      
      expect(container.textContent).toBe('Unknown Hero');
      expect(container.querySelectorAll('img').length).toBe(0);
    });

    it('does NOT accept pre-parsed hero array - expects string input', () => {
      // This test documents the fix: createHeroIconsContainer expects a string,
      // and internally calls parseHeroesString. Passing a pre-parsed array
      // would be incorrect usage.
      const heroesString = 'Ana, Mercy';
      mockParseHeroesString.mockReturnValue([
        { key: 'ana', name: 'Ana', portrait: '/icons/heroes/ana.png' }
      ]);
      
      createHeroIconsContainer(heroesString);
      
      // The function should receive a string, not an array
      const callArg = mockParseHeroesString.mock.calls[0][0];
      expect(typeof callArg).toBe('string');
      expect(Array.isArray(callArg)).toBe(false);
    });
  });
});
