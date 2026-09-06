import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, test } from 'bun:test';
import { initMarketSchema } from '../src/db/market-repo.ts';
import { initSchema } from '../src/db/repo.ts';
import { materializeAllEtfs, materializeAllStocks } from '../src/db/selection-materialize.ts';
import {
  initSelectionSchema,
  replaceSelectionDailyBars,
  replaceSelectionEtfNav,
  upsertSelectionEtfCatalog,
  upsertSelectionStockCatalog,
  upsertSelectionStockIndicators,
  upsertSelectionStockStatements,
} from '../src/db/selection-repo.ts';
import { parseFeePercent, validateAndCleanDailyBars } from '../src/fetchers/selection-fuyao.ts';
import { canUseDailyClose, evaluateReturnWindow } from '../src/metrics/selection-calc.ts';
import type { SelectionDailyBar } from '../src/utils/selection-types.ts';

const databases: Database[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

function database(withMacro = true): Database {
  const db = new Database(':memory:');
  databases.push(db);
  initSchema(db);
  if (withMacro) initMarketSchema(db);
  initSelectionSchema(db);
  return db;
}

function etf(db: Database, linked = true): void {
  db.query(
    `INSERT INTO fund_basic_info (fund_code, fund_name, fund_type, created_at, updated_at)
     VALUES ('510300', '测试宽基ETF', '指数型-股票', 1, 1)`,
  ).run();
  upsertSelectionEtfCatalog(db, [
    {
      symbol: '510300.SH',
      ticker: '510300',
      name: '测试宽基ETF',
      exchange: 'SH',
      assetClass: '境内权益',
      linkedFundCode: linked ? '510300' : null,
      linkMethod: linked ? 'exact_code_and_clean_name' : null,
      createdAt: 1,
      updatedAt: 1,
    },
  ]);
}

function stock(db: Database): void {
  upsertSelectionStockCatalog(db, [
    {
      symbol: '600001.SH',
      ticker: '600001',
      name: '测试公司',
      exchange: 'SH',
      createdAt: 1,
      updatedAt: 1,
    },
  ]);
}

function bar(date: string, close: number): SelectionDailyBar {
  return {
    assetType: 'stock',
    symbol: '600001.SH',
    adjust: 'forward',
    tradeDate: date,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 100,
    turnover: 1000,
    collectedAt: 1,
  };
}

describe('independent selection integration review', () => {
  test('preserves valid negative forward-adjusted lows but does not turn nonpositive closes into percentage risk', () => {
    const adjusted = { ...bar('2022-04-27', 0.36), open: 0.18, high: 0.43, low: -0.1 };
    expect(validateAndCleanDailyBars([adjusted])).toEqual([adjusted]);
    expect(validateAndCleanDailyBars([{ ...adjusted, assetType: 'etf', adjust: 'none' }])).toEqual(
      [],
    );
    const risk = evaluateReturnWindow(
      [
        { date: '2025-09-04', value: 1 },
        { date: '2026-03-04', value: -1 },
        { date: '2026-09-04', value: 2 },
      ],
      1,
      3,
    );
    expect(risk.periodReturn).toBeNull();
    expect(risk.maxDrawdown).toBeNull();
  });
  test('an intraday candle cannot become a closing premium just because materialization runs later', () => {
    expect(canUseDailyClose('2026-09-04', Date.parse('2026-09-04T14:59:00+08:00'))).toBe(false);
    expect(canUseDailyClose('2026-09-04', Date.parse('2026-09-04T15:01:00+08:00'))).toBe(true);
    expect(canUseDailyClose('2026-09-04', Date.parse('2026-09-06T12:00:00+08:00'))).toBe(true);
  });
  test('empty percentage strings remain unknown while an explicit zero rate is valid', () => {
    expect(parseFeePercent('%')).toBeNull();
    expect(parseFeePercent('  % ')).toBeNull();
    expect(parseFeePercent('0%')).toBe(0);
  });

  test('materializes a restored fund database before macro tables are installed', () => {
    const db = database(false);
    etf(db);
    expect(materializeAllEtfs(db)).toHaveLength(1);
    expect(materializeAllStocks(db)).toHaveLength(0);
  });

  test('reuses verified fund fees and dated scale without borrowing unverified data', () => {
    const db = database();
    etf(db);
    db.query(
      `INSERT INTO fund_fees (fund_code, mgmt_fee_pct, custodian_fee_pct, updated_at)
       VALUES ('510300', 0.15, 0.05, 1)`,
    ).run();
    db.query(
      `INSERT INTO fund_select_metrics (fund_code, scale_yi, scale_asof, updated_at)
       VALUES ('510300', 42, '2026-06-30', 1)`,
    ).run();
    const row = materializeAllEtfs(db)[0];
    expect(row?.totalExpensePct).toBeCloseTo(0.2, 6);
    expect(row?.scaleYi).toBe(42);
    expect(row?.scalePeriod).toBe('2026-06-30');
    db.query('UPDATE selection_etf_catalog SET linked_fund_code = NULL, link_method = NULL').run();
    const unlinked = materializeAllEtfs(db)[0];
    expect(unlinked?.totalExpensePct).toBeNull();
    expect(unlinked?.scaleYi).toBeNull();
  });

  test('keeps a known individual fee when the combined fee is unknown', () => {
    const db = database();
    etf(db);
    db.query(
      `INSERT INTO fund_fees (fund_code, mgmt_fee_pct, custodian_fee_pct, updated_at)
       VALUES ('510300', 0, NULL, 1)`,
    ).run();
    const row = materializeAllEtfs(db)[0];
    expect(row?.mgmtFeePct).toBe(0);
    expect(row?.custodyFeePct).toBeNull();
    expect(row?.totalExpensePct).toBeNull();
  });

  test('counts verified local NAV history as available while preserving its source date', () => {
    const db = database();
    etf(db);
    db.query(
      `INSERT INTO fund_nav (fund_code, nav_date, unit_nav, daily_return)
       VALUES ('510300', '2026-08-19', 10, NULL), ('510300', '2026-08-20', 11, 10)`,
    ).run();
    const row = materializeAllEtfs(db)[0];
    expect(row?.hasNavHistory).toBe(true);
    expect(row?.navRiskBasis).toBe('local_total_return');
    expect(row?.navRiskAsof).toBe('2026-08-20');
    expect(row?.return1y).toBeNull();
  });

  test('an inferred intraday quote cannot produce a same-date closing premium', () => {
    const db = database();
    etf(db, false);
    db.query(
      `INSERT INTO market_quote_latest
        (instrument_id, source, trade_date, is_inferred_date, price, collected_at)
       VALUES ('etf:510300.SH', 'fuyao', '2026-09-04', 1, 11, 1)`,
    ).run();
    replaceSelectionEtfNav(db, '510300.SH', [
      { symbol: '510300.SH', navDate: '2026-09-04', unitNav: 10, adjNav: 10, collectedAt: 1 },
    ]);
    const row = materializeAllEtfs(db)[0];
    expect(row?.marketPrice).toBe(11);
    expect(row?.premiumDiscountPct).toBeNull();
  });

  test('all-market snapshot remains available without research history', () => {
    const db = database();
    stock(db);
    db.query(
      `INSERT INTO selection_stock_snapshot (symbol, trade_date, price, turnover, collected_at)
       VALUES ('600001.SH', '2026-09-04', 15, 100000000, 1)`,
    ).run();
    const row = materializeAllStocks(db)[0];
    expect(row?.price).toBe(15);
    expect(row?.tradeDate).toBe('2026-09-04');
    expect(row?.hasPriceHistory).toBe(false);
    expect(row?.return1y).toBeNull();
  });

  test('uses only indicators from the financial statement annual period', () => {
    const db = database();
    stock(db);
    upsertSelectionStockStatements(db, [
      {
        symbol: '600001.SH',
        statementType: 'income',
        fiscalYear: 2025,
        fiscalPeriod: 'FY',
        periodEnd: '2025-12-31',
        reportDate: '2026-04-01',
        currency: 'CNY',
        data: { operating_income: 100, net_profit: 20 },
        collectedAt: 1,
      },
    ]);
    for (const [report, value] of [
      ['2025-4', '12.5'],
      ['2026-2', '99'],
    ]) {
      if (!report || !value) throw new Error('Missing test period');
      upsertSelectionStockIndicators(db, {
        symbol: '600001.SH',
        report,
        abilities: [
          { ability: 'profitability', indicators: [{ index_id: 'index_weighted_avg_roe', value }] },
        ],
        collectedAt: 1,
      });
    }
    expect(materializeAllStocks(db)[0]?.roeWeighted).toBe(12.5);
    upsertSelectionStockIndicators(db, {
      symbol: '600001.SH',
      report: '2025-4',
      abilities: [
        {
          ability: 'profitability',
          indicators: [{ index_id: 'index_weighted_avg_roe', value: '' }],
        },
      ],
      collectedAt: 2,
    });
    expect(materializeAllStocks(db)[0]?.roeWeighted).toBeNull();
  });

  test('does not divide cashflow from a different period or currency by annual profit', () => {
    const db = database();
    stock(db);
    upsertSelectionStockStatements(db, [
      {
        symbol: '600001.SH',
        statementType: 'income',
        fiscalYear: 2025,
        fiscalPeriod: 'FY',
        periodEnd: '2025-12-31',
        reportDate: '2026-04-01',
        currency: 'CNY',
        data: { operating_income: 100, net_profit: 20 },
        collectedAt: 1,
      },
      {
        symbol: '600001.SH',
        statementType: 'cash_flow',
        fiscalYear: 2025,
        fiscalPeriod: 'FY',
        periodEnd: '2025-06-30',
        reportDate: '2026-04-01',
        currency: 'CNY',
        data: { act_cash_flow_net: 50, pay_fixed_assets_etc_cash: 5 },
        collectedAt: 1,
      },
    ]);
    expect(materializeAllStocks(db)[0]?.cashProfitRatio).toBeNull();
    db.query(
      `UPDATE selection_stock_financial_statement SET period_end = '2025-12-31', currency = 'USD'
       WHERE statement_type = 'cash_flow'`,
    ).run();
    expect(materializeAllStocks(db)[0]?.cashProfitRatio).toBeNull();
  });

  test('a failed adjusted-history replacement preserves the entire previous window', () => {
    const db = database();
    const previous = [bar('2026-09-03', 10), bar('2026-09-04', 11)];
    replaceSelectionDailyBars(db, 'stock', '600001.SH', 'forward', previous);
    db.exec(
      `CREATE TRIGGER reject_bad_selection_bar BEFORE INSERT ON selection_daily_bar
       WHEN NEW.close = 999 BEGIN SELECT RAISE(ABORT, 'injected publication failure'); END`,
    );
    expect(() =>
      replaceSelectionDailyBars(db, 'stock', '600001.SH', 'forward', [
        bar('2026-09-03', 20),
        bar('2026-09-04', 999),
      ]),
    ).toThrow('injected publication failure');
    expect(
      db.query('SELECT trade_date, close FROM selection_daily_bar ORDER BY trade_date').all(),
    ).toEqual([
      { trade_date: '2026-09-03', close: 10 },
      { trade_date: '2026-09-04', close: 11 },
    ]);
  });
});
