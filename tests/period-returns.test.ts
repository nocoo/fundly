import { describe, expect, it } from 'bun:test';
import {
  addCalendarMonths,
  assignRanks,
  navReturn,
  pass4433,
  windowStartDate,
} from '../src/utils/period-returns.ts';

describe('windowStartDate', () => {
  it('shifts calendar months and clamps month-end', () => {
    expect(addCalendarMonths('2026-08-18', -1)).toBe('2026-07-18');
    expect(addCalendarMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(windowStartDate('2026-08-18', 'return_2y')).toBe('2024-08-18');
    expect(windowStartDate('2026-08-18', 'return_ytd')).toBe('2025-12-31');
    expect(windowStartDate('2026-08-18', 'return_since_start')).toBeNull();
  });
});

describe('navReturn', () => {
  it('prefers accumulated nav and rejects a zero base', () => {
    expect(navReturn({ acc: 1.265, unit: 1.1 }, { acc: 1.5187, unit: 1.3 })).toBeCloseTo(20.06, 2);
    expect(navReturn({ acc: null, unit: 1.2491 }, { acc: null, unit: 1.2985 })).toBeCloseTo(
      3.95,
      2,
    );
    expect(navReturn({ acc: 0, unit: 0 }, { acc: 1.2, unit: 1.2 })).toBeNull();
  });
});

describe('assignRanks', () => {
  it('ranks higher returns closer to 0 and skips nulls', () => {
    const ranks = assignRanks([
      { fundCode: 'a', value: 10 },
      { fundCode: 'b', value: 20 },
      { fundCode: 'c', value: null },
      { fundCode: 'd', value: 20 },
    ]);
    expect(ranks.get('b')).toBeCloseTo(100 / 3);
    expect(ranks.get('d')).toBeCloseTo(100 / 3);
    expect(ranks.get('a')).toBeCloseTo(100);
    expect(ranks.get('c')).toBeNull();
  });
});

describe('pass4433', () => {
  it('requires all six windows inside the 25/33 thresholds', () => {
    expect(
      pass4433({
        rank_pct_1y: 25,
        rank_pct_2y: 25,
        rank_pct_3y: 24,
        rank_pct_5y: 10,
        rank_pct_6m: 100 / 3,
        rank_pct_3m: 30,
      }),
    ).toBe(1);
    expect(
      pass4433({
        rank_pct_1y: 25,
        rank_pct_2y: 25,
        rank_pct_3y: 24,
        rank_pct_5y: 10,
        rank_pct_6m: 100 / 3,
        rank_pct_3m: null,
      }),
    ).toBe(0);
    expect(
      pass4433({
        rank_pct_1y: 25.01,
        rank_pct_2y: 25,
        rank_pct_3y: 24,
        rank_pct_5y: 10,
        rank_pct_6m: 30,
        rank_pct_3m: 30,
      }),
    ).toBe(0);
  });
});
