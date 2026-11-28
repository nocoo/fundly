import { describe, expect, test } from 'bun:test';
import { unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  countDividends,
  countFees,
  countFunds,
  countManagerLinks,
  countManagers,
  countMoneyYield,
  countNavPoints,
  countPortfolio,
  dropBasicInfoDuplicateColumns,
  initSchema,
  latestNavDate,
  listAllFundCodes,
  listFundCodesWithNav,
  listMoneyFundCodes,
  listMvpFundCodes,
  listMvpFundCodesMissingPerformance,
  openDb,
  readDividends,
  upsertDividends,
  upsertFees,
  upsertFundList,
  upsertManagerLinks,
  upsertMoneyYield,
  upsertNavPoints,
  upsertPerformance,
  upsertPortfolio,
  upsertRiskMetrics,
  upsertTrendExtra,
  writeFetchLog,
} from '../src/db/repo.ts';
import type {
  FundPerformance,
  NavPoint,
  PingzhongData,
  RawFundListRow,
} from '../src/utils/types.ts';

function tmpDbPath(): string {
  return join(tmpdir(), `fundly-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

describe('db repo', () => {
  test('initSchema is idempotent', () => {
    const path = tmpDbPath();
    const db = openDb(path);
    initSchema(db);
    initSchema(db); // 二次调用不应报错
    const row = db.query('SELECT COUNT(*) as n FROM schema_version').get() as { n: number } | null;
    expect(row?.n).toBe(1);
    const cols = (
      db.query('PRAGMA table_info(fund_basic_info)').all() as Array<{ name: string }>
    ).map((col) => col.name);
    expect(cols).not.toContain('fee_rate');
    expect(cols).not.toContain('fund_manager');
    db.close();
    unlinkSync(path);
  });

  test('dropBasicInfoDuplicateColumns strips leftover stub columns', () => {
    const path = tmpDbPath();
    const db = openDb(path);
    db.exec(`
      CREATE TABLE fund_basic_info (
        fund_code TEXT PRIMARY KEY,
        fund_name TEXT NOT NULL,
        fund_type TEXT NOT NULL,
        fee_rate REAL,
        fund_manager TEXT,
        fund_company TEXT
      )
    `);
    dropBasicInfoDuplicateColumns(db);
    const cols = (
      db.query('PRAGMA table_info(fund_basic_info)').all() as Array<{ name: string }>
    ).map((col) => col.name);
    expect(cols).toEqual(['fund_code', 'fund_name', 'fund_type']);
    db.close();
    unlinkSync(path);
  });

  test('upsertFundList writes and updates', () => {
    const path = tmpDbPath();
    const db = openDb(path);
    initSchema(db);

    const rows: RawFundListRow[] = [
      {
        fundCode: '000001',
        pinyinAbbr: 'HXCZ',
        fundName: '华夏成长',
        fundType: '股票型',
        pinyinFull: 'HUAXIA',
      },
      {
        fundCode: '000002',
        pinyinAbbr: 'ZZKZ',
        fundName: '中债信用',
        fundType: '债券型-长债',
        pinyinFull: 'ZHONGZHAI',
      },
    ];
    const n = upsertFundList(db, rows);
    expect(n).toBe(2);
    expect(countFunds(db)).toBe(2);
    expect(countFunds(db, { mvpOnly: true })).toBe(1); // 只 000001 是 MVP
    expect(listMvpFundCodes(db)).toEqual(['000001']);

    // 再写一次应更新，不新增
    upsertFundList(db, rows);
    expect(countFunds(db)).toBe(2);

    db.close();
    unlinkSync(path);
  });

  test('listMvpFundCodesMissingPerformance returns only funds without performance row', () => {
    const path = tmpDbPath();
    const db = openDb(path);
    initSchema(db);

    upsertFundList(db, [
      { fundCode: '000001', pinyinAbbr: 'A', fundName: 'A', fundType: '股票型', pinyinFull: 'A' },
      { fundCode: '000002', pinyinAbbr: 'B', fundName: 'B', fundType: '股票型', pinyinFull: 'B' },
      {
        fundCode: '000003',
        pinyinAbbr: 'C',
        fundName: 'C',
        fundType: '债券型-长债',
        pinyinFull: 'C',
      },
    ]);
    // 手动把 000003 也拉进 MVP 池
    db.exec("UPDATE fund_basic_info SET in_mvp_pool = 1 WHERE fund_code = '000003'");

    // 只给 000001 写 performance
    upsertPerformance(db, {
      fundCode: '000001',
      return1m: null,
      return3m: null,
      return6m: null,
      return1y: null,
      return2y: null,
      return3y: null,
      return5y: null,
      returnYtd: null,
      returnSinceStart: null,
      rankPct1m: null,
      rankPct3m: null,
      rankPct6m: null,
      rankPct1y: null,
      rankPct2y: null,
      rankPct3y: null,
      rankPct5y: null,
      dataDate: null,
    });

    const missing = listMvpFundCodesMissingPerformance(db);
    expect(missing).toEqual(['000002', '000003']);

    db.close();
    unlinkSync(path);
  });

  test('latestNavDate reflects max nav_date, null when empty', () => {
    const path = tmpDbPath();
    const db = openDb(path);
    initSchema(db);
    expect(latestNavDate(db)).toBeNull();

    upsertFundList(db, [
      { fundCode: '000001', pinyinAbbr: 'X', fundName: 'x', fundType: '股票型', pinyinFull: 'X' },
    ]);
    upsertNavPoints(db, '000001', [
      { navDate: '2026-08-17', unitNav: 1, accNav: 1, dailyReturn: 0 },
      { navDate: '2026-08-18', unitNav: 1.02, accNav: 1.02, dailyReturn: 2 },
    ]);
    expect(latestNavDate(db)).toBe('2026-08-18');

    db.close();
    unlinkSync(path);
  });

  test('upsertNavPoints and count', () => {
    const path = tmpDbPath();
    const db = openDb(path);
    initSchema(db);

    // 先写基础表满足外键
    upsertFundList(db, [
      {
        fundCode: '000001',
        pinyinAbbr: 'X',
        fundName: 'x',
        fundType: '股票型',
        pinyinFull: 'X',
      },
    ]);

    const points: NavPoint[] = [
      { navDate: '2026-01-01', unitNav: 1.0, accNav: 1.0, dailyReturn: 0 },
      { navDate: '2026-01-02', unitNav: 1.02, accNav: 1.02, dailyReturn: 2 },
    ];
    expect(upsertNavPoints(db, '000001', points)).toBe(2);
    expect(countNavPoints(db)).toBe(2);
    expect(countNavPoints(db, '000001')).toBe(2);

    // 重复写入同日期应 UPSERT
    upsertNavPoints(db, '000001', [
      { navDate: '2026-01-01', unitNav: 1.5, accNav: 1.5, dailyReturn: 50 },
    ]);
    expect(countNavPoints(db)).toBe(2);
    const row = db
      .query('SELECT unit_nav FROM fund_nav WHERE fund_code = ? AND nav_date = ?')
      .get('000001', '2026-01-01') as { unit_nav: number } | null;
    expect(row?.unit_nav).toBe(1.5);

    expect(
      upsertMoneyYield(db, '000001', [
        { navDate: '2026-01-01', millionIncome: 0.22, sevenDayYield: 0.81 },
        { navDate: '2026-01-02', millionIncome: 0.21, sevenDayYield: 0.8 },
      ]),
    ).toBe(2);
    expect(countMoneyYield(db, '000001')).toBe(2);
    upsertMoneyYield(db, '000001', [
      { navDate: '2026-01-01', millionIncome: 0.3, sevenDayYield: 1.1 },
    ]);
    expect(countMoneyYield(db, '000001')).toBe(2);
    const yieldRow = db
      .query(
        'SELECT million_income, seven_day_yield FROM fund_money_yield WHERE fund_code = ? AND nav_date = ?',
      )
      .get('000001', '2026-01-01') as { million_income: number; seven_day_yield: number } | null;
    expect(yieldRow?.million_income).toBe(0.3);
    expect(yieldRow?.seven_day_yield).toBe(1.1);

    db.close();
    unlinkSync(path);
  });

  test('upsertPerformance stores and updates', () => {
    const path = tmpDbPath();
    const db = openDb(path);
    initSchema(db);

    upsertFundList(db, [
      {
        fundCode: '000001',
        pinyinAbbr: 'X',
        fundName: 'x',
        fundType: '股票型',
        pinyinFull: 'X',
      },
    ]);

    const perf: FundPerformance = {
      fundCode: '000001',
      return1m: 1,
      return3m: 2,
      return6m: 3,
      return1y: 25,
      return2y: null,
      return3y: 60,
      return5y: null,
      returnYtd: null,
      returnSinceStart: null,
      rankPct1m: null,
      rankPct3m: null,
      rankPct6m: null,
      rankPct1y: null,
      rankPct2y: null,
      rankPct3y: null,
      rankPct5y: null,
      dataDate: '2026-08-18',
    };
    upsertPerformance(db, perf);
    const row = db
      .query('SELECT return_1y, data_date FROM fund_performance WHERE fund_code = ?')
      .get('000001') as { return_1y: number; data_date: string } | null;
    expect(row?.return_1y).toBe(25);
    expect(row?.data_date).toBe('2026-08-18');

    db.query(
      'UPDATE fund_performance SET rank_pct_1y = 12.5, pass_4433 = 1 WHERE fund_code = ?',
    ).run('000001');
    upsertPerformance(db, { ...perf, return1y: 26, rankPct1y: null });
    const kept = db
      .query('SELECT return_1y, rank_pct_1y, pass_4433 FROM fund_performance WHERE fund_code = ?')
      .get('000001') as { return_1y: number; rank_pct_1y: number; pass_4433: number };
    expect(kept.return_1y).toBe(26);
    expect(kept.rank_pct_1y).toBe(12.5);
    expect(kept.pass_4433).toBe(1);
  });

  test('upsertPerformance does not write long-window returns', () => {
    const path = tmpDbPath();
    const db = openDb(path);
    initSchema(db);
    upsertFundList(db, [
      {
        fundCode: '000001',
        pinyinAbbr: 'X',
        fundName: 'x',
        fundType: '股票型',
        pinyinFull: 'X',
      },
    ]);
    upsertPerformance(db, {
      fundCode: '000001',
      return1m: 1,
      return3m: 2,
      return6m: 3,
      return1y: 25,
      return2y: 40,
      return3y: 60,
      return5y: 80,
      returnYtd: null,
      returnSinceStart: null,
      rankPct1m: null,
      rankPct3m: null,
      rankPct6m: null,
      rankPct1y: null,
      rankPct2y: null,
      rankPct3y: null,
      rankPct5y: null,
      dataDate: '2026-08-18',
    });
    db.query('UPDATE fund_performance SET return_2y = 11, return_3y = 22, return_5y = 33').run();
    upsertPerformance(db, {
      fundCode: '000001',
      return1m: 1,
      return3m: 2,
      return6m: 3,
      return1y: 26,
      return2y: 1,
      return3y: 1,
      return5y: 1,
      returnYtd: null,
      returnSinceStart: null,
      rankPct1m: null,
      rankPct3m: null,
      rankPct6m: null,
      rankPct1y: null,
      rankPct2y: null,
      rankPct3y: null,
      rankPct5y: null,
      dataDate: '2026-08-18',
    });
    const row = db
      .query('SELECT return_2y, return_3y, return_5y FROM fund_performance WHERE fund_code = ?')
      .get('000001') as { return_2y: number; return_3y: number; return_5y: number };
    expect(row.return_2y).toBe(11);
    expect(row.return_3y).toBe(22);
    expect(row.return_5y).toBe(33);
    db.close();
    unlinkSync(path);
  });

  test('upsertTrendExtra roundtrips json', () => {
    const path = tmpDbPath();
    const db = openDb(path);
    initSchema(db);

    upsertFundList(db, [
      {
        fundCode: '000001',
        pinyinAbbr: 'X',
        fundName: 'x',
        fundType: '股票型',
        pinyinFull: 'X',
      },
    ]);

    const data: PingzhongData = {
      fundCode: '000001',
      navPoints: [],
      moneyYield: [],
      performance: {
        fundCode: '000001',
        return1m: null,
        return3m: null,
        return6m: null,
        return1y: null,
        return2y: null,
        return3y: null,
        return5y: null,
        returnYtd: null,
        returnSinceStart: null,
        rankPct1m: null,
        rankPct3m: null,
        rankPct6m: null,
        rankPct1y: null,
        rankPct2y: null,
        rankPct3y: null,
        rankPct5y: null,
        dataDate: null,
      },
      extra: {
        assetAllocationJson: '{"stock":80}',
        scaleHistoryJson: null,
        holderStructureJson: null,
        rankingTrendJson: null,
        performance5dJson: null,
        grandTotalJson: null,
      },
    };
    upsertTrendExtra(db, data);
    const row = db
      .query('SELECT asset_allocation_json FROM fund_trend_extra WHERE fund_code = ?')
      .get('000001') as { asset_allocation_json: string } | null;
    expect(row?.asset_allocation_json).toBe('{"stock":80}');
  });

  test('writeFetchLog stores entries', () => {
    const path = tmpDbPath();
    const db = openDb(path);
    initSchema(db);

    writeFetchLog(db, {
      fundCode: '000001',
      source: 'eastmoney',
      endpoint: 'pingzhongdata',
      status: 'success',
      httpCode: 200,
      errorMsg: null,
      durationMs: 123,
    });
    writeFetchLog(db, {
      fundCode: null,
      source: 'eastmoney',
      endpoint: 'fundcode_search',
      status: 'failed',
      httpCode: 500,
      errorMsg: 'boom',
      durationMs: 500,
    });

    const rows = db.query('SELECT status, http_code FROM fetch_log ORDER BY id').all() as Array<{
      status: string;
      http_code: number;
    }>;
    expect(rows).toHaveLength(2);
    expect(rows[0]?.status).toBe('success');
    expect(rows[1]?.http_code).toBe(500);
    db.close();
    unlinkSync(path);
  });

  test('upserts and reads risk, dividends, fees, managers, portfolio, and fund code listings', () => {
    const path = tmpDbPath();
    const db = openDb(path);
    initSchema(db);
    upsertFundList(db, [
      {
        fundCode: '000001',
        pinyinAbbr: 'HX',
        fundName: '华夏成长',
        fundType: '股票型',
        pinyinFull: 'HUAXIA',
      },
      {
        fundCode: '000198',
        pinyinAbbr: 'TE',
        fundName: '余额宝',
        fundType: '货币型',
        pinyinFull: 'YUEBAO',
      },
    ]);
    upsertNavPoints(db, '000001', [
      { navDate: '2026-01-02', unitNav: 1.1, accNav: 1.1, dailyReturn: 1 },
    ]);
    expect(listAllFundCodes(db)).toEqual(['000001', '000198']);
    expect(listFundCodesWithNav(db)).toEqual(['000001']);
    expect(listMoneyFundCodes(db)).toEqual(['000198']);
    expect(countMoneyYield(db)).toBe(0);

    upsertRiskMetrics(db, {
      fundCode: '000001',
      dataDate: '2026-01-02',
      volatility1y: 12,
      volatility3y: 14,
      volatility5y: 15,
      maxDrawdown1y: 8,
      maxDrawdown3y: 10,
      maxDrawdown5y: 15,
      maxDrawdownAll: 20,
      sharpe1y: 1.2,
      sharpe3y: 1.1,
      sharpe5y: 1.0,
      sortino1y: 1.4,
      sortino3y: 1.3,
      calmar1y: 1.5,
      calmar3y: 1.2,
      annualReturn1y: 12,
      annualReturn3y: 10,
      annualReturn5y: 9,
      navSamples1y: 250,
      navSamples3y: 750,
      navSamples5y: 1200,
    });
    expect(
      db.query('SELECT sharpe_1y FROM fund_risk_metrics WHERE fund_code = ?').get('000001'),
    ).toEqual({
      sharpe_1y: 1.2,
    });

    expect(
      upsertDividends(db, [
        {
          fundCode: '000001',
          eventDate: '2026-01-02',
          eventType: 'dividend',
          dividendPerShare: 0.15,
          splitRatio: null,
          remark: '每10份派1.5元',
        },
      ]),
    ).toBe(1);
    expect(countDividends(db)).toBe(1);
    expect(readDividends(db, '000001')).toHaveLength(1);

    upsertFees(db, {
      fundCode: '000001',
      mgmtFeePct: 1.2,
      custodianFeePct: 0.2,
      salesServiceFeePct: 0,
      subscriptionFeeMax: 1.5,
      redemptionFeeMax: 1.5,
      minSubscribeAmount: 10,
      rawJson: '{}',
    });
    expect(countFees(db)).toBe(1);

    expect(
      upsertManagerLinks(db, [
        {
          fundCode: '000001',
          managerName: '张三',
          startDate: '2022-01-01',
          endDate: null,
          tenureDays: 1000,
          returnDuring: 25,
        },
      ]),
    ).toBe(1);
    expect(countManagers(db)).toBe(1);
    expect(countManagerLinks(db)).toBe(1);

    expect(
      upsertPortfolio(db, [
        {
          fundCode: '000001',
          reportDate: '2026-06-30',
          stockCode: '600519',
          stockName: '贵州茅台',
          holdPct: 8.5,
          holdShares: 10,
          holdValueWan: 1500,
        },
      ]),
    ).toBe(1);
    expect(countPortfolio(db)).toBe(1);

    db.close();
    unlinkSync(path);
  });
});
