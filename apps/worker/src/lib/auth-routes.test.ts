import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import type { AuthConfig } from './auth-config';
import { mePayload, registerAuthRoutes, requireSession } from './auth-routes';
import { OAUTH_COOKIE, SESSION_COOKIE, signOAuthState, signSession } from './session';

const AUTH: AuthConfig = {
  enabled: true,
  required: true,
  clientId: 'cid',
  clientSecret: 'sec',
  sessionSecret: 'test-session-secret-at-least-32-chars',
  allowedEmails: ['a@b.com'],
};

function appWithAuth(cfg: AuthConfig = AUTH) {
  const app = new Hono();
  registerAuthRoutes(app, cfg);
  app.use('/api/*', (c, next) => requireSession(c, cfg, next));
  app.get('/api/source', (c) => c.json({ ok: true }));
  return app;
}

describe('mePayload', () => {
  it('marks auth required when enabled', () => {
    expect(mePayload(AUTH, null)).toEqual({
      email: null,
      name: null,
      avatar: null,
      authenticated: false,
      authRequired: true,
    });
    expect(
      mePayload(AUTH, { email: 'a@b.com', name: 'A', avatar: 'https://img/a', sub: 's1' }),
    ).toEqual({
      email: 'a@b.com',
      name: 'A',
      avatar: 'https://img/a',
      authenticated: true,
      authRequired: true,
    });
  });
});

describe('requireSession', () => {
  it('lets live and me through', async () => {
    const app = appWithAuth();
    const me = await app.request('http://local/api/me');
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ authenticated: false, authRequired: true });
  });

  it('passes through when auth is disabled and not required', async () => {
    const app = appWithAuth({ ...AUTH, enabled: false, required: false });
    const res = await app.request('http://local/api/source');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('rejects protected routes without a cookie', async () => {
    const app = appWithAuth();
    const res = await app.request('http://local/api/source');
    expect(res.status).toBe(401);
  });

  it('accepts a signed session cookie', async () => {
    const app = appWithAuth();
    const token = await signSession(
      { email: 'a@b.com', name: 'A', avatar: null, sub: 'sub-1' },
      AUTH.sessionSecret,
    );
    const res = await app.request('http://local/api/source', {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('returns 503 when railway requires auth but secrets are missing', async () => {
    const app = appWithAuth({ ...AUTH, enabled: false, required: true });
    expect((await app.request('http://local/api/source')).status).toBe(503);
    expect((await app.request('http://local/api/auth/google')).status).toBe(503);
    expect((await app.request('http://local/api/auth/callback')).headers.get('location')).toBe(
      '/login?error=OAuthFailed',
    );
  });
});

describe('google oauth routes', () => {
  it('starts PKCE flow with state cookie and redirects to Google', async () => {
    const app = appWithAuth({ ...AUTH, originOverride: 'https://fundly.hexly.ai' });
    const res = await app.request('http://127.0.0.1/api/auth/google?from=%2Ffunds%3Fq%3D1');
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('location') ?? '');
    expect(location.origin).toBe('https://accounts.google.com');
    expect(location.searchParams.get('redirect_uri')).toBe(
      'https://fundly.hexly.ai/api/auth/callback',
    );
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(res.headers.get('set-cookie')).toContain(`${OAUTH_COOKIE}=`);
    expect(res.headers.get('set-cookie')).toContain('Secure');
  });

  it('rejects error query, mismatched state, exchange failures, and disallowed emails', async () => {
    const app = appWithAuth();
    expect(
      (await app.request('http://local/api/auth/callback?error=access_denied')).headers.get(
        'location',
      ),
    ).toBe('/login?error=OAuthFailed');
    expect(
      (await app.request('http://local/api/auth/callback?code=c&state=s')).headers.get('location'),
    ).toBe('/login?error=OAuthFailed');

    const stateCookie = await signOAuthState(
      { state: 'st-1', verifier: 'ver-1', redirect: '/funds' },
      AUTH.sessionSecret,
    );

    const prevFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response('bad token', { status: 400 })) as typeof fetch;
    try {
      const failed = await app.request('http://local/api/auth/callback?code=c&state=st-1', {
        headers: { cookie: `${OAUTH_COOKIE}=${stateCookie}` },
      });
      expect(failed.headers.get('location')).toBe('/login?error=OAuthFailed');
    } finally {
      globalThis.fetch = prevFetch;
    }

    globalThis.fetch = (async (input) => {
      if (String(input).includes('/token')) return Response.json({ access_token: 'tok' });
      return Response.json({ sub: 's2', email: 'other@b.com', email_verified: true });
    }) as typeof fetch;
    try {
      const denied = await app.request('http://local/api/auth/callback?code=c&state=st-1', {
        headers: { cookie: `${OAUTH_COOKIE}=${stateCookie}` },
      });
      expect(denied.headers.get('location')).toBe('/login?error=AccessDenied');
    } finally {
      globalThis.fetch = prevFetch;
    }
  });

  it('sets session cookie on valid callback and clears cookies on logout', async () => {
    const app = appWithAuth();
    const stateCookie = await signOAuthState(
      { state: 'st-ok', verifier: 'ver-ok', redirect: '/select/picks' },
      AUTH.sessionSecret,
    );
    const prevFetch = globalThis.fetch;
    globalThis.fetch = (async (input) => {
      if (String(input).includes('/token')) return Response.json({ access_token: 'tok' });
      return Response.json({
        sub: 's1',
        email: 'a@b.com',
        email_verified: true,
        name: 'User',
        picture: null,
      });
    }) as typeof fetch;
    try {
      const cb = await app.request('http://local/api/auth/callback?code=c&state=st-ok', {
        headers: { cookie: `${OAUTH_COOKIE}=${stateCookie}` },
      });
      expect(cb.status).toBe(302);
      expect(cb.headers.get('location')).toBe('/select/picks');
      const cookies = cb.headers.getSetCookie().join('; ');
      expect(cookies).toContain(`${SESSION_COOKIE}=`);
    } finally {
      globalThis.fetch = prevFetch;
    }

    const logout = await app.request('http://local/api/auth/logout', { method: 'POST' });
    expect(logout.status).toBe(200);
    expect(await logout.json()).toEqual({ ok: true });
    expect(logout.headers.getSetCookie().join('; ')).toContain(`${SESSION_COOKIE}=`);
  });
});
