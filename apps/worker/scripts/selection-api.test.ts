import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initMarketSchema } from '../../../src/db/market-repo.ts';
import { initSchema } from '../../../src/db/repo.ts';
import {
  initSelectionSchema,
  replaceSelectionDailyBars,
  replaceSelectionEtfHoldings,
  replaceSelectionEtfMaterialized,
  replaceSelectionStockMaterialized,
  upsertSelectionEtfCatalog,
  upsertSelectionStockCatalog,
} from '../../../src/db/selection-repo.ts';
import type { AuthConfig } from '../src/lib/auth-config.ts';
import { createApi } from './app.ts';

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

function createTestApp(withTables = true): { app: ReturnType<typeof createApi>; db: Database } {
  const dir = mkdtempSync(join(tmpdir(), 'fundly-selection-api-'));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'test.db');
  const db = new Database(path, { create: true });
  cleanup.push(() => db.close());
  db.exec('PRAGMA journal_mode = WAL');
  initSchema(db);
  initMarketSchema(db);
  if (withTables) initSelectionSchema(db);

  const app = createApi(path, {
    auth: publicAuth,
  });
  return { app, db };
}

describe('selection API integration endpoints', () => {
  test('gracefully returns ready:false on restored database without selection schema', async () => {
    // 数据库没有 selection_* 表
    const { app } = createTestApp(false);
    const resEtfs = await app.request('/api/selection/etfs');
    expect(resEtfs.status).toBe(200);
    const jsonEtfs = (await resEtfs.json()) as { ready: boolean; rows: unknown[] };
    expect(jsonEtfs.ready).toBe(false);
    expect(jsonEtfs.rows).toEqual([]);

    const resStocks = await app.request('/api/selection/stocks');
    expect(resStocks.status).toBe(200);
    const jsonStocks = (await resStocks.json()) as { ready: boolean; rows: unknown[] };
    expect(jsonStocks.ready).toBe(false);
    expect(jsonStocks.rows).toEqual([]);

    const resDetail = await app.request('/api/selection/etfs/510300.SH');
    expect(resDetail.status).toBe(503);
  });

  test('validates ETF list query, filters, sorting and pagination', async () => {
    const { app, db } = createTestApp(true);
    upsertSelectionEtfCatalog(db, [
      {
        symbol: '510300.SH',
        ticker: '510300',
        name: '沪深300ETF华泰柏瑞',
        exchange: 'SH',
        assetClass: '境内权益',
        directionTag: '宽基',
        linkedFundCode: '510300',
        createdAt: 1,
        updatedAt: 1,
      },
      {
        symbol: '513100.SH',
        ticker: '513100',
        name: '纳指ETF国泰',
        exchange: 'SH',
        assetClass: '境外权益',
        directionTag: '跨境海外',
        linkedFundCode: '513100',
        createdAt: 1,
        updatedAt: 1,
      },
    ]);

    replaceSelectionEtfMaterialized(db, [
      {
        symbol: '510300.SH',
        ticker: '510300',
        name: '沪深300ETF华泰柏瑞',
        exchange: 'SH',
        assetClass: '境内权益',
        directionTag: '宽基',
        linkedFundCode: '510300',
        marketTradeDate: '2026-09-04',
        marketPrice: 4.614,
        changePct: 0.5,
        turnover: 500000000,
        volume: 100000000,
        avgTurnover20d: 600000000,
        navDate: '2026-09-04',
        unitNav: 4.6147,
        adjNav: 2.1684,
        premiumDiscountPct: -0.015,
        mgmtFeePct: 0.15,
        custodyFeePct: 0.05,
        totalExpensePct: 0.2,
        scaleYi: 948.72,
        scalePeriod: '2026-06-30',
        scaleDisclosureDate: '2026-08-29',
        scaleSource: 'disclosure',
        historyAsof: '2026-09-04',
        navRiskBasis: 'adj_nav',
        navRiskAsof: '2026-09-04',
        return1y: 15.2,
        return3y: 10.5,
        return5y: 25.0,
        cagr1y: 15.2,
        cagr3y: 3.4,
        cagr5y: 4.5,
        maxDrawdown1y: 12.3,
        maxDrawdown3y: 22.1,
        maxDrawdown5y: 35.6,
        volatility1y: 14.5,
        volatility3y: 16.2,
        volatility5y: 17.8,
        points1y: 242,
        points3y: 726,
        points5y: 1210,
        sparklineJson: '[4.5, 4.6, 4.614]',
        sparklineType: 'price',
        hasMarketBars: true,
        hasNavHistory: true,
        hasDeepResearch: true,
        updatedAt: 1,
      },
      {
        symbol: '513100.SH',
        ticker: '513100',
        name: '纳指ETF国泰',
        exchange: 'SH',
        assetClass: '境外权益',
        directionTag: '跨境海外',
        linkedFundCode: '513100',
        marketTradeDate: '2026-09-04',
        marketPrice: 1.992,
        changePct: 1.2,
        turnover: 300000000,
        volume: 150000000,
        avgTurnover20d: 250000000,
        navDate: '2026-09-04',
        unitNav: 1.9925,
        adjNav: 2.512,
        premiumDiscountPct: -0.025,
        mgmtFeePct: 0.6,
        custodyFeePct: 0.2,
        totalExpensePct: 0.8,
        scaleYi: 194.68,
        scalePeriod: '2026-06-30',
        scaleDisclosureDate: '2026-08-31',
        scaleSource: 'disclosure',
        historyAsof: '2026-09-04',
        navRiskBasis: 'adj_nav',
        navRiskAsof: '2026-09-04',
        return1y: 28.5,
        return3y: 45.2,
        return5y: 80.1,
        cagr1y: 28.5,
        cagr3y: 13.2,
        cagr5y: 12.5,
        maxDrawdown1y: 10.5,
        maxDrawdown3y: 25.4,
        maxDrawdown5y: 32.1,
        volatility1y: 18.2,
        volatility3y: 19.5,
        volatility5y: 20.1,
        points1y: 242,
        points3y: 726,
        points5y: 1210,
        sparklineJson: '[1.9, 1.95, 1.992]',
        sparklineType: 'price',
        hasMarketBars: true,
        hasNavHistory: true,
        hasDeepResearch: true,
        updatedAt: 1,
      },
    ]);

    // 默认列表查询
    const res = await app.request('/api/selection/etfs');
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      ready: boolean;
      total: number;
      rows: Array<{ symbol: string }>;
    };
    expect(data.ready).toBe(true);
    expect(data.total).toBe(2);
    expect(data.rows).toHaveLength(2);

    // 过滤分类 category=境外权益
    const resOverseas = await app.request(
      '/api/selection/etfs?category=%E5%A2%83%E5%A4%96%E6%9D%83%E7%9B%8A',
    );
    const dataOverseas = (await resOverseas.json()) as { rows: Array<{ symbol: string }> };
    expect(dataOverseas.rows).toHaveLength(1);
    expect(dataOverseas.rows[0]?.symbol).toBe('513100.SH');

    // 精选门槛条件过滤：maxFee=0.5 (排除了 0.8% 的 513100)
    const resPicks = await app.request('/api/selection/etfs?maxFee=0.5');
    const dataPicks = (await resPicks.json()) as { rows: Array<{ symbol: string }> };
    expect(dataPicks.rows).toHaveLength(1);
    expect(dataPicks.rows[0]?.symbol).toBe('510300.SH');
  });

  test('validates stock list query, lenses, negative PE exclusion and sorting', async () => {
    const { app, db } = createTestApp(true);
    upsertSelectionStockCatalog(db, [
      {
        symbol: '600519.SH',
        ticker: '600519',
        name: '贵州茅台',
        exchange: 'SH',
        industryThscode: '881121.TI',
        industryName: '白酒',
        isFinancial: false,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        symbol: '000001.SZ',
        ticker: '000001',
        name: '平安银行',
        exchange: 'SZ',
        industryThscode: '881155.TI',
        industryName: '银行',
        isFinancial: true,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        symbol: '688981.SH',
        ticker: '688981',
        name: '中芯国际',
        exchange: 'SH',
        industryThscode: '881121.TI',
        industryName: '半导体',
        isFinancial: false,
        createdAt: 1,
        updatedAt: 1,
      },
    ]);

    replaceSelectionStockMaterialized(db, [
      {
        symbol: '600519.SH',
        ticker: '600519',
        name: '贵州茅台',
        exchange: 'SH',
        industryThscode: '881121.TI',
        industryName: '白酒',
        isFinancial: false,
        tradeDate: '2026-09-04',
        price: 1500,
        changePct: 1.2,
        turnover: 5000000000,
        volume: 3300000,
        avgTurnover20d: 4800000000,
        peTtm: 20.4,
        peMrq: 18.6,
        pbMrq: 6.6,
        psTtm: 9.5,
        pcfTtm: 13.9,
        valuationTimestamp: 1788451200000,
        historyAsof: '2026-09-04',
        return1y: 5.2,
        return3y: -10.5,
        return5y: 15.0,
        cagr1y: 5.2,
        cagr3y: -3.6,
        cagr5y: 2.8,
        maxDrawdown1y: 15.2,
        maxDrawdown3y: 35.4,
        maxDrawdown5y: 45.1,
        volatility1y: 18.2,
        volatility3y: 21.0,
        volatility5y: 23.5,
        return20d: 2.1,
        return60d: 4.5,
        ma60Bias: 1.2,
        sparklineJson: '[1480, 1490, 1500]',
        fiscalYear: 2025,
        periodEnd: '2025-12-31',
        reportDate: '2026-04-17',
        currency: 'CNY',
        roeWeighted: 32.53,
        roeDeductedWeighted: 32.52,
        grossMargin: 91.18,
        netMargin: 50.53,
        debtRatio: 16.42,
        operatingIncome: 168838102514,
        revenueYoy: -1.2,
        netProfit: 85310324833,
        parentNetProfit: 82320067101,
        profitYoy: -4.5,
        revenueCagr3y: 10.8,
        profitCagr3y: 9.5,
        operatingCashFlow: 61522204989,
        cashProfitRatio: 0.72,
        capex: 3127594916,
        cashMinusCapex: 58394610072,
        hasDeepResearch: true,
        hasPriceHistory: true,
        hasFinancials: true,
        updatedAt: 1,
      },
      {
        symbol: '000001.SZ',
        ticker: '000001',
        name: '平安银行',
        exchange: 'SZ',
        industryThscode: '881155.TI',
        industryName: '银行',
        isFinancial: true,
        tradeDate: '2026-09-04',
        price: 11.2,
        changePct: 0.1,
        turnover: 1200000000,
        volume: 100000000,
        avgTurnover20d: 1100000000,
        peTtm: 5.3,
        peMrq: 4.5,
        pbMrq: 0.49,
        psTtm: 1.7,
        pcfTtm: 0.65,
        valuationTimestamp: 1788451200000,
        historyAsof: '2026-09-04',
        return1y: 8.5,
        return3y: -5.2,
        return5y: 10.1,
        cagr1y: 8.5,
        cagr3y: -1.8,
        cagr5y: 1.9,
        maxDrawdown1y: 12.0,
        maxDrawdown3y: 28.5,
        maxDrawdown5y: 38.0,
        volatility1y: 16.0,
        volatility3y: 18.5,
        volatility5y: 20.0,
        return20d: 1.0,
        return60d: 2.2,
        ma60Bias: 0.5,
        sparklineJson: '[11.0, 11.1, 11.2]',
        fiscalYear: 2025,
        periodEnd: '2025-12-31',
        reportDate: '2026-03-21',
        currency: 'CNY',
        roeWeighted: 9.15,
        roeDeductedWeighted: 9.15,
        grossMargin: null,
        netMargin: 30.5,
        debtRatio: 90.7,
        operatingIncome: 140000000000,
        revenueYoy: -10.4,
        netProfit: 45000000000,
        parentNetProfit: 45000000000,
        profitYoy: -4.2,
        revenueCagr3y: -9.9,
        profitCagr3y: -2.2,
        operatingCashFlow: 330000000000,
        cashProfitRatio: 7.41,
        capex: 17000000000,
        cashMinusCapex: 313000000000,
        hasDeepResearch: true,
        hasPriceHistory: true,
        hasFinancials: true,
        updatedAt: 1,
      },
      {
        symbol: '688981.SH',
        ticker: '688981',
        name: '中芯国际',
        exchange: 'SH',
        industryThscode: '881121.TI',
        industryName: '半导体',
        isFinancial: false,
        tradeDate: '2026-09-04',
        price: 85.0,
        changePct: -1.5,
        turnover: 3500000000,
        volume: 41000000,
        avgTurnover20d: 3200000000,
        peTtm: -10.0, // 假设亏损负 PE
        peMrq: -12.0,
        pbMrq: 3.5,
        psTtm: 8.5,
        pcfTtm: 25.0,
        valuationTimestamp: 1788451200000,
        historyAsof: '2026-09-04',
        return1y: 25.0,
        return3y: 10.0,
        return5y: 50.0,
        cagr1y: 25.0,
        cagr3y: 3.2,
        cagr5y: 8.4,
        maxDrawdown1y: 25.0,
        maxDrawdown3y: 40.0,
        maxDrawdown5y: 55.0,
        volatility1y: 35.0,
        volatility3y: 38.0,
        volatility5y: 42.0,
        return20d: -2.0,
        return60d: 5.0,
        ma60Bias: -1.5,
        sparklineJson: '[88, 86, 85]',
        fiscalYear: 2025,
        periodEnd: '2025-12-31',
        reportDate: '2026-03-27',
        currency: 'CNY',
        roeWeighted: 3.4,
        roeDeductedWeighted: 2.8,
        grossMargin: 20.5,
        netMargin: 5.2,
        debtRatio: 33.0,
        operatingIncome: 50000000000,
        revenueYoy: 16.5,
        netProfit: 2500000000,
        parentNetProfit: 2200000000,
        profitYoy: 36.3,
        revenueCagr3y: 10.8,
        profitCagr3y: -25.4,
        operatingCashFlow: 15000000000,
        cashProfitRatio: 2.79,
        capex: 55000000000,
        cashMinusCapex: -40000000000,
        hasDeepResearch: true,
        hasPriceHistory: true,
        hasFinancials: true,
        updatedAt: 1,
      },
    ]);

    // 1. 估值镜头：默认正 PE 升序，负 PE 必须排在后面
    const resVal = await app.request('/api/selection/stocks?lens=valuation');
    const dataVal = (await resVal.json()) as { rows: Array<{ symbol: string }> };
    expect(dataVal.rows[0]?.symbol).toBe('000001.SZ'); // PE 5.3
    expect(dataVal.rows[1]?.symbol).toBe('600519.SH'); // PE 20.4
    expect(dataVal.rows[2]?.symbol).toBe('688981.SH'); // 负 PE 排在最后

    // 2. 现金流镜头：默认排除金融股 (000001.SZ 不应出现)
    const resCash = await app.request('/api/selection/stocks?lens=cashflow');
    const dataCash = (await resCash.json()) as { rows: Array<{ symbol: string }> };
    expect(dataCash.rows.some((r) => r.symbol === '000001.SZ')).toBe(false);

    // 3. 精选镜头：maxPe=30 门槛 (排除负 PE 688981)
    const resPicks = await app.request('/api/selection/stocks?lens=picks&maxPe=30');
    const dataPicks = (await resPicks.json()) as { rows: Array<{ symbol: string }> };
    expect(dataPicks.rows.some((r) => r.symbol === '688981.SH')).toBe(false);
  });

  test('returns detail and candlestick bars aggregated by interval and clamped by years', async () => {
    const { app, db } = createTestApp(true);
    upsertSelectionEtfCatalog(db, [
      {
        symbol: '510300.SH',
        ticker: '510300',
        name: '沪深300ETF华泰柏瑞',
        exchange: 'SH',
        assetClass: '境内权益',
        createdAt: 1,
        updatedAt: 1,
      },
    ]);

    replaceSelectionDailyBars(db, 'etf', '510300.SH', 'none', [
      {
        assetType: 'etf',
        symbol: '510300.SH',
        adjust: 'none',
        tradeDate: '2026-08-31',
        open: 4.5,
        high: 4.6,
        low: 4.4,
        close: 4.55,
        volume: 100,
        turnover: 455,
        collectedAt: 1,
      },
      {
        assetType: 'etf',
        symbol: '510300.SH',
        adjust: 'none',
        tradeDate: '2026-09-01',
        open: 4.55,
        high: 4.7,
        low: 4.5,
        close: 4.65,
        volume: 200,
        turnover: 930,
        collectedAt: 1,
      },
    ]);

    replaceSelectionEtfHoldings(db, '510300.SH', [
      {
        symbol: '510300.SH',
        reportDate: '2026-06-30',
        stockCode: '600519.SH',
        stockName: '贵州茅台',
        assetType: 'stock',
        holdRatio: 8.88,
        positionCapital: 8000000000,
        positionCount: 5000000,
        collectedAt: 1,
      },
    ]);

    // 详情接口
    const resDetail = await app.request('/api/selection/etfs/510300.SH');
    expect(resDetail.status).toBe(200);
    const dataDetail = (await resDetail.json()) as {
      found: boolean;
      detail: {
        catalog: { name: string };
        holdings: Array<{ stockCode: string }>;
      };
    };
    expect(dataDetail.found).toBe(true);
    expect(dataDetail.detail.catalog.name).toBe('沪深300ETF华泰柏瑞');
    expect(dataDetail.detail.holdings).toHaveLength(1);
    expect(dataDetail.detail.holdings[0]?.stockCode).toBe('600519.SH');

    // K线接口
    const resBars = await app.request('/api/selection/etfs/510300.SH/bars?years=1&interval=day');
    expect(resBars.status).toBe(200);
    const dataBars = (await resBars.json()) as {
      bars: unknown[];
      adjust: string;
      coverage: { isFullWindow: boolean };
    };
    expect(dataBars.bars).toHaveLength(2);
    expect(dataBars.adjust).toBe('none');

    // 404 测试
    const resNotFound = await app.request('/api/selection/etfs/999999.SH');
    expect(resNotFound.status).toBe(404);
  });
});
