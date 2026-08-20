import { describe, expect, test } from 'bun:test';
import { unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  countFunds,
  countNavPoints,
  initSchema,
  latestNavDate,
  listMvpFundCodes,
  listMvpFundCodesMissingPerformance,
  openDb,
  upsertFundList,
  upsertNavPoints,
  upsertPerformance,
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
  });
});
