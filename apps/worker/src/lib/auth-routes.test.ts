import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import type { AuthConfig } from './auth-config';
import { mePayload, registerAuthRoutes, requireSession } from './auth-routes';
import { SESSION_COOKIE, signSession } from './session';

const AUTH: AuthConfig = {
  enabled: true,
  required: true,
  clientId: 'cid',
  clientSecret: 'sec',
  sessionSecret: 'test-session-secret-at-least-32-chars',
  allowedEmails: ['a@b.com'],
};

function appWithAuth() {
  const app = new Hono();
  registerAuthRoutes(app, AUTH);
  app.use('/api/*', (c, next) => requireSession(c, AUTH, next));
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
  });
});

describe('requireSession', () => {
  it('lets live and me through', async () => {
    const app = appWithAuth();
    const me = await app.request('http://local/api/me');
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ authenticated: false, authRequired: true });
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
    const app = new Hono();
    const cfg: AuthConfig = { ...AUTH, enabled: false, required: true };
    registerAuthRoutes(app, cfg);
    app.use('/api/*', (c, next) => requireSession(c, cfg, next));
    app.get('/api/source', (c) => c.json({ ok: true }));
    expect((await app.request('http://local/api/source')).status).toBe(503);
    expect((await app.request('http://local/api/auth/google')).status).toBe(503);
  });
});
