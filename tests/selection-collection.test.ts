import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, test } from 'bun:test';
import { initSchema } from '../src/db/repo.ts';
import {
  initSelectionSchema,
  replaceSelectionDailyBars,
  updateSelectionCollectionStatus,
} from '../src/db/selection-repo.ts';
import { MarketReader } from '../src/fetchers/market-reader.ts';
import {
  classifyEtfAsset,
  collectSelection,
  inferSelectionTradeDate,
  validateSelectionCatalog,
} from '../src/fetchers/selection-collection.ts';
import { fetchStockForwardBars, fetchStockIndicators } from '../src/fetchers/selection-fuyao.ts';
import { chinaMarketDate, shiftMarketDate } from '../src/utils/market-validation.ts';
import { parseSelectionOptions, selectResearchPool } from '../src/utils/selection-options.ts';

const databases: Database[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});
function database() {
  const db = new Database(':memory:');
  databases.push(db);
  initSchema(db);
  initSelectionSchema(db);
  return db;
}
function identity(symbol: string, assetType: string) {
  return {
    thscode: symbol,
    ticker: symbol.slice(0, 6),
    name: `测试${symbol}`,
    exchange: symbol.slice(7),
    asset_type: assetType,
  };
}
const today = chinaMarketDate(Date.now());
const previous = shiftMarketDate(today, -1);
function mockReader(
  options: {
    badValuation?: boolean;
    badPage?: boolean;
    badProfile?: boolean;
    badHistory?: boolean;
    noFinancials?: boolean;
    failIndustry?: boolean;
  } = {},
) {
  const calls: string[] = [];
  const reader = new MarketReader({
    mode: 'live',
    apiKey: 'test-only',
    intervalMs: 0,
    fetchImpl: async (url) => {
      const u = new URL(url);
      calls.push(u.pathname);
      const symbol = u.searchParams.get('thscode') ?? '588000.SH';
      let data: Record<string, unknown> = { item: [] };
      if (u.pathname.endsWith('/tickers/list')) {
        const type = u.searchParams.get('asset_type') ?? '';
        data = {
          item:
            type === 'fund-etf'
              ? [identity('588000.SH', type)]
              : [identity('600519.SH', type), identity('000001.SZ', type)],
        };
      } else if (u.pathname.endsWith('/trading-days'))
        data = { item: [{ date: previous }, { date: today }] };
      else if (u.pathname.endsWith('/ths-stock-list')) {
        if (options.failIndustry) return Response.json({ code: 3002 });
        data = {
          thscode: symbol,
          item: [{ thscode: symbol === '881155.TI' ? '000001.SZ' : '600519.SH' }],
        };
      } else if (u.pathname.endsWith('/prices/snapshot'))
        data = {
          total: options.badPage ? 3 : 2,
          timestamp: Date.now(),
          item: [
            { thscode: '600519.SH', last_price: 10, prev_price: 8, volume: 0, turnover: 0 },
            { thscode: '000001.SZ', last_price: 0, prev_price: 0, turnover: null },
          ],
        };
      else if (u.pathname.endsWith('/valuations/snapshot'))
        data = {
          item: (options.badValuation ? ['600519.SH'] : ['600519.SH', '000001.SZ']).map(
            (thscode) => ({ thscode, pe_ttm: 20 }),
          ),
        };
      else if (u.pathname.endsWith('/market/snapshot'))
        data = { item: [{ thscode: symbol, last_price: 10, prev_price: 9, turnover: 1000 }] };
      else if (u.pathname.endsWith('/historical')) {
        const end = Number(u.searchParams.get('end'));
        const date = chinaMarketDate(end - 86400000);
        data = {
          thscode: symbol,
          interval: '1d',
          adjust: 'forward',
          item: [
            {
              date_ms: Date.parse(`${date}T00:00:00+08:00`),
              open_price: 10,
              high_price: options.badHistory ? 1 : 11,
              low_price: 9,
              close_price: 10,
              volume: 1,
              turnover: 10,
            },
            {
              date_ms: end,
              open_price: 10,
              high_price: 11,
              low_price: 9,
              close_price: 10,
              volume: 1,
              turnover: 10,
            },
          ],
        };
      } else if (u.pathname.endsWith('/profile/detail')) {
        if (options.badProfile) return Response.json({ code: 3002 });
        data = {
          item: [
            {
              thscode: symbol,
              rate_info: [
                { rate_type: 'management', standard_rate: '0.15%' },
                { rate_type: 'custody', standard_rate: '0.05%' },
              ],
            },
          ],
        };
      } else if (u.pathname.endsWith('/performance/nav'))
        data = { thscode: symbol, item: [{ nav_date: previous, unit_nav: 10, adj_nav: 10 }] };
      else if (u.pathname.endsWith('/portfolio/holdings')) return Response.json({ code: 3002 });
      else if (u.pathname.includes('/financials/')) {
        if (options.noFinancials) return Response.json({ code: 3002 });
        if (u.pathname.startsWith('/api/a-share/')) {
          if (u.pathname.endsWith('/indicators')) {
            data = {
              thscode: symbol,
              report: u.searchParams.get('report'),
              abilities: [
                {
                  ability: 'profitability',
                  indicators: [{ index_id: 'index_weighted_avg_roe', value: '11.5' }],
                },
              ],
            };
          } else {
            data = {
              item: [
                {
                  thscode: symbol,
                  fiscal_year: 2025,
                  fiscal_period: 'FY',
                  currency: 'CNY',
                  period_end_ms: Date.parse('2025-12-31T00:00:00+08:00'),
                  report_date_ms: Date.parse('2026-04-01T00:00:00+08:00'),
                  operating_income: 200,
                  net_profit: 50,
                  parent_holder_net_profit: 40,
                  act_cash_flow_net: 100,
                  pay_fixed_assets_etc_cash: 30,
                  total_debt: 200,
                  assets_total: 1000,
                },
              ],
            };
          }
        } else data = { item: [] };
      }
      return Response.json({ code: 0, data });
    },
  });
  return { reader, calls };
}

describe('selection collection boundaries and publication', () => {
  test('stock deep collection publishes aligned statements, indicators and real resource counts', async () => {
    const db = database();
    const result = await collectSelection(
      db,
      mockReader().reader,
      parseSelectionOptions(['--scope', 'stock', '--symbols', '600519.SH']),
    );
    expect(result.deep.stock?.validCount).toBe(1);
    expect(result.deep.stock?.success).toBe(true);
    expect(
      db
        .query(
          "SELECT roe_weighted, cash_profit_ratio, cash_minus_capex, debt_ratio FROM selection_stock_materialized WHERE symbol='600519.SH'",
        )
        .get(),
    ).toEqual({ roe_weighted: 11.5, cash_profit_ratio: 2, cash_minus_capex: 70, debt_ratio: 20 });
  });

  test('stock symbol attempts with no successful deep resources cannot claim a refresh', async () => {
    const db = database();
    updateSelectionCollectionStatus(db, {
      scope: 'stock_deep',
      lastSuccessAt: 123,
      lastAttemptAt: 123,
      success: true,
      catalogCount: 1,
      validCount: 1,
      errorMessage: null,
      updatedAt: 123,
    });
    const result = await collectSelection(
      db,
      mockReader({ badHistory: true, noFinancials: true }).reader,
      parseSelectionOptions(['--scope', 'stock', '--symbols', '600519.SH']),
    );
    expect(result.deep.stock?.validCount).toBe(0);
    expect(result.deep.stock?.success).toBe(false);
    expect(
      db
        .query(
          "SELECT success,last_success_at FROM selection_collection_status WHERE scope='stock_deep'",
        )
        .get(),
    ).toEqual({ success: 0, last_success_at: 123 });
  });
  test('rejects unsafe or unbounded CLI input before collection', () => {
    for (const args of [
      ['--scope', 'stocks'],
      ['--etf-limit', 'NaN'],
      ['--stock-limit', 'Infinity'],
      ['--etf-limit', '0'],
      ['--stock-limit', '201'],
      ['--interval-minutes', '14'],
      ['--symbols', '510300'],
      ['--symbols', '588000.SH,588000.SH'],
      ['--symbols', '588000.SH', '--skip-deep'],
    ]) {
      expect(() => parseSelectionOptions(args)).toThrow();
    }
    expect(parseSelectionOptions(['--symbols', '588000.sh']).symbols).toEqual(['588000.SH']);
    expect(classifyEtfAsset('QDII-海外股票')).toBe('境外权益');
  });

  test('rejects truncated, duplicate and wrong-asset directories', () => {
    const item = [identity('588000.SH', 'fund-etf')];
    expect(validateSelectionCatalog({ item, collectedAt: 1 }, 'fund-etf')).toHaveLength(1);
    expect(() =>
      validateSelectionCatalog({ item, total: 2, collectedAt: 1 }, 'fund-etf'),
    ).toThrow();
    expect(() =>
      validateSelectionCatalog({ item: [...item, ...item], collectedAt: 1 }, 'fund-etf'),
    ).toThrow();
    expect(() => validateSelectionCatalog({ item, collectedAt: 1 }, 'a-share')).toThrow();
    expect(() => validateSelectionCatalog({ item, collectedAt: 1 }, 'fund-etf', 100)).toThrow();
  });

  test('weekend and pre-open snapshots resolve through trading calendar, not source timestamp', () => {
    const calendar = {
      item: [{ date: '20260904' }, { date: '20260907' }],
      collectedAt: 1,
      timestamp: Date.now(),
    };
    expect(inferSelectionTradeDate(calendar, Date.parse('2026-09-06T12:00:00+08:00'))).toBe(
      '2026-09-04',
    );
    expect(inferSelectionTradeDate(calendar, Date.parse('2026-09-07T08:00:00+08:00'))).toBe(
      '2026-09-04',
    );
    expect(inferSelectionTradeDate(calendar, Date.parse('2026-09-07T10:00:00+08:00'))).toBe(
      '2026-09-07',
    );
  });

  test('research pools keep verified anchors and balance groups by scale', () => {
    expect(
      selectResearchPool(
        [
          { symbol: 'A', group: '权益', size: 100 },
          { symbol: 'B', group: '权益', size: 99 },
          { symbol: 'C', group: '固收', size: 50 },
          { symbol: 'D', group: null, size: 200 },
        ],
        ['missing', 'B'],
        3,
      ),
    ).toEqual(['B', 'A', 'C']);
  });

  test('missing valuation members roll back the full stock basic batch', async () => {
    const db = database();
    const good = mockReader();
    await collectSelection(
      db,
      good.reader,
      parseSelectionOptions(['--scope', 'stock', '--skip-deep']),
    );
    const before = db.query('SELECT * FROM selection_stock_materialized ORDER BY symbol').all();
    await expect(
      collectSelection(
        db,
        mockReader({ badValuation: true }).reader,
        parseSelectionOptions(['--scope', 'stock', '--skip-deep']),
      ),
    ).rejects.toThrow('universe');
    expect(db.query('SELECT * FROM selection_stock_materialized ORDER BY symbol').all()).toEqual(
      before,
    );
    const status = db
      .query(
        "SELECT success, last_success_at FROM selection_collection_status WHERE scope = 'stock_valuation'",
      )
      .get() as { success: number; last_success_at: number };
    expect(status.success).toBe(0);
    expect(status.last_success_at).toBeGreaterThan(0);
    const rows = db
      .query('SELECT price, volume FROM selection_stock_snapshot ORDER BY symbol')
      .all();
    expect(rows).toEqual([
      { price: null, volume: null },
      { price: 10, volume: 0 },
    ]);
  });

  test('pagination changes and unavailable financial industries cannot publish a new stock batch', async () => {
    for (const failure of [{ badPage: true }, { failIndustry: true }]) {
      const db = database();
      await expect(
        collectSelection(
          db,
          mockReader(failure).reader,
          parseSelectionOptions(['--scope', 'stock', '--skip-deep']),
        ),
      ).rejects.toThrow();
      expect(db.query('SELECT COUNT(*) AS n FROM selection_stock_catalog').get()).toEqual({ n: 0 });
    }
  });

  test('588000 is classified by catalog and profile/holding failures do not suppress its NAV or K', async () => {
    const db = database();
    const mock = mockReader({ badProfile: true });
    const result = await collectSelection(
      db,
      mock.reader,
      parseSelectionOptions(['--scope', 'etf', '--symbols', '588000.SH']),
    );
    expect(result.deep.etf?.resources.bars?.success).toBe(1);
    expect(result.deep.etf?.resources.nav?.success).toBe(1);
    expect(result.deep.etf?.success).toBe(false);
    expect(db.query('SELECT COUNT(*) AS n FROM selection_daily_bar').get()).toEqual({ n: 2 });
    expect(db.query('SELECT COUNT(*) AS n FROM selection_etf_nav').get()).toEqual({ n: 1 });
    expect(db.query('SELECT COUNT(*) AS n FROM selection_stock_catalog').get()).toEqual({ n: 0 });
    expect(mock.calls).toContain('/api/fund/performance/nav');
  });

  test('bad K leaves its previous full window and a failed deep run cannot advance success time', async () => {
    const db = database();
    replaceSelectionDailyBars(db, 'etf', '588000.SH', 'none', [
      {
        assetType: 'etf',
        symbol: '588000.SH',
        adjust: 'none',
        tradeDate: '2025-01-02',
        open: 20,
        high: 21,
        low: 19,
        close: 20,
        volume: 1,
        turnover: 20,
        collectedAt: 1,
      },
    ]);
    updateSelectionCollectionStatus(db, {
      scope: 'etf_deep',
      lastSuccessAt: 123,
      lastAttemptAt: 123,
      success: true,
      catalogCount: 1,
      validCount: 1,
      errorMessage: null,
      updatedAt: 123,
    });
    await collectSelection(
      db,
      mockReader({ badHistory: true }).reader,
      parseSelectionOptions(['--scope', 'etf', '--symbols', '588000.SH']),
    );
    expect(db.query('SELECT trade_date, close FROM selection_daily_bar').all()).toEqual([
      { trade_date: '2025-01-02', close: 20 },
    ]);
    expect(
      db
        .query(
          "SELECT success, last_success_at FROM selection_collection_status WHERE scope = 'etf_deep'",
        )
        .get(),
    ).toEqual({ success: 0, last_success_at: 123 });
  });

  test('materialization failure rolls back catalog and does not publish a success', async () => {
    const db = database();
    db.exec(
      "CREATE TRIGGER reject_selection BEFORE INSERT ON selection_etf_materialized BEGIN SELECT RAISE(ABORT, 'rejected'); END",
    );
    await expect(
      collectSelection(
        db,
        mockReader().reader,
        parseSelectionOptions(['--scope', 'etf', '--skip-deep']),
      ),
    ).rejects.toThrow('rejected');
    expect(db.query('SELECT COUNT(*) AS n FROM selection_etf_catalog').get()).toEqual({ n: 0 });
    expect(
      db.query("SELECT success FROM selection_collection_status WHERE scope = 'etf_catalog'").get(),
    ).toEqual({ success: 0 });
  });

  test('missing identity or adjustment metadata is never accepted as forward history', async () => {
    const reader = new MarketReader({
      mode: 'live',
      apiKey: 'test-only',
      intervalMs: 0,
      fetchImpl: async () =>
        Response.json({ code: 0, data: { item: [], abilities: [], report: '2025-4' } }),
    });
    await expect(fetchStockForwardBars(reader, '600519.SH', 1, 2)).rejects.toThrow();
    await expect(fetchStockIndicators(reader, '600519.SH', '2025-4')).rejects.toThrow();
  });
});
