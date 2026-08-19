import { describe, expect, it } from 'bun:test';
import { tokenFromWranglerJson } from './cf-token';

describe('tokenFromWranglerJson', () => {
  it('reads token from wrangler --json output', () => {
    expect(tokenFromWranglerJson('{"token":"abc","type":"oauth"}')).toBe('abc');
  });

  it('rejects missing token fields', () => {
    expect(() => tokenFromWranglerJson('{"ok":true}')).toThrow('missing token');
  });
});
