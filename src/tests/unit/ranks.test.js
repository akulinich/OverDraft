import { describe, it, expect } from 'vitest';
import { 
  roundRating, 
  getRankFromRating, 
  getTierLabel, 
  getTierClass,
  getAllTiers 
} from '../../js/utils/ranks.js';

describe('roundRating', () => {
  it('rounds to nearest 100', () => {
    expect(roundRating(3050)).toBe(3100);
    expect(roundRating(3049)).toBe(3000);
    expect(roundRating(3000)).toBe(3000);
  });

  it('handles edge cases', () => {
    expect(roundRating(0)).toBe(0);
    expect(roundRating(50)).toBe(100);
    expect(roundRating(49)).toBe(0);
  });
});

describe('getRankFromRating', () => {
  describe('tier boundaries', () => {
    it('returns bronze for rating < 1500', () => {
      const rank = getRankFromRating(1200);
      expect(rank?.tier).toBe('bronze');
    });

    it('returns silver for rating 1500-1999', () => {
      const rank = getRankFromRating(1500);
      expect(rank?.tier).toBe('silver');
    });

    it('returns gold for rating 2000-2499', () => {
      const rank = getRankFromRating(2000);
      expect(rank?.tier).toBe('gold');
    });

    it('returns platinum for rating 2500-2999', () => {
      const rank = getRankFromRating(2500);
      expect(rank?.tier).toBe('platinum');
    });

    it('returns diamond for rating 3000-3499', () => {
      const rank = getRankFromRating(3000);
      expect(rank?.tier).toBe('diamond');
    });

    it('returns master for rating 3500-3999', () => {
      const rank = getRankFromRating(3500);
      expect(rank?.tier).toBe('master');
    });

    it('returns grandmaster for rating 4000-4499', () => {
      const rank = getRankFromRating(4000);
      expect(rank?.tier).toBe('grandmaster');
    });

    it('returns champion for rating >= 4500', () => {
      const rank = getRankFromRating(4500);
      expect(rank?.tier).toBe('champion');
    });
  });

  describe('grades within tier', () => {
    it('returns grade 5 at tier minimum', () => {
      const rank = getRankFromRating(3000);
      expect(rank?.tier).toBe('diamond');
      expect(rank?.grade).toBe(5);
    });

    it('returns grade 4 at tier minimum + 100', () => {
      const rank = getRankFromRating(3100);
      expect(rank?.tier).toBe('diamond');
      expect(rank?.grade).toBe(4);
    });

    it('returns grade 1 at tier minimum + 400', () => {
      const rank = getRankFromRating(3400);
      expect(rank?.tier).toBe('diamond');
      expect(rank?.grade).toBe(1);
    });
  });

  describe('string input', () => {
    it('parses string rating', () => {
      const rank = getRankFromRating('3200');
      expect(rank?.tier).toBe('diamond');
    });
  });

  describe('invalid input', () => {
    it('returns null for NaN', () => {
      expect(getRankFromRating(NaN)).toBeNull();
    });

    it('returns null for negative rating', () => {
      expect(getRankFromRating(-100)).toBeNull();
    });

    it('returns null for non-numeric string', () => {
      expect(getRankFromRating('abc')).toBeNull();
    });
  });

  describe('rank info structure', () => {
    it('includes all required properties', () => {
      const rank = getRankFromRating(3200);
      expect(rank).toHaveProperty('tier');
      expect(rank).toHaveProperty('grade');
      expect(rank).toHaveProperty('label');
      expect(rank).toHaveProperty('labelRu');
      expect(rank).toHaveProperty('tierIcon');
    });

    it('generates correct label format', () => {
      const rank = getRankFromRating(3200);
      expect(rank?.label).toBe('Diamond 3');
    });
  });
});

describe('getTierLabel', () => {
  it('returns English label by default', () => {
    expect(getTierLabel('diamond')).toBe('Diamond');
    expect(getTierLabel('grandmaster')).toBe('Grandmaster');
  });

  it('returns Russian label when requested', () => {
    expect(getTierLabel('diamond', true)).toBe('Бриллиант');
    expect(getTierLabel('grandmaster', true)).toBe('Грандмастер');
  });

  it('returns tier name for unknown tier', () => {
    expect(getTierLabel('unknown')).toBe('unknown');
  });
});

describe('getTierClass', () => {
  it('returns CSS class with rank prefix', () => {
    expect(getTierClass('diamond')).toBe('rank-diamond');
    expect(getTierClass('bronze')).toBe('rank-bronze');
  });
});

describe('getAllTiers', () => {
  it('returns all 8 tiers', () => {
    const tiers = getAllTiers();
    expect(tiers.length).toBe(8);
  });

  it('tiers are sorted from highest to lowest', () => {
    const tiers = getAllTiers();
    expect(tiers[0].tier).toBe('champion');
    expect(tiers[7].tier).toBe('bronze');
  });
});

