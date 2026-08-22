import { describe, expect, test } from 'bun:test';
import {
  buildTotalReturn,
  type TotalReturnNav,
  trWindowReturn,
} from '../../src/analytics/total-return.ts';

function navs(rows: Array<[string, number, number | null]>): TotalReturnNav[] {
  return rows.map(([navDate, unitNav, dailyReturn]) => ({ navDate, unitNav, dailyReturn }));
}

describe('buildTotalReturn', () => {
  test('returns null without unit nav', () => {
    expect(buildTotalReturn([])).toBeNull();
  });

  test('chains official daily returns including dividend days', () => {
    const series = buildTotalReturn(
      navs([
        ['2026-01-01', 1, null],
        ['2026-01-02', 1.1, 10],
        ['2026-01-03', 1.0, 5],
      ]),
      [{ eventDate: '2026-01-03', eventType: 'dividend', dividendPerShare: 0.1, splitRatio: null }],
    );
    expect(series).not.toBeNull();
    expect(series?.[2]?.trNav).toBeCloseTo(1.1 * 1.05, 8);
  });

  test('adds cash dividend only when daily return is missing', () => {
    const series = buildTotalReturn(
      navs([
        ['2026-01-01', 1, null],
        ['2026-01-02', 0.9, null],
      ]),
      [{ eventDate: '2026-01-02', eventType: 'dividend', dividendPerShare: 0.1, splitRatio: null }],
    );
    expect(series?.[1]?.trNav).toBeCloseTo(1, 8);
  });

  test('applies split only on the unit-nav branch', () => {
    const withDaily = buildTotalReturn(
      navs([
        ['2026-01-01', 2, null],
        ['2026-01-02', 1, 0],
      ]),
      [{ eventDate: '2026-01-02', eventType: 'split', dividendPerShare: null, splitRatio: 2 }],
    );
    expect(withDaily?.[1]?.trNav).toBeCloseTo(1, 8);

    const unitOnly = buildTotalReturn(
      navs([
        ['2026-01-01', 2, null],
        ['2026-01-02', 1, null],
      ]),
      [{ eventDate: '2026-01-02', eventType: 'split', dividendPerShare: null, splitRatio: 2 }],
    );
    expect(unitOnly?.[1]?.trNav).toBeCloseTo(1, 8);
  });
});

describe('trWindowReturn', () => {
  test('uses last point on or before each bound', () => {
    const series = buildTotalReturn(
      navs([
        ['2024-01-01', 1, null],
        ['2025-01-01', 1.5, 50],
        ['2026-01-01', 2, 100 / 3],
      ]),
    );
    expect(trWindowReturn(series, '2025-01-01', '2026-01-01')).toBeCloseTo((2 / 1.5 - 1) * 100, 5);
  });
});
