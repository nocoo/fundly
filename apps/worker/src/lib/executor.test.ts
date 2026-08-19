import { describe, expect, it } from 'bun:test';
import { toSqlBindings } from './executor';

describe('toSqlBindings', () => {
  it('keeps sqlite-legal values and rejects objects', () => {
    expect(toSqlBindings(['a', 1, null, undefined])).toEqual(['a', 1, null, null]);
    expect(() => toSqlBindings([{}])).toThrow('unsupported sqlite binding');
    expect(() => toSqlBindings([Number.NaN])).toThrow('non-finite');
    expect(() => toSqlBindings([1n])).toThrow('bigint');
  });
});
