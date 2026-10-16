import { afterEach, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { TokenStore } from './api-tokens';
import type { AuthConfig } from './auth-config';
import { apiCors, isAllowedOrigin, type OriginPolicy } from './origin-policy';
import { SESSION_COOKIE, signSession } from './session';
import { registerTokenRoutes, requireSessionOrToken } from './token-auth';

const auth: AuthConfig = {
  enabled: true,
  required: true,
  clientId: 'test',
  clientSecret: 'test',
  sessionSecret: 'origin-test-session-secret-at-least-32',
  allowedEmails: [],
};
const policy: OriginPolicy = {
  canonicalOrigin: 'https://fundly.example',
  allowedOrigins: ['https://reader.example'],
  development: false,
};
const stores: TokenStore[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
});
async function setup() {
  const store = new TokenStore(':memory:');
  stores.push(store);
  const app = new Hono();
  app.use('/api/*', apiCors(policy));
  app.use('/api/*', (c, next) => requireSessionOrToken(c, auth, store, next, policy));
  registerTokenRoutes(app, auth, store);
  const cookie = `${SESSION_COOKIE}=${await signSession({ email: 'test@example.com', sub: 'test', name: null, avatar: null }, auth.sessionSecret)}`;
  return { app, store, headers: { cookie, 'content-type': 'application/json' } };
}
test('origin matching uses own/canonical/explicit origins, not arbitrary or spoofed origins', () => {
  for (const origin of ['https://api.example', 'https://fundly.example', 'https://reader.example'])
    expect(isAllowedOrigin(origin, 'https://api.example/api/tokens', policy)).toBe(true);
  for (const origin of [
    'https://evil.example',
    'null',
    'https://fundly.example.evil',
    'https://fundly.example/path',
    'https://user@fundly.example',
    'http://localhost:7044',
  ])
    expect(isAllowedOrigin(origin, 'https://api.example/api/tokens', policy)).toBe(false);
  const dev = { ...policy, development: true };
  for (const origin of ['http://localhost:7044', 'http://127.0.0.1:7044', 'http://[::1]:7044'])
    expect(isAllowedOrigin(origin, 'https://api.example', dev)).toBe(true);
  expect(isAllowedOrigin('http://localhost.evil:7044', 'https://api.example', dev)).toBe(false);
});
test('session token creation and revoke require JSON, including when Origin is absent', async () => {
  const { app, store, headers } = await setup();
  const body = JSON.stringify({ name: 'bot', scopes: ['funds:read'] });
  for (const type of ['text/plain', 'application/x-www-form-urlencoded', '']) {
    expect(
      (
        await app.request('https://fundly.example/api/tokens', {
          method: 'POST',
          headers: { ...headers, 'content-type': type },
          body,
        })
      ).status,
    ).toBe(415);
  }
  expect(store.list()).toHaveLength(0);
  const created = await app.request('https://fundly.example/api/tokens', {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json; charset=utf-8' },
    body,
  });
  expect(created.status).toBe(201);
  const { id } = (await created.json()) as { id: string };
  expect(
    (
      await app.request(`https://fundly.example/api/tokens/${id}/revoke`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'text/plain' },
        body: '{}',
      })
    ).status,
  ).toBe(415);
  expect(store.list()[0]?.status).toBe('active');
});
test('foreign origins cannot create/revoke/delete session tokens; trusted and absent origins can', async () => {
  const { app, store, headers } = await setup();
  const body = JSON.stringify({ name: 'bot', scopes: ['funds:read'] });
  expect(
    (
      await app.request('https://fundly.example/api/tokens', {
        method: 'POST',
        headers: { ...headers, origin: 'https://evil.example', 'x-forwarded-host': 'evil.example' },
        body,
      })
    ).status,
  ).toBe(403);
  expect(store.list()).toHaveLength(0);
  for (const origin of ['https://fundly.example', 'https://reader.example'])
    expect(
      (
        await app.request('https://fundly.example/api/tokens', {
          method: 'POST',
          headers: { ...headers, origin },
          body,
        })
      ).status,
    ).toBe(201);
  const id = store.list()[0]?.id;
  expect(
    (
      await app.request(`https://fundly.example/api/tokens/${id}/revoke`, {
        method: 'POST',
        headers: { ...headers, origin: 'null' },
      })
    ).status,
  ).toBe(403);
  expect(store.list()[0]?.status).toBe('active');
  expect(
    (
      await app.request(`https://fundly.example/api/tokens/${id}/revoke`, {
        method: 'POST',
        headers: { ...headers, origin: 'https://fundly.example' },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await app.request(`https://fundly.example/api/tokens/${id}`, {
        method: 'DELETE',
        headers: { ...headers, origin: 'https://evil.example' },
      })
    ).status,
  ).toBe(403);
  expect(store.list()).toHaveLength(2);
  expect(
    (await app.request(`https://fundly.example/api/tokens/${id}`, { method: 'DELETE', headers }))
      .status,
  ).toBe(200);
});
test('CORS never reflects an untrusted origin with credentials and validates preflights', async () => {
  const app = new Hono();
  app.use('/api/*', apiCors(policy));
  app.get('/api/live', (c) => c.json({ ok: true }));
  for (const origin of ['https://evil.example', 'null']) {
    const res = await app.request('https://fundly.example/api/live', { headers: { origin } });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    expect(res.headers.get('access-control-allow-credentials')).toBeNull();
    expect(
      (
        await app.request('https://fundly.example/api/tokens', {
          method: 'OPTIONS',
          headers: { origin },
        })
      ).status,
    ).toBe(403);
  }
  const trusted = await app.request('https://fundly.example/api/tokens', {
    method: 'OPTIONS',
    headers: { origin: 'https://reader.example', 'access-control-request-method': 'POST' },
  });
  expect(trusted.status).toBe(204);
  expect(trusted.headers.get('access-control-allow-origin')).toBe('https://reader.example');
  expect(trusted.headers.get('access-control-allow-credentials')).toBe('true');
  expect(trusted.headers.get('vary')).toContain('Origin');
  const noOrigin = await app.request('https://fundly.example/api/live');
  expect(noOrigin.headers.get('access-control-allow-credentials')).toBeNull();
});
