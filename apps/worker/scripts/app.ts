import { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
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
import { type AuthConfig, loadAuthConfig } from '../src/lib/auth-config.ts';
import { registerAuthRoutes, requireSession } from '../src/lib/auth-routes.ts';
import { DAILY_DATE_RE, getDailyReport, listDailyReports } from '../src/lib/daily-service.ts';
import type { QueryExec, SqlBinding } from '../src/lib/executor.ts';
import { parseFundListQuery } from '../src/lib/fund-query.ts';
import {
  getDataStats,
  getFundDetail,
  getFundNav,
  listFundSiblings,
  listFunds,
  listFundTypes,
} from '../src/lib/funds-service.ts';
import {
  getEtfDetail,
  getIndustryConstituents,
  getMarketBars,
  getMarketObservations,
  getMarketOverview,
} from '../src/lib/market-service.ts';
import {
  type EtfListQuery,
  getSelectionEtfBars,
  getSelectionEtfDetail,
  getSelectionStockBars,
  getSelectionStockDetail,
  listSelectionEtfs,
  listSelectionStocks,
  type StockListQuery,
} from '../src/lib/selection-service.ts';
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
  if (!existsSync(sqlitePath)) {
    throw new Error(`database not found: ${sqlitePath}`);
  }
  return sqliteExec(new Database(sqlitePath, { readonly: true }));
}

/** A private connection keeps every query in one response on the same published snapshot. */
export async function withMarketSnapshot<T>(
  sqlitePath: string,
  read: (executor: QueryExec) => Promise<T>,
): Promise<T> {
  const db = new Database(sqlitePath, { readonly: true });
  try {
    db.exec('PRAGMA busy_timeout = 5000');
    db.exec('BEGIN');
    return await read(sqliteExec(db));
  } finally {
    try {
      if (db.inTransaction) db.exec('ROLLBACK');
    } finally {
      db.close();
    }
  }
}

export function createApi(
  sqlitePath: string,
  opts: { staticDir?: string; component?: string; auth?: AuthConfig } = {},
): Hono {
  const sqlite = openReadonlySqlite(sqlitePath);
  const app = new Hono();
  const repoRoot = resolve(import.meta.dirname, '../../..');
  const auth = opts.auth ?? loadAuthConfig(process.env, true);

  app.use('/api/*', async (c, next) => {
    c.header('access-control-allow-origin', c.req.header('origin') ?? '*');
    c.header('access-control-allow-credentials', 'true');
    await next();
  });

  app.get('/api/live', async (c) => {
    let connected = false;
    try {
      await sqlite.first('SELECT fund_code FROM fund_basic_info LIMIT 1');
      connected = true;
    } catch {
      connected = false;
    }
    return c.json(
      {
        status: connected ? 'ok' : 'error',
        version: APP_VERSION,
        component: opts.component ?? 'local-api',
        timestamp: new Date().toISOString(),
        uptime: Math.round(process.uptime()),
        database: { connected },
      },
      connected ? 200 : 503,
      { 'Cache-Control': 'no-store' },
    );
  });

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
      lens: c.req.query('lens'),
      feePeer: c.req.query('feePeer'),
      ddPeer: c.req.query('ddPeer'),
      scalePeer: c.req.query('scalePeer'),
      top10Max: c.req.query('top10Max'),
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
  app.get('/api/funds/:code/siblings', async (c) => {
    return c.json({ items: await listFundSiblings(sqlite, c.req.param('code')) });
  });
  app.get('/api/funds/:code', async (c) => {
    const detail = await getFundDetail(sqlite, c.req.param('code'));
    if (!detail) return c.json({ error: 'Not found' }, 404);
    return c.json(detail);
  });

  // 财经日报 / 宏观日报（仓库 content/macro-daily/*.md）
  app.get('/api/daily', async (c) => c.json(await listDailyReports(repoRoot)));
  app.get('/api/daily/:date', async (c) => {
    const date = c.req.param('date');
    if (!DAILY_DATE_RE.test(date)) {
      return c.json({ error: 'date must be YYYY-MM-DD' }, 400);
    }
    const report = await getDailyReport(repoRoot, date);
    if (!report) return c.json({ error: 'Not found' }, 404);
    return c.json(report);
  });

  // 宏观大屏与跨资产接口
  app.get('/api/market/overview', async (c) => {
    return c.json(await withMarketSnapshot(sqlitePath, getMarketOverview));
  });

  app.get('/api/market/bars/:id', async (c) => {
    const limit = Number(c.req.query('limit') ?? 60);
    const rawYears = c.req.query('years');
    const rawInterval = c.req.query('interval');
    if (rawYears !== undefined && !['1', '3', '5'].includes(rawYears))
      return c.json({ error: 'years must be 1, 3 or 5' }, 400);
    if (rawInterval !== undefined && (!rawYears || !['day', 'week', 'month'].includes(rawInterval)))
      return c.json({ error: 'interval requires years and must be day, week or month' }, 400);
    const years = Number(rawYears) as 1 | 3 | 5;
    const interval = (rawInterval ?? (years === 1 ? 'day' : years === 3 ? 'week' : 'month')) as
      | 'day'
      | 'week'
      | 'month';
    const data = await withMarketSnapshot(sqlitePath, (exec) =>
      getMarketBars(exec, c.req.param('id'), rawYears ? { years, interval } : limit),
    );
    if (!data.instrument) return c.json({ error: 'Instrument not found' }, 404);
    return c.json(data);
  });

  app.get('/api/market/series/:id', async (c) => {
    const limit = Number(c.req.query('limit') ?? 60);
    const data = await withMarketSnapshot(sqlitePath, (exec) =>
      getMarketObservations(exec, c.req.param('id'), limit),
    );
    if (!data.instrument) return c.json({ error: 'Series not found' }, 404);
    return c.json(data);
  });

  app.get('/api/market/industries/:id/constituents', async (c) => {
    const data = await withMarketSnapshot(sqlitePath, (exec) =>
      getIndustryConstituents(exec, c.req.param('id')),
    );
    if (!data.industry) return c.json({ error: 'Industry not found' }, 404);
    return c.json(data);
  });

  app.get('/api/market/etfs/:id', async (c) => {
    const data = await withMarketSnapshot(sqlitePath, (exec) =>
      getEtfDetail(exec, c.req.param('id')),
    );
    if (!data.instrument) return c.json({ error: 'ETF not found' }, 404);
    return c.json(data);
  });

  // 选 ETF 独立只读 API
  app.get('/api/selection/etfs', async (c) => {
    const q: EtfListQuery = {
      q: c.req.query('q'),
      category: c.req.query('category'),
      theme: c.req.query('theme'),
      years: (c.req.query('years') as '1' | '3' | '5') ?? '1',
      lens: c.req.query('lens') as EtfListQuery['lens'],
      maxFee: c.req.query('maxFee') ? Number(c.req.query('maxFee')) : undefined,
      minScale: c.req.query('minScale') ? Number(c.req.query('minScale')) : undefined,
      maxDrawdown: c.req.query('maxDrawdown') ? Number(c.req.query('maxDrawdown')) : undefined,
      minTurnover: c.req.query('minTurnover') ? Number(c.req.query('minTurnover')) : undefined,
      hasBars: c.req.query('hasBars') === 'true',
      sort: c.req.query('sort'),
      order: (c.req.query('order') as 'asc' | 'desc') ?? 'asc',
      page: c.req.query('page') ? Number(c.req.query('page')) : 1,
      pageSize: c.req.query('pageSize') ? Number(c.req.query('pageSize')) : 50,
    };
    return c.json(await withMarketSnapshot(sqlitePath, (exec) => listSelectionEtfs(exec, q)));
  });

  app.get('/api/selection/etfs/:symbol', async (c) => {
    const data = await withMarketSnapshot(sqlitePath, (exec) =>
      getSelectionEtfDetail(exec, c.req.param('symbol')),
    );
    if (!data.ready) return c.json({ ready: false, error: 'Selection tables not ready' }, 503);
    if (!data.found) return c.json({ error: 'ETF not found' }, 404);
    return c.json(data);
  });

  app.get('/api/selection/etfs/:symbol/bars', async (c) => {
    const rawYears = c.req.query('years');
    const rawInterval = c.req.query('interval');
    if (rawYears !== undefined && !['1', '3', '5'].includes(rawYears))
      return c.json({ error: 'years must be 1, 3 or 5' }, 400);
    if (rawInterval !== undefined && !['day', 'week', 'month'].includes(rawInterval))
      return c.json({ error: 'interval must be day, week or month' }, 400);
    const years = (rawYears ? Number(rawYears) : 1) as 1 | 3 | 5;
    const interval = (rawInterval ?? 'day') as 'day' | 'week' | 'month';

    const data = await withMarketSnapshot(sqlitePath, (exec) =>
      getSelectionEtfBars(exec, c.req.param('symbol'), { years, interval }),
    );
    if (!data.ready) return c.json({ ready: false, error: 'Selection tables not ready' }, 503);
    if (!data.found) return c.json({ error: 'ETF not found' }, 404);
    return c.json(data);
  });

  // 选股独立只读 API
  app.get('/api/selection/stocks', async (c) => {
    const q: StockListQuery = {
      q: c.req.query('q'),
      exchange: c.req.query('exchange'),
      industry: c.req.query('industry'),
      isFinancial:
        c.req.query('isFinancial') === 'true'
          ? true
          : c.req.query('isFinancial') === 'false'
            ? false
            : undefined,
      excludeFinancial:
        c.req.query('excludeFinancial') === 'true'
          ? true
          : c.req.query('excludeFinancial') === 'false'
            ? false
            : undefined,
      excludeSt: c.req.query('excludeSt') === 'true',
      years: (c.req.query('years') as '1' | '3' | '5') ?? '1',
      fiscalYear: c.req.query('fiscalYear') ? Number(c.req.query('fiscalYear')) : undefined,
      lens: c.req.query('lens') as StockListQuery['lens'],
      maxPe: c.req.query('maxPe') ? Number(c.req.query('maxPe')) : undefined,
      minRoe: c.req.query('minRoe') ? Number(c.req.query('minRoe')) : undefined,
      minRevenueYoy: c.req.query('minRevenueYoy')
        ? Number(c.req.query('minRevenueYoy'))
        : undefined,
      maxDrawdown: c.req.query('maxDrawdown') ? Number(c.req.query('maxDrawdown')) : undefined,
      minTurnover: c.req.query('minTurnover') ? Number(c.req.query('minTurnover')) : undefined,
      hasHistory: c.req.query('hasHistory') === 'true',
      hasFinancials: c.req.query('hasFinancials') === 'true',
      sort: c.req.query('sort'),
      order: (c.req.query('order') as 'asc' | 'desc') ?? 'asc',
      page: c.req.query('page') ? Number(c.req.query('page')) : 1,
      pageSize: c.req.query('pageSize') ? Number(c.req.query('pageSize')) : 50,
    };
    return c.json(await withMarketSnapshot(sqlitePath, (exec) => listSelectionStocks(exec, q)));
  });

  app.get('/api/selection/stocks/:symbol', async (c) => {
    const data = await withMarketSnapshot(sqlitePath, (exec) =>
      getSelectionStockDetail(exec, c.req.param('symbol')),
    );
    if (!data.ready) return c.json({ ready: false, error: 'Selection tables not ready' }, 503);
    if (!data.found) return c.json({ error: 'Stock not found' }, 404);
    return c.json(data);
  });

  app.get('/api/selection/stocks/:symbol/bars', async (c) => {
    const rawYears = c.req.query('years');
    const rawInterval = c.req.query('interval');
    if (rawYears !== undefined && !['1', '3', '5'].includes(rawYears))
      return c.json({ error: 'years must be 1, 3 or 5' }, 400);
    if (rawInterval !== undefined && !['day', 'week', 'month'].includes(rawInterval))
      return c.json({ error: 'interval must be day, week or month' }, 400);
    const years = (rawYears ? Number(rawYears) : 1) as 1 | 3 | 5;
    const interval = (rawInterval ?? 'day') as 'day' | 'week' | 'month';

    const data = await withMarketSnapshot(sqlitePath, (exec) =>
      getSelectionStockBars(exec, c.req.param('symbol'), { years, interval }),
    );
    if (!data.ready) return c.json({ ready: false, error: 'Selection tables not ready' }, 503);
    if (!data.found) return c.json({ error: 'Stock not found' }, 404);
    return c.json(data);
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
