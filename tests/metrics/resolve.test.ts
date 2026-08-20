import { describe, expect, it } from 'bun:test';
import {
  LIVE_RETURN_FIELDS,
  planReturnLookups,
  RANK_RETURN_FIELDS,
  resolveFundReturns,
} from '../../src/metrics/index.ts';

const last = { date: '2026-08-18', acc: 2, unit: 1.5 };

describe('planReturnLookups', () => {
  describe('正常', () => {
    it('asks for first nav and each window start before last', () => {
      const plan = planReturnLookups(LIVE_RETURN_FIELDS, '2026-08-18');
      expect(plan.needFirst).toBe(true);
      expect(plan.windows.map((item) => item.field)).toContain('return_2y');
      expect(plan.windows.find((item) => item.field === 'return_ytd')?.start).toBe('2025-12-31');
    });
  });

  describe('边界', () => {
    it('skips windows when last date is missing but still flags since-inception', () => {
      const plan = planReturnLookups(['return_2y', 'return_since_start'], null);
      expect(plan.needFirst).toBe(true);
      expect(plan.windows).toEqual([]);
    });
  });

  describe('异常', () => {
    it('emits no windows for an empty field list', () => {
      expect(planReturnLookups([], '2026-08-18')).toEqual({ needFirst: false, windows: [] });
    });
  });
});

describe('resolveFundReturns', () => {
  describe('正常', () => {
    it('keeps crawled short windows and computes long windows from acc nav', () => {
      const got = resolveFundReturns({
        fields: RANK_RETURN_FIELDS,
        crawled: { return_1y: 3.95, return_2y: 0 },
        last,
        asOf: {
          return_2y: { acc: 1, unit: 1 },
        },
      });
      expect(got.return_1y).toBe(3.95);
      expect(got.return_2y).toBeCloseTo(100, 5);
    });
  });

  describe('边界', () => {
    it('keeps crawled zero on 1y and fills since-inception from first/last', () => {
      const got = resolveFundReturns({
        fields: ['return_1y', 'return_since_start'],
        crawled: { return_1y: 0 },
        last,
        first: { acc: 1, unit: 1 },
      });
      expect(got.return_1y).toBe(0);
      expect(got.return_since_start).toBeCloseTo(100, 5);
    });

    it('computes a short empty window from same-kind nav', () => {
      const got = resolveFundReturns({
        fields: ['return_1m'],
        last: { date: '2026-08-18', acc: 2, unit: 2 },
        asOf: { return_1m: { acc: 1, unit: 1 } },
      });
      expect(got.return_1m).toBeCloseTo(100, 5);
    });
  });

  describe('异常', () => {
    it('nulls every nav window when last is missing', () => {
      const got = resolveFundReturns({
        fields: ['return_2y', 'return_1m'],
        crawled: { return_1m: null },
        last: null,
      });
      expect(got.return_2y).toBeNull();
      expect(got.return_1m).toBeNull();
    });

    it('nulls long windows that lack acc on either end', () => {
      const got = resolveFundReturns({
        fields: ['return_5y'],
        last,
        asOf: { return_5y: { acc: null, unit: 1 } },
      });
      expect(got.return_5y).toBeNull();
    });

    it('nulls a window when the start date is not before last', () => {
      const got = resolveFundReturns({
        fields: ['return_1m'],
        last: { date: 'not-a-date', acc: 2, unit: 2 },
        asOf: { return_1m: { acc: 1, unit: 1 } },
      });
      expect(got.return_1m).toBeNull();
    });
  });
});
