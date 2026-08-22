#!/usr/bin/env bun
/** 抓全库最新季度持仓 → fund_portfolio */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  countPortfolio,
  DEFAULT_DB_PATH,
  initSchema,
  listAllFundCodes,
  openDb,
  upsertPortfolio,
  writeFetchLog,
} from '../src/db/repo.ts';
import { fetchPortfolio } from '../src/fetchers/portfolio.ts';
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
  logger.info('start fetching portfolios', { total: codes.length, qps: QPS });

  const limiter = new RateLimiter(QPS);
  const pool = new ConcurrencyPool(CONCURRENCY);
  const t0 = Date.now();
  let ok = 0;
  let failed = 0;
  let rows = 0;

  await pool.run(
    codes,
    async (code) => {
      await limiter.acquire();
      const start = Date.now();
      try {
        const holdings = await fetchPortfolio(code);
        if (holdings.length > 0) {
          rows += upsertPortfolio(
            db,
            holdings.map((h) => ({ ...h, fundCode: code })),
          );
        }
        writeFetchLog(db, {
          fundCode: code,
          source: 'eastmoney',
          endpoint: 'jjcc',
          status: 'success',
          httpCode: 200,
          errorMsg: null,
          durationMs: Date.now() - start,
        });
        ok += 1;
      } catch (err) {
        writeFetchLog(db, {
          fundCode: code,
          source: 'eastmoney',
          endpoint: 'jjcc',
          status: 'failed',
          httpCode: null,
          errorMsg: (err as Error).message,
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
          rows,
          ratePerSec: rate,
          etaSec: eta,
        });
      }
    },
  );

  logger.info('done', {
    total: codes.length,
    ok,
    failed,
    rows,
    totalInDb: countPortfolio(db),
    elapsedSec: Math.round((Date.now() - t0) / 1000),
  });
  db.close();
}

await main();
