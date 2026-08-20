import { describe, expect, it } from 'bun:test';
import {
  isCrawledReturnField,
  isLiveReturnField,
  isNavOnlyReturnField,
} from '../../src/metrics/index.ts';

describe('return field predicates', () => {
  describe('正常', () => {
    it('classifies crawled vs nav-only vs live keys', () => {
      expect(isCrawledReturnField('return_1y')).toBe(true);
      expect(isCrawledReturnField('return_2y')).toBe(false);
      expect(isNavOnlyReturnField('return_5y')).toBe(true);
      expect(isNavOnlyReturnField('return_1m')).toBe(false);
      expect(isLiveReturnField('return_ytd')).toBe(true);
    });
  });

  describe('边界', () => {
    it('treats since-inception as live but neither crawled nor nav-only', () => {
      expect(isLiveReturnField('return_since_start')).toBe(true);
      expect(isCrawledReturnField('return_since_start')).toBe(false);
      expect(isNavOnlyReturnField('return_since_start')).toBe(false);
    });
  });

  describe('异常', () => {
    it('rejects unknown keys', () => {
      expect(isLiveReturnField('fund_name')).toBe(false);
      expect(isLiveReturnField('')).toBe(false);
    });
  });
});
