import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initMarketSchema } from '../../../src/db/market-repo.ts';
import { initSchema } from '../../../src/db/repo.ts';
import { initSelectionSchema } from '../../../src/db/selection-repo.ts';
import { TokenStore } from '../src/lib/api-tokens.ts';
import { createApi, defaultSqlitePath, openReadonlySqlite } from './app.ts';

const cleanup: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanup.splice(0).reverse()) fn();
});

function setup(opts: { staticDir?: string } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'fundly-app-test-'));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  const dbPath = join(dir, 'fundly.db');
  const db = new Database(dbPath, { create: true });
  cleanup.push(() => db.close());
  initSchema(db);
  initMarketSchema(db);
  initSelectionSchema(db);
  const store = new TokenStore(join(dir, 'auth.db'));
  cleanup.push(() => store.close());
  const app = createApi(dbPath, {
    tokenStore: store,
    staticDir: opts.staticDir,
    auth: {
      enabled: false,
      required: false,
      clientId: '',
      clientSecret: '',
      sessionSecret: '',
      allowedEmails: [],
    },
  });
  return { dir, dbPath, db, app };
}

describe('createApi routes and helpers', () => {
  test('validates sqlite path helpers', () => {
    expect(defaultSqlitePath()).toContain('fundly.db');
    expect(() => openReadonlySqlite('/tmp/nonexistent-fundly-missing.db')).toThrow(
      'database not found',
    );
  });

  test('handles backy config, test, job, history, and restore validation', async () => {
    const { app } = setup();
    const initial = await app.request('/api/backy');
    expect(initial.status).toBe(200);
    expect(await initial.json()).toMatchObject({ configured: false, history: null });

    const badCfg = await app.request('/api/backy/config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ webhookUrl: 'not-a-url' }),
    });
    expect(badCfg.status).toBe(400);

    const saved = await app.request('/api/backy/config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ webhookUrl: 'https://backy.example/hook', token: 'tok-1' }),
    });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({
      webhookUrl: 'https://backy.example/hook',
      hasToken: true,
    });

    const prevFetch = globalThis.fetch;
    globalThis.fetch = (async (_url, init) => {
      if (init?.method === 'HEAD') return new Response(null, { status: 204 });
      return Response.json({
        project_name: 'fundly',
        environment: 'prod',
        total_backups: 1,
        recent_backups: [],
      });
    }) as typeof fetch;
    try {
      const testRes = await app.request('/api/backy/test', { method: 'POST' });
      expect(testRes.status).toBe(200);
      expect(await testRes.json()).toEqual({ status: 204 });

      const histRes = await app.request('/api/backy');
      expect(histRes.status).toBe(200);
      expect(await histRes.json()).toMatchObject({
        configured: true,
        history: { project_name: 'fundly' },
      });
    } finally {
      globalThis.fetch = prevFetch;
    }

    expect((await app.request('/api/backy/job')).status).toBe(200);
    expect(
      (
        await app.request('/api/backy/restore', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        })
      ).status,
    ).toBe(400);
  });

  test('handles fund, daily, market, and selection edge cases and 400/404 responses', async () => {
    const { db, app } = setup();
    db.exec(
      "INSERT INTO fund_basic_info (fund_code, fund_name, fund_type, in_mvp_pool, created_at, updated_at) VALUES ('000001', '华夏成长', '混合型-灵活', 1, 1, 1)",
    );
    expect((await app.request('/api/fund-types')).status).toBe(200);
    expect((await app.request('/api/stats')).status).toBe(200);
    const fundsRes = await app.request('/api/funds?q=%E5%8D%8E%E5%A4%8F&page=1&pageSize=20');
    expect(fundsRes.status).toBe(200);
    expect(await fundsRes.json()).toMatchObject({ total: 1 });
    expect((await app.request('/api/funds/000001/nav')).status).toBe(200);
    expect((await app.request('/api/funds/000001/siblings')).status).toBe(200);
    expect((await app.request('/api/funds/999999')).status).toBe(404);
    expect(
      (
        await app.request('/api/backy/restore', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: 'missing-id' }),
        })
      ).status,
    ).toBe(400);

    expect((await app.request('/api/daily?limit=99999')).status).toBe(400);
    expect((await app.request('/api/market/series/missing')).status).toBe(404);
    expect((await app.request('/api/market/industries/missing/constituents')).status).toBe(404);
    expect((await app.request('/api/market/etfs/missing')).status).toBe(404);
    expect((await app.request('/api/selection/etfs/510300.SH/bars?years=2')).status).toBe(400);
    expect((await app.request('/api/selection/etfs/510300.SH/bars?interval=hour')).status).toBe(
      400,
    );
    expect((await app.request('/api/selection/stocks/600519.SH/bars?years=2')).status).toBe(400);
    expect((await app.request('/api/selection/stocks/600519.SH/bars?interval=hour')).status).toBe(
      400,
    );
  });

  test('serves SPA index.html when staticDir exists and 404 when missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fundly-spa-'));
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
    const { app: appMissing } = setup({ staticDir: dir });
    expect((await appMissing.request('/funds')).status).toBe(404);

    writeFileSync(join(dir, 'index.html'), '<div id="root"></div>');
    const { app: appOk } = setup({ staticDir: dir });
    const res = await appOk.request('/funds');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<div id="root"></div>');
  });
});
