import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { headWebhook, listBackups } from '../../../src/backup/backy.ts';
import { isBackupRunning, resolveBackupJob, writeBackupJob } from '../../../src/backup/job.ts';
import { resolveEnvironment, runRestore } from '../../../src/backup/run.ts';
import {
  loadStoredBackyCredentials,
  readBackyConfig,
  saveBackyConfig,
} from '../../../src/backup/settings.ts';
import { initSchema } from '../../../src/db/repo.ts';
import { type AuthConfig, loadAuthConfig } from '../src/lib/auth-config.ts';
import { registerAuthRoutes, requireSession } from '../src/lib/auth-routes.ts';
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

export function defaultSqlitePath(): string {
  return resolve(process.env.FUNDLY_SQLITE ?? `${import.meta.dirname}/../../../data/fundly.db`);
}

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

export function openReadonlySqlite(sqlitePath: string): QueryExec {
  mkdirSync(dirname(sqlitePath), { recursive: true });
  if (!existsSync(sqlitePath)) {
    const fresh = new Database(sqlitePath, { create: true });
    initSchema(fresh);
    fresh.close();
  }
  return sqliteExec(new Database(sqlitePath, { readonly: true }));
}

export function createApi(
  sqlitePath: string,
  opts: { staticDir?: string; component?: string; auth?: AuthConfig } = {},
): Hono {
  const sqlite = openReadonlySqlite(sqlitePath);
  const app = new Hono();
  const repoRoot = resolve(import.meta.dirname, '../../..');
  const auth = opts.auth ?? loadAuthConfig(process.env, opts.component === 'railway');

  app.use('/api/*', async (c, next) => {
    c.header('access-control-allow-origin', c.req.header('origin') ?? '*');
    c.header('access-control-allow-credentials', 'true');
    await next();
  });

  app.get('/api/live', (c) =>
    c.json({
      status: 'ok',
      version: APP_VERSION,
      component: opts.component ?? 'local-api',
      timestamp: new Date().toISOString(),
      uptime: 0,
    }),
  );

  registerAuthRoutes(app, auth);
  app.use('/api/*', (c, next) => requireSession(c, auth, next));

  app.get('/api/source', (c) => c.json({ source: 'sqlite', allowed: ['sqlite'], rejected: false }));

  app.get('/api/backy', async (c) => {
    let config: ReturnType<typeof readBackyConfig>;
    try {
      config = readBackyConfig(sqlitePath);
    } catch (error) {
      return c.json({
        available: true,
        configured: false,
        webhookUrl: '',
        hasToken: false,
        environment: resolveEnvironment(),
        history: null,
        job: resolveBackupJob(sqlitePath),
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
      job: resolveBackupJob(sqlitePath),
      error: undefined as string | undefined,
    };
    if (!base.configured) return c.json(base);
    try {
      return c.json({
        ...base,
        history: await listBackups(loadStoredBackyCredentials(sqlitePath)),
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
        saveBackyConfig(sqlitePath, { webhookUrl: body.webhookUrl ?? '', token: body.token }),
      );
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
    }
  });

  app.post('/api/backy/test', async (c) => {
    try {
      return c.json({ status: await headWebhook(loadStoredBackyCredentials(sqlitePath)) });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
    }
  });

  app.get('/api/backy/job', (c) => c.json({ job: resolveBackupJob(sqlitePath) }));

  app.post('/api/backy', (c) => {
    if (isBackupRunning(sqlitePath)) {
      return c.json({ status: 'running', job: resolveBackupJob(sqlitePath) }, 202);
    }
    const startedAt = new Date().toISOString();
    const child = Bun.spawn(['bun', 'run', resolve(repoRoot, 'scripts/backup.ts')], {
      cwd: repoRoot,
      env: { ...process.env, FUNDLY_SQLITE: sqlitePath },
      stdin: 'ignore',
      stdout: 'inherit',
      stderr: 'inherit',
    });
    writeBackupJob(sqlitePath, { status: 'running', pid: child.pid, startedAt });
    return c.json({ status: 'running', job: resolveBackupJob(sqlitePath) }, 202);
  });

  app.post('/api/backy/restore', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { id?: string; force?: boolean };
    if (!body.id) return c.json({ error: 'id is required' }, 400);
    try {
      return c.json(
        await runRestore({ id: body.id, force: Boolean(body.force), sqlite: sqlitePath }),
      );
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

  app.get('/api/fund-types', async (c) => c.json({ items: await listFundTypes(sqlite) }));
  app.get('/api/stats', async (c) => c.json(await getDataStats(sqlite)));
  app.get('/api/funds/:code/nav', async (c) =>
    c.json({
      items: await getFundNav(sqlite, c.req.param('code'), {
        from: c.req.query('from'),
        limit: c.req.query('limit'),
      }),
    }),
  );
  app.get('/api/funds/:code', async (c) => {
    const detail = await getFundDetail(sqlite, c.req.param('code'));
    if (!detail) return c.json({ error: 'Not found' }, 404);
    return c.json(detail);
  });

  if (opts.staticDir) {
    const root = opts.staticDir;
    app.use('/*', serveStatic({ root }));
    app.get('*', async () => {
      const index = Bun.file(join(root, 'index.html'));
      if (await index.exists()) {
        return new Response(index, { headers: { 'content-type': 'text/html; charset=utf-8' } });
      }
      return new Response('spa not built', { status: 404 });
    });
  }

  return app;
}
