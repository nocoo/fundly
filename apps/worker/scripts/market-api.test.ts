import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  initMarketSchema,
  upsertMarketDailyBars,
  upsertMarketInstruments,
  upsertMarketQuote,
} from '../../../src/db/market-repo.ts';
import { initSchema } from '../../../src/db/repo.ts';
import { shiftMarketDate } from '../../../src/utils/market-validation.ts';
import { chinaInstrument } from '../../../src/utils/market-watchlist.ts';
import type { AuthConfig } from '../src/lib/auth-config.ts';
import type { getMarketBars, MarketOverviewData } from '../src/lib/market-service.ts';
import { SESSION_COOKIE, signSession } from '../src/lib/session.ts';
import { createApi, withMarketSnapshot } from './app.ts';

const cleanup: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanup.splice(0).reverse()) fn();
});
const publicAuth: AuthConfig = {
  enabled: false,
  required: false,
  clientId: '',
  clientSecret: '',
  sessionSecret: '',
  allowedEmails: [],
};
function database(market = true) {
  const dir = mkdtempSync(join(tmpdir(), 'fundly-market-api-'));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'test.db');
  const db = new Database(path, { create: true });
  cleanup.push(() => db.close());
  db.exec('PRAGMA journal_mode = WAL');
  initSchema(db);
  if (market) {
    initMarketSchema(db);
    upsertMarketInstruments(db, [chinaInstrument('index', '000300.SH', '沪深300')]);
    upsertMarketQuote(db, {
      instrumentId: 'index:000300.SH',
      source: 'fuyao',
      tradeDate: '2026-09-04',
      price: 10,
      collectedAt: 100,
    });
  }
  return { db, path };
}

describe('local market API integration', () => {
  test('every market route requires a session and a valid session can read the market', async () => {
    const { path } = database();
    const auth: AuthConfig = {
      enabled: true,
      required: true,
      clientId: 'unit-test',
      clientSecret: 'unit-test',
      sessionSecret: 'unit-test-session-signing-value',
      allowedEmails: ['market-test@example.invalid'],
    };
    const app = createApi(path, { auth });
    for (const route of [
      'overview',
      'bars/index:000300.SH',
      'series/rate:LPR.1Y',
      'industries/industry:881121.TI/constituents',
      'etfs/etf:510300.SH',
    ]) {
      expect((await app.request(`/api/market/${route}`)).status).toBe(401);
    }
    const token = await signSession(
      { email: 'market-test@example.invalid', sub: 'unit-test', name: null, avatar: null },
      auth.sessionSecret,
    );
    const response = await app.request('/api/market/overview', {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    });
    expect(response.status).toBe(200);
    expect(((await response.json()) as MarketOverviewData).indices[0]?.price).toBe(10);
    expect(
      (
        await app.request('/api/market/overview', {
          method: 'POST',
          headers: { cookie: `${SESSION_COOKIE}=${token}` },
        })
      ).status,
    ).toBe(404);
  });

  test('an older database serves an empty market and clean 404 details without mutation', async () => {
    const { path, db } = database(false);
    const app = createApi(path, { auth: publicAuth });
    const response = await app.request('/api/market/overview');
    expect(response.status).toBe(200);
    expect(((await response.json()) as MarketOverviewData).ready).toBe(false);
    for (const route of [
      'bars/missing',
      'series/missing',
      'industries/missing/constituents',
      'etfs/missing',
    ]) {
      expect((await app.request(`/api/market/${route}`)).status).toBe(404);
    }
    expect(db.query("SELECT name FROM sqlite_master WHERE name LIKE 'market_%'").all()).toEqual([]);
  });

  test('bar limits are bounded and records keep chronological OHLC order', async () => {
    const { path, db } = database();
    upsertMarketDailyBars(
      db,
      Array.from({ length: 65 }, (_, i) => ({
        instrumentId: 'index:000300.SH',
        source: 'fuyao',
        tradeDate: shiftMarketDate('2026-06-01', i),
        open: 10,
        high: 12,
        low: 9,
        close: 11,
        volume: 0,
      })),
    );
    const app = createApi(path, { auth: publicAuth });
    for (const [limit, count] of [
      ['20', 20],
      ['60', 60],
      ['NaN', 60],
      ['Infinity', 60],
      ['-1', 1],
      ['99999999', 65],
    ] as const) {
      const response = await app.request(`/api/market/bars/index%3A000300.SH?limit=${limit}`);
      expect(response.status).toBe(200);
      const body = (await response.json()) as Awaited<ReturnType<typeof getMarketBars>>;
      expect(body.bars).toHaveLength(count);
      expect(body.bars[0]?.volume).toBe(0);
      if (count > 1) expect((body.bars[0]?.date ?? '') < (body.bars.at(-1)?.date ?? '')).toBe(true);
    }
    expect((await app.request('/api/market/bars/unknown')).status).toBe(404);
  });

  test('1/3/5-year API windows are calendar based, not limited to 1000 bars', async () => {
    const { path, db } = database();
    upsertMarketDailyBars(
      db,
      Array.from({ length: 1900 }, (_, i) => ({
        instrumentId: 'index:000300.SH',
        source: 'fuyao',
        tradeDate: shiftMarketDate('2026-09-04', i - 1899),
        open: 100 + i,
        high: 110 + i,
        low: 90 + i,
        close: 105 + i,
        volume: 0,
      })),
    );
    const app = createApi(path, { auth: publicAuth });
    for (const [years, from, count] of [
      [1, '2025-09-04', 366],
      [3, '2023-09-04', 1097],
      [5, '2021-09-04', 1827],
    ] as const) {
      const daily = await app.request(
        `/api/market/bars/index%3A000300.SH?years=${years}&interval=day`,
      );
      expect(daily.status).toBe(200);
      const data = (await daily.json()) as Awaited<ReturnType<typeof getMarketBars>>;
      expect(data.bars.length).toBe(count);
      expect(data.bars[0]?.date).toBe(from);
      expect(data.range).toMatchObject({
        requestedFrom: from,
        requestedTo: '2026-09-04',
        dailyCount: count,
        isPartial: false,
      });
      const grouped = (await (
        await app.request(`/api/market/bars/index%3A000300.SH?years=${years}&interval=month`)
      ).json()) as Awaited<ReturnType<typeof getMarketBars>>;
      expect(grouped.bars[0]?.open).toBe(data.bars[0]?.open);
      expect(grouped.bars.at(-1)?.close).toBe(data.bars.at(-1)?.close);
      expect(grouped.range?.changePct).toBe(data.range?.changePct);
      expect(grouped.bars[0]?.volume).toBe(0);
    }
    for (const query of [
      'years=2',
      'years=Infinity',
      'years=1&interval=quarter',
      'interval=week',
      'years=',
    ]) {
      expect((await app.request(`/api/market/bars/index%3A000300.SH?${query}`)).status).toBe(400);
    }
  });

  test('short instrument history is explicitly marked instead of implying five years', async () => {
    const { path, db } = database();
    upsertMarketDailyBars(db, [
      {
        instrumentId: 'index:000300.SH',
        source: 'fuyao',
        tradeDate: '2026-09-04',
        open: 10,
        high: 12,
        low: 9,
        close: 11,
      },
    ]);
    const app = createApi(path, { auth: publicAuth });
    const data = (await (
      await app.request('/api/market/bars/index%3A000300.SH?years=5')
    ).json()) as Awaited<ReturnType<typeof getMarketBars>>;
    expect(data.bars.length).toBe(1);
    expect(data.range).toMatchObject({
      interval: 'month',
      availableFrom: '2026-09-04',
      displayedFrom: '2026-09-04',
      dailyCount: 1,
      isPartial: true,
    });
  });

  test('a private read snapshot stays consistent across a concurrent publication and rejects writes', async () => {
    const { path, db } = database();
    await withMarketSnapshot(path, async (exec) => {
      const before = await exec.first<{ price: number }>('SELECT price FROM market_quote_latest');
      db.query('UPDATE market_quote_latest SET price = 20').run();
      const after = await exec.first<{ price: number }>('SELECT price FROM market_quote_latest');
      expect(before?.price).toBe(10);
      expect(after?.price).toBe(10);
    });
    expect(
      await withMarketSnapshot(path, (exec) =>
        exec.first<{ price: number }>('SELECT price FROM market_quote_latest'),
      ),
    ).toEqual({ price: 20 });
    await expect(
      withMarketSnapshot(path, (exec) =>
        exec.all('DELETE FROM market_quote_latest RETURNING instrument_id'),
      ),
    ).rejects.toThrow();
    expect(db.query('SELECT COUNT(*) AS n FROM market_quote_latest').get()).toEqual({ n: 1 });
  });
});
