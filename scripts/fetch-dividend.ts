#!/usr/bin/env bun
/**
 * 抓取全库基金分红送配 → fund_dividend
 * Usage: bun run scripts/fetch-dividend.ts [db_path]
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  countDividends,
  DEFAULT_DB_PATH,
  initSchema,
  listAllFundCodes,
  openDb,
  upsertDividends,
  writeFetchLog,
} from '../src/db/repo.ts';
import { fetchDividends } from '../src/fetchers/dividend.ts';
import { logger } from '../src/utils/logger.ts';
import { ConcurrencyPool, RateLimiter } from '../src/utils/pool.ts';

const CONCURRENCY = Number(process.env.FUNDLY_CONCURRENCY ?? 5);
const QPS = Number(process.env.FUNDLY_QPS ?? 5);

async function main(): Promise<void> {
  const dbPath = process.argv[2] ?? DEFAULT_DB_PATH;
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = openDb(dbPath);
  initSchema(db);

  const codes = listAllFundCodes(db);
  logger.info('start fetching dividends', { total: codes.length, qps: QPS });

  const limiter = new RateLimiter(QPS);
  const pool = new ConcurrencyPool(CONCURRENCY);
  const t0 = Date.now();
  let ok = 0;
  let failed = 0;
  let events = 0;

  await pool.run(
    codes,
    async (code) => {
      await limiter.acquire();
      const start = Date.now();
      try {
        const items = await fetchDividends(code);
        if (items.length > 0) {
          upsertDividends(
            db,
            items.map((it) => ({ ...it, fundCode: code })),
          );
          events += items.length;
        }
        writeFetchLog(db, {
          fundCode: code,
          source: 'eastmoney',
          endpoint: 'fhsp',
          status: 'success',
          httpCode: 200,
          errorMsg: null,
          durationMs: Date.now() - start,
        });
        ok += 1;
      } catch (err) {
        const msg = (err as Error).message;
        writeFetchLog(db, {
          fundCode: code,
          source: 'eastmoney',
          endpoint: 'fhsp',
          status: 'failed',
          httpCode: null,
          errorMsg: msg,
          durationMs: Date.now() - start,
        });
        failed += 1;
      }
    },
    (done, total) => {
      if (done % 500 === 0 || done === total) {
        const rate = (done / ((Date.now() - t0) / 1000)).toFixed(2);
        const eta = Math.round((total - done) / Number(rate));
        logger.info('progress', {
          done,
          total,
          ok,
          failed,
          events,
          ratePerSec: rate,
          etaSec: Number.isFinite(eta) ? eta : null,
        });
      }
    },
  );

  logger.info('done', {
    total: codes.length,
    ok,
    failed,
    events,
    totalInDb: countDividends(db),
    elapsedSec: Math.round((Date.now() - t0) / 1000),
  });
  db.close();
}

await main();
