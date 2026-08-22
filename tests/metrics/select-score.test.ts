import { describe, expect, test } from 'bun:test';
import { computeSelectScore } from '../../src/metrics/select-score.ts';

describe('computeSelectScore', () => {
  test('averages flipped peer percentiles and skips missing dims', () => {
    const peers = [
      { rank_pct_1y: 10, calmar_1y: 2, ulcer_1y: 5, all_in_fee_pct: 1, sales_fee_known: 1 },
      { rank_pct_1y: 90, calmar_1y: 1, ulcer_1y: 15, all_in_fee_pct: 2, sales_fee_known: 1 },
    ];
    const first = peers[0];
    if (!first) throw new Error('missing peer');
    const score = computeSelectScore(first, peers);
    expect(score).not.toBeNull();
    expect(score ?? 0).toBeGreaterThan(50);
  });

  test('nulls when fewer than two dimensions exist', () => {
    expect(
      computeSelectScore(
        {
          rank_pct_1y: 10,
          calmar_1y: null,
          ulcer_1y: null,
          all_in_fee_pct: null,
          sales_fee_known: 0,
        },
        [],
      ),
    ).toBeNull();
  });
});
