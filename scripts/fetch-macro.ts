#!/usr/bin/env bun
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { publishMarketCollection } from '../src/db/market-publish.ts';
import { initMarketSchema, updateMarketSourceStatus } from '../src/db/market-repo.ts';
import { openDb } from '../src/db/repo.ts';
import { collectFuyao } from '../src/fetchers/market-fuyao-collection.ts';
import {
  collectCboe,
  collectChinaMoney,
  collectEcb,
  collectFred,
  collectShfe,
} from '../src/fetchers/market-public-collection.ts';
import { MarketReader } from '../src/fetchers/market-reader.ts';
import { logger } from '../src/utils/logger.ts';
import { acquireMarketLock } from '../src/utils/market-lock.ts';

const SOURCES = ['fuyao', 'shfe', 'cboe', 'ecb', 'shibor', 'lpr', 'fred'] as const;
type Source = (typeof SOURCES)[number];

export async function fetchMacro(options: {
  sqlite: string;
  sources: Source[];
  mode: 'live' | 'evidence';
  evidenceDir: string;
  historyDays: number;
}): Promise<
  Array<{
    source: string;
    success: boolean;
    quotes?: number;
    bars?: number;
    observations?: number;
    warnings?: number;
  }>
> {
  if (!existsSync(options.sqlite))
    throw new Error('Fundly SQLite database does not exist; initialize the database first');
  const release = acquireMarketLock(options.sqlite);
  let db: ReturnType<typeof openDb> | undefined;
  const results: Array<{
    source: string;
    success: boolean;
    quotes?: number;
    bars?: number;
    observations?: number;
    warnings?: number;
  }> = [];
  try {
    db = openDb(options.sqlite);
    if (
      !db
        .query("SELECT name FROM sqlite_master WHERE type='table' AND name='fund_basic_info'")
        .get()
    )
      throw new Error('Not a Fundly database');
    initMarketSchema(db);
    for (const source of options.sources) {
      const sourceKey = source === 'shibor' || source === 'lpr' ? `chinamoney_${source}` : source;
      const reader = new MarketReader({
        mode: options.mode,
        evidenceDir: options.evidenceDir,
        apiKey: process.env.HITHINK_FINANCE_API_KEY,
      });
      const progress = (message: string) => logger.info('macro collection', { source, message });
      logger.info('collecting macro source', { source, mode: options.mode });
      try {
        const batch =
          source === 'fuyao'
            ? await collectFuyao(db, reader, options.historyDays, progress)
            : source === 'shfe'
              ? await collectShfe(db, reader, options.historyDays, progress)
              : source === 'cboe'
                ? await collectCboe(reader, options.historyDays)
                : source === 'ecb'
                  ? await collectEcb(reader, options.historyDays)
                  : source === 'fred'
                    ? await collectFred(reader, options.historyDays)
                    : await collectChinaMoney(reader, source);
        publishMarketCollection(db, batch);
        const result = {
          source,
          success: true,
          quotes: batch.quotes.length,
          bars: batch.bars.length,
          observations: batch.observations.length,
          warnings: batch.warnings?.length ?? 0,
        };
        results.push(result);
        logger.info('macro source published', {
          ...result,
          tradeDate: batch.tradeDate,
          batchId: batch.batchId,
          requests: reader.requestCount,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Collection failed';
        updateMarketSourceStatus(db, {
          sourceKey,
          lastStatusCode: 503,
          lastErrorMessage: message,
          collectionMode: options.mode,
          startedAt: reader.startedAt,
        });
        results.push({ source, success: false });
        logger.error('macro source failed; previous successful data retained', {
          source,
          error: message,
        });
      }
    }
    return results;
  } finally {
    try {
      db?.close();
    } finally {
      release();
    }
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      offline: { type: 'boolean', default: false },
      watch: { type: 'boolean', default: false },
      'interval-minutes': { type: 'string', default: '60' },
      sqlite: { type: 'string' },
      sources: { type: 'string', default: SOURCES.join(',') },
      'evidence-dir': { type: 'string', default: 'output/macro-research-2026-09-06/evidence' },
      'history-days': { type: 'string', default: '1826' },
      help: { type: 'boolean', default: false },
    },
  });
  if (values.help) {
    console.log(
      'bun run fetch:macro [--sources fuyao,shfe,cboe,ecb,shibor,lpr,fred] [--sqlite path] [--history-days 1826]\nContinuous collection: --watch [--interval-minutes 60] (minimum 15)\nExplicit archived import: --offline --evidence-dir path\nLive collection requires HITHINK_FINANCE_API_KEY for Fuyao. No automatic archive fallback.',
    );
    return;
  }
  const sources = (values.sources ?? SOURCES.join(',')).split(',').map((s) => s.trim());
  if (!sources.length || sources.some((s) => !(SOURCES as readonly string[]).includes(s)))
    throw new Error('Unknown macro source');
  const historyDays = Number(values['history-days']);
  if (!Number.isInteger(historyDays) || historyDays < 90 || historyDays > 3650)
    throw new Error('history-days must be an integer from 90 to 3650');
  const root = resolve(import.meta.dirname, '..');
  const intervalMinutes = Number(values['interval-minutes']);
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 15 || intervalMinutes > 1440)
    throw new Error('interval-minutes must be an integer from 15 to 1440');
  if (values.watch && values.offline) throw new Error('Watch mode requires live collection');
  const options = {
    sqlite: resolve(values.sqlite ?? process.env.FUNDLY_SQLITE ?? resolve(root, 'data/fundly.db')),
    sources: [...new Set(sources)] as Source[],
    mode: values.offline ? ('evidence' as const) : ('live' as const),
    evidenceDir: resolve(values['evidence-dir'] ?? 'output/macro-research-2026-09-06/evidence'),
    historyDays,
  };
  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  if (values.watch) {
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  }
  try {
    do {
      const result = await fetchMacro(options);
      if (!values.watch) {
        if (result.some((r) => !r.success)) process.exitCode = 1;
        break;
      }
      if (stopping) break;
      logger.info('macro collector waiting for next refresh', { intervalMinutes });
      const next = Date.now() + intervalMinutes * 60000;
      while (!stopping && Date.now() < next) await Bun.sleep(Math.min(1000, next - Date.now()));
    } while (!stopping);
  } finally {
    if (values.watch) {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
    }
  }
}

if (import.meta.main)
  main().catch((error: unknown) => {
    logger.error('macro collection could not start', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    process.exitCode = 1;
  });
