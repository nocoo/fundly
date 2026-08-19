/**
 * 数据库连接 + Repository
 */

import { Database } from 'bun:sqlite';
import { logger } from '../utils/logger.ts';
import type {
  FetchLogEntry,
  FundPerformance,
  NavPoint,
  PingzhongData,
  RawFundListRow,
} from '../utils/types.ts';
import { isMvpFundType } from '../utils/types.ts';
import { SCHEMA_DDL, SCHEMA_VERSION } from './schema.ts';

export const DEFAULT_DB_PATH = 'data/fundly.db';

export function openDb(path: string = DEFAULT_DB_PATH): Database {
  const db = new Database(path, { create: true });
  // 性能优化
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec('PRAGMA temp_store = MEMORY');
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

/** 初始化 schema（幂等） */
export function initSchema(db: Database): void {
  db.transaction(() => {
    for (const ddl of SCHEMA_DDL) {
      db.exec(ddl);
    }
    // 记录版本
    const existing = db
      .query('SELECT version FROM schema_version WHERE version = ?')
      .get(SCHEMA_VERSION);
    if (!existing) {
      db.query(
        'INSERT INTO schema_version (version, applied_at, description) VALUES (?, ?, ?)',
      ).run(SCHEMA_VERSION, Date.now(), 'initial schema');
      logger.info('schema initialized', { version: SCHEMA_VERSION });
    }
  })();
}

// ============================================================
// fund_basic_info
// ============================================================

const UPSERT_FUND_BASIC = `
  INSERT INTO fund_basic_info (
    fund_code, fund_name, fund_type, pinyin_abbr, pinyin_full,
    in_mvp_pool, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(fund_code) DO UPDATE SET
    fund_name = excluded.fund_name,
    fund_type = excluded.fund_type,
    pinyin_abbr = excluded.pinyin_abbr,
    pinyin_full = excluded.pinyin_full,
    in_mvp_pool = excluded.in_mvp_pool,
    updated_at = excluded.updated_at
`;

/** 批量 upsert 基金列表；返回写入条数 */
export function upsertFundList(db: Database, rows: readonly RawFundListRow[]): number {
  const now = Date.now();
  const stmt = db.prepare(UPSERT_FUND_BASIC);

  const tx = db.transaction((batch: readonly RawFundListRow[]) => {
    let count = 0;
    for (const r of batch) {
      stmt.run(
        r.fundCode,
        r.fundName,
        r.fundType,
        r.pinyinAbbr,
        r.pinyinFull,
        isMvpFundType(r.fundType) ? 1 : 0,
        now,
        now,
      );
      count += 1;
    }
    return count;
  });

  return tx(rows);
}

export function countFunds(db: Database, options: { mvpOnly?: boolean } = {}): number {
  const sql = options.mvpOnly
    ? 'SELECT COUNT(*) as n FROM fund_basic_info WHERE in_mvp_pool = 1'
    : 'SELECT COUNT(*) as n FROM fund_basic_info';
  const row = db.query(sql).get() as { n: number } | null;
  return row?.n ?? 0;
}

export function listMvpFundCodes(db: Database): string[] {
  const rows = db
    .query('SELECT fund_code FROM fund_basic_info WHERE in_mvp_pool = 1 ORDER BY fund_code')
    .all() as { fund_code: string }[];
  return rows.map((r) => r.fund_code);
}

// ============================================================
// fund_performance
// ============================================================

const UPSERT_PERFORMANCE = `
  INSERT INTO fund_performance (
    fund_code,
    return_1m, return_3m, return_6m, return_1y, return_2y, return_3y, return_5y,
    return_ytd, return_since_start,
    rank_pct_1m, rank_pct_3m, rank_pct_6m, rank_pct_1y, rank_pct_2y, rank_pct_3y, rank_pct_5y,
    data_date, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(fund_code) DO UPDATE SET
    return_1m = excluded.return_1m,
    return_3m = excluded.return_3m,
    return_6m = excluded.return_6m,
    return_1y = excluded.return_1y,
    return_2y = excluded.return_2y,
    return_3y = excluded.return_3y,
    return_5y = excluded.return_5y,
    return_ytd = excluded.return_ytd,
    return_since_start = excluded.return_since_start,
    rank_pct_1m = excluded.rank_pct_1m,
    rank_pct_3m = excluded.rank_pct_3m,
    rank_pct_6m = excluded.rank_pct_6m,
    rank_pct_1y = excluded.rank_pct_1y,
    rank_pct_2y = excluded.rank_pct_2y,
    rank_pct_3y = excluded.rank_pct_3y,
    rank_pct_5y = excluded.rank_pct_5y,
    data_date = excluded.data_date,
    updated_at = excluded.updated_at
`;

export function upsertPerformance(db: Database, perf: FundPerformance): void {
  db.prepare(UPSERT_PERFORMANCE).run(
    perf.fundCode,
    perf.return1m,
    perf.return3m,
    perf.return6m,
    perf.return1y,
    perf.return2y,
    perf.return3y,
    perf.return5y,
    perf.returnYtd,
    perf.returnSinceStart,
    perf.rankPct1m,
    perf.rankPct3m,
    perf.rankPct6m,
    perf.rankPct1y,
    perf.rankPct2y,
    perf.rankPct3y,
    perf.rankPct5y,
    perf.dataDate,
    Date.now(),
  );
}

// ============================================================
// fund_nav
// ============================================================

const UPSERT_NAV = `
  INSERT INTO fund_nav (fund_code, nav_date, unit_nav, acc_nav, daily_return)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(fund_code, nav_date) DO UPDATE SET
    unit_nav = excluded.unit_nav,
    acc_nav = excluded.acc_nav,
    daily_return = excluded.daily_return
`;

/** 批量写入某基金的净值序列；返回写入条数 */
export function upsertNavPoints(
  db: Database,
  fundCode: string,
  points: readonly NavPoint[],
): number {
  const stmt = db.prepare(UPSERT_NAV);
  const tx = db.transaction((batch: readonly NavPoint[]) => {
    let count = 0;
    for (const p of batch) {
      stmt.run(fundCode, p.navDate, p.unitNav, p.accNav, p.dailyReturn);
      count += 1;
    }
    return count;
  });
  return tx(points);
}

export function countNavPoints(db: Database, fundCode?: string): number {
  if (fundCode) {
    const row = db
      .query('SELECT COUNT(*) as n FROM fund_nav WHERE fund_code = ?')
      .get(fundCode) as { n: number } | null;
    return row?.n ?? 0;
  }
  const row = db.query('SELECT COUNT(*) as n FROM fund_nav').get() as { n: number } | null;
  return row?.n ?? 0;
}

// ============================================================
// fund_trend_extra
// ============================================================

const UPSERT_TREND_EXTRA = `
  INSERT INTO fund_trend_extra (
    fund_code, asset_allocation_json, scale_history_json,
    holder_structure_json, ranking_trend_json, performance_5d_json, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(fund_code) DO UPDATE SET
    asset_allocation_json = excluded.asset_allocation_json,
    scale_history_json = excluded.scale_history_json,
    holder_structure_json = excluded.holder_structure_json,
    ranking_trend_json = excluded.ranking_trend_json,
    performance_5d_json = excluded.performance_5d_json,
    updated_at = excluded.updated_at
`;

export function upsertTrendExtra(db: Database, data: PingzhongData): void {
  db.prepare(UPSERT_TREND_EXTRA).run(
    data.fundCode,
    data.extra.assetAllocationJson,
    data.extra.scaleHistoryJson,
    data.extra.holderStructureJson,
    data.extra.rankingTrendJson,
    data.extra.performance5dJson,
    Date.now(),
  );
}

// ============================================================
// fetch_log
// ============================================================

export function writeFetchLog(db: Database, entry: FetchLogEntry): void {
  db.prepare(
    `INSERT INTO fetch_log
      (fund_code, source, endpoint, status, http_code, error_msg, duration_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    entry.fundCode,
    entry.source,
    entry.endpoint,
    entry.status,
    entry.httpCode,
    entry.errorMsg,
    entry.durationMs,
    Date.now(),
  );
}
