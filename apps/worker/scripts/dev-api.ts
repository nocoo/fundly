#!/usr/bin/env bun
/** Local API: sqlite by default, D1 when X-Fundly-Source: d1 */

import { Database } from 'bun:sqlite';
import { resolve } from 'node:path';
import { Hono } from 'hono';
import type { QueryExec, SqlBinding } from '../src/lib/executor.ts';
import { parseFundListQuery } from '../src/lib/fund-query.ts';
import {
  getDataStats,
  getFundDetail,
  getFundNav,
  listFunds,
  listFundTypes,
} from '../src/lib/funds-service.ts';
import { resolveDataSource } from '../src/lib/source.ts';
import { APP_VERSION } from '../src/lib/version.ts';
import { cloudflareApiToken } from './cf-token.ts';

const PORT = Number(process.env.FUNDLY_API_PORT ?? 7045);
const SQLITE_PATH = resolve(
  process.env.FUNDLY_SQLITE ?? `${import.meta.dirname}/../../../data/fundly.db`,
);

function sqliteExec(db: Database): QueryExec {
  return {
    async all<T>(sql: string, params: SqlBinding[] = []) {
      return db.prepare(sql).all(...params) as T[];
    },
    async first<T>(sql: string, params: SqlBinding[] = []) {
      return (db.prepare(sql).get(...params) as T | null) ?? null;
    },
  };
}

function d1HttpExec(token: string): QueryExec {
  const account = 'd51a8fde361e4be31db17d8c56737c1f';
  const databaseId = 'ccc8336d-8c39-489a-a532-2ea856ec69ed';
  const url = `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${databaseId}/query`;
  return {
    async all<T>(sql: string, params: SqlBinding[] = []) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql, params }),
      });
      const body = (await res.json()) as {
        success: boolean;
        errors?: { message: string }[];
        result?: { results?: T[] }[];
      };
      if (!res.ok || !body.success) {
        throw new Error(body.errors?.[0]?.message ?? `D1 query failed ${res.status}`);
      }
      return (body.result?.[0]?.results ?? []) as T[];
    },
    async first<T>(sql: string, params: SqlBinding[] = []) {
      const rows = await this.all<T>(sql, params);
      return rows[0] ?? null;
    },
  };
}

const sqlite = sqliteExec(new Database(SQLITE_PATH, { readonly: true }));
let d1: QueryExec | null = null;

function execFor(source: 'sqlite' | 'd1'): QueryExec {
  if (source === 'sqlite') return sqlite;
  if (!d1) d1 = d1HttpExec(cloudflareApiToken());
  return d1;
}

const app = new Hono();

app.use('/api/*', async (c, next) => {
  c.header('access-control-allow-origin', c.req.header('origin') ?? '*');
  c.header('access-control-allow-credentials', 'true');
  await next();
});

app.get('/api/live', (c) =>
  c.json({
    status: 'ok',
    version: APP_VERSION,
    component: 'local-api',
    timestamp: new Date().toISOString(),
    uptime: 0,
  }),
);

app.get('/api/source', (c) => {
  const resolved = resolveDataSource({
    requested: c.req.header('x-fundly-source') ?? c.req.query('source'),
    environment: 'development',
  });
  return c.json(resolved);
});

app.get('/api/me', (c) => c.json({ email: null, name: null, avatar: null, authenticated: false }));

app.get('/api/funds', async (c) => {
  const source = resolveDataSource({
    requested: c.req.header('x-fundly-source'),
    environment: 'development',
  }).source;
  const query = parseFundListQuery({
    q: c.req.query('q'),
    fundType: c.req.query('fundType'),
    mvpOnly: c.req.query('mvpOnly'),
    hasNav: c.req.query('hasNav'),
    sort: c.req.query('sort'),
    dir: c.req.query('dir'),
    page: c.req.query('page'),
    pageSize: c.req.query('pageSize'),
  });
  return c.json(await listFunds(execFor(source), query));
});

app.get('/api/fund-types', async (c) => {
  const source = resolveDataSource({
    requested: c.req.header('x-fundly-source'),
    environment: 'development',
  }).source;
  return c.json({ items: await listFundTypes(execFor(source)) });
});

app.get('/api/stats', async (c) => {
  const source = resolveDataSource({
    requested: c.req.header('x-fundly-source'),
    environment: 'development',
  }).source;
  return c.json(await getDataStats(execFor(source)));
});

app.get('/api/funds/:code/nav', async (c) => {
  const source = resolveDataSource({
    requested: c.req.header('x-fundly-source'),
    environment: 'development',
  }).source;
  const limit = Number(c.req.query('limit') ?? 400);
  return c.json({ items: await getFundNav(execFor(source), c.req.param('code'), limit) });
});

app.get('/api/funds/:code', async (c) => {
  const source = resolveDataSource({
    requested: c.req.header('x-fundly-source'),
    environment: 'development',
  }).source;
  const detail = await getFundDetail(execFor(source), c.req.param('code'));
  if (!detail) return c.json({ error: 'Not found' }, 404);
  return c.json(detail);
});

export default {
  port: PORT,
  fetch: app.fetch,
};

console.log(`fundly local api http://127.0.0.1:${PORT} sqlite=${SQLITE_PATH}`);
