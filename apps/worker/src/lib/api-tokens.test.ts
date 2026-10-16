import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { hashToken, TokenStore } from './api-tokens';
import type { AuthConfig } from './auth-config';
import { READ_RESOURCES } from './read-resources';
import { SESSION_COOKIE, signSession } from './session';
import { registerTokenRoutes, requireSessionOrToken, scopeForPath } from './token-auth';

const auth: AuthConfig = {
  enabled: true,
  required: true,
  clientId: 'test',
  clientSecret: 'test',
  sessionSecret: 'token-test-session-secret-at-least-32',
  allowedEmails: [],
};
const stores: TokenStore[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
});
function setup() {
  const store = new TokenStore(':memory:');
  stores.push(store);
  const app = new Hono();
  app.use('/api/*', (c, next) => requireSessionOrToken(c, auth, store, next));
  registerTokenRoutes(app, auth, store);
  app.get('/api/funds', (c) => c.json({ ok: true }));
  app.post('/api/backy', (c) => c.json({ ok: true }));
  app.get('/api/unknown', (c) => c.json({ ok: true }));
  return { app, store };
}
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
async function session() {
  return {
    cookie: `${SESSION_COOKIE}=${await signSession({ email: 'test@example.com', sub: 'test', name: null, avatar: null }, auth.sessionSecret)}`,
  };
}
describe('API tokens', () => {
  test('hashes SHA-256, stores no plaintext, returns secret once, and persists independently', () => {
    expect(hashToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    const dir = mkdtempSync(join(tmpdir(), 'fundly-token-store-'));
    let store = new TokenStore(join(dir, 'auth.db'));
    try {
      const created = store.create('test', ['funds:read'], 'test@example.com');
      expect(created.token).toMatch(/^fdk_[A-Za-z0-9_-]{43}$/);
      expect(created.token_prefix).toBe(created.token.slice(0, 12));
      const stored = JSON.stringify(store.db.query('SELECT * FROM api_tokens').all());
      expect(stored).not.toContain(created.token);
      expect(stored).toContain(hashToken(created.token));
      expect(store.list()[0]).not.toHaveProperty('token_hash');
      store.close();
      store = new TokenStore(join(dir, 'auth.db'));
      expect(store.authenticate(created.token)?.id).toBe(created.id);
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test('session works unchanged, even with a bad bearer header', async () => {
    const { app } = setup();
    expect(
      (
        await app.request('/api/funds', {
          headers: { ...(await session()), authorization: 'Bearer bad' },
        })
      ).status,
    ).toBe(200);
    expect(
      (await app.request('/api/backy', { method: 'POST', headers: await session() })).status,
    ).toBe(200);
    expect((await app.request('/api/funds')).status).toBe(401);
  });
  test('accepts bearer GET/HEAD and wildcard, updates usage at most once per minute', async () => {
    const { app, store } = setup();
    const token = store.create('bot', ['funds:read'], 'test');
    expect((await app.request('/api/funds', { headers: bearer(token.token) })).status).toBe(200);
    expect(
      (await app.request('/api/funds', { method: 'HEAD', headers: bearer(token.token) })).status,
    ).toBe(200);
    const used = store.list()[0]?.last_used_at;
    expect(used).toBeNumber();
    store.authenticate(token.token);
    expect(store.list()[0]?.last_used_at).toBe(used);
    const wildcard = store.create('bot', ['*:read'], 'test');
    expect((await app.request('/api/funds', { headers: bearer(wildcard.token) })).status).toBe(200);
  });
  test('denies wrong scopes, mutations, management and unmapped paths', async () => {
    const { app, store } = setup();
    const wrong = store.create('wrong', ['market:read'], 'test');
    expect((await app.request('/api/funds', { headers: bearer(wrong.token) })).status).toBe(403);
    const token = store.create('all', ['*:read'], 'test');
    for (const [method, path] of [
      ['POST', '/api/backy'],
      ['GET', '/api/tokens'],
      ['POST', '/api/tokens'],
      ['POST', '/api/tokens/id/revoke'],
      ['DELETE', '/api/tokens/id'],
      ['GET', '/api/unknown'],
    ])
      expect((await app.request(path ?? '', { method, headers: bearer(token.token) })).status).toBe(
        403,
      );
    expect((await app.request('/api/funds', { headers: bearer('fdk_bad') })).status).toBe(401);
    expect(
      (await app.request('/api/funds', { headers: { authorization: 'Basic test' } })).status,
    ).toBe(401);
  });
  test('rejects revoked and expired tokens', async () => {
    const { app, store } = setup();
    const revoked = store.create('revoked', ['funds:read'], 'test');
    store.revoke(revoked.id);
    const expired = store.create('expired', ['funds:read'], 'test', 1, Date.now() - 86400001);
    for (const token of [revoked, expired])
      expect((await app.request('/api/funds', { headers: bearer(token.token) })).status).toBe(401);
    expect(store.authenticate(expired.token, expired.expires_at ?? 0)).toBeNull();
  });
  test('management validates input, lists without hash, revoke and delete enforce state', async () => {
    const { app } = setup();
    const headers = { ...(await session()), 'Content-Type': 'application/json' };
    for (const input of [
      null,
      {},
      { name: '', scopes: ['funds:read'] },
      { name: 'x', scopes: [] },
      { name: 'x', scopes: ['bad'] },
      { name: 'x', scopes: ['*:read'], expires_in_days: 0 },
      { name: 'x', scopes: ['*:read'], expires_in_days: 1.2 },
    ])
      expect(
        (await app.request('/api/tokens', { method: 'POST', headers, body: JSON.stringify(input) }))
          .status,
      ).toBe(400);
    const response = await app.request('/api/tokens', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'bot', scopes: ['funds:read'], expires_in_days: 30 }),
    });
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const token = (await response.json()) as { id: string; token: string };
    const list = await (await app.request('/api/tokens', { headers })).json();
    expect(JSON.stringify(list)).not.toContain(token.token);
    expect(JSON.stringify(list)).not.toContain('token_hash');
    expect(
      (await app.request(`/api/tokens/${token.id}`, { method: 'DELETE', headers })).status,
    ).toBe(409);
    expect(
      (await app.request(`/api/tokens/${token.id}/revoke`, { method: 'POST', headers })).status,
    ).toBe(200);
    expect(
      (await app.request(`/api/tokens/${token.id}/revoke`, { method: 'POST', headers })).status,
    ).toBe(200);
    expect(
      (await app.request(`/api/tokens/${token.id}`, { method: 'DELETE', headers })).status,
    ).toBe(200);
    expect(
      (await app.request(`/api/tokens/${token.id}`, { method: 'DELETE', headers })).status,
    ).toBe(404);
    expect(
      (await app.request(`/api/tokens/${token.id}/revoke`, { method: 'POST', headers })).status,
    ).toBe(404);
  });
  test('mapping is boundary-safe and default-deny even for wildcard', () => {
    for (const resource of READ_RESOURCES) expect(scopeForPath(resource.path)).toBe(resource.scope);
    expect(scopeForPath('/api/funds/000001/nav')).toBe('funds:read');
    expect(scopeForPath('/api/selection/stocks/600519.SH/bars')).toBe('stocks:read');
    for (const path of [
      '/api/tokens',
      '/api/backy',
      '/api/new',
      '/api/funds/000001/unknown',
      '/api/read/funds/basic-info/secret',
    ])
      expect(scopeForPath(path)).toBeUndefined();
  });
});
