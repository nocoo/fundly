import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';
import type { QueryExec } from './executor';
import { presentField } from './fund-detail';
import { parseFundListQuery } from './fund-query';
import {
  applyRankTriples,
  getFundDetail,
  getFundNav,
  listFunds,
  returnFromNavPair,
} from './funds-service';

function exec(db: Database): QueryExec {
  return {
    async all<T>(sql: string, params: unknown[] = []) {
      return db.prepare(sql).all(...params) as T[];
    },
    async first<T>(sql: string, params: unknown[] = []) {
      return (db.prepare(sql).get(...params) as T | null) ?? null;
    },
  };
}

describe('listFunds / getFundDetail', () => {
  it('filters+sorts with page size 200 and maps empty schema fields', async () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE fund_basic_info (
        fund_code TEXT PRIMARY KEY, fund_name TEXT NOT NULL, fund_type TEXT NOT NULL,
        pinyin_abbr TEXT, pinyin_full TEXT, established_date TEXT, fund_manager TEXT,
        fund_company TEXT, fund_scale REAL, scale_date TEXT, fee_rate REAL,
        in_mvp_pool INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE TABLE fund_performance (
        fund_code TEXT PRIMARY KEY, return_1m REAL, return_3m REAL, return_6m REAL, return_1y REAL,
        return_2y REAL, return_3y REAL, return_5y REAL, return_ytd REAL, return_since_start REAL,
        rank_pct_1m REAL, rank_pct_3m REAL, rank_pct_6m REAL, rank_pct_1y REAL, rank_pct_2y REAL,
        rank_pct_3y REAL, rank_pct_5y REAL, pass_4433 INTEGER NOT NULL DEFAULT 0,
        rank_stats_json TEXT,
        data_date TEXT, updated_at INTEGER NOT NULL
      );
      CREATE TABLE fund_nav (fund_code TEXT, nav_date TEXT, unit_nav REAL, acc_nav REAL, daily_return REAL);
      CREATE TABLE fund_trend_extra (
        fund_code TEXT PRIMARY KEY,
        asset_allocation_json TEXT,
        scale_history_json TEXT,
        holder_structure_json TEXT,
        ranking_trend_json TEXT,
        performance_5d_json TEXT,
        updated_at INTEGER
      );
    `);
    db.prepare(
      `INSERT INTO fund_basic_info (fund_code, fund_name, fund_type, pinyin_abbr, in_mvp_pool, created_at, updated_at)
       VALUES ('000001', '华夏成长混合', '混合型-灵活', 'HXCZHH', 1, 1, 1)`,
    ).run();
    db.prepare(
      `INSERT INTO fund_performance (fund_code, return_1y, pass_4433, updated_at) VALUES ('000001', 12.5, 0, 1)`,
    ).run();
    db.prepare(
      `INSERT INTO fund_trend_extra (fund_code, scale_history_json, updated_at)
       VALUES ('000001', '{"categories":["2026-06-30"],"series":[{"y":12.3,"mom":"1%"}]}', 1)`,
    ).run();

    const q = parseFundListQuery({
      q: '华夏',
      fundType: '混合型-灵活',
      sort: 'return_1y',
      dir: 'desc',
    });
    const list = await listFunds(exec(db), q);
    expect(list.total).toBe(1);
    expect(list.pageSize).toBe(200);
    expect(list.items[0]?.fund_code).toBe('000001');

    const detail = await getFundDetail(exec(db), '000001');
    const manager = detail?.fields.find((f) => f.key === 'fund_manager');
    expect(manager?.empty).toBe(true);
    expect(detail?.fields.find((f) => f.key === 'return_1y')?.empty).toBe(false);
    expect(detail?.fields.find((f) => f.key === 'fund_scale')?.value).toBe(12.3);
    expect(detail?.fields.find((f) => f.key === 'scale_date')?.value).toBe('2026-06-30');
    expect(detail?.extras.scale?.latest.value).toBe(12.3);
    expect(detail?.fields.find((f) => f.key === 'return_since_start')?.empty).toBe(true);
  });

  it('backfills since-inception from accumulated nav', async () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE fund_basic_info (
        fund_code TEXT PRIMARY KEY, fund_name TEXT NOT NULL, fund_type TEXT NOT NULL,
        pinyin_abbr TEXT, pinyin_full TEXT, established_date TEXT, fund_manager TEXT,
        fund_company TEXT, fund_scale REAL, scale_date TEXT, fee_rate REAL,
        in_mvp_pool INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE TABLE fund_performance (
        fund_code TEXT PRIMARY KEY, return_1m REAL, return_3m REAL, return_6m REAL, return_1y REAL,
        return_2y REAL, return_3y REAL, return_5y REAL, return_ytd REAL, return_since_start REAL,
        rank_pct_1m REAL, rank_pct_3m REAL, rank_pct_6m REAL, rank_pct_1y REAL, rank_pct_2y REAL,
        rank_pct_3y REAL, rank_pct_5y REAL, pass_4433 INTEGER NOT NULL DEFAULT 0,
        rank_stats_json TEXT,
        data_date TEXT, updated_at INTEGER NOT NULL
      );
      CREATE TABLE fund_nav (fund_code TEXT, nav_date TEXT, unit_nav REAL, acc_nav REAL, daily_return REAL);
      CREATE TABLE fund_trend_extra (
        fund_code TEXT PRIMARY KEY,
        asset_allocation_json TEXT, scale_history_json TEXT, holder_structure_json TEXT,
        ranking_trend_json TEXT, performance_5d_json TEXT, updated_at INTEGER
      );
    `);
    db.prepare(
      `INSERT INTO fund_basic_info (fund_code, fund_name, fund_type, in_mvp_pool, created_at, updated_at)
       VALUES ('000001', '华夏成长混合', '混合型-灵活', 1, 1, 1)`,
    ).run();
    db.prepare(
      `INSERT INTO fund_performance (fund_code, return_1y, pass_4433, updated_at) VALUES ('000001', 44.06, 0, 1)`,
    ).run();
    db.prepare(
      'INSERT INTO fund_nav (fund_code, nav_date, unit_nav, acc_nav) VALUES (?, ?, ?, ?)',
    ).run('000001', '2001-12-18', 1, 1);
    db.prepare(
      'INSERT INTO fund_nav (fund_code, nav_date, unit_nav, acc_nav) VALUES (?, ?, ?, ?)',
    ).run('000001', '2024-08-18', 1.2, 2);
    db.prepare(
      'INSERT INTO fund_nav (fund_code, nav_date, unit_nav, acc_nav) VALUES (?, ?, ?, ?)',
    ).run('000001', '2026-08-18', 1.409, 3.982);

    const detail = await getFundDetail(exec(db), '000001');
    const since = detail?.fields.find((f) => f.key === 'return_since_start');
    expect(since?.empty).toBe(false);
    expect(Number(since?.value)).toBeCloseTo(298.2, 1);
    const twoYear = detail?.fields.find((f) => f.key === 'return_2y');
    expect(twoYear?.empty).toBe(false);
    expect(Number(twoYear?.value)).toBeCloseTo(99.1, 1);
    expect(detail?.fields.find((f) => f.key === 'return_1y')?.value).toBe(44.06);
  });
});

describe('applyRankTriples', () => {
  it('replaces percentile fields with rank / peers / percent', () => {
    const fields = [
      presentField('rank_pct_1y', '近1年同类排名', '排名', 9.52),
      presentField('pass_4433', '4433', '排名', 0),
    ];
    const out = applyRankTriples(fields, {
      rank_pct_1y: { rank: 83, n: 872, pct: 9.518 },
    });
    expect(out[0]?.value).toBe('83 / 872 / 9.52%');
    expect(out[1]?.value).toBe(0);
  });
});

describe('returnFromNavPair', () => {
  it('prefers accumulated nav and rejects a zero base', () => {
    expect(
      returnFromNavPair({
        first_acc: 1,
        first_unit: 1,
        last_acc: 3.982,
        last_unit: 1.409,
      }),
    ).toBeCloseTo(298.2, 1);
    expect(
      returnFromNavPair({
        first_acc: null,
        first_unit: 0,
        last_acc: null,
        last_unit: 1.2,
      }),
    ).toBeNull();
  });
});

describe('getFundNav', () => {
  it('returns the newest nav points in ascending date order', async () => {
    const db = new Database(':memory:');
    db.exec(
      'CREATE TABLE fund_nav (fund_code TEXT, nav_date TEXT, unit_nav REAL, acc_nav REAL, daily_return REAL)',
    );
    const insert = db.prepare(
      'INSERT INTO fund_nav (fund_code, nav_date, unit_nav, acc_nav, daily_return) VALUES (?, ?, ?, NULL, NULL)',
    );
    insert.run('000001', '2001-01-01', 1);
    insert.run('000001', '2026-08-17', 2);
    insert.run('000001', '2026-08-18', 3);

    const rows = await getFundNav(exec(db), '000001', 2);
    expect(rows.map((r) => r.nav_date)).toEqual(['2026-08-17', '2026-08-18']);
    expect(await getFundNav(exec(db), '000001', Number.POSITIVE_INFINITY)).toHaveLength(3);
    expect(await getFundNav(exec(db), '000001', 0.5)).toHaveLength(3);
    const windowed = await getFundNav(exec(db), '000001', { from: '2026-01-01' });
    expect(windowed.map((r) => r.nav_date)).toEqual(['2026-08-17', '2026-08-18']);
  });
});
