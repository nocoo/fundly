import { describe, expect, test } from 'bun:test';
import { computeHoldMetrics } from '../../src/analytics/hold-metrics.ts';

function series(start: string, values: number[]): Array<{ navDate: string; trNav: number }> {
  const day = new Date(`${start}T00:00:00Z`);
  return values.map((trNav, index) => {
    const d = new Date(day);
    d.setUTCDate(d.getUTCDate() + index);
    return { navDate: d.toISOString().slice(0, 10), trNav };
  });
}

describe('computeHoldMetrics', () => {
  test('uses the peak that produced max drawdown for recovery days', () => {
    const values = [
      ...Array.from({ length: 50 }, (_, i) => 100 - i),
      ...Array.from({ length: 50 }, (_, i) => 50 + i),
      ...Array.from({ length: 266 }, (_, i) => 100 + i),
    ];
    const got = computeHoldMetrics(series('2025-01-01', values));
    expect(got.recovery_status_1y).toBe('recovered');
    expect(got.recovery_days_1y).toBe(50);
  });

  test('keeps open recoveries distinct from insufficient samples', () => {
    const open = computeHoldMetrics(
      series('2025-01-01', [
        ...Array.from({ length: 300 }, () => 100),
        ...Array.from({ length: 70 }, (_, i) => 80 - i),
      ]),
    );
    expect(open.recovery_status_1y).toBe('open');
    expect(open.recovery_days_1y).toBeNull();
    const short = computeHoldMetrics(
      series(
        '2025-01-01',
        Array.from({ length: 80 }, () => 1),
      ),
    );
    expect(short.recovery_status_1y).toBe('insufficient');
    expect(short.recovery_days_1y).toBeNull();
  });
});
