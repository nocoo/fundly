import { describe, expect, it } from 'bun:test';
import { decodeJwtPayload } from './me';

describe('decodeJwtPayload', () => {
  it('returns null for malformed tokens', () => {
    expect(decodeJwtPayload('not-a-jwt')).toBeNull();
    expect(decodeJwtPayload('a.b')).toBeNull();
  });

  it('decodes a JSON payload segment', () => {
    const payload = btoa(JSON.stringify({ email: 'a@b.com', name: 'A' }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(decodeJwtPayload(`x.${payload}.y`)).toEqual({ email: 'a@b.com', name: 'A' });
  });
});
