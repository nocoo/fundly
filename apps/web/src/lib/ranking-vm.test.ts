import { describe, expect, it } from 'bun:test';
import {
  contextReturnKeys,
  DEFAULT_TYPE_L1,
  dimByKey,
  listRank,
  normalizeRankingState,
  parseRankingSearch,
  RANKING_PAGE_SIZE,
  RISK_MIN_SAMPLES,
  rankingApiPath,
  rankingStatesEqual,
  rankingUrlState,
  TYPE_L1_ALL,
  visibleDims,
} from './ranking-vm';

const types = [
  { fund_type: '混合型-偏股', n: 10 },
  { fund_type: '混合型-灵活', n: 4 },
  { fund_type: '股票型', n: 3 },
];

describe('parseRankingSearch', () => {
  it('defaults to 混合型 and 近1年', () => {
    const state = parseRankingSearch(new URLSearchParams());
    expect(state.typeL1).toBe(DEFAULT_TYPE_L1);
    expect(state.typeL2).toBe('');
    expect(state.dim.key).toBe('return_1y');
    expect(state.pass4433).toBe(false);
    expect(state.page).toBe(1);
  });

  it('keeps typeL1=all distinct from the default class', () => {
    const all = parseRankingSearch(new URLSearchParams('typeL1=all'));
    expect(all.typeL1).toBe(TYPE_L1_ALL);
    const stock = parseRankingSearch(
      new URLSearchParams('typeL1=股票型&dim=sharpe_1y&pass4433=1&page=2'),
    );
    expect(stock.typeL1).toBe('股票型');
    expect(stock.dim.key).toBe('sharpe_1y');
    expect(stock.pass4433).toBe(true);
    expect(stock.page).toBe(2);
  });
});

describe('normalizeRankingState', () => {
  it('drops invalid L2 and remaps risk dims when risk is unavailable', () => {
    const parsed = parseRankingSearch(
      new URLSearchParams('typeL1=混合型&typeL2=不存在&dim=sharpe_1y'),
    );
    const got = normalizeRankingState(parsed, types, false);
    expect(got.typeL2).toBe('');
    expect(got.dim.key).toBe('return_1y');
    expect(got.typeL1).toBe('混合型');
  });

  it('keeps a valid L2 when the parent matches', () => {
    const parsed = parseRankingSearch(new URLSearchParams('typeL1=混合型&typeL2=偏股'));
    expect(normalizeRankingState(parsed, types, true).typeL2).toBe('偏股');
    expect(normalizeRankingState(parsed, [], true).typeL2).toBe('偏股');
  });
});

describe('ranking urls', () => {
  it('omits default 混合型 and 近1年 from the search string', () => {
    const state = parseRankingSearch(new URLSearchParams());
    expect(rankingUrlState(state)).toEqual({
      typeL1: null,
      typeL2: null,
      dim: null,
      pass4433: null,
      page: null,
    });
  });

  it('writes typeL1=all and ranking query flags', () => {
    const state = parseRankingSearch(
      new URLSearchParams('typeL1=all&dim=max_drawdown_1y&pass4433=1&page=3'),
    );
    expect(rankingUrlState(state).typeL1).toBe(TYPE_L1_ALL);
    expect(rankingUrlState(state).dim).toBe('max_drawdown_1y');
    const path = rankingApiPath(state);
    expect(path).not.toContain('typeL1=');
    expect(path).toContain('sort=max_drawdown_1y');
    expect(path).toContain('dir=asc');
    expect(path).toContain('metricNotNull=1');
    expect(path).toContain('pass4433=1');
    expect(path).toContain(`minSamples=${RISK_MIN_SAMPLES}`);
    expect(path).toContain('page=3');
    expect(path).toContain(`pageSize=${RANKING_PAGE_SIZE}`);
  });
});

describe('helpers', () => {
  it('computes list rank and visible dims', () => {
    expect(listRank(2, 50, 0)).toBe(51);
    expect(visibleDims(false).every((dim) => dim.group === 'return')).toBe(true);
    expect(visibleDims(true).some((dim) => dim.key === 'sharpe_1y')).toBe(true);
    expect(contextReturnKeys(dimByKey('return_1y'))).toEqual(['return_1m']);
    expect(contextReturnKeys(dimByKey('sharpe_1y'))).toEqual(['return_1y', 'return_1m']);
    const a = parseRankingSearch(new URLSearchParams());
    expect(rankingStatesEqual(a, { ...a, page: 1 })).toBe(true);
    expect(rankingStatesEqual(a, { ...a, page: 2 })).toBe(false);
  });
});
