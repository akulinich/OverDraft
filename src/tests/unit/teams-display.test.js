import { describe, it, expect } from 'vitest';

/**
 * This file tests the Teams Display Config merging logic.
 * The actual logic is in renderer.js's renderTeamsDisplayModal function.
 * We extract and test the algorithm here to ensure correctness.
 */

/**
 * Computes the visible column IDs for Teams Display modal.
 * This mirrors the logic in renderTeamsDisplayModal.
 * 
 * @param {Object} columnsConfig - Current columns configuration
 * @param {Object|null} displayConfig - Existing display config (or null for new)
 * @returns {string[]} - Array of visible column IDs
 */
function computeVisibleColumnIds(columnsConfig, displayConfig) {
  const orderedColumns = columnsConfig?.columns || [];
  const nonNameColumnIds = orderedColumns
    .filter(c => c.columnType !== 'name')
    .map(c => c.id);
  
  if (!displayConfig) {
    // No existing config - all non-name columns visible by default
    return [...nonNameColumnIds];
  }
  
  // Existing config - keep previous selections, but add any NEW columns as visible by default
  const previousVisibleIds = new Set(displayConfig.visibleColumnIds);
  const allCurrentColumnIds = new Set(orderedColumns.map(c => c.id));
  
  // Start with previous visible IDs that still exist in current config
  const validPreviousIds = displayConfig.visibleColumnIds.filter(id => allCurrentColumnIds.has(id));
  
  // Add any new column IDs that weren't in the previous config (default to visible)
  const newColumnIds = nonNameColumnIds.filter(id => !previousVisibleIds.has(id));
  
  return [...validPreviousIds, ...newColumnIds];
}

describe('Teams Display Config Merging Logic', () => {
  describe('computeVisibleColumnIds', () => {
    describe('with no existing config (first time setup)', () => {
      it('returns all non-name columns as visible', () => {
        const columnsConfig = {
          columns: [
            { id: 'col_name', displayName: 'Name', sheetColumn: 'Nick', columnType: 'name', order: 0 },
            { id: 'col_role', displayName: 'Role', sheetColumn: 'Role', columnType: 'role', order: 1 },
            { id: 'col_rating', displayName: 'Rating', sheetColumn: 'SR', columnType: 'rating', order: 2 }
          ]
        };
        
        const result = computeVisibleColumnIds(columnsConfig, null);
        
        expect(result).toEqual(['col_role', 'col_rating']);
        expect(result).not.toContain('col_name');
      });

      it('returns empty array when only name column exists', () => {
        const columnsConfig = {
          columns: [
            { id: 'col_name', displayName: 'Name', sheetColumn: 'Nick', columnType: 'name', order: 0 }
          ]
        };
        
        const result = computeVisibleColumnIds(columnsConfig, null);
        
        expect(result).toEqual([]);
      });

      it('handles multiple non-name columns', () => {
        const columnsConfig = {
          columns: [
            { id: 'col_name', displayName: 'Name', columnType: 'name', order: 0 },
            { id: 'col_role', displayName: 'Role', columnType: 'role', order: 1 },
            { id: 'col_rating', displayName: 'Rating', columnType: 'rating', order: 2 },
            { id: 'col_heroes', displayName: 'Heroes', columnType: 'heroes', order: 3 },
            { id: 'col_text', displayName: 'Notes', columnType: 'text', order: 4 }
          ]
        };
        
        const result = computeVisibleColumnIds(columnsConfig, null);
        
        expect(result).toHaveLength(4);
        expect(result).toContain('col_role');
        expect(result).toContain('col_rating');
        expect(result).toContain('col_heroes');
        expect(result).toContain('col_text');
      });
    });

    describe('with existing config (reconfiguration)', () => {
      it('preserves previously selected columns and adds unselected as visible', () => {
        // Current behavior: columns not in visibleColumnIds are treated as "new" and added
        // This ensures users see all available options when reconfiguring
        const columnsConfig = {
          columns: [
            { id: 'col_name', displayName: 'Name', columnType: 'name', order: 0 },
            { id: 'col_role', displayName: 'Role', columnType: 'role', order: 1 },
            { id: 'col_rating', displayName: 'Rating', columnType: 'rating', order: 2 }
          ]
        };
        
        const existingConfig = {
          visibleColumnIds: ['col_role'] // Only role was visible
        };
        
        const result = computeVisibleColumnIds(columnsConfig, existingConfig);
        
        // col_role is preserved, col_rating is added as visible (wasn't in previous config)
        expect(result).toContain('col_role');
        expect(result).toContain('col_rating');
        expect(result).toHaveLength(2);
      });

      it('adds new columns as visible by default', () => {
        const columnsConfig = {
          columns: [
            { id: 'col_name', displayName: 'Name', columnType: 'name', order: 0 },
            { id: 'col_role', displayName: 'Role', columnType: 'role', order: 1 },
            { id: 'col_rating', displayName: 'Rating', columnType: 'rating', order: 2 },
            { id: 'col_heroes', displayName: 'Heroes', columnType: 'heroes', order: 3 } // NEW column
          ]
        };
        
        const existingConfig = {
          visibleColumnIds: ['col_role', 'col_rating'] // Both were visible before
        };
        
        const result = computeVisibleColumnIds(columnsConfig, existingConfig);
        
        // Should include previously selected + new columns
        expect(result).toContain('col_role');
        expect(result).toContain('col_rating');
        expect(result).toContain('col_heroes'); // New column added as visible
        expect(result).toHaveLength(3);
      });

      it('removes deleted columns from visible IDs', () => {
        const columnsConfig = {
          columns: [
            { id: 'col_name', displayName: 'Name', columnType: 'name', order: 0 },
            { id: 'col_role', displayName: 'Role', columnType: 'role', order: 1 }
            // col_rating was removed
          ]
        };
        
        const existingConfig = {
          visibleColumnIds: ['col_role', 'col_rating'] // Both were visible
        };
        
        const result = computeVisibleColumnIds(columnsConfig, existingConfig);
        
        expect(result).toEqual(['col_role']);
        expect(result).not.toContain('col_rating'); // Removed column filtered out
      });

      it('handles mixed scenario: add new, remove old, keep selected', () => {
        const columnsConfig = {
          columns: [
            { id: 'col_name', displayName: 'Name', columnType: 'name', order: 0 },
            { id: 'col_role', displayName: 'Role', columnType: 'role', order: 1 },
            // col_rating was removed
            { id: 'col_heroes', displayName: 'Heroes', columnType: 'heroes', order: 2 }, // NEW
            { id: 'col_text', displayName: 'Notes', columnType: 'text', order: 3 } // NEW
          ]
        };
        
        const existingConfig = {
          visibleColumnIds: ['col_role', 'col_rating'] // role stays, rating was removed
        };
        
        const result = computeVisibleColumnIds(columnsConfig, existingConfig);
        
        expect(result).toContain('col_role');      // Kept from previous
        expect(result).not.toContain('col_rating'); // Removed - no longer in columns
        expect(result).toContain('col_heroes');    // New - added as visible
        expect(result).toContain('col_text');      // New - added as visible
        expect(result).toHaveLength(3);
      });

      it('treats unselected columns as new when user unchecked them', () => {
        // Current behavior: when user unchecks all, they are treated as "new" on reconfigure
        // This is by design - on reconfigure, previously unchecked columns become visible
        const columnsConfig = {
          columns: [
            { id: 'col_name', displayName: 'Name', columnType: 'name', order: 0 },
            { id: 'col_role', displayName: 'Role', columnType: 'role', order: 1 },
            { id: 'col_rating', displayName: 'Rating', columnType: 'rating', order: 2 }
          ]
        };
        
        const existingConfig = {
          visibleColumnIds: [] // User unchecked everything
        };
        
        const result = computeVisibleColumnIds(columnsConfig, existingConfig);
        
        // All non-name columns are added as visible
        expect(result).toContain('col_role');
        expect(result).toContain('col_rating');
        expect(result).toHaveLength(2);
      });
    });

    describe('edge cases', () => {
      it('handles null columnsConfig', () => {
        const result = computeVisibleColumnIds(null, null);
        expect(result).toEqual([]);
      });

      it('handles undefined columnsConfig', () => {
        const result = computeVisibleColumnIds(undefined, null);
        expect(result).toEqual([]);
      });

      it('handles columnsConfig without columns array', () => {
        const result = computeVisibleColumnIds({}, null);
        expect(result).toEqual([]);
      });

      it('handles displayConfig with empty visibleColumnIds - treats all as new', () => {
        const columnsConfig = {
          columns: [
            { id: 'col_name', displayName: 'Name', columnType: 'name', order: 0 },
            { id: 'col_role', displayName: 'Role', columnType: 'role', order: 1 }
          ]
        };
        
        const existingConfig = { visibleColumnIds: [] };
        
        const result = computeVisibleColumnIds(columnsConfig, existingConfig);
        
        // All non-name columns treated as new and added as visible
        expect(result).toEqual(['col_role']);
      });
    });
  });
});

