import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock i18n before importing components
vi.mock('../../js/i18n/index.js', () => ({
  t: (key) => key,
  isInitialized: () => true
}));

// Mock overfast API
vi.mock('../../js/api/overfast.js', () => ({
  getRole: () => null,
  getHero: () => null,
  parseHeroesString: () => [],
  isLoaded: () => false
}));

// Mock ranks utility
vi.mock('../../js/utils/ranks.js', () => ({
  getRankFromRating: () => null
}));

import { createElement } from '../../js/ui/components.js';

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

