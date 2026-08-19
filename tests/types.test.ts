import { describe, expect, test } from 'bun:test';
import { isMvpFundType, MVP_FUND_TYPES } from '../src/utils/types.ts';

describe('isMvpFundType', () => {
  test('accepts all whitelisted types', () => {
    for (const t of MVP_FUND_TYPES) {
      expect(isMvpFundType(t)).toBe(true);
    }
  });

  test('rejects bond and money market types', () => {
    expect(isMvpFundType('债券型-长债')).toBe(false);
    expect(isMvpFundType('货币型-普通货币')).toBe(false);
    expect(isMvpFundType('FOF-稳健型')).toBe(false);
  });

  test('rejects unknown/empty', () => {
    expect(isMvpFundType('')).toBe(false);
    expect(isMvpFundType('未知类型')).toBe(false);
  });
});
