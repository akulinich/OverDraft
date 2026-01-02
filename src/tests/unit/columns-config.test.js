import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  generateColumnId,
  createDefaultColumnsConfiguration,
  migrateColumnMappingToConfig,
  validateColumnsConfiguration,
  getColumnByType,
  getOrderedColumns
} from '../../js/storage/persistence.js';

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

describe('generateColumnId', () => {
  it('generates unique IDs', () => {
    const id1 = generateColumnId();
    const id2 = generateColumnId();
    
    expect(id1).toMatch(/^col_\d+_[a-z0-9]+$/);
    expect(id2).toMatch(/^col_\d+_[a-z0-9]+$/);
    expect(id1).not.toBe(id2);
  });
});

describe('createDefaultColumnsConfiguration', () => {
  it('always includes mandatory name column with empty sheetColumn when no header provided', () => {
    const config = createDefaultColumnsConfiguration();
    
    expect(config.columns).toHaveLength(1);
    expect(config.columns[0].displayName).toBe('Имя');
    expect(config.columns[0].sheetColumn).toBe(''); // Empty, user must select
    expect(config.columns[0].columnType).toBe('name');
    expect(config.columns[0].order).toBe(0);
  });
  
  it('creates config with name column when header provided', () => {
    const config = createDefaultColumnsConfiguration('Nickname');
    
    expect(config.columns).toHaveLength(1);
    expect(config.columns[0].displayName).toBe('Имя');
    expect(config.columns[0].sheetColumn).toBe('Nickname');
    expect(config.columns[0].columnType).toBe('name');
    expect(config.columns[0].order).toBe(0);
  });
});

describe('migrateColumnMappingToConfig', () => {
  it('migrates full legacy mapping', () => {
    const legacyMapping = {
      nickname: 'Player Name',
      role: 'Role',
      rating: 'SR',
      heroes: 'Main Heroes'
    };
    
    const config = migrateColumnMappingToConfig(legacyMapping);
    
    expect(config.columns).toHaveLength(4);
    
    const nameCol = config.columns.find(c => c.columnType === 'name');
    expect(nameCol.sheetColumn).toBe('Player Name');
    expect(nameCol.order).toBe(0);
    
    const roleCol = config.columns.find(c => c.columnType === 'role');
    expect(roleCol.sheetColumn).toBe('Role');
    
    const ratingCol = config.columns.find(c => c.columnType === 'rating');
    expect(ratingCol.sheetColumn).toBe('SR');
    
    const heroesCol = config.columns.find(c => c.columnType === 'heroes');
    expect(heroesCol.sheetColumn).toBe('Main Heroes');
  });
  
  it('migrates partial legacy mapping', () => {
    const legacyMapping = {
      nickname: 'Nick',
      role: null,
      rating: 'Rating',
      heroes: null
    };
    
    const config = migrateColumnMappingToConfig(legacyMapping);
    
    expect(config.columns).toHaveLength(2);
    expect(config.columns[0].columnType).toBe('name');
    expect(config.columns[1].columnType).toBe('rating');
  });
  
  it('handles empty legacy mapping', () => {
    const legacyMapping = {
      nickname: null,
      role: null,
      rating: null,
      heroes: null
    };
    
    const config = migrateColumnMappingToConfig(legacyMapping);
    
    expect(config.columns).toHaveLength(0);
  });
  
  it('assigns correct order to migrated columns', () => {
    const legacyMapping = {
      nickname: 'Name',
      role: 'Role',
      rating: 'SR',
      heroes: 'Heroes'
    };
    
    const config = migrateColumnMappingToConfig(legacyMapping);
    
    expect(config.columns[0].order).toBe(0);
    expect(config.columns[1].order).toBe(1);
    expect(config.columns[2].order).toBe(2);
    expect(config.columns[3].order).toBe(3);
  });
});

describe('validateColumnsConfiguration', () => {
  it('validates valid configuration', () => {
    const config = {
      columns: [
        { id: 'col1', displayName: 'Name', sheetColumn: 'Nick', columnType: 'name', order: 0 },
        { id: 'col2', displayName: 'Role', sheetColumn: 'Role', columnType: 'role', order: 1 }
      ]
    };
    
    const result = validateColumnsConfiguration(config);
    
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });
  
  it('rejects config without name column', () => {
    const config = {
      columns: [
        { id: 'col1', displayName: 'Role', sheetColumn: 'Role', columnType: 'role', order: 0 }
      ]
    };
    
    const result = validateColumnsConfiguration(config);
    
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Name column is required');
  });
  
  it('rejects config with duplicate IDs', () => {
    const config = {
      columns: [
        { id: 'col1', displayName: 'Name', sheetColumn: 'Nick', columnType: 'name', order: 0 },
        { id: 'col1', displayName: 'Role', sheetColumn: 'Role', columnType: 'role', order: 1 }
      ]
    };
    
    const result = validateColumnsConfiguration(config);
    
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Duplicate column ID');
  });
  
  it('rejects config with missing required fields', () => {
    const config = {
      columns: [
        { id: 'col1', displayName: 'Name', sheetColumn: 'Nick', columnType: 'name', order: 0 },
        { id: 'col2', displayName: '', sheetColumn: 'Role', columnType: 'role', order: 1 }
      ]
    };
    
    const result = validateColumnsConfiguration(config);
    
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Column missing required fields');
  });
  
  it('rejects null/undefined config', () => {
    expect(validateColumnsConfiguration(null).valid).toBe(false);
    expect(validateColumnsConfiguration(undefined).valid).toBe(false);
  });
  
  it('rejects config without columns array', () => {
    const result = validateColumnsConfiguration({ columns: 'not an array' });
    
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid configuration structure');
  });
});

describe('getColumnByType', () => {
  const config = {
    columns: [
      { id: 'col1', displayName: 'Name', sheetColumn: 'Nick', columnType: 'name', order: 0 },
      { id: 'col2', displayName: 'Role', sheetColumn: 'Role', columnType: 'role', order: 1 },
      { id: 'col3', displayName: 'Rating', sheetColumn: 'SR', columnType: 'rating', order: 2 }
    ]
  };
  
  it('finds column by type', () => {
    expect(getColumnByType(config, 'name').id).toBe('col1');
    expect(getColumnByType(config, 'role').id).toBe('col2');
    expect(getColumnByType(config, 'rating').id).toBe('col3');
  });
  
  it('returns null for missing type', () => {
    expect(getColumnByType(config, 'heroes')).toBeNull();
    expect(getColumnByType(config, 'text')).toBeNull();
  });
  
  it('handles null/undefined config', () => {
    expect(getColumnByType(null, 'name')).toBeNull();
    expect(getColumnByType(undefined, 'name')).toBeNull();
  });
});

describe('getOrderedColumns', () => {
  it('returns columns sorted by order', () => {
    const config = {
      columns: [
        { id: 'col3', displayName: 'C', sheetColumn: 'C', columnType: 'rating', order: 2 },
        { id: 'col1', displayName: 'A', sheetColumn: 'A', columnType: 'name', order: 0 },
        { id: 'col2', displayName: 'B', sheetColumn: 'B', columnType: 'role', order: 1 }
      ]
    };
    
    const ordered = getOrderedColumns(config);
    
    expect(ordered[0].id).toBe('col1');
    expect(ordered[1].id).toBe('col2');
    expect(ordered[2].id).toBe('col3');
  });
  
  it('returns empty array for null/undefined config', () => {
    expect(getOrderedColumns(null)).toEqual([]);
    expect(getOrderedColumns(undefined)).toEqual([]);
  });
  
  it('returns empty array for config without columns', () => {
    expect(getOrderedColumns({})).toEqual([]);
    expect(getOrderedColumns({ columns: null })).toEqual([]);
  });
  
  it('does not mutate original array', () => {
    const config = {
      columns: [
        { id: 'col2', displayName: 'B', sheetColumn: 'B', columnType: 'role', order: 1 },
        { id: 'col1', displayName: 'A', sheetColumn: 'A', columnType: 'name', order: 0 }
      ]
    };
    
    const ordered = getOrderedColumns(config);
    
    // Original should be unchanged
    expect(config.columns[0].id).toBe('col2');
    expect(config.columns[1].id).toBe('col1');
    
    // Returned array should be sorted
    expect(ordered[0].id).toBe('col1');
    expect(ordered[1].id).toBe('col2');
  });
});

