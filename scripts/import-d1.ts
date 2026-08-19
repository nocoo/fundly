#!/usr/bin/env bun
/**
 * Incremental sqlite → D1 import. Re-runs INSERT OR IGNORE existing PKs.
 * Usage: bun run scripts/import-d1.ts [path-to-sqlite]
 */

import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  copyTableIncremental,
  IMPORT_TABLES,
  type ImportTable,
  type SqlExec,
} from '../apps/worker/src/lib/import-copy.ts';
import {
  flattenRows,
  planIncrementalInsert,
  rowKey,
  sqlInsertOrIgnore,
} from '../apps/worker/src/lib/import-plan.ts';

const ACCOUNT = 'd51a8fde361e4be31db17d8c56737c1f';
const DATABASE_ID = 'ccc8336d-8c39-489a-a532-2ea856ec69ed';
const SQLITE_PATH = resolve(process.argv[2] ?? 'data/fundly.db');

function wranglerToken(): string {
  const text = readFileSync(
    `${process.env.HOME}/Library/Preferences/.wrangler/config/default.toml`,
    'utf8',
  );
  const line = text.split('\n').find((l) => l.startsWith('oauth_token'));
  if (!line) throw new Error('wrangler oauth_token not found');
  return line.split('=', 2)[1]?.trim().replaceAll('"', '') ?? '';
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

function sqliteExec(db: Database): SqlExec {
  return {
    all<T>(sql: string, params: unknown[] = []) {
      return db.prepare(sql).all(...params) as T[];
    },
    run(sql: string, params: unknown[] = []) {
      db.prepare(sql).run(...params);
    },
  };
}

async function copyNav(
  src: SqlExec,
  dest: SqlExec,
): Promise<{ inserted: number; skipped: number }> {
  const table = IMPORT_TABLES.find((t) => t.table === 'fund_nav');
  if (!table) throw new Error('fund_nav missing');
  const codes = await src.all<{ fund_code: string }>('SELECT DISTINCT fund_code FROM fund_nav');
  let inserted = 0;
  let skipped = 0;
  let i = 0;
  for (const { fund_code } of codes) {
    i += 1;
    const destRows = await dest.all<{ nav_date: string }>(
      'SELECT nav_date FROM fund_nav WHERE fund_code = ?',
      [fund_code],
    );
    const existing = new Set(destRows.map((r) => rowKey([fund_code, r.nav_date])));
    const incoming = await src.all<Record<string, unknown>>(
      'SELECT * FROM fund_nav WHERE fund_code = ?',
      [fund_code],
    );
    const plan = planIncrementalInsert(existing, incoming, (r) =>
      rowKey([r.fund_code as string, r.nav_date as string]),
    );
    skipped += plan.skipped;
    const batchSize = Math.max(1, Math.floor(80 / table.columns.length));
    for (let b = 0; b < plan.toInsert.length; b += batchSize) {
      const chunk = plan.toInsert.slice(b, b + batchSize);
      const tuples = chunk.map((row) => table.columns.map((c) => row[c] ?? null));
      await dest.run(
        sqlInsertOrIgnore(table.table, table.columns, chunk.length),
        flattenRows(tuples),
      );
      inserted += chunk.length;
    }
    if (i % 100 === 0) {
      console.log(`nav ${i}/${codes.length} inserted=${inserted} skipped=${skipped}`);
    }
  }
  return { inserted, skipped };
}

async function main() {
  const token = wranglerToken();
  const srcDb = new Database(SQLITE_PATH, { readonly: true });
  const src = sqliteExec(srcDb);
  const dest = d1Exec(token);

  for (const table of IMPORT_TABLES) {
    if (table.table === 'fund_nav') {
      console.log('copying fund_nav…');
      const r = await copyNav(src, dest);
      console.log('fund_nav', r);
      continue;
    }
    console.log(`copying ${table.table}…`);
    const r = await copyTableIncremental(src, dest, table as ImportTable);
    console.log(table.table, r);
  }
  srcDb.close();
}

await main();
