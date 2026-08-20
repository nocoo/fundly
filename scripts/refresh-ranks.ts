#!/usr/bin/env bun

/**
 * 按同类基金计算阶段排名百分位并写入 fund_performance。
 * 抓取不会覆盖这些列；净值/业绩刷新后需手动再跑一次。
 *
 * 用法：
 *   bun run rank:refresh
 *   bun run rank:refresh data/fundly.db
 */

import { refreshRanks } from '../src/db/ranks.ts';
import { DEFAULT_DB_PATH, openDb } from '../src/db/repo.ts';

const dbPath = process.argv[2] ?? DEFAULT_DB_PATH;
const started = Date.now();
const db = openDb(dbPath);
const result = refreshRanks(db);
db.close();
console.log(
  JSON.stringify(
    {
      dbPath,
      ...result,
      elapsedSec: Number(((Date.now() - started) / 1000).toFixed(1)),
    },
    null,
    2,
  ),
);
