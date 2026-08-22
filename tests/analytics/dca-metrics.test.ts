import { describe, expect, test } from 'bun:test';
import { computeDcaMetrics } from '../../src/analytics/dca-metrics.ts';

describe('computeDcaMetrics', () => {
  test('uses last trading day of each calendar month', () => {
    const points: Array<{ navDate: string; trNav: number }> = [];
    for (let i = 0; i < 36; i++) {
      const d = new Date(Date.UTC(2023, 8 + i, 1));
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      points.push({ navDate: `${y}-${m}-01`, trNav: 1 }, { navDate: `${y}-${m}-28`, trNav: 2 });
    }
    const got = computeDcaMetrics(points);
    expect(got.dca_vs_lump_3y).toBeCloseTo(0, 8);
    expect(got.dca_month_win_3y).toBe(0);
    expect(got.dca_month_vol_3y).toBe(0);
  });
});
