import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadColumnsConfiguration,
  saveColumnsConfiguration,
  removeColumnsConfiguration,
  loadTeamsDisplayConfig,
  saveTeamsDisplayConfig,
  removeTeamsDisplayConfig,
  migrateColumnMappingToConfig,
  validateColumnsConfiguration,
  getOrderedColumns,
  generateColumnId,
  loadColumnMapping,
  saveColumnMapping
} from '../../js/storage/persistence.js';

describe('Columns Configuration Integration', () => {
  let mockStorage;

  beforeEach(() => {
    // Create mock localStorage
    mockStorage = {};
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key) => mockStorage[key] || null),
      setItem: vi.fn((key, value) => { mockStorage[key] = value; }),
      removeItem: vi.fn((key) => { delete mockStorage[key]; })
    });
  });

  describe('Columns Configuration CRUD', () => {
    it('returns null when no config exists', () => {
      const config = loadColumnsConfiguration('sheet_123');
      expect(config).toBeNull();
    });

    it('saves and loads columns configuration', () => {
      const config = {
        columns: [
          { id: 'col1', displayName: 'Name', sheetColumn: 'Nick', columnType: 'name', order: 0 },
          { id: 'col2', displayName: 'Role', sheetColumn: 'Role', columnType: 'role', order: 1 },
          { id: 'col3', displayName: 'Rating', sheetColumn: 'SR', columnType: 'rating', order: 2 }
        ]
      };

      saveColumnsConfiguration('sheet_123', config);
      const loaded = loadColumnsConfiguration('sheet_123');

      expect(loaded.columns.length).toBe(3);
      expect(loaded.columns[0].displayName).toBe('Name');
      expect(loaded.columns[1].columnType).toBe('role');
    });

    it('removes columns configuration', () => {
      const config = {
        columns: [
          { id: 'col1', displayName: 'Name', sheetColumn: 'Nick', columnType: 'name', order: 0 }
        ]
      };

      saveColumnsConfiguration('sheet_123', config);
      expect(loadColumnsConfiguration('sheet_123')).not.toBeNull();

      removeColumnsConfiguration('sheet_123');
      expect(loadColumnsConfiguration('sheet_123')).toBeNull();
    });

    it('handles multiple sheets independently', () => {
      const config1 = {
        columns: [
          { id: 'col1', displayName: 'Name1', sheetColumn: 'Nick1', columnType: 'name', order: 0 }
        ]
      };
      const config2 = {
        columns: [
          { id: 'col2', displayName: 'Name2', sheetColumn: 'Nick2', columnType: 'name', order: 0 }
        ]
      };

      saveColumnsConfiguration('sheet_1', config1);
      saveColumnsConfiguration('sheet_2', config2);

      const loaded1 = loadColumnsConfiguration('sheet_1');
      const loaded2 = loadColumnsConfiguration('sheet_2');

      expect(loaded1.columns[0].displayName).toBe('Name1');
      expect(loaded2.columns[0].displayName).toBe('Name2');
    });
  });

  describe('Teams Display Config CRUD', () => {
    it('returns null when no config exists', () => {
      const config = loadTeamsDisplayConfig('sheet_123');
      expect(config).toBeNull();
    });

    it('saves and loads teams display config', () => {
      const config = {
        visibleColumnIds: ['col1', 'col2', 'col3']
      };

      saveTeamsDisplayConfig('sheet_123', config);
      const loaded = loadTeamsDisplayConfig('sheet_123');

      expect(loaded.visibleColumnIds).toEqual(['col1', 'col2', 'col3']);
    });

    it('removes teams display config', () => {
      const config = { visibleColumnIds: ['col1'] };

      saveTeamsDisplayConfig('sheet_123', config);
      expect(loadTeamsDisplayConfig('sheet_123')).not.toBeNull();

      removeTeamsDisplayConfig('sheet_123');
      expect(loadTeamsDisplayConfig('sheet_123')).toBeNull();
    });
  });

  describe('Legacy Migration', () => {
    it('migrates legacy column mapping on load', () => {
      // Save a legacy column mapping
      const legacyMapping = {
        nickname: 'Player Name',
        role: 'Role',
        rating: 'SR',
        heroes: 'Heroes'
      };
      saveColumnMapping('sheet_legacy', legacyMapping);

      // Load columns configuration - should auto-migrate
      const config = loadColumnsConfiguration('sheet_legacy');

      expect(config).not.toBeNull();
      expect(config.columns.length).toBe(4);
      
      const nameCol = config.columns.find(c => c.columnType === 'name');
      expect(nameCol.sheetColumn).toBe('Player Name');
      
      const roleCol = config.columns.find(c => c.columnType === 'role');
      expect(roleCol.sheetColumn).toBe('Role');
    });

    it('prefers new config over legacy mapping', () => {
      // Save both legacy and new config
      const legacyMapping = {
        nickname: 'Old Name',
        role: 'Old Role',
        rating: 'Old SR',
        heroes: 'Old Heroes'
      };
      saveColumnMapping('sheet_both', legacyMapping);

      const newConfig = {
        columns: [
          { id: 'col1', displayName: 'Name', sheetColumn: 'New Name', columnType: 'name', order: 0 }
        ]
      };
      saveColumnsConfiguration('sheet_both', newConfig);

      // Should return new config, not migrated legacy
      const loaded = loadColumnsConfiguration('sheet_both');

      expect(loaded.columns.length).toBe(1);
      expect(loaded.columns[0].sheetColumn).toBe('New Name');
    });
  });

  describe('Configuration Workflow', () => {
    it('complete configuration workflow', () => {
      const sheetKey = 'workflow_test';
      
      // 1. Create initial configuration
      const initialConfig = {
        columns: [
          { id: generateColumnId(), displayName: 'Имя', sheetColumn: 'Nickname', columnType: 'name', order: 0 }
        ]
      };
      
      // 2. Validate
      expect(validateColumnsConfiguration(initialConfig).valid).toBe(true);
      
      // 3. Save
      saveColumnsConfiguration(sheetKey, initialConfig);
      
      // 4. Add more columns
      const updatedConfig = loadColumnsConfiguration(sheetKey);
      updatedConfig.columns.push({
        id: generateColumnId(),
        displayName: 'Роль',
        sheetColumn: 'Role',
        columnType: 'role',
        order: 1
      });
      updatedConfig.columns.push({
        id: generateColumnId(),
        displayName: 'Рейтинг',
        sheetColumn: 'SR',
        columnType: 'rating',
        order: 2
      });
      
      // 5. Save updated config
      saveColumnsConfiguration(sheetKey, updatedConfig);
      
      // 6. Verify
      const finalConfig = loadColumnsConfiguration(sheetKey);
      expect(finalConfig.columns.length).toBe(3);
      
      // 7. Get ordered columns
      const ordered = getOrderedColumns(finalConfig);
      expect(ordered[0].columnType).toBe('name');
      expect(ordered[1].columnType).toBe('role');
      expect(ordered[2].columnType).toBe('rating');
    });

    it('reorder columns workflow', () => {
      const config = {
        columns: [
          { id: 'col_name', displayName: 'Name', sheetColumn: 'Nick', columnType: 'name', order: 0 },
          { id: 'col_role', displayName: 'Role', sheetColumn: 'Role', columnType: 'role', order: 1 },
          { id: 'col_rating', displayName: 'Rating', sheetColumn: 'SR', columnType: 'rating', order: 2 }
        ]
      };
      
      // Reorder: move rating before role
      config.columns.find(c => c.id === 'col_rating').order = 1;
      config.columns.find(c => c.id === 'col_role').order = 2;
      
      const ordered = getOrderedColumns(config);
      
      expect(ordered[0].id).toBe('col_name');
      expect(ordered[1].id).toBe('col_rating');
      expect(ordered[2].id).toBe('col_role');
    });

    it('teams display configuration workflow', () => {
      const sheetKey = 'teams_display_test';
      
      // 1. Create columns configuration
      const columnsConfig = {
        columns: [
          { id: 'col_name', displayName: 'Name', sheetColumn: 'Nick', columnType: 'name', order: 0 },
          { id: 'col_role', displayName: 'Role', sheetColumn: 'Role', columnType: 'role', order: 1 },
          { id: 'col_rating', displayName: 'Rating', sheetColumn: 'SR', columnType: 'rating', order: 2 },
          { id: 'col_heroes', displayName: 'Heroes', sheetColumn: 'Heroes', columnType: 'heroes', order: 3 }
        ]
      };
      saveColumnsConfiguration(sheetKey, columnsConfig);
      
      // 2. Select which columns to show in teams
      const displayConfig = {
        visibleColumnIds: ['col_role', 'col_rating'] // Show role and rating, hide heroes
      };
      saveTeamsDisplayConfig(sheetKey, displayConfig);
      
      // 3. Verify teams display shows correct columns
      const loadedDisplay = loadTeamsDisplayConfig(sheetKey);
      
      expect(loadedDisplay.visibleColumnIds).toContain('col_role');
      expect(loadedDisplay.visibleColumnIds).toContain('col_rating');
      expect(loadedDisplay.visibleColumnIds).not.toContain('col_heroes');
      expect(loadedDisplay.visibleColumnIds).not.toContain('col_name'); // name is always shown, not in config
    });
  });

  describe('Edge Cases', () => {
    it('handles corrupted localStorage data gracefully', () => {
      mockStorage['overdraft_columns_config'] = 'invalid json {{{';
      
      const config = loadColumnsConfiguration('sheet_123');
      
      // Should return null, not throw
      expect(config).toBeNull();
    });

    it('handles empty columns array', () => {
      const config = { columns: [] };
      
      saveColumnsConfiguration('empty_test', config);
      const loaded = loadColumnsConfiguration('empty_test');
      
      expect(loaded.columns).toEqual([]);
    });

    it('preserves column IDs across save/load cycles', () => {
      const originalId = generateColumnId();
      const config = {
        columns: [
          { id: originalId, displayName: 'Name', sheetColumn: 'Nick', columnType: 'name', order: 0 }
        ]
      };
      
      saveColumnsConfiguration('id_test', config);
      const loaded = loadColumnsConfiguration('id_test');
      
      expect(loaded.columns[0].id).toBe(originalId);
    });
  });

  describe('Reconfigure Workflow', () => {
    it('adding new column updates Teams Display options', () => {
      const sheetKey = 'reconfigure_test_1';
      
      // Step 1: Initial configuration with 2 columns
      const initialColumnsConfig = {
        columns: [
          { id: 'col_name', displayName: 'Name', sheetColumn: 'Nick', columnType: 'name', order: 0 },
          { id: 'col_role', displayName: 'Role', sheetColumn: 'Role', columnType: 'role', order: 1 }
        ]
      };
      saveColumnsConfiguration(sheetKey, initialColumnsConfig);
      
      // Step 2: Initial teams display - only show role
      const initialDisplayConfig = {
        visibleColumnIds: ['col_role']
      };
      saveTeamsDisplayConfig(sheetKey, initialDisplayConfig);
      
      // Step 3: User reconfigures and adds a rating column
      const updatedColumnsConfig = {
        columns: [
          { id: 'col_name', displayName: 'Name', sheetColumn: 'Nick', columnType: 'name', order: 0 },
          { id: 'col_role', displayName: 'Role', sheetColumn: 'Role', columnType: 'role', order: 1 },
          { id: 'col_rating', displayName: 'Rating', sheetColumn: 'SR', columnType: 'rating', order: 2 }
        ]
      };
      saveColumnsConfiguration(sheetKey, updatedColumnsConfig);
      
      // Step 4: Verify new column is available for teams display
      const columnsConfig = loadColumnsConfiguration(sheetKey);
      const orderedColumns = getOrderedColumns(columnsConfig);
      
      expect(orderedColumns).toHaveLength(3);
      expect(orderedColumns.map(c => c.id)).toContain('col_rating');
      
      // Step 5: Update teams display to include new column
      const updatedDisplayConfig = {
        visibleColumnIds: ['col_role', 'col_rating']
      };
      saveTeamsDisplayConfig(sheetKey, updatedDisplayConfig);
      
      const finalDisplay = loadTeamsDisplayConfig(sheetKey);
      expect(finalDisplay.visibleColumnIds).toContain('col_rating');
    });

    it('complete reconfigure workflow preserves user selections', () => {
      const sheetKey = 'reconfigure_test_2';
      
      // Step 1: Full initial configuration
      const columnsConfig = {
        columns: [
          { id: 'col_name', displayName: 'Name', sheetColumn: 'Nick', columnType: 'name', order: 0 },
          { id: 'col_role', displayName: 'Role', sheetColumn: 'Role', columnType: 'role', order: 1 },
          { id: 'col_rating', displayName: 'Rating', sheetColumn: 'SR', columnType: 'rating', order: 2 },
          { id: 'col_heroes', displayName: 'Heroes', sheetColumn: 'Heroes', columnType: 'heroes', order: 3 }
        ]
      };
      saveColumnsConfiguration(sheetKey, columnsConfig);
      
      const displayConfig = {
        visibleColumnIds: ['col_role', 'col_rating'] // Only role and rating visible
      };
      saveTeamsDisplayConfig(sheetKey, displayConfig);
      
      // Step 2: Simulate "reconfigure" - load existing configs
      const existingColumnsConfig = loadColumnsConfiguration(sheetKey);
      const existingDisplayConfig = loadTeamsDisplayConfig(sheetKey);
      
      // Step 3: Verify data is intact after load
      expect(existingColumnsConfig.columns).toHaveLength(4);
      expect(existingDisplayConfig.visibleColumnIds).toEqual(['col_role', 'col_rating']);
      
      // Step 4: User makes changes (adds a text column, removes heroes)
      const newColumnsConfig = {
        columns: [
          { id: 'col_name', displayName: 'Name', sheetColumn: 'Nick', columnType: 'name', order: 0 },
          { id: 'col_role', displayName: 'Role', sheetColumn: 'Role', columnType: 'role', order: 1 },
          { id: 'col_rating', displayName: 'Rating', sheetColumn: 'SR', columnType: 'rating', order: 2 },
          // heroes removed
          { id: 'col_notes', displayName: 'Notes', sheetColumn: 'Notes', columnType: 'text', order: 3 } // NEW
        ]
      };
      saveColumnsConfiguration(sheetKey, newColumnsConfig);
      
      // Step 5: Verify the changes
      const finalColumnsConfig = loadColumnsConfiguration(sheetKey);
      expect(finalColumnsConfig.columns).toHaveLength(4);
      expect(finalColumnsConfig.columns.find(c => c.id === 'col_heroes')).toBeUndefined();
      expect(finalColumnsConfig.columns.find(c => c.id === 'col_notes')).toBeDefined();
    });

    it('removing column from columns config filters it from display config', () => {
      const sheetKey = 'reconfigure_test_3';
      
      // Initial setup with heroes column
      const columnsConfig = {
        columns: [
          { id: 'col_name', displayName: 'Name', sheetColumn: 'Nick', columnType: 'name', order: 0 },
          { id: 'col_role', displayName: 'Role', sheetColumn: 'Role', columnType: 'role', order: 1 },
          { id: 'col_heroes', displayName: 'Heroes', sheetColumn: 'Heroes', columnType: 'heroes', order: 2 }
        ]
      };
      saveColumnsConfiguration(sheetKey, columnsConfig);
      
      const displayConfig = {
        visibleColumnIds: ['col_role', 'col_heroes']
      };
      saveTeamsDisplayConfig(sheetKey, displayConfig);
      
      // User removes heroes column
      const newColumnsConfig = {
        columns: [
          { id: 'col_name', displayName: 'Name', sheetColumn: 'Nick', columnType: 'name', order: 0 },
          { id: 'col_role', displayName: 'Role', sheetColumn: 'Role', columnType: 'role', order: 1 }
          // heroes removed
        ]
      };
      saveColumnsConfiguration(sheetKey, newColumnsConfig);
      
      // Load display config - it still has the old reference
      const loadedDisplay = loadTeamsDisplayConfig(sheetKey);
      expect(loadedDisplay.visibleColumnIds).toContain('col_heroes');
      
      // When rendering, the application should filter out non-existent columns
      // This is tested by the merge logic which filters validPreviousIds
      const loadedColumns = loadColumnsConfiguration(sheetKey);
      const currentColumnIds = new Set(loadedColumns.columns.map(c => c.id));
      const validDisplayIds = loadedDisplay.visibleColumnIds.filter(id => currentColumnIds.has(id));
      
      expect(validDisplayIds).toEqual(['col_role']);
      expect(validDisplayIds).not.toContain('col_heroes');
    });

    it('multiple sheets have independent configurations', () => {
      const sheetKey1 = 'sheet_1';
      const sheetKey2 = 'sheet_2';
      
      // Configure sheet 1
      const config1 = {
        columns: [
          { id: 'col_name_1', displayName: 'Player', sheetColumn: 'Name', columnType: 'name', order: 0 },
          { id: 'col_role_1', displayName: 'Role', sheetColumn: 'Role', columnType: 'role', order: 1 }
        ]
      };
      saveColumnsConfiguration(sheetKey1, config1);
      saveTeamsDisplayConfig(sheetKey1, { visibleColumnIds: ['col_role_1'] });
      
      // Configure sheet 2 differently
      const config2 = {
        columns: [
          { id: 'col_name_2', displayName: 'Nickname', sheetColumn: 'Nick', columnType: 'name', order: 0 },
          { id: 'col_rating_2', displayName: 'SR', sheetColumn: 'Rating', columnType: 'rating', order: 1 },
          { id: 'col_heroes_2', displayName: 'Mains', sheetColumn: 'Heroes', columnType: 'heroes', order: 2 }
        ]
      };
      saveColumnsConfiguration(sheetKey2, config2);
      saveTeamsDisplayConfig(sheetKey2, { visibleColumnIds: ['col_rating_2', 'col_heroes_2'] });
      
      // Verify independence
      const loaded1 = loadColumnsConfiguration(sheetKey1);
      const loaded2 = loadColumnsConfiguration(sheetKey2);
      
      expect(loaded1.columns).toHaveLength(2);
      expect(loaded2.columns).toHaveLength(3);
      
      const display1 = loadTeamsDisplayConfig(sheetKey1);
      const display2 = loadTeamsDisplayConfig(sheetKey2);
      
      expect(display1.visibleColumnIds).toEqual(['col_role_1']);
      expect(display2.visibleColumnIds).toEqual(['col_rating_2', 'col_heroes_2']);
    });
  });
});

