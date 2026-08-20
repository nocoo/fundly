import { describe, expect, it } from 'bun:test';
import {
  assignRanks,
  emptyRankPercents,
  type RankedFund,
  rankPct,
  rankPeerGroups,
} from '../../src/metrics/index.ts';

function fund(fundCode: string, fundType: string, value: number | null): RankedFund {
  return {
    fundCode,
    fundType,
    returns: {
      return_1m: value,
      return_3m: value,
      return_6m: value,
      return_1y: value,
      return_2y: value,
      return_3y: value,
      return_5y: value,
    },
  };
}

describe('rankPct', () => {
  describe('正常', () => {
    it('is 1-based percent of (better + 1) / n', () => {
      expect(rankPct(0, 4)).toBe(25);
      expect(rankPct(3, 4)).toBe(100);
    });
  });

  describe('边界', () => {
    it('allows betterCount of 0 in a singleton group', () => {
      expect(rankPct(0, 1)).toBe(100);
    });
  });

  describe('异常', () => {
    it('rejects empty groups and negative better counts', () => {
      expect(rankPct(0, 0)).toBeNull();
      expect(rankPct(-1, 3)).toBeNull();
    });
  });
});

describe('assignRanks', () => {
  describe('正常', () => {
    it('ranks higher returns closer to zero', () => {
      const ranks = assignRanks([
        { fundCode: 'a', value: 10 },
        { fundCode: 'b', value: 20 },
        { fundCode: 'c', value: null },
        { fundCode: 'd', value: 20 },
      ]);
      expect(ranks.get('b')).toBeCloseTo(100 / 3);
      expect(ranks.get('d')).toBeCloseTo(100 / 3);
      expect(ranks.get('a')).toBeCloseTo(100);
      expect(ranks.get('c')).toBeNull();
    });
  });

  describe('边界', () => {
    it('gives 100 to a single eligible fund', () => {
      const ranks = assignRanks([{ fundCode: 'only', value: 1 }]);
      expect(ranks.get('only')).toBe(100);
    });
  });

  describe('异常', () => {
    it('returns empty or all-null maps when nothing is rankable', () => {
      expect(assignRanks([]).size).toBe(0);
      const ranks = assignRanks([{ fundCode: 'x', value: null }]);
      expect(ranks.get('x')).toBeNull();
    });
  });
});

describe('rankPeerGroups', () => {
  describe('正常', () => {
    it('ranks inside each fund type, not across types', () => {
      const ranks = rankPeerGroups([
        fund('a', '混合型-灵活', 10),
        fund('b', '混合型-灵活', 30),
        fund('c', '债券型-混合一级', 50),
      ]);
      expect(ranks.get('b')?.rank_pct_1y).toBe(50);
      expect(ranks.get('a')?.rank_pct_1y).toBe(100);
      expect(ranks.get('c')?.rank_pct_1y).toBe(100);
    });
  });

  describe('边界', () => {
    it('keeps null windows null after grouping', () => {
      const row = fund('z', '指数型-股票', null);
      const ranks = rankPeerGroups([row]);
      expect(ranks.get('z')).toEqual(emptyRankPercents());
    });
  });

  describe('异常', () => {
    it('returns an empty map for no funds', () => {
      expect(rankPeerGroups([]).size).toBe(0);
    });
  });
});
