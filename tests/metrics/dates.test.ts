import { describe, expect, it } from 'bun:test';
import { addCalendarMonths, windowStartDate } from '../../src/metrics/index.ts';

describe('addCalendarMonths', () => {
  describe('正常', () => {
    it('shifts backward and forward by whole months', () => {
      expect(addCalendarMonths('2026-08-18', -1)).toBe('2026-07-18');
      expect(addCalendarMonths('2026-08-18', 4)).toBe('2026-12-18');
      expect(addCalendarMonths('2026-08-18', 0)).toBe('2026-08-18');
    });
  });

  describe('边界', () => {
    it('clamps month-end and leap February', () => {
      expect(addCalendarMonths('2026-03-31', -1)).toBe('2026-02-28');
      expect(addCalendarMonths('2024-03-31', -1)).toBe('2024-02-29');
      expect(addCalendarMonths('2026-01-31', -1)).toBe('2025-12-31');
      expect(addCalendarMonths('2026-12-31', 1)).toBe('2027-01-31');
    });
  });

  describe('异常', () => {
    it('returns the original string when the date is not ISO', () => {
      expect(addCalendarMonths('20260818', -1)).toBe('20260818');
      expect(addCalendarMonths('', -3)).toBe('');
      expect(addCalendarMonths('2026-8-18', -1)).toBe('2026-8-18');
    });
  });
});

describe('windowStartDate', () => {
  describe('正常', () => {
    it('maps every rolling window from an end date', () => {
      expect(windowStartDate('2026-08-18', 'return_1m')).toBe('2026-07-18');
      expect(windowStartDate('2026-08-18', 'return_3m')).toBe('2026-05-18');
      expect(windowStartDate('2026-08-18', 'return_6m')).toBe('2026-02-18');
      expect(windowStartDate('2026-08-18', 'return_1y')).toBe('2025-08-18');
      expect(windowStartDate('2026-08-18', 'return_2y')).toBe('2024-08-18');
      expect(windowStartDate('2026-08-18', 'return_3y')).toBe('2023-08-18');
      expect(windowStartDate('2026-08-18', 'return_5y')).toBe('2021-08-18');
      expect(windowStartDate('2026-08-18', 'return_ytd')).toBe('2025-12-31');
    });
  });

  describe('边界', () => {
    it('uses last day of the previous year for YTD', () => {
      expect(windowStartDate('2026-01-01', 'return_ytd')).toBe('2025-12-31');
      expect(windowStartDate('2000-01-01', 'return_ytd')).toBe('1999-12-31');
    });
  });

  describe('异常', () => {
    it('returns null for since-inception and non-numeric YTD years', () => {
      expect(windowStartDate('2026-08-18', 'return_since_start')).toBeNull();
      expect(windowStartDate('abcd-01-01', 'return_ytd')).toBeNull();
    });
  });
});
