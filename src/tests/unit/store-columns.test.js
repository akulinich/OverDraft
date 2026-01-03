import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = value; },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();

Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Mock dependencies before importing store
vi.mock('../../js/storage/persistence.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadConfiguredSheets: vi.fn(() => []),
    loadTeamsSheet: vi.fn(() => null),
    loadSettings: vi.fn(() => ({ theme: 'dark' })),
    saveConfiguredSheets: vi.fn(),
    saveSettings: vi.fn(),
    saveTeamsSheet: vi.fn(),
    loadColumnMapping: vi.fn(() => null),
    saveColumnMapping: vi.fn(),
    loadColumnsConfiguration: vi.fn(() => null),
    saveColumnsConfiguration: vi.fn(),
    removeColumnsConfiguration: vi.fn(),
    loadTeamsDisplayConfig: vi.fn(() => null),
    saveTeamsDisplayConfig: vi.fn(),
    removeTeamsDisplayConfig: vi.fn()
  };
});

import {
  createColumnConfig,
  getColumnsConfiguration,
  setColumnsConfiguration,
  getOrderedColumnsForSheet,
  getNameColumn,
  getTeamsDisplayConfiguration,
  setTeamsDisplayConfiguration
} from '../../js/state/store.js';

import * as persistence from '../../js/storage/persistence.js';

describe('createColumnConfig', () => {
  it('creates a column config with all required fields', () => {
    const config = createColumnConfig('My Column', 'SheetCol', 'text', 0);
    
    expect(config.id).toBeDefined();
    expect(config.id).toMatch(/^col_/);
    expect(config.displayName).toBe('My Column');
    expect(config.sheetColumn).toBe('SheetCol');
    expect(config.columnType).toBe('text');
    expect(config.order).toBe(0);
  });
  
  it('creates unique IDs for each call', () => {
    const config1 = createColumnConfig('A', 'A', 'text', 0);
    const config2 = createColumnConfig('B', 'B', 'text', 1);
    
    expect(config1.id).not.toBe(config2.id);
  });
});

describe('getColumnsConfiguration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  it('calls loadColumnsConfiguration from persistence', () => {
    getColumnsConfiguration('test_key');
    
    expect(persistence.loadColumnsConfiguration).toHaveBeenCalledWith('test_key');
  });
});

describe('setColumnsConfiguration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  it('calls saveColumnsConfiguration from persistence', () => {
    const config = {
      columns: [
        { id: 'col1', displayName: 'Name', sheetColumn: 'Nick', columnType: 'name', order: 0 }
      ]
    };
    
    setColumnsConfiguration('test_key', config);
    
    expect(persistence.saveColumnsConfiguration).toHaveBeenCalledWith('test_key', config);
  });
});

describe('getTeamsDisplayConfiguration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  it('calls loadTeamsDisplayConfig from persistence', () => {
    getTeamsDisplayConfiguration('test_key');
    
    expect(persistence.loadTeamsDisplayConfig).toHaveBeenCalledWith('test_key');
  });
});

describe('setTeamsDisplayConfiguration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  it('calls saveTeamsDisplayConfig from persistence', () => {
    const config = { visibleColumnIds: ['col1', 'col2'] };
    
    setTeamsDisplayConfiguration('test_key', config);
    
    expect(persistence.saveTeamsDisplayConfig).toHaveBeenCalledWith('test_key', config);
  });
});

