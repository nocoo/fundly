import { describe, expect, it } from 'bun:test';
import { resolveDataSource } from './source';

describe('resolveDataSource', () => {
  it('defaults to sqlite locally and allows both', () => {
    expect(resolveDataSource({ requested: null, environment: 'development' })).toEqual({
      source: 'sqlite',
      allowed: ['sqlite', 'd1'],
      rejected: false,
    });
  });

  it('honours an explicit local d1 request', () => {
    expect(resolveDataSource({ requested: 'd1', environment: 'development' }).source).toBe('d1');
  });

  it('locks production to d1 and rejects sqlite', () => {
    expect(resolveDataSource({ requested: 'sqlite', environment: 'production' })).toEqual({
      source: 'd1',
      allowed: ['d1'],
      rejected: true,
    });
    expect(resolveDataSource({ requested: null, environment: 'production' }).source).toBe('d1');
  });
});
