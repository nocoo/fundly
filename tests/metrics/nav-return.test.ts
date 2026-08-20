import { describe, expect, it } from 'bun:test';
import { navReturn } from '../../src/metrics/index.ts';

describe('navReturn', () => {
  describe('正常', () => {
    it('uses accumulated nav when both ends have it', () => {
      expect(navReturn({ acc: 1.265, unit: 1.1 }, { acc: 1.5187, unit: 1.3 })).toBeCloseTo(
        20.06,
        2,
      );
    });

    it('falls back to unit nav when both ends lack acc', () => {
      expect(navReturn({ acc: null, unit: 1.2491 }, { acc: null, unit: 1.2985 })).toBeCloseTo(
        3.95,
        2,
      );
    });
  });

  describe('边界', () => {
    it('treats a zero or negative acc base as unusable and tries unit', () => {
      expect(navReturn({ acc: 0, unit: 1 }, { acc: 1.2, unit: 1.1 })).toBeCloseTo(10, 5);
      expect(navReturn({ acc: -1, unit: 2 }, { acc: 2, unit: 2.2 })).toBeCloseTo(10, 5);
    });

    it('keeps same-kind unit when one end is missing acc', () => {
      expect(navReturn({ acc: 1.5, unit: 1 }, { acc: null, unit: 1.1 })).toBeCloseTo(10, 5);
    });
  });

  describe('异常', () => {
    it('returns null for missing prints, non-finite ends, or required acc', () => {
      expect(navReturn(null, { acc: 2, unit: 2 })).toBeNull();
      expect(navReturn({ acc: 1, unit: 1 }, null)).toBeNull();
      expect(navReturn({ acc: 1, unit: 1 }, { acc: Number.NaN, unit: 2 })).toBeCloseTo(100, 5);
      expect(navReturn({ acc: null, unit: 0 }, { acc: null, unit: 1.2 })).toBeNull();
      expect(
        navReturn({ acc: 1.5, unit: 1 }, { acc: null, unit: 1.1 }, { requireAcc: true }),
      ).toBeNull();
      expect(
        navReturn(
          { acc: 1, unit: 1 },
          { acc: Number.POSITIVE_INFINITY, unit: 2 },
          { requireAcc: true },
        ),
      ).toBeNull();
    });
  });
});
