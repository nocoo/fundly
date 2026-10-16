import { Database } from 'bun:sqlite';
import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initMarketSchema } from '../../../src/db/market-repo';
import { initSchema } from '../../../src/db/repo';
import { initSelectionSchema } from '../../../src/db/selection-repo';
import { TokenStore } from '../src/lib/api-tokens';
import { buildReadQuery, LARGE_TABLE_INDEXES } from '../src/lib/read-query';
import { READ_RESOURCES } from '../src/lib/read-resources';
import { createApi } from './app';

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const fn of cleanup.splice(0).reverse()) fn();
});
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'fundly-read-api-'));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'market.db');
  const db = new Database(path, { create: true });
  cleanup.push(() => db.close());
  initSchema(db);
  initMarketSchema(db);
  initSelectionSchema(db);
  const store = new TokenStore(join(dir, 'auth.db'));
  cleanup.push(() => store.close());
  const token = store.create('bot', ['*:read'], 'test');
  const app = createApi(path, {
    tokenStore: store,
    auth: {
      enabled: true,
      required: true,
      clientId: 'test',
      clientSecret: 'test',
      sessionSecret: 'test',
      allowedEmails: [],
    },
  });
  const headers = { authorization: `Bearer ${token.token}` };
  return { db, app, headers };
}
test('all public schema tables have explicit typed read routes; credentials and internals excluded', async () => {
  const { db, app, headers } = setup();
  const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as {
    name: string;
  }[];
  expect(
    tables
      .map((row) => row.name)
      .filter((name) => !['app_settings', 'sqlite_sequence'].includes(name))
      .sort(),
  ).toEqual(READ_RESOURCES.map((resource) => resource.table).sort());
  for (const resource of READ_RESOURCES) {
    const schema = db.query(`PRAGMA table_info("${resource.table}")`).all() as { name: string }[];
    expect(Object.keys(resource.columns).sort()).toEqual(schema.map((col) => col.name).sort());
    const path = resource.path + (LARGE_TABLE_INDEXES[resource.table] ? '?code=test' : '');
    const response = await app.request(path, { headers });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      items: expect.any(Array),
      limit: 100,
      offset: 0,
      has_more: false,
    });
  }
  expect((await app.request('/api/read/stats/app-settings', { headers })).status).toBe(403);
});
test('large-table policy matches real indexes and rejects unbounded reads before SQL', async () => {
  const { db, app, headers } = setup();
  for (const [table, indexes] of Object.entries(LARGE_TABLE_INDEXES)) {
    const info = db.query(`PRAGMA table_info("${table}")`).all() as { name: string; pk: number }[];
    const primary = info
      .filter((column) => column.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((column) => column.name);
    const list = db.query(`PRAGMA index_list("${table}")`).all() as { name: string }[];
    const actual = [
      primary,
      ...list.map((index) =>
        (db.query(`PRAGMA index_info("${index.name}")`).all() as { name: string }[]).map(
          (column) => column.name,
        ),
      ),
    ];
    for (const index of indexes)
      expect(actual.some((columns) => index.every((column, i) => column === columns[i]))).toBe(
        true,
      );
    const resource = READ_RESOURCES.find((resource) => resource.table === table);
    if (!resource) throw new Error(table);
    expect((await app.request(resource.path, { headers })).status).toBe(400);
  }
  expect(
    (
      await app.request('/api/live', { headers: { ...headers, origin: 'https://evil.example' } })
    ).headers.get('access-control-allow-origin'),
  ).toBeNull();
});
test('large NAV queries cap offsets, reject non-index sorts and require indexed bounded ranges', async () => {
  const { db, app, headers } = setup();
  for (const params of [
    'code=000001&offset=100001',
    'code=000001&sort=unit_nav',
    'from=2026-01-01',
    'from=2000-01-01&to=2026-01-01',
    'from=2026-01-01&to=2026-01-02&sort=fund_code',
    'from=2026-01-01&to=2026-01-02&date_field=fund_code',
    'codes=000001,000002&sort=nav_date',
  ])
    expect((await app.request(`/api/read/funds/nav?${params}`, { headers })).status).toBe(400);
  expect(
    (await app.request('/api/read/funds/nav?code=000001&offset=100000', { headers })).status,
  ).toBe(200);
  expect(
    (await app.request('/api/read/stocks/daily-bar?from=2026-01-01&to=2026-01-02', { headers }))
      .status,
  ).toBe(400);
  expect(
    (await app.request('/api/read/stocks/daily-bar?symbol=600519.SH&sort=trade_date', { headers }))
      .status,
  ).toBe(200);
  const resource = READ_RESOURCES.find((resource) => resource.table === 'fund_nav');
  if (!resource) throw new Error('fund_nav');
  const query = buildReadQuery(resource, { from: '2026-01-01', to: '2026-01-31' });
  expect(query.sort).toBe('nav_date');
  const plan = db.query(`EXPLAIN QUERY PLAN ${query.sql}`).all(...query.params) as {
    detail: string;
  }[];
  expect(plan.some((row) => row.detail.includes('idx_nav_date'))).toBe(true);
  expect(
    plan.some((row) => row.detail.includes('TEMP B-TREE') || row.detail.startsWith('SCAN')),
  ).toBe(false);
  expect(
    (await app.request('/api/read/funds/nav?from=2026-01-01&to=2026-01-31', { headers })).status,
  ).toBe(200);
});
test('batch basics, NAV date ranges, sort/projection and stable offset pagination', async () => {
  const { db, app, headers } = setup();
  for (const code of ['000001', '000002', '000003'])
    db.query(
      'INSERT INTO fund_basic_info (fund_code,fund_name,fund_type,created_at,updated_at) VALUES (?,?,?,?,?)',
    ).run(code, code, 'test', 1, 1);
  for (const date of ['2026-01-01', '2026-01-02', '2026-01-03'])
    db.query('INSERT INTO fund_nav VALUES (?,?,?,?,?)').run('000001', date, 1, 1, 0);
  const basic = await app.request(
    '/api/read/funds/basic-info?codes=000001,000002&fields=fund_code&order=desc&limit=1',
    { headers },
  );
  expect(await basic.json()).toEqual({
    items: [{ fund_code: '000002' }],
    limit: 1,
    offset: 0,
    has_more: true,
  });
  const nav = await app.request(
    '/api/read/funds/nav?code=000001&from=2026-01-02&to=2026-01-03&sort=nav_date&order=desc&offset=1&fields=nav_date,unit_nav',
    { headers },
  );
  expect(await nav.json()).toEqual({
    items: [{ nav_date: '2026-01-02', unit_nav: 1 }],
    limit: 100,
    offset: 1,
    has_more: false,
  });
  const injection = await app.request('/api/read/funds/basic-info?code=%27%20OR%201%3D1--', {
    headers,
  });
  expect(((await injection.json()) as { items: unknown[] }).items).toEqual([]);
});
test('reverse stock holdings and manager managed funds use parameterized column filters', async () => {
  const { db, app, headers } = setup();
  db.exec(
    "INSERT INTO fund_portfolio(fund_code,report_date,stock_code,hold_pct,updated_at) VALUES ('000001','2026-06-30','600519',5,1); INSERT INTO fund_manager VALUES ('manager1','Manager',NULL,1); INSERT INTO fund_manager_link(fund_code,manager_id,start_date,updated_at) VALUES ('000001','manager1','2020-01-01',1)",
  );
  for (const path of [
    '/api/read/funds/portfolio?stock_code=600519',
    '/api/read/managers/profiles?code=manager1',
    '/api/read/managers/funds?manager_id=manager1',
  ]) {
    const result = (await (await app.request(path, { headers })).json()) as { items: unknown[] };
    expect(result.items).toHaveLength(1);
  }
});
test('stock financials, valuations, ETF holdings and bars work against populated extension schema', async () => {
  const { db, app, headers } = setup();
  db.exec(`INSERT INTO selection_stock_financial_statement VALUES ('600519.SH','income',2025,'FY','2025-12-31','2026-04-01','CNY','{"revenue":123}',1);
    INSERT INTO selection_stock_valuation(symbol,trade_date,pe_ttm,collected_at) VALUES ('600519.SH','2026-10-01',20,1);
    INSERT INTO selection_etf_holding(symbol,report_date,stock_code,stock_name,asset_type,hold_ratio,collected_at) VALUES ('510300.SH','2026-06-30','600519.SH','Stock','stock',5,1);
    INSERT INTO selection_daily_bar VALUES ('stock','600519.SH','forward','2026-10-01',10,12,9,11,100,1000,1)`);
  for (const path of [
    '/api/read/stocks/stock-financial-statement?symbol=600519.SH&fiscal_year=2025&statement_type=income&from=2026-01-01',
    '/api/read/stocks/stock-valuation?codes=600519.SH&from=2026-10-01&to=2026-10-01',
    '/api/read/stocks/etf-holding?code=510300.SH&stock_code=600519.SH',
    '/api/read/stocks/daily-bar?symbol=600519.SH&asset_type=stock&adjust=forward&fields=symbol,close',
  ]) {
    const response = await app.request(path, { headers });
    expect(response.status).toBe(200);
    expect(((await response.json()) as { items: unknown[] }).items).toHaveLength(1);
  }
});
test('query helper rejects unknown sort/fields/filters, bad pagination and dates', () => {
  const resource = READ_RESOURCES.find((resource) => resource.table === 'fund_nav');
  if (!resource) throw new Error('missing resource');
  const invalidQueries: Record<string, string>[] = [
    { sort: 'unit_nav; DROP TABLE fund_nav' },
    { fields: 'token_hash' },
    { fields: '' },
    { secret: 'yes' },
    { limit: '5001' },
    { limit: '0' },
    { limit: '1.2' },
    { offset: '-1' },
    { order: 'sideways' },
    { codes: '' },
    { from: 'bad' },
    { from: '2026-02-30' },
    { from: '2026-02-02', to: '2026-01-01' },
    { date_field: 'bad' },
  ];
  for (const query of invalidQueries) expect(() => buildReadQuery(resource, query)).toThrow();
  const result = buildReadQuery(resource, {
    codes: '000001,000002',
    from: '2026-01-01',
    to: '2026-02-01',
    limit: '5000',
  });
  expect(result.params).toEqual(['000001', '000002', '2026-01-01', '2026-02-01', 5001, 0]);
  expect(result.sql).not.toContain('000001');
});
test('bearer cannot bypass auth on early-registered browser and backup routes', async () => {
  const { app, headers } = setup();
  for (const path of [
    '/api/me',
    '/api/auth/google',
    '/api/auth/callback',
    '/api/backy',
    '/api/backy/job',
    '/api/tokens',
  ]) {
    expect((await app.request(path, { headers })).status).toBe(403);
  }
  expect((await app.request('/api/auth/logout', { method: 'POST', headers })).status).toBe(403);
  expect((await app.request('/api/live', { headers })).status).toBe(200);
  expect((await app.request('/api/me')).status).toBe(200);
});
test('market and auth stores cannot share the same file', () => {
  const { db } = setup();
  expect(() => createApi(db.filename, { authDbPath: db.filename })).toThrow(
    'AUTH_DB_PATH must be separate',
  );
});
test('HTTP rejects malformed query and reports missing tables without creating them', async () => {
  const { db, app, headers } = setup();
  expect((await app.request('/api/read/funds/nav?fields=bad', { headers })).status).toBe(400);
  db.exec('ALTER TABLE selection_stock_valuation DROP COLUMN pe_ttm');
  expect((await app.request('/api/read/stocks/stock-valuation', { headers })).status).toBe(503);
  db.exec('DROP TABLE selection_etf_holding');
  expect((await app.request('/api/read/stocks/etf-holding?code=test', { headers })).status).toBe(
    503,
  );
  expect(
    db.query("SELECT name FROM sqlite_master WHERE name='selection_etf_holding'").get(),
  ).toBeNull();
});
