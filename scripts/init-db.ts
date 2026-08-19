#!/usr/bin/env bun
/**
 * 初始化 SQLite 数据库（幂等）
 * Usage: bun run scripts/init-db.ts [db_path]
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DEFAULT_DB_PATH, initSchema, openDb } from '../src/db/repo.ts';
import { logger } from '../src/utils/logger.ts';

const dbPath = process.argv[2] ?? DEFAULT_DB_PATH;
mkdirSync(dirname(dbPath), { recursive: true });

const db = openDb(dbPath);
initSchema(db);
logger.info('database ready', { path: dbPath });
db.close();
