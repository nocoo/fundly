#!/usr/bin/env bun
/** 抓全库基金经理 → fund_manager + fund_manager_link */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  countManagerLinks,
  countManagers,
  DEFAULT_DB_PATH,
  initSchema,
  listAllFundCodes,
  openDb,
  upsertManagerLinks,
  writeFetchLog,
} from '../src/db/repo.ts';
import { fetchManagers } from '../src/fetchers/manager.ts';
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
  logger.info('start fetching managers', { total: codes.length, qps: QPS });

  const limiter = new RateLimiter(QPS);
  const pool = new ConcurrencyPool(CONCURRENCY);
  const t0 = Date.now();
  let ok = 0;
  let failed = 0;
  let links = 0;

  await pool.run(
    codes,
    async (code) => {
      await limiter.acquire();
      const start = Date.now();
      try {
        const terms = await fetchManagers(code);
        const rows = terms.flatMap((t) =>
          t.managerNames.map((name) => ({
            fundCode: code,
            managerName: name,
            startDate: t.startDate,
            endDate: t.endDate,
            tenureDays: t.tenureDays,
            returnDuring: t.returnDuring,
          })),
        );
        if (rows.length > 0) links += upsertManagerLinks(db, rows);
        writeFetchLog(db, {
          fundCode: code,
          source: 'eastmoney',
          endpoint: 'jjjl',
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
          endpoint: 'jjjl',
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
          links,
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
    links,
    managersInDb: countManagers(db),
    linksInDb: countManagerLinks(db),
    elapsedSec: Math.round((Date.now() - t0) / 1000),
  });
  db.close();
}

await main();
