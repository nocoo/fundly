#!/usr/bin/env bun
/**
 * 拉取 MVP 池中所有基金的 pingzhongdata（详情 + 净值 + 业绩）。
 * Usage: bun run scripts/fetch-fund-nav.ts [db_path] [limit]
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  countNavPoints,
  DEFAULT_DB_PATH,
  initSchema,
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

async function main(): Promise<void> {
  const dbPath = process.argv[2] ?? DEFAULT_DB_PATH;
  const limit = process.argv[3] ? Number(process.argv[3]) : Number.POSITIVE_INFINITY;
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = openDb(dbPath);
  initSchema(db);

  const allCodes = listMvpFundCodes(db);
  const codes = Number.isFinite(limit) ? allCodes.slice(0, limit) : allCodes;
  if (codes.length === 0) {
    logger.error('no funds in MVP pool. run fetch:list first.');
    process.exit(1);
  }

  logger.info('start fetching pingzhongdata', {
    total: codes.length,
    concurrency: CONCURRENCY,
    qps: QPS,
  });

  const limiter = new RateLimiter(QPS);
  const pool = new ConcurrencyPool(CONCURRENCY);
  const t0 = Date.now();
  let ok = 0;
  let failed = 0;
  let navRows = 0;

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
        navRows += wrote;
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
      if (done % 50 === 0 || done === total) {
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

  const elapsed = Date.now() - t0;
  const totalNavInDb = countNavPoints(db);
  logger.info('done', {
    total: codes.length,
    ok,
    failed,
    navRowsWritten: navRows,
    totalNavInDb,
    elapsedSec: Math.round(elapsed / 1000),
  });

  db.close();
}

await main();
