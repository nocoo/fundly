#!/usr/bin/env bun
import { existsSync } from 'node:fs';
import { openDb } from '../src/db/repo.ts';
import { initSelectionSchema } from '../src/db/selection-repo.ts';
import { MarketReader } from '../src/fetchers/market-reader.ts';
import { collectSelection, safeSelectionError } from '../src/fetchers/selection-collection.ts';
import { logger } from '../src/utils/logger.ts';
import { acquireMarketLock } from '../src/utils/market-lock.ts';
import { parseSelectionOptions, type SelectionOptions } from '../src/utils/selection-options.ts';

export async function fetchSelection(options: SelectionOptions): Promise<boolean> {
  if (!existsSync(options.sqlite))
    throw new Error('Database not found; initialize or restore it first');
  const apiKey = process.env.HITHINK_FINANCE_API_KEY;
  if (!apiKey) throw new Error('HITHINK_FINANCE_API_KEY is not configured');
  const release = acquireMarketLock(options.sqlite);
  try {
    const db = openDb(options.sqlite);
    try {
      initSelectionSchema(db);
      const reader = new MarketReader({ mode: 'live', apiKey, intervalMs: 400, timeoutMs: 20000 });
      const result = await collectSelection(db, reader, options, (message, detail) =>
        logger.info(message, { detail }),
      );
      const complete = Object.values(result.deep).every((r) => r.success);
      logger.info('selection collection finished', {
        etfCount: result.etfCount,
        stockCount: result.stockCount,
        tradeDate: result.tradeDate,
        requests: reader.requestCount,
        complete,
      });
      return complete;
    } finally {
      db.close();
    }
  } finally {
    release();
  }
}

async function main(): Promise<void> {
  const options = parseSelectionOptions(Bun.argv.slice(2));
  if (options.help) {
    console.log(`用法: bun run fetch:selection [options]
  --scope all|etf|stock       采集范围，默认 all
  --etf-limit 60             ETF 深采上限，1–200
  --stock-limit 80           股票深采上限，1–200
  --symbols 510300.SH,...    按目录身份补采，受本组 limit 限制
  --sqlite data/fundly.db    已初始化的基金库
  --skip-deep               只刷新完整目录/股票行情与估值/本地指标
  --watch                   常驻重复采集，每轮释放共享采集锁
  --interval-minutes 1440   重复间隔，15–10080 分钟
  -h, --help                帮助`);
    return;
  }
  do {
    try {
      const complete = await fetchSelection(options);
      if (!complete && !options.watch) process.exitCode = 1;
    } catch (error) {
      logger.error(safeSelectionError(error));
      if (!options.watch) {
        process.exitCode = 1;
        return;
      }
    }
    if (options.watch) {
      logger.info('waiting for next selection collection', { minutes: options.intervalMinutes });
      await Bun.sleep(options.intervalMinutes * 60000);
    }
  } while (options.watch);
}

if (import.meta.main)
  main().catch((error) => {
    logger.error(safeSelectionError(error));
    process.exitCode = 1;
  });
