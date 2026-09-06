import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initSchema } from '../../../src/db/repo.ts';
import {
  initSelectionSchema,
  replaceSelectionDailyBars,
  upsertSelectionStockIndicators,
  upsertSelectionStockStatements,
} from '../../../src/db/selection-repo.ts';
import type { EtfRowDto, StockRowDto } from '../src/lib/selection-service.ts';
import { createApi } from './app.ts';

const cleanup: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanup.splice(0).reverse()) fn();
});

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'fundly-selection-review-'));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'research.db');
  const db = new Database(path, { create: true });
  cleanup.push(() => db.close());
  db.exec('PRAGMA journal_mode = WAL');
  initSchema(db);
  initSelectionSchema(db);
  const app = createApi(path, {
    auth: {
      enabled: false,
      required: false,
      clientId: '',
      clientSecret: '',
      sessionSecret: '',
      allowedEmails: [],
    },
  });
  const stocks = [
    ['000001.SZ', '测试银行', '银行', 1, 5, 10, 0, 10, 2025, 1, 1],
    ['600001.SH', '测试制造', '制造', 0, 20, 9, 5, 20, 2025, 1, 1],
    ['600002.SH', '*ST测试', '制造', 0, -3, null, null, null, null, 0, 0],
    ['600003.SH', '未分类测试', null, 0, 50, 6, -2, 30, 2024, 0, 1],
    ['920001.BJ', '测试北交所', null, 0, 10, 10, 3, 15, 2025, 1, 1],
  ] as const;
  for (const [
    symbol,
    name,
    industry,
    financial,
    pe,
    roe,
    growth,
    dd,
    year,
    history,
    reports,
  ] of stocks) {
    db.query(`INSERT INTO selection_stock_catalog
      (symbol,ticker,name,exchange,industry_name,is_financial,created_at,updated_at)
      VALUES (?,?,?,?,?,?,1,1)`).run(
      symbol,
      symbol.slice(0, 6),
      name,
      symbol.slice(7),
      industry,
      financial,
    );
    db.query(`INSERT INTO selection_stock_materialized
      (symbol,ticker,name,exchange,industry_name,is_financial,price,trade_date,turnover,
       pe_ttm,roe_weighted,revenue_yoy,max_drawdown_1y,max_drawdown_3y,fiscal_year,
       has_price_history,has_financials,updated_at)
      VALUES (?,?,?,?,?,?,10,'2026-09-04',100000000,?,?,?,?,40,?,?,?,1)`).run(
      symbol,
      symbol.slice(0, 6),
      name,
      symbol.slice(7),
      industry,
      financial,
      pe,
      roe,
      growth,
      dd,
      year,
      history,
      reports,
    );
  }
  for (const [symbol, name, category, fee, scale, dd, turnover, nav, bars] of [
    ['510001.SH', '测试零费宽基', '境内权益', 0, 10, 0, 0, '2026-08-18', 1],
    ['513001.SH', '测试海外', '境外权益', 0.8, 3, 20, 10000000, '2026-09-04', 1],
    ['159001.SZ', '测试待核验', '待核验', null, null, null, null, null, 0],
  ] as const) {
    db.query(`INSERT INTO selection_etf_catalog
      (symbol,ticker,name,exchange,asset_class,created_at,updated_at) VALUES (?,?,?,?,?,1,1)`).run(
      symbol,
      symbol.slice(0, 6),
      name,
      symbol.slice(7),
      category,
    );
    db.query(`INSERT INTO selection_etf_materialized
      (symbol,ticker,name,exchange,asset_class,direction_tag,total_expense_pct,scale_yi,
       max_drawdown_1y,max_drawdown_3y,avg_turnover_20d,nav_date,has_nav_history,has_market_bars,updated_at)
      VALUES (?,?,?,?,?,'宽基',?,?,?,30,?,?,?,?,1)`).run(
      symbol,
      symbol.slice(0, 6),
      name,
      symbol.slice(7),
      category,
      fee,
      scale,
      dd,
      turnover,
      nav,
      nav ? 1 : 0,
      bars,
    );
  }
  async function get<T>(suffix: string): Promise<T> {
    const response = await app.request(`/api/selection${suffix}`);
    expect(response.status).toBe(200);
    return response.json() as Promise<T>;
  }
  return { app, db, get };
}

type List<T> = { total: number; rows: T[]; page: number; pageSize: number };

describe('selection independent API contracts', () => {
  test('explicit all-company selection overrides the operating-lens financial default', async () => {
    const { get } = fixture();
    const defaults = await get<List<StockRowDto>>('/stocks?lens=quality&exchange=SH%2CSZ');
    expect(defaults.rows.every((r) => !r.isFinancial)).toBe(true);
    const all = await get<List<StockRowDto>>(
      '/stocks?lens=quality&exchange=SH%2CSZ&excludeFinancial=false',
    );
    expect(all.rows.some((r) => r.isFinancial)).toBe(true);
    const bank = await get<List<StockRowDto>>('/stocks?lens=quality&exchange=all&isFinancial=true');
    expect(bank.rows.map((r) => r.symbol)).toEqual(['000001.SZ']);
    const non = await get<List<StockRowDto>>('/stocks?lens=quality&exchange=all&isFinancial=false');
    expect(non.rows.every((r) => !r.isFinancial)).toBe(true);
  });

  test('ETF zero thresholds are real filters and unknown values only pass disabled filters', async () => {
    const { get } = fixture();
    const filtered = await get<List<EtfRowDto>>(
      '/etfs?category=all&maxFee=0&minScale=0&maxDrawdown=0&minTurnover=0',
    );
    expect(filtered.rows.map((r) => r.symbol)).toEqual(['510001.SH']);
    const all = await get<List<EtfRowDto>>('/etfs?category=all');
    expect(all.total).toBe(3);
    expect(all.rows.some((r) => r.totalExpensePct === null)).toBe(true);
    const older = await get<List<EtfRowDto>>('/etfs?years=3&maxDrawdown=0');
    expect(older.rows).toEqual([]);
    const covered = await get<List<EtfRowDto>>('/etfs?hasBars=true&theme=宽基');
    expect(covered.total).toBe(2);
  });

  test('stock pick intersection excludes negative PE and missing research metrics', async () => {
    const { get } = fixture();
    const chosen = await get<List<StockRowDto>>(
      '/stocks?exchange=SH%2CSZ&maxPe=25&minRoe=8&minRevenueYoy=0&maxDrawdown=25&minTurnover=50000000&excludeFinancial=true&excludeSt=true',
    );
    expect(chosen.rows.map((r) => r.symbol)).toEqual(['600001.SH']);
    const basic = await get<List<StockRowDto>>('/stocks?exchange=all&lens=browse');
    expect(basic.total).toBe(5);
    expect(basic.rows.some((r) => r.peTtm === -3)).toBe(true);
    expect(
      (await get<List<StockRowDto>>('/stocks?exchange=SH%2CSZ&hasFinancials=true&fiscalYear=2025'))
        .total,
    ).toBe(2);
    expect(
      (await get<List<StockRowDto>>('/stocks?exchange=BJ&hasHistory=true')).rows[0]?.symbol,
    ).toBe('920001.BJ');
    expect((await get<List<StockRowDto>>('/stocks?exchange=all&industry=未分类')).total).toBe(2);
    expect((await get<List<StockRowDto>>('/stocks?exchange=all&q=制造')).rows[0]?.symbol).toBe(
      '600001.SH',
    );
  });

  test('both sort directions retain null-last ordering and deterministic pagination', async () => {
    const { get } = fixture();
    for (const order of ['asc', 'desc']) {
      const funds = await get<List<EtfRowDto>>(`/etfs?category=all&sort=fee&order=${order}`);
      expect(funds.rows.at(-1)?.symbol).toBe('159001.SZ');
      expect(funds.rows[0]?.symbol).toBe(order === 'asc' ? '510001.SH' : '513001.SH');
      const stocks = await get<List<StockRowDto>>(`/stocks?exchange=all&sort=pe&order=${order}`);
      expect(stocks.rows.at(-1)?.peTtm).toBe(-3);
      expect(stocks.rows[0]?.peTtm).toBe(order === 'asc' ? 5 : 50);
    }
    const page = await get<List<StockRowDto>>(
      '/stocks?exchange=all&sort=ticker&order=asc&page=2&pageSize=2',
    );
    expect(page.page).toBe(2);
    expect(page.rows.map((r) => r.symbol)).toEqual(['600002.SH', '600003.SH']);
    const invalid = await get<List<StockRowDto>>(
      '/stocks?exchange=all&sort=__proto__&page=Infinity&pageSize=NaN',
    );
    expect(invalid.page).toBe(1);
    expect(invalid.pageSize).toBe(50);
  });

  test('stock detail aligns annual statements and returns only needed data', async () => {
    const { get, db } = fixture();
    upsertSelectionStockStatements(db, [
      {
        symbol: '600001.SH',
        statementType: 'income',
        fiscalYear: 2025,
        fiscalPeriod: 'FY',
        periodEnd: '2025-12-31',
        reportDate: '2026-04-01',
        currency: 'CNY',
        data: { operating_income: 100, net_profit: 20, parent_holder_net_profit: 18 },
        collectedAt: 1,
      },
      {
        symbol: '600001.SH',
        statementType: 'cash_flow',
        fiscalYear: 2025,
        fiscalPeriod: 'FY',
        periodEnd: '2025-12-31',
        reportDate: '2026-04-02',
        currency: 'CNY',
        data: { act_cash_flow_net: 40, pay_fixed_assets_etc_cash: 10 },
        collectedAt: 1,
      },
      {
        symbol: '600001.SH',
        statementType: 'balance',
        fiscalYear: 2025,
        fiscalPeriod: 'FY',
        periodEnd: '2025-12-31',
        reportDate: '2026-04-03',
        currency: 'USD',
        data: { assets_total: 50, total_debt: 20 },
        collectedAt: 1,
      },
    ]);
    upsertSelectionStockIndicators(db, {
      symbol: '600001.SH',
      report: '2025-4',
      abilities: [
        {
          ability: 'profitability',
          indicators: [{ index_id: 'index_weighted_avg_roe', value: 9 }],
        },
      ],
      collectedAt: 1,
    });
    const response = await get<{
      detail: {
        metrics: StockRowDto;
        statements: Array<{
          currency: string;
          reportDate: string;
          income: unknown;
          balance: unknown;
          cashFlow: unknown;
        }>;
        indicators: unknown[];
      };
    }>('/stocks/600001.SH');
    expect(response.detail.metrics.peTtm).toBe(20);
    const annual = response.detail.statements[0];
    expect(annual?.currency).toBe('CNY');
    expect(annual?.reportDate).toBe('2026-04-02');
    expect(annual?.income).toEqual({
      operating_income: 100,
      net_profit: 20,
      parent_holder_net_profit: 18,
    });
    expect(annual?.cashFlow).toEqual({ act_cash_flow_net: 40, pay_fixed_assets_etc_cash: 10 });
    expect(annual?.balance).toBeNull();
    expect(response.detail.indicators).toHaveLength(1);
    expect(JSON.stringify(response)).not.toContain('raw_json');
  });

  test('stock bars keep forward-adjusted negative lows and aggregate real OHLC without filling missing volume', async () => {
    const { get, db, app } = fixture();
    replaceSelectionDailyBars(db, 'stock', '600001.SH', 'forward', [
      {
        assetType: 'stock',
        symbol: '600001.SH',
        adjust: 'forward',
        tradeDate: '2026-09-01',
        open: 0.2,
        high: 0.4,
        low: -0.1,
        close: 0.3,
        volume: 100,
        turnover: 20,
        collectedAt: 1,
      },
      {
        assetType: 'stock',
        symbol: '600001.SH',
        adjust: 'forward',
        tradeDate: '2026-09-02',
        open: 0.3,
        high: 0.7,
        low: 0.2,
        close: 0.6,
        volume: null,
        turnover: 30,
        collectedAt: 1,
      },
    ]);
    type Bars = {
      adjust: string;
      bars: Array<{
        open: number;
        high: number;
        low: number;
        close: number;
        volume: number | null;
        turnover: number | null;
      }>;
      coverage: { isFullWindow: boolean };
    };
    const daily = await get<Bars>('/stocks/600001.SH/bars?years=5&interval=day');
    expect(daily.adjust).toBe('forward');
    expect(daily.bars).toHaveLength(2);
    expect(daily.coverage.isFullWindow).toBe(false);
    for (const interval of ['week', 'month']) {
      const data = await get<Bars>(`/stocks/600001.SH/bars?years=5&interval=${interval}`);
      expect(data.bars).toHaveLength(1);
      expect(data.bars[0]).toMatchObject({
        open: 0.2,
        high: 0.7,
        low: -0.1,
        close: 0.6,
        volume: null,
        turnover: 50,
      });
    }
    expect((await get<Bars>('/stocks/600002.SH/bars')).bars).toEqual([]);
    expect((await app.request('/api/selection/stocks/999999.SH')).status).toBe(404);
    expect((await app.request('/api/selection/stocks/999999.SH/bars')).status).toBe(404);
  });
});
