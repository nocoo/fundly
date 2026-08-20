import { describe, expect, it } from 'bun:test';
import {
  assignRanks,
  emptyRankPercents,
  emptyRankStats,
  formatRankTriple,
  parseRankStats,
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

describe('formatRankTriple', () => {
  describe('正常', () => {
    it('renders rank / peers / percent', () => {
      expect(formatRankTriple({ rank: 1, n: 5000, pct: 0.02 })).toBe('1 / 5000 / 0.02%');
      expect(formatRankTriple({ rank: 1, n: 100, pct: 1 })).toBe('1 / 100 / 1.00%');
    });
  });

  describe('边界', () => {
    it('keeps two decimal places including zero', () => {
      expect(formatRankTriple({ rank: 50, n: 50, pct: 100 })).toBe('50 / 50 / 100.00%');
    });
  });

  describe('异常', () => {
    it('returns null for missing or invalid stats', () => {
      expect(formatRankTriple(null)).toBeNull();
      expect(formatRankTriple({ rank: 0, n: 10, pct: 10 })).toBeNull();
      expect(formatRankTriple({ rank: 1, n: 0, pct: 10 })).toBeNull();
      expect(formatRankTriple({ rank: 1, n: 10, pct: Number.NaN })).toBeNull();
    });
  });
});

describe('parseRankStats', () => {
  describe('正常', () => {
    it('reads rank stats from json', () => {
      const stats = parseRankStats(
        '{"rank_pct_1y":{"rank":1,"n":5000,"pct":0.02},"rank_pct_1m":null}',
      );
      expect(stats?.rank_pct_1y).toEqual({ rank: 1, n: 5000, pct: 0.02 });
      expect(stats?.rank_pct_1m).toBeNull();
    });
  });

  describe('边界', () => {
    it('accepts an already parsed object', () => {
      expect(parseRankStats({ rank_pct_3m: { rank: 2, n: 10, pct: 20 } })?.rank_pct_3m).toEqual({
        rank: 2,
        n: 10,
        pct: 20,
      });
    });
  });

  describe('异常', () => {
    it('returns null for junk', () => {
      expect(parseRankStats('')).toBeNull();
      expect(parseRankStats('{')).toBeNull();
      expect(parseRankStats(null)).toBeNull();
    });
  });
});

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
      expect(ranks.get('b')).toEqual({ rank: 1, n: 3, pct: 100 / 3 });
      expect(ranks.get('d')).toEqual({ rank: 1, n: 3, pct: 100 / 3 });
      expect(ranks.get('a')).toEqual({ rank: 3, n: 3, pct: 100 });
      expect(ranks.get('c')).toBeNull();
    });
  });

  describe('边界', () => {
    it('gives 100 to a single eligible fund', () => {
      const ranks = assignRanks([{ fundCode: 'only', value: 1 }]);
      expect(ranks.get('only')).toEqual({ rank: 1, n: 1, pct: 100 });
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
      expect(ranks.get('b')?.percents.rank_pct_1y).toBe(50);
      expect(ranks.get('b')?.stats.rank_pct_1y).toEqual({ rank: 1, n: 2, pct: 50 });
      expect(ranks.get('a')?.percents.rank_pct_1y).toBe(100);
      expect(ranks.get('c')?.percents.rank_pct_1y).toBe(100);
    });
  });

  describe('边界', () => {
    it('keeps null windows null after grouping', () => {
      const row = fund('z', '指数型-股票', null);
      const ranks = rankPeerGroups([row]);
      expect(ranks.get('z')).toEqual({ percents: emptyRankPercents(), stats: emptyRankStats() });
    });
  });

  describe('异常', () => {
    it('returns an empty map for no funds', () => {
      expect(rankPeerGroups([]).size).toBe(0);
    });
  });
});
