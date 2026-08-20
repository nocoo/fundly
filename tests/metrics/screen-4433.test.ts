import { describe, expect, it } from 'bun:test';
import { emptyRankPercents, pass4433 } from '../../src/metrics/index.ts';

const pass = {
  ...emptyRankPercents(),
  rank_pct_1y: 25,
  rank_pct_2y: 25,
  rank_pct_3y: 24,
  rank_pct_5y: 10,
  rank_pct_6m: 100 / 3,
  rank_pct_3m: 30,
};

describe('pass4433', () => {
  describe('正常', () => {
    it('passes when all six windows are inside the 25 / 1/3 caps', () => {
      expect(pass4433(pass)).toBe(1);
    });
  });

  describe('边界', () => {
    it('includes the exact 25 and 1/3 thresholds', () => {
      expect(pass4433(pass)).toBe(1);
      expect(pass4433({ ...pass, rank_pct_1y: 25.01 })).toBe(0);
      expect(pass4433({ ...pass, rank_pct_6m: 100 / 3 + 1e-9 })).toBe(0);
    });
  });

  describe('异常', () => {
    it('fails when any required window is missing or empty percents', () => {
      expect(pass4433({ ...pass, rank_pct_3m: null })).toBe(0);
      expect(pass4433(emptyRankPercents())).toBe(0);
    });
  });
});
