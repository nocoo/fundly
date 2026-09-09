import { describe, expect, it } from 'bun:test';
import {
  DEFAULT_DAILY_WIDTH_MODE,
  dailyPageWidthClass,
  parseDailyWidthMode,
} from './daily-width-mode';

describe('parseDailyWidthMode', () => {
  it('defaults to full', () => {
    expect(parseDailyWidthMode(null)).toBe(DEFAULT_DAILY_WIDTH_MODE);
    expect(parseDailyWidthMode(undefined)).toBe('full');
    expect(parseDailyWidthMode('nope')).toBe('full');
    expect(parseDailyWidthMode('full')).toBe('full');
  });

  it('accepts limited', () => {
    expect(parseDailyWidthMode('limited')).toBe('limited');
  });
});

describe('dailyPageWidthClass', () => {
  it('maps modes to page classes', () => {
    expect(dailyPageWidthClass('full')).toBe('daily-page--full');
    expect(dailyPageWidthClass('limited')).toBe('daily-page--limited');
  });
});
