#!/usr/bin/env bun
/**
 * 每日增量：复用 pingzhongdata 逐只刷新（默认只刷权益 MVP 池）
 *
 * 与 fetch-fund-nav.ts 的区别：
 *   fetch:nav 只抓"还没有 performance 记录的"基金（用于首次全量）；
 *   fetch:daily 强制重抓所有池内基金，覆盖最新净值 + 阶段业绩。
 *
 * 用法：
 *   bun run scripts/fetch-daily.ts                 # 默认 MVP 权益池 15,337 只
 *   bun run scripts/fetch-daily.ts data/fundly.db  # 指定 db
 *   FUNDLY_DAILY_POOL=all bun run fetch:daily      # 全市场 27,527 只
 *
 * 环境变量：
 *   FUNDLY_DAILY_POOL   = 'mvp' | 'all'  (默认 'mvp')
 *   FUNDLY_CONCURRENCY  = 5
 *   FUNDLY_QPS          = 5
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  countNavPoints,
  DEFAULT_DB_PATH,
  initSchema,
  latestNavDate,
  listMvpFundCodes,
  openDb,
  upsertNavPoints,
  upsertPerformance,
  upsertTrendExtra,
  writeFetchLog,
} from '../src/db/repo.ts';
import { fetchPingzhongData } from '../src/fetchers/eastmoney.ts';
import { logger } from '../src/utils/logger.ts';
import { ConcurrencyPool, RateLimiter } from '../src/utils/pool.ts';

const CONCURRENCY = Number(process.env.FUNDLY_CONCURRENCY ?? 5);
const QPS = Number(process.env.FUNDLY_QPS ?? 5);
const POOL_MODE = (process.env.FUNDLY_DAILY_POOL ?? 'mvp').toLowerCase();

async function main(): Promise<void> {
  const dbPath = process.argv[2] ?? DEFAULT_DB_PATH;
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = openDb(dbPath);
  initSchema(db);

  // 池选择：mvp 只刷权益类型；all 全市场
  let codes: string[];
  if (POOL_MODE === 'all') {
    const rows = db.query('SELECT fund_code FROM fund_basic_info ORDER BY fund_code').all() as {
      fund_code: string;
    }[];
    codes = rows.map((r) => r.fund_code);
  } else {
    codes = listMvpFundCodes(db);
  }

  if (codes.length === 0) {
    logger.error('no funds. run fetch:list first.');
    process.exit(1);
  }

  const beforeLatest = latestNavDate(db);
  const beforeRows = countNavPoints(db);
  logger.info('daily incremental start', {
    poolMode: POOL_MODE,
    total: codes.length,
    concurrency: CONCURRENCY,
    qps: QPS,
    beforeLatest,
    beforeRows,
  });

  const limiter = new RateLimiter(QPS);
  const pool = new ConcurrencyPool(CONCURRENCY);
  const t0 = Date.now();
  let ok = 0;
  let failed = 0;
  let navRowsWritten = 0;

  await pool.run(
    codes,
    async (code) => {
      await limiter.acquire();
      const start = Date.now();
      try {
        const data = await fetchPingzhongData(code);
        const wrote = upsertNavPoints(db, code, data.navPoints);
        upsertPerformance(db, data.performance);
        upsertTrendExtra(db, data);
        writeFetchLog(db, {
          fundCode: code,
          source: 'eastmoney',
          endpoint: 'pingzhongdata',
          status: 'success',
          httpCode: 200,
          errorMsg: null,
          durationMs: Date.now() - start,
        });
        ok += 1;
        navRowsWritten += wrote;
      } catch (err) {
        const msg = (err as Error).message;
        writeFetchLog(db, {
          fundCode: code,
          source: 'eastmoney',
          endpoint: 'pingzhongdata',
          status: 'failed',
          httpCode: null,
          errorMsg: msg,
          durationMs: Date.now() - start,
        });
        failed += 1;
        logger.warn('pingzhongdata failed', { fundCode: code, error: msg });
      }
    },
    (done, total) => {
      if (done % 500 === 0 || done === total) {
        const elapsed = Date.now() - t0;
        const rate = (done / (elapsed / 1000)).toFixed(2);
        const eta = Math.round((total - done) / Number(rate));
        logger.info('progress', {
          done,
          total,
          ok,
          failed,
          rateReqPerSec: rate,
          etaSec: Number.isFinite(eta) ? eta : null,
        });
      }
    },
  );

  const afterLatest = latestNavDate(db);
  const afterRows = countNavPoints(db);
  const elapsedSec = Math.round((Date.now() - t0) / 1000);
  logger.info('daily incremental done', {
    total: codes.length,
    ok,
    failed,
    navRowsWritten,
    dateAdvanced: afterLatest !== beforeLatest,
    beforeLatest,
    newLatestDate: afterLatest,
    deltaRows: afterRows - beforeRows,
    totalNavRows: afterRows,
    elapsedSec,
  });

  db.close();
}

await main();
