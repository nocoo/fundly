import { describe, expect, test } from 'bun:test';
import { computeCostMetrics } from '../../src/analytics/cost-metrics.ts';

describe('computeCostMetrics', () => {
  test('sums known fees', () => {
    const got = computeCostMetrics({
      mgmtFeePct: 1.2,
      custodianFeePct: 0.2,
      salesServiceFeePct: 0.4,
    });
    expect(got.sales_fee_known).toBe(1);
    expect(got.all_in_fee_pct).toBeCloseTo(1.8);
  });

  test('does not treat missing sales as zero', () => {
    expect(
      computeCostMetrics({ mgmtFeePct: 1.2, custodianFeePct: 0.2, salesServiceFeePct: null }),
    ).toEqual({ all_in_fee_pct: null, sales_fee_known: 0 });
  });
});
