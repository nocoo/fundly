import { describe, expect, it } from 'bun:test';
import {
  safeRedirectPath,
  signOAuthState,
  signSession,
  verifyOAuthState,
  verifySession,
} from './session';

const SECRET = 'test-session-secret-at-least-32-chars';

describe('session jwt', () => {
  it('round-trips a user', async () => {
    const token = await signSession(
      { email: 'a@b.com', name: 'A', avatar: 'https://img/a', sub: 'sub-1' },
      SECRET,
    );
    expect(await verifySession(token, SECRET)).toEqual({
      email: 'a@b.com',
      name: 'A',
      avatar: 'https://img/a',
      sub: 'sub-1',
    });
  });

  it('rejects a token signed with another secret', async () => {
    const token = await signSession(
      { email: 'a@b.com', name: null, avatar: null, sub: 'sub-1' },
      SECRET,
    );
    expect(await verifySession(token, 'other-secret-value-32-chars-long')).toBeNull();
  });
});

describe('oauth state jwt', () => {
  it('round-trips state', async () => {
    const token = await signOAuthState({ state: 's', verifier: 'v', redirect: '/funds' }, SECRET);
    expect(await verifyOAuthState(token, SECRET)).toEqual({
      state: 's',
      verifier: 'v',
      redirect: '/funds',
    });
  });
});

describe('safeRedirectPath', () => {
  it('only allows same-origin paths', () => {
    expect(safeRedirectPath('/funds')).toBe('/funds');
    expect(safeRedirectPath('https://evil.test')).toBe('/');
    expect(safeRedirectPath('//evil.test')).toBe('/');
    expect(safeRedirectPath(null)).toBe('/');
  });
});
