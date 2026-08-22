#!/usr/bin/env bun
/**
 * 本地计算全库基金风险指标（零 API 请求）
 * Usage: bun run scripts/compute-risk-metrics.ts [db_path]
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { computeRiskMetrics } from '../src/analytics/risk-metrics.ts';
import {
  DEFAULT_DB_PATH,
  initSchema,
  listFundCodesWithNav,
  openDb,
  readNav,
  upsertRiskMetrics,
} from '../src/db/repo.ts';
import { logger } from '../src/utils/logger.ts';

async function main(): Promise<void> {
  const dbPath = process.argv[2] ?? DEFAULT_DB_PATH;
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = openDb(dbPath);
  initSchema(db);

  const codes = listFundCodesWithNav(db);
  logger.info('start computing risk metrics', { total: codes.length });

  const t0 = Date.now();
  let done = 0;
  let ok = 0;
  let skipped = 0;

  for (const code of codes) {
    const nav = readNav(db, code);
    const m = computeRiskMetrics(nav);
    if (
      m.y1.samples === 0 &&
      m.y3.samples === 0 &&
      m.y5.samples === 0 &&
      m.maxDrawdownAll === null
    ) {
      skipped += 1;
    } else {
      upsertRiskMetrics(db, {
        fundCode: code,
        dataDate: m.dataDate,
        volatility1y: m.y1.volatility,
        volatility3y: m.y3.volatility,
        volatility5y: m.y5.volatility,
        maxDrawdown1y: m.y1.maxDrawdown,
        maxDrawdown3y: m.y3.maxDrawdown,
        maxDrawdown5y: m.y5.maxDrawdown,
        maxDrawdownAll: m.maxDrawdownAll,
        sharpe1y: m.y1.sharpe,
        sharpe3y: m.y3.sharpe,
        sharpe5y: m.y5.sharpe,
        sortino1y: m.y1.sortino,
        sortino3y: m.y3.sortino,
        calmar1y: m.y1.calmar,
        calmar3y: m.y3.calmar,
        annualReturn1y: m.y1.annualReturn,
        annualReturn3y: m.y3.annualReturn,
        annualReturn5y: m.y5.annualReturn,
        navSamples1y: m.y1.samples,
        navSamples3y: m.y3.samples,
        navSamples5y: m.y5.samples,
      });
      ok += 1;
    }
    done += 1;
    if (done % 2000 === 0) {
      const rate = (done / ((Date.now() - t0) / 1000)).toFixed(0);
      logger.info('progress', { done, total: codes.length, ok, skipped, ratePerSec: rate });
    }
  }

  logger.info('done', {
    total: codes.length,
    ok,
    skipped,
    elapsedSec: Math.round((Date.now() - t0) / 1000),
  });
  db.close();
}

await main();
