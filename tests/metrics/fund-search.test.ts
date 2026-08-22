import { describe, expect, test } from 'bun:test';
import { parseSearchQuery, searchRecalls, searchScore } from '../../src/metrics/fund-search.ts';

const yfd300 = {
  fundCode: '110020',
  fundName: '易方达沪深300ETF联接A',
  pinyinAbbr: 'YFDHS300ETFLJA',
  pinyinFull: 'YIFANGDA',
  shareLetter: 'A',
};

describe('fund search', () => {
  test('recalls split tokens like 易方达300', () => {
    const q = parseSearchQuery('易方达300');
    expect(q.tokens).toEqual(['易方达', '300']);
    expect(searchRecalls(q, yfd300)).toBe(true);
    expect(searchScore(q, yfd300)).toBe(12);
    expect(
      searchScore(q, {
        fundCode: '110003',
        fundName: '易方达沪深300指数A',
        pinyinAbbr: 'YFD',
        pinyinFull: 'YIFANGDA',
        shareLetter: 'A',
      }),
    ).toBe(4);
  });

  test('penalizes product signal mismatch both ways', () => {
    const etf = parseSearchQuery('易方达300ETF');
    expect(
      searchScore(etf, {
        fundCode: '110003',
        fundName: '易方达沪深300指数A',
        pinyinAbbr: null,
        pinyinFull: null,
        shareLetter: 'A',
      }),
    ).toBe(8);
  });

  test('pure F does not recall ETF names', () => {
    const q = parseSearchQuery('F');
    expect(
      searchRecalls(q, {
        fundCode: '510300',
        fundName: '华泰柏瑞沪深300ETF',
        pinyinAbbr: null,
        pinyinFull: null,
        shareLetter: '',
      }),
    ).toBe(false);
    expect(
      searchRecalls(q, {
        fundCode: '000123',
        fundName: '易方达安悦超短债F',
        pinyinAbbr: null,
        pinyinFull: null,
        shareLetter: 'F',
      }),
    ).toBe(true);
  });

  test('exact code wins', () => {
    const q = parseSearchQuery('110020');
    expect(searchScore(q, yfd300)).toBe(0);
  });

  test('empty query with no signal recalls nothing', () => {
    const q = parseSearchQuery('***');
    expect(searchRecalls(q, yfd300)).toBe(false);
  });

  test('pure ETF only recalls ETF names', () => {
    const q = parseSearchQuery('ETF');
    expect(searchRecalls(q, yfd300)).toBe(true);
    expect(
      searchRecalls(q, {
        ...yfd300,
        fundName: '华夏成长混合',
        fundCode: '000001',
        shareLetter: '',
      }),
    ).toBe(false);
  });
});
