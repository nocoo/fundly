#!/usr/bin/env bun
/**
 * 拉取全市场基金列表并写入 fund_basic_info。
 * Usage: bun run scripts/fetch-fund-list.ts [db_path]
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  countFunds,
  DEFAULT_DB_PATH,
  initSchema,
  openDb,
  upsertFundList,
  writeFetchLog,
} from '../src/db/repo.ts';
import { fetchFundList } from '../src/fetchers/eastmoney.ts';
import { logger } from '../src/utils/logger.ts';

async function main(): Promise<void> {
  const dbPath = process.argv[2] ?? DEFAULT_DB_PATH;
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = openDb(dbPath);
  initSchema(db);

  const t0 = Date.now();
  logger.info('fetching fund list from eastmoney...');

  try {
    const rows = await fetchFundList();
    const written = upsertFundList(db, rows);
    const mvpCount = countFunds(db, { mvpOnly: true });
    const totalCount = countFunds(db);
    const durationMs = Date.now() - t0;

    writeFetchLog(db, {
      fundCode: null,
      source: 'eastmoney',
      endpoint: 'fundcode_search',
      status: 'success',
      httpCode: 200,
      errorMsg: null,
      durationMs,
    });

    logger.info('fund list saved', {
      fetched: rows.length,
      written,
      totalInDb: totalCount,
      mvpPoolInDb: mvpCount,
      durationMs,
    });
  } catch (err) {
    const durationMs = Date.now() - t0;
    const msg = (err as Error).message;
    writeFetchLog(db, {
      fundCode: null,
      source: 'eastmoney',
      endpoint: 'fundcode_search',
      status: 'failed',
      httpCode: null,
      errorMsg: msg,
      durationMs,
    });
    logger.error('fund list failed', { error: msg, durationMs });
    process.exit(1);
  } finally {
    db.close();
  }
}

await main();
