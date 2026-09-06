import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, test } from 'bun:test';
import { initSchema } from '../src/db/repo.ts';
import {
  initSelectionSchema,
  replaceSelectionDailyBars,
  replaceSelectionEtfFinancials,
  replaceSelectionEtfHoldings,
  updateSelectionCollectionStatus,
  upsertSelectionEtfCatalog,
  upsertSelectionEtfProfile,
  upsertSelectionStockCatalog,
  upsertSelectionStockSnapshots,
  upsertSelectionStockValuations,
} from '../src/db/selection-repo.ts';
import { parseFeePercent, validateAndCleanDailyBars } from '../src/fetchers/selection-fuyao.ts';
import {
  compute20DayAvgTurnover,
  computeAnnualVolatility,
  computeCagr,
  computeCashMinusCapex,
  computeCashProfitRatio,
  computeDebtRatio,
  computeFinancial3YearCagr,
  computeMa60Bias,
  computeMaxDrawdown,
  computeYoyGrowth,
  deriveEtfDirectionTag,
  evaluateReturnWindow,
} from '../src/metrics/selection-calc.ts';
import type { SelectionDailyBar } from '../src/utils/selection-types.ts';

const databases: Database[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

function memoryDb(): Database {
  const db = new Database(':memory:');
  databases.push(db);
  initSchema(db);
  initSelectionSchema(db);
  return db;
}

describe('selection mathematical financial indicators and pure calculations', () => {
  test('CAGR computes strict geometric annual rate and rejects non-positive or non-finite inputs', () => {
    // 100 涨到 200，用时 365.25 天 -> 100%
    expect(computeCagr(100, 200, 365.25)).toBeCloseTo(100, 2);
    // 亏损/非正/无效参数
    expect(computeCagr(100, -10, 365)).toBeNull();
    expect(computeCagr(-100, 200, 365)).toBeNull();
    expect(computeCagr(100, 200, 0)).toBeNull();
    expect(computeCagr(NaN, 200, 365)).toBeNull();
  });

  test('max drawdown returns positive percentage and zero on monotonic increase', () => {
    expect(computeMaxDrawdown([100, 120, 150])).toBe(0);
    // 100 -> 150 -> 75 -> 50% 回撤
    expect(computeMaxDrawdown([100, 150, 75])).toBe(50);
    expect(computeMaxDrawdown([100])).toBeNull();
  });

  test('annual volatility computes sample standard deviation times sqrt(252)', () => {
    // 常数序列日收益为 0 -> 波动率为 0
    const flat = Array.from({ length: 205 }, () => 10);
    expect(computeAnnualVolatility(flat, 200)).toBe(0);
    // 样本不足
    expect(computeAnnualVolatility([10, 11, 12], 200)).toBeNull();
  });

  test('20-day average turnover requires all 20 non-null valid numbers', () => {
    const valid = Array.from({ length: 20 }, () => 1000);
    expect(compute20DayAvgTurnover(valid)).toBe(1000);

    const withNull = [...valid.slice(0, 19), null];
    expect(compute20DayAvgTurnover(withNull)).toBeNull();

    const short = [1000, 2000];
    expect(compute20DayAvgTurnover(short)).toBeNull();
  });

  test('MA60 bias strictly requires 60 positive prices', () => {
    const prices = Array.from({ length: 60 }, () => 100);
    expect(computeMa60Bias(prices)).toBe(0);

    // 最新涨到 110
    prices[59] = 110;
    // ma = (59*100 + 110)/60 = 6010/60 = 100.1667; bias = (110/100.1667 - 1)*100 = 9.817
    expect(computeMa60Bias(prices)).toBeCloseTo(9.817, 1);
  });

  test('YoY growth and financial 3-year CAGR enforce continuity and positivity across all 4 years', () => {
    expect(computeYoyGrowth(120, 100)).toBe(20);
    expect(computeYoyGrowth(120, -100)).toBeNull(); // 上年非正则为 null

    const valid4y = new Map([
      [2022, 100],
      [2023, 110],
      [2024, 120],
      [2025, 133.1],
    ]);
    // 100 * 1.1^3 = 133.1 -> CAGR = 10%
    expect(computeFinancial3YearCagr(valid4y, 2025)).toBeCloseTo(10, 2);

    // 中间年份非正
    const lossMiddle = new Map([
      [2022, 100],
      [2023, -50],
      [2024, 120],
      [2025, 133.1],
    ]);
    expect(computeFinancial3YearCagr(lossMiddle, 2025)).toBeNull();

    // 缺失年份
    const missingYear = new Map([
      [2022, 100],
      [2024, 120],
      [2025, 133.1],
    ]);
    expect(computeFinancial3YearCagr(missingYear, 2025)).toBeNull();
  });

  test('cash profit ratio and capex deduction strictly use net_profit and positive denominator', () => {
    expect(computeCashProfitRatio(100, 200)).toBe(0.5);
    expect(computeCashProfitRatio(100, -50)).toBeNull();
    expect(computeCashMinusCapex(100, 30)).toBe(70);
  });

  test('debt ratio handles total_debt and assets_total', () => {
    expect(computeDebtRatio(50, 100)).toBe(50);
    expect(computeDebtRatio(50, 0)).toBeNull();
  });

  test('ETF direction tags correctly prioritize themes before broad index numbers', () => {
    expect(deriveEtfDirectionTag('芯片50ETF', '境内权益')).toBe('行业主题');
    expect(deriveEtfDirectionTag('证券ETF', '境内权益')).toBe('行业主题');
    expect(deriveEtfDirectionTag('沪深300ETF', '境内权益')).toBe('宽基');
    expect(deriveEtfDirectionTag('红利低波ETF', '境内权益')).toBe('红利低波');
    expect(deriveEtfDirectionTag('标普500ETF', '境外权益')).toBe('跨境海外');
    expect(deriveEtfDirectionTag('国债ETF', '固收')).toBe('固收货币');
  });

  test('evaluateReturnWindow clamps calendar boundary and checks sample points threshold', () => {
    // 构造不足 200 个点的 1 年序列
    const fewPoints = [
      { date: '2025-01-01', value: 1.0 },
      { date: '2026-01-01', value: 1.2 },
    ];
    const w1 = evaluateReturnWindow(fewPoints, 1);
    expect(w1.periodReturn).toBeNull(); // 样本数不足 200
  });

  test('parseFeePercent parses rate strings and numbers', () => {
    expect(parseFeePercent('0.15%')).toBe(0.15);
    expect(parseFeePercent('0.60')).toBe(0.6);
    expect(parseFeePercent(0.05)).toBe(0.05);
    expect(parseFeePercent(null)).toBeNull();
  });

  test('validateAndCleanDailyBars filters inverted geometry and sorts ascending', () => {
    const bars: SelectionDailyBar[] = [
      {
        assetType: 'stock',
        symbol: '600000.SH',
        adjust: 'forward',
        tradeDate: '2026-01-02',
        open: 10,
        high: 12,
        low: 9,
        close: 11,
        volume: 100,
        turnover: 1000,
        collectedAt: 1,
      },
      // 倒挂几何：low > min(open, close)
      {
        assetType: 'stock',
        symbol: '600000.SH',
        adjust: 'forward',
        tradeDate: '2026-01-03',
        open: 10,
        high: 12,
        low: 10.5,
        close: 11,
        volume: 100,
        turnover: 1000,
        collectedAt: 1,
      },
    ];
    const cleaned = validateAndCleanDailyBars(bars);
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0]?.tradeDate).toBe('2026-01-02');
  });
});

describe('selection repository persistence and schema operations', () => {
  test('persists ETF catalog, profile, financials, holdings, and status', () => {
    const db = memoryDb();
    upsertSelectionEtfCatalog(db, [
      {
        symbol: '510300.SH',
        ticker: '510300',
        name: '沪深300ETF华泰柏瑞',
        exchange: 'SH',
        assetClass: '境内权益',
        directionTag: '宽基',
        linkedFundCode: '510300',
        linkMethod: 'exact_code_and_clean_name',
        createdAt: 1,
        updatedAt: 1,
      },
    ]);

    upsertSelectionEtfProfile(db, {
      symbol: '510300.SH',
      estabDate: '2012-05-04',
      mgmtName: '华泰柏瑞',
      managerName: '柳军',
      fundScale: 100000000000,
      managementFeePct: 0.15,
      custodyFeePct: 0.05,
      collectedAt: 1,
    });

    replaceSelectionEtfFinancials(db, '510300.SH', [
      {
        symbol: '510300.SH',
        startDate: '2026-01-01',
        endDate: '2026-06-30',
        publishDate: '2026-08-29',
        assetNav: 94872183996.4,
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

    replaceSelectionDailyBars(db, 'etf', '510300.SH', 'none', [
      {
        assetType: 'etf',
        symbol: '510300.SH',
        adjust: 'none',
        tradeDate: '2026-09-04',
        open: 4.6,
        high: 4.7,
        low: 4.5,
        close: 4.65,
        volume: 1000000,
        turnover: 4650000,
        collectedAt: 1,
      },
    ]);

    updateSelectionCollectionStatus(db, {
      scope: 'etf_catalog',
      lastSuccessAt: 1000,
      lastAttemptAt: 1000,
      success: true,
      catalogCount: 1670,
      validCount: 1614,
      errorMessage: null,
      updatedAt: 1000,
    });

    const cat = db
      .query('SELECT * FROM selection_etf_catalog WHERE symbol = ?')
      .get('510300.SH') as Record<string, unknown>;
    expect(cat.name).toBe('沪深300ETF华泰柏瑞');
    expect(cat.linked_fund_code).toBe('510300');

    const prof = db
      .query('SELECT * FROM selection_etf_profile WHERE symbol = ?')
      .get('510300.SH') as Record<string, unknown>;
    expect(prof.mgmt_fee_pct).toBe(0.15);
    expect(prof.custody_fee_pct).toBe(0.05);

    const fin = db
      .query('SELECT * FROM selection_etf_financials WHERE symbol = ?')
      .get('510300.SH') as Record<string, unknown>;
    expect(fin.asset_nav).toBe(94872183996.4);

    const bar = db
      .query('SELECT * FROM selection_daily_bar WHERE symbol = ?')
      .get('510300.SH') as Record<string, unknown>;
    expect(bar.adjust).toBe('none');
    expect(bar.close).toBe(4.65);
  });

  test('persists stock catalog, snapshots, valuations and materialized tables', () => {
    const db = memoryDb();
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
    ]);

    upsertSelectionStockSnapshots(db, [
      {
        symbol: '600519.SH',
        tradeDate: '2026-09-04',
        price: 1500,
        prevClose: 1480,
        changePct: 1.35,
        open: 1485,
        high: 1510,
        low: 1480,
        volume: 50000,
        turnover: 75000000,
        isInferredDate: false,
        collectedAt: 1,
      },
    ]);

    upsertSelectionStockValuations(db, [
      {
        symbol: '600519.SH',
        tradeDate: '2026-09-04',
        timestamp: 1788451200000,
        peTtm: 20.4,
        peMrq: 18.6,
        pbMrq: 6.6,
        psTtm: 9.5,
        pcfTtm: 13.9,
        collectedAt: 1,
      },
    ]);

    const snap = db
      .query('SELECT * FROM selection_stock_snapshot WHERE symbol = ?')
      .get('600519.SH') as Record<string, unknown>;
    expect(snap.price).toBe(1500);

    const val = db
      .query('SELECT * FROM selection_stock_valuation WHERE symbol = ?')
      .get('600519.SH') as Record<string, unknown>;
    expect(val.pe_ttm).toBe(20.4);
  });
});
