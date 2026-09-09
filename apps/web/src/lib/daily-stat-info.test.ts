import { describe, expect, it } from 'bun:test';
import { DAILY_STAT_INFO, dailyStatInfo } from './daily-stat-info';

describe('dailyStatInfo', () => {
  it('covers STAT_ALIASES labels with concise Chinese blurbs', () => {
    for (const label of ['S&P 500', 'VIX', 'US 10Y', 'DXY', 'Gold'] as const) {
      const text = dailyStatInfo(label);
      expect(text).toBeTruthy();
      expect(text?.length).toBeGreaterThan(8);
      expect(DAILY_STAT_INFO[label]).toBe(text);
    }
  });

  it('returns undefined for unknown labels', () => {
    expect(dailyStatInfo('NASDAQ')).toBeUndefined();
    expect(dailyStatInfo('')).toBeUndefined();
  });
});
