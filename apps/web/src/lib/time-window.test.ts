import { describe, expect, it } from 'bun:test';
import { formatAxisDay, parseRangeYears, rangeBounds, utcTs } from './time-window';

describe('parseRangeYears', () => {
  it('defaults to 5 years', () => {
    expect(parseRangeYears(null)).toBe(5);
    expect(parseRangeYears('5')).toBe(5);
    expect(parseRangeYears('10')).toBe(10);
    expect(parseRangeYears('2')).toBe(5);
  });
});

describe('rangeBounds', () => {
  it('opens a full calendar window ending on the given day', () => {
    expect(rangeBounds(5, new Date('2026-08-20T12:00:00Z'))).toEqual({
      from: '2021-08-20',
      to: '2026-08-20',
    });
    expect(utcTs('2026-08-20')).toBe(Date.parse('2026-08-20T00:00:00Z'));
    expect(formatAxisDay(utcTs('2026-08-20'))).toBe('2026-08');
  });
});
