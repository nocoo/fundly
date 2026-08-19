#!/usr/bin/env bun
/**
 * First-load sqlite → D1 seed via wrangler d1 execute --file.
 * Incremental updates stay on `bun run import:d1`.
 */

import { Database } from 'bun:sqlite';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { cloudflareApiToken } from '../apps/worker/scripts/cf-token.ts';
import { type SqlBinding, toSqlBindings } from '../apps/worker/src/lib/executor.ts';
import {
  IMPORT_TABLES,
  type ImportTable,
  type SqlExec,
} from '../apps/worker/src/lib/import-copy.ts';
import { flattenRows, sqlUpsert } from '../apps/worker/src/lib/import-plan.ts';
import {
  assertSeedSnapshot,
  packInsertStatements,
  parseSkipFiles,
  resolveSeedSqlitePath,
  selectSeedTables,
  sqliteSnapshot,
} from '../apps/worker/src/lib/seed-sql.ts';

const SQLITE_PATH = resolve(process.argv[2] ?? 'data/fundly.db');
const ROOT = resolve(import.meta.dirname, '..');
const WRANGLER = resolve(ROOT, 'apps/worker/node_modules/.bin/wrangler');
const ACCOUNT = 'd51a8fde361e4be31db17d8c56737c1f';
const DATABASE_ID = 'ccc8336d-8c39-489a-a532-2ea856ec69ed';
const ROWS_PER_PACK = 80;
const STATEMENTS_PER_FILE = 800;

function sleep(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function runWrangler(args: string[], attempts = 5) {
  let last = 0;
  for (let i = 1; i <= attempts; i++) {
    const res = spawnSync(WRANGLER, args, {
      cwd: join(ROOT, 'apps/worker'),
      encoding: 'utf8',
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    last = res.status ?? 1;
    if (last === 0) return;
    if (i === attempts) break;
    console.warn(`wrangler failed (attempt ${i}/${attempts}), retrying…`);
    sleep(2000 * i);
  }
  throw new Error(`wrangler ${args.join(' ')} failed after ${attempts} attempts (status ${last})`);
}

function d1Exec(token: string): SqlExec {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DATABASE_ID}/query`;
  return {
    async all<T>(sql: string, params: SqlBinding[] = []) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql, params }),
      });
      const body = (await res.json()) as {
        success: boolean;
        errors?: { message: string }[];
        result?: { results?: T[] }[];
      };
      if (!res.ok || !body.success) {
        throw new Error(body.errors?.[0]?.message ?? `D1 query failed ${res.status}`);
      }
      return (body.result?.[0]?.results ?? []) as T[];
    },
    async run(sql: string, params: SqlBinding[] = []) {
      await this.all(sql, params);
    },
  };
}

async function upsertOversized(dest: SqlExec, table: ImportTable, row: unknown[]) {
  await dest.run(
    sqlUpsert(table.table, table.columns, table.keyCols, 1),
    toSqlBindings(flattenRows([row])),
  );
}

async function main() {
  const skipFiles = parseSkipFiles(process.env.FUNDLY_SEED_SKIP_FILES);
  const tables = selectSeedTables(IMPORT_TABLES, process.env.FUNDLY_SEED_TABLES);
  if (skipFiles > 0 && tables.length !== 1) {
    throw new Error('FUNDLY_SEED_SKIP_FILES requires FUNDLY_SEED_TABLES with exactly one table');
  }
  const sourcePath = resolveSeedSqlitePath({
    livePath: SQLITE_PATH,
    resumeSqlite: process.env.FUNDLY_SEED_SQLITE,
    skipFiles,
  });
  let dbPath = sourcePath;
  if (skipFiles === 0 && !process.env.FUNDLY_SEED_SQLITE) {
    dbPath = `${SQLITE_PATH}.seed-snapshot.db`;
    try {
      statSync(dbPath);
      console.log(`reusing immutable snapshot ${dbPath}`);
    } catch {
      const live = new Database(SQLITE_PATH, { readonly: true });
      live.exec(`VACUUM INTO '${dbPath.replaceAll("'", "''")}'`);
      live.close();
      console.log(`wrote immutable snapshot ${dbPath}`);
    }
  }
  const st = statSync(dbPath);
  const snapshot = sqliteSnapshot(st.size, st.mtimeMs);
  assertSeedSnapshot(snapshot, process.env.FUNDLY_SEED_SNAPSHOT, skipFiles);
  console.log(`sqlite snapshot ${snapshot} path=${dbPath}`);

  const dest = d1Exec(cloudflareApiToken());
  runWrangler(['d1', 'migrations', 'apply', 'fundly-db', '--remote']);
  const db = new Database(dbPath, { readonly: true });
  let dir: string | undefined;
  let files = 0;
  let oversizedTotal = 0;

  try {
    dir = mkdtempSync(join(tmpdir(), 'fundly-d1-seed-'));
    for (const table of tables) {
      const countRow = db.prepare(`SELECT COUNT(*) AS n FROM ${table.table}`).get() as {
        n: number;
      };
      console.log(`dumping ${table.table} (${countRow.n} rows)`);
      const select = db.prepare(
        `SELECT ${table.columns.join(', ')} FROM ${table.table} ORDER BY ${table.keyCols.join(', ')}`,
      );
      const statements: string[] = [];
      const pending: unknown[][] = [];
      let part = 0;

      const flushFile = () => {
        if (statements.length === 0 || !dir) return;
        if (part < skipFiles) {
          console.log(`skip ${table.table}-${part}.sql (${statements.length} statements)`);
          part += 1;
          statements.length = 0;
          return;
        }
        const path = join(dir, `${table.table}-${part}.sql`);
        writeFileSync(path, `${statements.join('\n')}\n`);
        console.log(`executing ${path} (${statements.length} statements)`);
        try {
          runWrangler(['d1', 'execute', 'fundly-db', '--remote', '--yes', '--file', path]);
        } finally {
          unlinkSync(path);
        }
        files += 1;
        part += 1;
        statements.length = 0;
      };

      const flushPending = async () => {
        if (pending.length === 0) return;
        const packed = packInsertStatements(table.table, table.columns, pending);
        statements.push(...packed.statements);
        for (const row of packed.oversized) {
          if (part >= skipFiles) {
            await upsertOversized(dest, table, [...row]);
            oversizedTotal += 1;
          }
        }
        pending.length = 0;
        if (statements.length >= STATEMENTS_PER_FILE) flushFile();
      };

      if (skipFiles) console.log(`${table.table}: skip first ${skipFiles} packed files`);
      for (const row of select.iterate() as Iterable<Record<string, unknown>>) {
        const tuple = table.columns.map((c) => row[c] ?? null);
        const packed = packInsertStatements(table.table, table.columns, [tuple]);
        if (packed.oversized.length) {
          if (part >= skipFiles) {
            await upsertOversized(dest, table, tuple);
            oversizedTotal += 1;
          }
          continue;
        }
        pending.push(tuple);
        if (pending.length >= ROWS_PER_PACK) await flushPending();
      }
      await flushPending();
      flushFile();
      if (part < skipFiles) {
        throw new Error(`${table.table} only packed ${part} files, cannot skip ${skipFiles}`);
      }
    }
  } finally {
    db.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }

  console.log(`seeded ${files} sql files, ${oversizedTotal} rest rows from ${dbPath}`);
}

await main();
