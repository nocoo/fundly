#!/usr/bin/env bun
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DEFAULT_DB_PATH, initSchema, openDb } from '../src/db/repo.ts';
import { replaceSelectMetrics } from '../src/db/select-compute.ts';
import { logger } from '../src/utils/logger.ts';

const dbPath = process.argv[2] ?? process.env.FUNDLY_SQLITE ?? DEFAULT_DB_PATH;
mkdirSync(dirname(dbPath), { recursive: true });
const db = openDb(dbPath);
initSchema(db);
const started = Date.now();
const result = replaceSelectMetrics(db);
db.close();
logger.info('compute select done', {
  dbPath,
  ...result,
  elapsedSec: Number(((Date.now() - started) / 1000).toFixed(1)),
});
