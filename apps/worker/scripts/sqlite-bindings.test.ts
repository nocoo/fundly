import { describe, expect, it } from 'bun:test';
import { toSqliteBindings } from './sqlite-bindings';

describe('toSqliteBindings', () => {
  it('keeps sqlite-legal values and rejects objects', () => {
    expect(toSqliteBindings(['a', 1, null, undefined])).toEqual(['a', 1, null, null]);
    expect(() => toSqliteBindings([{}])).toThrow('unsupported sqlite binding');
  });
});
