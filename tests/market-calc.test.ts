import { describe, expect, test } from 'bun:test';
import {
  computeEtfPremiumDiscount,
  computeMarketBreadth,
  computeRelativeStrength,
  computeRollingReturn,
} from '../src/metrics/market-calc.ts';
import type { MarketDailyBar } from '../src/utils/market-types.ts';

describe('market calculation metrics and regressions', () => {
  test('computeRollingReturn requires N+1 bars and computes strict percent', () => {
    const bars: MarketDailyBar[] = Array.from({ length: 21 }, (_, i) => ({
      instrumentId: 'test',
      tradeDate: `2026-08-${String(i + 1).padStart(2, '0')}`,
      source: 'test',
      open: 100 + i,
      high: 102 + i,
      low: 99 + i,
      close: 100 + i * 2, // base = 100, current = 140
    }));

    // 20-day return with 21 points
    const ret20 = computeRollingReturn(bars, 20);
    expect(ret20).toBe(40);

    // If only 20 points, cannot compute 20-day return (needs 21 points)
    expect(computeRollingReturn(bars.slice(0, 20), 20)).toBeNull();
  });

  test('computeRelativeStrength strictly aligns start and end dates and returns null on date mismatch or missing suspension', () => {
    const indBarsNormal: MarketDailyBar[] = [
      {
        instrumentId: 'ind',
        tradeDate: '2026-08-01',
        source: 't',
        open: 10,
        high: 12,
        low: 9,
        close: 10,
      },
      {
        instrumentId: 'ind',
        tradeDate: '2026-08-02',
        source: 't',
        open: 10,
        high: 12,
        low: 9,
        close: 12,
      }, // +20%
    ];
    const bmBarsNormal: MarketDailyBar[] = [
      {
        instrumentId: 'bm',
        tradeDate: '2026-08-01',
        source: 't',
        open: 100,
        high: 105,
        low: 95,
        close: 100,
      },
      {
        instrumentId: 'bm',
        tradeDate: '2026-08-02',
        source: 't',
        open: 100,
        high: 105,
        low: 95,
        close: 105,
      }, // +5%
    ];

    // 正常相同起止日期：20% - 5% = +15 pp
    const rs = computeRelativeStrength(indBarsNormal, bmBarsNormal, 1);
    expect(rs).toBe(15);

    // 反例 1：最新日期不一致（例如行业停牌，缺少最新交易日）
    const indBarsSuspended: MarketDailyBar[] = [
      {
        instrumentId: 'ind',
        tradeDate: '2026-07-31',
        source: 't',
        open: 10,
        high: 12,
        low: 9,
        close: 10,
      },
      {
        instrumentId: 'ind',
        tradeDate: '2026-08-01',
        source: 't',
        open: 10,
        high: 12,
        low: 9,
        close: 12,
      },
    ];
    expect(computeRelativeStrength(indBarsSuspended, bmBarsNormal, 1)).toBeNull();

    // 反例 2：基准起点在行业中缺日
    const indBarsMissingStart: MarketDailyBar[] = [
      {
        instrumentId: 'ind',
        tradeDate: '2026-07-30',
        source: 't',
        open: 10,
        high: 12,
        low: 9,
        close: 10,
      },
      {
        instrumentId: 'ind',
        tradeDate: '2026-08-02',
        source: 't',
        open: 10,
        high: 12,
        low: 9,
        close: 12,
      },
    ];
    expect(computeRelativeStrength(indBarsMissingStart, bmBarsNormal, 1)).toBeNull();
  });

  test('computeEtfPremiumDiscount strictly requires same-date validation and returns null when dates differ', () => {
    // 510300 on 2026-09-04: price 4.616, nav 4.6147 -> ~ +0.0282%
    const pdSameDate = computeEtfPremiumDiscount(4.616, '2026-09-04', 4.6147, '2026-09-04');
    expect(pdSameDate).toBeCloseTo(0.0282, 3);

    // 反例：市价为 09-04，但现有库 NAV 仅到 08-20，严禁跨日误算，必须返回 null
    const pdCrossDate = computeEtfPremiumDiscount(4.616, '2026-09-04', 4.6147, '2026-08-20');
    expect(pdCrossDate).toBeNull();

    // 非法或缺失数值返回 null
    expect(computeEtfPremiumDiscount(null, '2026-09-04', 4.6147, '2026-09-04')).toBeNull();
    expect(computeEtfPremiumDiscount(4.616, '2026-09-04', 0, '2026-09-04')).toBeNull();
  });

  test('computeMarketBreadth handles duplicate codes, non-finite values (Infinity/NaN), and non-SH/SZ codes', () => {
    const rawQuotes = [
      // 合法深市
      {
        code: '000001.SZ',
        price: 11.89,
        prevClose: 11.88,
        volume: 81437295,
        turnover: 969948440,
        changePct: 0.084175,
      },
      // 重复代码（应当去重）
      { code: '000001.SZ', price: 11.89, prevClose: 11.88, volume: 81437295, turnover: 969948440 },
      // 合法沪市
      {
        code: '600519.SH',
        price: 1800,
        prevClose: 1850,
        volume: 10000,
        turnover: 18000000,
        changePct: -2.7027,
      },
      // 平盘
      {
        code: '000008.SZ',
        price: 2.49,
        prevClose: 2.49,
        volume: 1000,
        turnover: 2490,
        changePct: 0,
      },
      // 反例 1：含 Infinity
      {
        code: '000009.SZ',
        price: Number.POSITIVE_INFINITY,
        prevClose: 10,
        volume: 100,
        turnover: 1000,
      },
      // 反例 2：含 NaN
      { code: '000010.SZ', price: Number.NaN, prevClose: 10, volume: 100, turnover: 1000 },
      // 反例 3：非 SH/SZ 范围（如三板或基金代码 43/83/51 开头等非 A 股普通股）
      { code: '831001.BJ', price: 10, prevClose: 9, volume: 100, turnover: 1000 },
    ];

    const b = computeMarketBreadth(rawQuotes, '2026-09-04', 5567, {
      limitUpCount: 38,
      limitDownCount: 9,
      limitBreakCount: 48,
    });
    expect(b.totalValidCount).toBe(3); // 000001, 600519, 000008
    expect(b.upCount).toBe(1);
    expect(b.downCount).toBe(1);
    expect(b.flatCount).toBe(1);
    expect(b.limitUpCount).toBe(38);
    expect(b.limitDownCount).toBe(9);
    expect(b.limitBreakCount).toBe(48);
  });
});

test('catalog-based breadth includes 689009.SH and excludes assets outside that catalog', () => {
  const quote = { price: 10, prevClose: 9, volume: 100, turnover: 1000, changePct: 1 };
  const breadth = computeMarketBreadth(
    [
      { ...quote, code: '689009.SH' },
      { ...quote, code: '510300.SH' },
    ],
    '2026-09-04',
    1,
    undefined,
    new Set(['689009.SH']),
  );
  expect(breadth.totalValidCount).toBe(1);
  expect(breadth.upCount).toBe(1);
});

test('relative strength refuses a different N-day start even when that date exists elsewhere', () => {
  const industry = [
    { tradeDate: '2026-08-01', close: 100 },
    { tradeDate: '2026-08-03', close: 110 },
    { tradeDate: '2026-08-04', close: 120 },
  ];
  const benchmark = [
    { tradeDate: '2026-08-02', close: 100 },
    { tradeDate: '2026-08-03', close: 105 },
    { tradeDate: '2026-08-04', close: 110 },
  ];
  expect(computeRelativeStrength(industry, benchmark, 2)).toBeNull();
});
