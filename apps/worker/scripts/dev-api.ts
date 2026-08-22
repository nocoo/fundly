#!/usr/bin/env bun
/** Local API: reads FUNDLY_SQLITE / data/fundly.db */

import { Database } from 'bun:sqlite';
import { resolve } from 'node:path';
import { Hono } from 'hono';
import { headWebhook, listBackups } from '../../../src/backup/backy.ts';
import { isBackupRunning, resolveBackupJob, writeBackupJob } from '../../../src/backup/job.ts';
import { resolveEnvironment, runRestore } from '../../../src/backup/run.ts';
import {
  loadStoredBackyCredentials,
  readBackyConfig,
  saveBackyConfig,
} from '../../../src/backup/settings.ts';
import type { QueryExec, SqlBinding } from '../src/lib/executor.ts';
import { parseFundListQuery } from '../src/lib/fund-query.ts';
import {
  getDataStats,
  getFundDetail,
  getFundNav,
  listFunds,
  listFundTypes,
} from '../src/lib/funds-service.ts';
import { APP_VERSION } from '../src/lib/version.ts';

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

const sqlite = sqliteExec(new Database(SQLITE_PATH, { readonly: true }));

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

app.get('/api/source', (c) => c.json({ source: 'sqlite', allowed: ['sqlite'], rejected: false }));

app.get('/api/me', (c) => c.json({ email: null, name: null, avatar: null, authenticated: false }));

app.get('/api/backy', async (c) => {
  let config: ReturnType<typeof readBackyConfig>;
  try {
    config = readBackyConfig(SQLITE_PATH);
  } catch (error) {
    return c.json({
      available: true,
      configured: false,
      webhookUrl: '',
      hasToken: false,
      environment: resolveEnvironment(),
      history: null,
      job: resolveBackupJob(SQLITE_PATH),
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const base = {
    available: true,
    configured: Boolean(config.webhookUrl && config.hasToken),
    webhookUrl: config.webhookUrl,
    hasToken: config.hasToken,
    environment: resolveEnvironment(),
    history: null as Awaited<ReturnType<typeof listBackups>> | null,
    job: resolveBackupJob(SQLITE_PATH),
    error: undefined as string | undefined,
  };
  if (!base.configured) return c.json(base);
  try {
    return c.json({
      ...base,
      history: await listBackups(loadStoredBackyCredentials(SQLITE_PATH)),
    });
  } catch (error) {
    return c.json({
      ...base,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.on(['PUT', 'POST'], '/api/backy/config', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { webhookUrl?: string; token?: string };
  try {
    return c.json(
      saveBackyConfig(SQLITE_PATH, { webhookUrl: body.webhookUrl ?? '', token: body.token }),
    );
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});

app.post('/api/backy/test', async (c) => {
  try {
    const status = await headWebhook(loadStoredBackyCredentials(SQLITE_PATH));
    return c.json({ status });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});

app.get('/api/backy/job', (c) => c.json({ job: resolveBackupJob(SQLITE_PATH) }));

app.post('/api/backy', (c) => {
  if (isBackupRunning(SQLITE_PATH)) {
    return c.json({ status: 'running', job: resolveBackupJob(SQLITE_PATH) }, 202);
  }
  const startedAt = new Date().toISOString();
  const root = resolve(import.meta.dirname, '../../..');
  const child = Bun.spawn(['bun', 'run', resolve(root, 'scripts/backup.ts')], {
    cwd: root,
    env: { ...process.env, FUNDLY_SQLITE: SQLITE_PATH },
    stdin: 'ignore',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  writeBackupJob(SQLITE_PATH, { status: 'running', pid: child.pid, startedAt });
  return c.json({ status: 'running', job: resolveBackupJob(SQLITE_PATH) }, 202);
});

app.post('/api/backy/restore', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { id?: string; force?: boolean };
  if (!body.id) return c.json({ error: 'id is required' }, 400);
  try {
    return c.json(await runRestore({ id: body.id, force: Boolean(body.force) }));
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});

app.get('/api/funds', async (c) => {
  const query = parseFundListQuery({
    q: c.req.query('q'),
    fundType: c.req.query('fundType'),
    typeL1: c.req.query('typeL1'),
    typeL2: c.req.query('typeL2'),
    mvpOnly: c.req.query('mvpOnly'),
    hasNav: c.req.query('hasNav'),
    pass4433: c.req.query('pass4433'),
    metricNotNull: c.req.query('metricNotNull'),
    minSamples: c.req.query('minSamples'),
    includeCaps: c.req.query('includeCaps'),
    sort: c.req.query('sort'),
    dir: c.req.query('dir'),
    page: c.req.query('page'),
    pageSize: c.req.query('pageSize'),
  });
  return c.json(await listFunds(sqlite, query));
});

app.get('/api/fund-types', async (c) => {
  return c.json({ items: await listFundTypes(sqlite) });
});

app.get('/api/stats', async (c) => {
  return c.json(await getDataStats(sqlite));
});

app.get('/api/funds/:code/nav', async (c) => {
  return c.json({
    items: await getFundNav(sqlite, c.req.param('code'), {
      from: c.req.query('from'),
      limit: c.req.query('limit'),
    }),
  });
});

app.get('/api/funds/:code', async (c) => {
  const detail = await getFundDetail(sqlite, c.req.param('code'));
  if (!detail) return c.json({ error: 'Not found' }, 404);
  return c.json(detail);
});

export default {
  port: PORT,
  fetch: app.fetch,
};

console.log(`fundly local api http://127.0.0.1:${PORT} sqlite=${SQLITE_PATH}`);
