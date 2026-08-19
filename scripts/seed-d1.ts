#!/usr/bin/env bun
/**
 * First-load sqlite → D1 seed via wrangler d1 execute --file.
 * Incremental updates stay on `bun run import:d1`.
 */

import { Database } from 'bun:sqlite';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { cloudflareApiToken } from '../apps/worker/scripts/cf-token.ts';
import {
  IMPORT_TABLES,
  type ImportTable,
  type SqlExec,
} from '../apps/worker/src/lib/import-copy.ts';
import { flattenRows, sqlUpsert } from '../apps/worker/src/lib/import-plan.ts';
import { packInsertStatements } from '../apps/worker/src/lib/seed-sql.ts';

const SQLITE_PATH = resolve(process.argv[2] ?? 'data/fundly.db');
const ROOT = resolve(import.meta.dirname, '..');
const WRANGLER = resolve(ROOT, 'apps/worker/node_modules/.bin/wrangler');
const ACCOUNT = 'd51a8fde361e4be31db17d8c56737c1f';
const DATABASE_ID = 'ccc8336d-8c39-489a-a532-2ea856ec69ed';
const ROWS_PER_PACK = 80;
const STATEMENTS_PER_FILE = 800;

function runWrangler(args: string[]) {
  const res = spawnSync(WRANGLER, args, {
    cwd: join(ROOT, 'apps/worker'),
    encoding: 'utf8',
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  if (res.status !== 0) throw new Error(`wrangler ${args.join(' ')} failed`);
}

function d1Exec(token: string): SqlExec {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DATABASE_ID}/query`;
  return {
    async all<T>(sql: string, params: unknown[] = []) {
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
    async run(sql: string, params: unknown[] = []) {
      await this.all(sql, params);
    },
  };
}

async function upsertOversized(dest: SqlExec, table: ImportTable, rows: unknown[][]) {
  for (const row of rows) {
    await dest.run(sqlUpsert(table.table, table.columns, table.keyCols, 1), flattenRows([row]));
  }
}

async function main() {
  runWrangler(['d1', 'migrations', 'apply', 'fundly-db', '--remote']);
  const db = new Database(SQLITE_PATH, { readonly: true });
  const dir = mkdtempSync(join(tmpdir(), 'fundly-d1-seed-'));
  const dest = d1Exec(cloudflareApiToken());
  let files = 0;
  let oversizedTotal = 0;

  try {
    for (const table of IMPORT_TABLES) {
      const countRow = db.prepare(`SELECT COUNT(*) AS n FROM ${table.table}`).get() as {
        n: number;
      };
      console.log(`dumping ${table.table} (${countRow.n} rows)`);
      const select = db.prepare(`SELECT ${table.columns.join(', ')} FROM ${table.table}`);
      const statements: string[] = [];
      const pending: unknown[][] = [];
      const oversized: unknown[][] = [];
      let part = 0;

      const flushFile = () => {
        if (statements.length === 0) return;
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

      const flushPending = () => {
        if (pending.length === 0) return;
        const packed = packInsertStatements(table.table, table.columns, pending);
        statements.push(...packed.statements);
        oversized.push(...packed.oversized.map((r) => [...r]));
        pending.length = 0;
        if (statements.length >= STATEMENTS_PER_FILE) flushFile();
      };

      for (const row of select.iterate() as Iterable<Record<string, unknown>>) {
        pending.push(table.columns.map((c) => row[c] ?? null));
        if (pending.length >= ROWS_PER_PACK) flushPending();
      }
      flushPending();
      flushFile();
      if (oversized.length) {
        console.log(`${table.table}: ${oversized.length} oversized rows via REST`);
        await upsertOversized(dest, table, oversized);
        oversizedTotal += oversized.length;
      }
    }
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }

  console.log(`seeded ${files} sql files, ${oversizedTotal} rest rows from ${SQLITE_PATH}`);
}

await main();
