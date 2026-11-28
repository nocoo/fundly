import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  initMarketSchema,
  upsertMarketDailyBars,
  upsertMarketInstruments,
} from '../src/db/market-repo.ts';
import { initSchema } from '../src/db/repo.ts';
import {
  collectFuyao,
  fuyaoHistoryWindows,
  recentHistoryStart,
} from '../src/fetchers/market-fuyao-collection.ts';
import { type FuyaoData, MarketReader } from '../src/fetchers/market-reader.ts';
import { CN_WATCHLIST, ETF_WATCHLIST, INDUSTRY_WATCHLIST } from '../src/utils/market-watchlist.ts';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function evidenceDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'fundly-market-reader-'));
  dirs.push(dir);
  return dir;
}

describe('market source provenance and completeness', () => {
  test('a multi-year backfill is not skipped just because recent candles exist', () => {
    const db = new Database(':memory:');
    initMarketSchema(db);
    const instrument = CN_WATCHLIST[0];
    if (!instrument) throw new Error('Missing fixture');
    upsertMarketInstruments(db, [instrument]);
    const bar = {
      instrumentId: instrument.instrumentId,
      source: 'fuyao',
      open: 10,
      high: 12,
      low: 9,
      close: 11,
    };
    try {
      upsertMarketDailyBars(db, [
        { ...bar, tradeDate: '2026-06-01' },
        { ...bar, tradeDate: '2026-09-04' },
      ]);
      expect(
        recentHistoryStart(db, instrument.instrumentId, '2021-08-11', '2026-09-04', 'live'),
      ).toBe('2021-08-11');
      upsertMarketDailyBars(db, [{ ...bar, tradeDate: '2021-08-12' }]);
      expect(
        recentHistoryStart(db, instrument.instrumentId, '2021-08-11', '2026-09-04', 'live'),
      ).toBe('2026-08-30');
      expect(
        recentHistoryStart(db, instrument.instrumentId, '2021-08-11', '2026-09-04', 'evidence'),
      ).toBe('2021-08-11');
    } finally {
      db.close();
    }
  });

  test('ETF backfill windows cover every day without overlapping or exceeding upstream limits', () => {
    const windows = fuyaoHistoryWindows('2021-08-11', '2026-09-04', true);
    expect(windows.length).toBe(2);
    expect(windows[0]?.from).toBe('2021-08-11');
    expect(windows.at(-1)?.to).toBe('2026-09-05');
    expect(windows[0]?.to).toBe(windows[1]?.from);
    for (const window of windows) {
      expect(Date.parse(window.to) - Date.parse(window.from)).toBeLessThanOrEqual(1460 * 86400000);
    }
    expect(fuyaoHistoryWindows('2021-08-11', '2026-09-04', false)).toEqual([
      { from: '2021-08-11', to: '2026-09-05' },
    ]);
  });

  test('live failure cannot silently read a successful archived response', async () => {
    const dir = evidenceDir();
    await Bun.write(join(dir, 'response.txt'), 'archived success');
    let calls = 0;
    const reader = new MarketReader({
      mode: 'live',
      evidenceDir: dir,
      fetchImpl: async () => {
        calls++;
        return new Response('unavailable', { status: 503 });
      },
    });
    await expect(reader.text('https://example.invalid/market', 'response.txt')).rejects.toThrow(
      'HTTP 503',
    );
    expect(calls).toBe(3);
    expect(reader.collectedAt).toBe(0);
  });

  test('explicit evidence import preserves the receipt time and performs no network request', async () => {
    const dir = evidenceDir();
    await Bun.write(join(dir, 'response.txt'), 'archived success');
    await Bun.write(
      join(dir, 'response.receipt.json'),
      JSON.stringify({ retrieved_at: '2026-09-04T09:00:00Z' }),
    );
    const reader = new MarketReader({
      mode: 'evidence',
      evidenceDir: dir,
      fetchImpl: async () => {
        throw new Error('unexpected network');
      },
    });
    const response = await reader.text('https://example.invalid/market', 'response.txt');
    expect(response.text).toBe('archived success');
    expect(response.collectedAt).toBe(Date.parse('2026-09-04T09:00:00Z'));
    expect(reader.requestCount).toBe(0);
  });

  test('authenticated requests reject a different host before sending the key', async () => {
    const reader = new MarketReader({
      mode: 'live',
      apiKey: 'unit-test-value',
      fetchImpl: async () => {
        throw new Error('unexpected network');
      },
    });
    await expect(reader.text('https://example.invalid/market', undefined, true)).rejects.toThrow(
      'Invalid financial API origin',
    );
    expect(reader.requestCount).toBe(0);
  });

  for (const failure of ['short-page', 'changed-total', 'duplicate-code'] as const) {
    test(`Fuyao collection rejects ${failure} before publishing partial coverage`, async () => {
      const db = new Database(':memory:');
      initSchema(db);
      initMarketSchema(db);
      const stocks = Array.from({ length: 1001 }, (_, i) => ({
        thscode: `${String(i + 1).padStart(6, '0')}.SZ`,
        name: '测试股票',
        asset_type: 'a-share',
        exchange: 'SZ',
      }));
      const snapshot = (thscode: string) => ({
        thscode,
        last_price: 10,
        prev_price: 9,
        volume: 100,
        turnover: 1000,
        price_change_ratio_pct: 11.11,
      });
      const reader = new MarketReader({ mode: 'evidence' });
      reader.fuyao = async (path, params = {}): Promise<FuyaoData> => {
        let item: Array<Record<string, unknown>> = [];
        let total: number | undefined;
        if (path.includes('/calendar/')) item = [{ date: '20260904' }];
        else if (path === '/api/meta/tickers/list')
          item =
            params.asset_type === 'a-share'
              ? stocks
              : ETF_WATCHLIST.map(([thscode, name]) => ({ thscode, name, asset_type: 'fund-etf' }));
        else if (path.includes('/catalog/'))
          item = INDUSTRY_WATCHLIST.map((i) => ({ thscode: i.symbol, name: i.name }));
        else if (path === '/api/a-share/prices/snapshot') {
          const offset = Number(params.offset);
          item = stocks.slice(offset, offset + 1000).map((s) => snapshot(s.thscode));
          total = stocks.length;
          if (offset > 0 && failure === 'short-page') item = [];
          if (offset > 0 && failure === 'changed-total') total++;
          if (offset > 0 && failure === 'duplicate-code') item = [snapshot('000001.SZ')];
        } else if (path.endsWith('/snapshot')) {
          const symbols = String(params.thscodes ?? params.thscode).split(',');
          item = CN_WATCHLIST.filter((i) => symbols.includes(i.symbol)).map((i) =>
            snapshot(i.symbol),
          );
        } else throw new Error('unexpected endpoint');
        return { item, total, collectedAt: Date.parse('2026-09-04T09:00:00Z') };
      };
      try {
        await expect(collectFuyao(db, reader)).rejects.toThrow(
          failure === 'duplicate-code' ? 'security universe' : 'page coverage',
        );
        expect(db.query('SELECT COUNT(*) AS n FROM market_quote_latest').get()).toEqual({ n: 0 });
      } finally {
        db.close();
      }
    });
  }

  test('collectFuyao completes full watchlist, stocks, limit pools, history, constituents, and ETF disclosures', async () => {
    const db = new Database(':memory:');
    initSchema(db);
    initMarketSchema(db);
    db.exec(
      "INSERT INTO fund_basic_info (fund_code, fund_name, fund_type, created_at, updated_at) VALUES ('510300', '沪深300ETF华泰柏瑞', '指数型-股票', 1, 1)",
    );
    const stocks = [
      { thscode: '600519.SH', name: '贵州茅台', asset_type: 'a-share', exchange: 'SH' },
      { thscode: '000001.SZ', name: '平安银行', asset_type: 'a-share', exchange: 'SZ' },
    ];
    const tradeDate = '2026-09-04';
    const dayMs = Date.parse('2026-09-04T00:00:00+08:00');
    const reader = new MarketReader({ mode: 'evidence' });
    reader.fuyao = async (path, params = {}): Promise<FuyaoData> => {
      const collectedAt = Date.parse('2026-09-04T15:30:00+08:00');
      if (path === '/api/a-share/calendar/trading-days') {
        return { item: [{ date: '20260903' }, { date: '20260904' }], collectedAt };
      }
      if (path === '/api/meta/tickers/list') {
        return {
          item:
            params.asset_type === 'a-share'
              ? stocks
              : ETF_WATCHLIST.map(([thscode, name]) => ({ thscode, name, asset_type: 'fund-etf' })),
          collectedAt,
        };
      }
      if (path === '/api/a-share-index/catalog/ths-index-list') {
        return {
          item: INDUSTRY_WATCHLIST.map((i) => ({ thscode: i.symbol, name: i.name })),
          collectedAt,
        };
      }
      if (path === '/api/a-share-index/prices/snapshot' || path === '/api/fund/market/snapshot') {
        const symbols = String(params.thscodes ?? params.thscode).split(',');
        return {
          item: symbols.map((thscode) => ({
            thscode,
            last_price: 10,
            prev_price: 9.5,
            volume: 100,
            turnover: 1000,
          })),
          collectedAt,
        };
      }
      if (path === '/api/a-share/prices/snapshot') {
        return {
          total: stocks.length,
          item: stocks.map((s) => ({
            thscode: s.thscode,
            last_price: 10,
            prev_price: 10,
            volume: 100,
            turnover: 1000,
          })),
          collectedAt,
        };
      }
      if (path.includes('/special-data/limit-')) {
        const isUp = path.includes('limit-up');
        return {
          pagination: { total: isUp ? 1 : 0, pages: 1, page: 1, size: 200 },
          item: isUp ? [{ thscode: '600519.SH' }] : [],
          collectedAt,
        };
      }
      if (path.endsWith('/historical')) {
        return {
          thscode: String(params.thscode),
          item: [
            { date_ms: dayMs, open_price: 10, high_price: 11, low_price: 9, close_price: 10.5 },
          ],
          collectedAt,
        };
      }
      if (path.endsWith('/constituents/ths-stock-list')) {
        return {
          item: [{ stock_code: '600519.SH', stock_name: '贵州茅台', weight: 5 }],
          collectedAt,
        };
      }
      if (path === '/api/fund/profile/detail') {
        return {
          item: [
            {
              thscode: params.thscode,
              fund_name: '沪深300ETF华泰柏瑞',
              estab_date: Date.parse('2012-05-04T00:00:00+08:00'),
              fund_scale: 100,
            },
          ],
          collectedAt,
        };
      }
      if (path === '/api/fund/performance/nav') {
        return { item: [{ nav_date: dayMs, unit_nav: 4.1 }], collectedAt };
      }
      if (path === '/api/fund/portfolio/holdings') {
        return {
          item: [
            {
              end_date_ms: Date.parse('2026-06-30T00:00:00+08:00'),
              thscode: '600519.SH',
              stock_name: '贵州茅台',
              hold_ratio: 5,
            },
          ],
          collectedAt,
        };
      }
      throw new Error(`unexpected: ${path}`);
    };

    try {
      const batch = await collectFuyao(db, reader, 10);
      expect(batch.tradeDate).toBe(tradeDate);
      expect(batch.actualItems).toBe(stocks.length + CN_WATCHLIST.length);
      expect(batch.breadth?.limitUpCount).toBe(1);
      expect(batch.members?.length).toBeGreaterThan(0);
      expect(batch.profiles?.length).toBe(ETF_WATCHLIST.length);
      expect(batch.aliases?.find((a) => a.symbol === '510300.SH')?.fundCode).toBe('510300');
    } finally {
      db.close();
    }
  });
});
