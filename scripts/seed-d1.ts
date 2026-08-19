#!/usr/bin/env bun
/**
 * First-load sqlite → D1 seed via wrangler d1 execute --file.
 * Incremental updates stay on `bun run import:d1`.
 */

import { Database } from 'bun:sqlite';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { IMPORT_TABLES } from '../apps/worker/src/lib/import-copy.ts';
import { sqlInsertStatement } from '../apps/worker/src/lib/seed-sql.ts';

const SQLITE_PATH = resolve(process.argv[2] ?? 'data/fundly.db');
const ROOT = resolve(import.meta.dirname, '..');
const WRANGLER = resolve(ROOT, 'apps/worker/node_modules/.bin/wrangler');
const ROWS_PER_STATEMENT = 80;
const STATEMENTS_PER_FILE = 800;

function runWrangler(args: string[]) {
  const res = spawnSync(WRANGLER, args, {
    cwd: join(ROOT, 'apps/worker'),
    encoding: 'utf8',
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  if (res.status !== 0) throw new Error(`wrangler ${args.join(' ')} failed`);
}

function main() {
  runWrangler(['d1', 'migrations', 'apply', 'fundly-db', '--remote']);
  const db = new Database(SQLITE_PATH, { readonly: true });
  const dir = mkdtempSync(join(tmpdir(), 'fundly-d1-seed-'));
  let files = 0;

  for (const table of IMPORT_TABLES) {
    const countRow = db.prepare(`SELECT COUNT(*) AS n FROM ${table.table}`).get() as { n: number };
    console.log(`dumping ${table.table} (${countRow.n} rows)`);
    const select = db.prepare(`SELECT ${table.columns.join(', ')} FROM ${table.table}`);
    const statements: string[] = [];
    let batch: unknown[][] = [];
    let part = 0;

    const flushFile = () => {
      if (statements.length === 0) return;
      const path = join(dir, `${table.table}-${part}.sql`);
      writeFileSync(path, `${statements.join('\n')}\n`);
      console.log(`executing ${path} (${statements.length} statements)`);
      runWrangler(['d1', 'execute', 'fundly-db', '--remote', '--yes', '--file', path]);
      files += 1;
      part += 1;
      statements.length = 0;
    };

    for (const row of select.iterate() as Iterable<Record<string, unknown>>) {
      batch.push(table.columns.map((c) => row[c] ?? null));
      if (batch.length >= ROWS_PER_STATEMENT) {
        statements.push(sqlInsertStatement(table.table, table.columns, batch));
        batch = [];
        if (statements.length >= STATEMENTS_PER_FILE) flushFile();
      }
    }
    if (batch.length) statements.push(sqlInsertStatement(table.table, table.columns, batch));
    flushFile();
  }

  db.close();
  console.log(`seeded ${files} sql files from ${SQLITE_PATH}`);
}

main();
