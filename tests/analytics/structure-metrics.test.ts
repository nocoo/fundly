import { describe, expect, test } from 'bun:test';
import { computeExcessHs300, computeTop10Weight } from '../../src/analytics/structure-metrics.ts';

describe('computeTop10Weight', () => {
  test('returns null when any holding weight is missing', () => {
    expect(computeTop10Weight([{ hold_pct: 10 }, { hold_pct: null }])).toBeNull();
    expect(computeTop10Weight([{ hold_pct: 10 }, { hold_pct: 20 }])).toBe(30);
  });
});

describe('computeExcessHs300', () => {
  test('requires aligned dates and 200 samples', () => {
    expect(
      computeExcessHs300(
        [
          { navDate: '2025-01-01', trNav: 1 },
          { navDate: '2026-01-01', trNav: 2 },
        ],
        [
          { navDate: '2024-12-31', trNav: 1 },
          { navDate: '2026-01-01', trNav: 1.5 },
        ],
        '2026-01-01',
      ),
    ).toEqual({ excess: null, asof: null });
  });

  test('computes excess on the intersection window', () => {
    const fund = Array.from({ length: 320 }, (_, i) => {
      const d = new Date(Date.UTC(2025, 0, 1 + i));
      return { navDate: d.toISOString().slice(0, 10), trNav: 1 + i * 0.01 };
    });
    const bench = fund.map((row) => ({ navDate: row.navDate, trNav: 1 + 0.005 }));
    const asof = fund[fund.length - 1]?.navDate ?? '2025-11-16';
    const got = computeExcessHs300(fund, bench, asof);
    expect(got.excess).not.toBeNull();
    expect(got.asof).toBe(asof);
  });
});
