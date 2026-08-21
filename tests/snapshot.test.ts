import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  acquireLock,
  assertCheckpointIdle,
  assertDiskSpace,
  assertFundlyDb,
  clearStaleWorkFiles,
  exclusiveRename,
  gunzipFile,
  gzipFile,
  listTargetPrevs,
  lockPath,
  processAlive,
  recoverInterruptedRestore,
  releaseLock,
  replaceWithForce,
  snapPath,
  vacuumInto,
} from '../src/backup/snapshot.ts';
import { initSchema } from '../src/db/repo.ts';

const leftovers: string[] = [];

function tmp(name: string): string {
  const dir = join(tmpdir(), `fundly-snap-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  leftovers.push(dir);
  return join(dir, name);
}

function seedMini(path: string): void {
  const db = new Database(path, { create: true });
  initSchema(db);
  const now = Date.now();
  db.query(
    `INSERT INTO fund_basic_info (fund_code, fund_name, fund_type, in_mvp_pool, created_at, updated_at)
     VALUES ('000001', '测试', '股票型', 1, ?, ?)`,
  ).run(now, now);
  db.query(
    `INSERT INTO fund_nav (fund_code, nav_date, unit_nav, acc_nav, daily_return)
     VALUES ('000001', '2026-08-21', 1.0, 1.0, 0)`,
  ).run();
  db.close();
}

afterEach(() => {
  for (const dir of leftovers.splice(0)) {
    try {
      Bun.spawnSync(['rm', '-rf', dir]);
    } catch {
      /* ignore */
    }
  }
});

describe('assertFundlyDb', () => {
  test('rejects missing file', () => {
    expect(() => assertFundlyDb(join(tmpdir(), 'no-such-fundly.db'))).toThrow('database not found');
  });

  test('rejects empty schema', () => {
    const path = tmp('empty.db');
    const db = new Database(path, { create: true });
    db.exec(
      'CREATE TABLE schema_version (version INTEGER PRIMARY KEY, applied_at INTEGER, description TEXT)',
    );
    db.exec('INSERT INTO schema_version (version, applied_at) VALUES (1, 1)');
    db.exec('CREATE TABLE fund_basic_info (fund_code TEXT)');
    db.exec('CREATE TABLE fund_performance (fund_code TEXT)');
    db.exec('CREATE TABLE fund_nav (fund_code TEXT)');
    db.close();
    expect(() => assertFundlyDb(path)).toThrow('empty');
  });

  test('accepts a seeded fundly db', () => {
    const path = tmp('ok.db');
    seedMini(path);
    assertFundlyDb(path);
  });
});

describe('locks', () => {
  test('second acquire fails while pid is alive', () => {
    const sqlite = tmp('lock.db');
    acquireLock(sqlite);
    expect(existsSync(lockPath(sqlite))).toBe(true);
    expect(() => acquireLock(sqlite)).toThrow(`pid ${process.pid}`);
    releaseLock(sqlite);
    acquireLock(sqlite);
    releaseLock(sqlite);
  });

  test('stale lock from dead pid is replaced', () => {
    const sqlite = tmp('stale.db');
    writeFileSync(lockPath(sqlite), '99999999\n');
    expect(processAlive(99999999)).toBe(false);
    acquireLock(sqlite);
    releaseLock(sqlite);
  });

  test('clears leftover snap files', () => {
    const sqlite = tmp('work.db');
    writeFileSync(snapPath(sqlite), 'x');
    clearStaleWorkFiles(sqlite);
    expect(existsSync(snapPath(sqlite))).toBe(false);
  });
});

describe('checkpoint and rename', () => {
  test('busy checkpoint is rejected', () => {
    expect(() => assertCheckpointIdle({ busy: 1 })).toThrow('busy');
    assertCheckpointIdle({ busy: 0 });
  });

  test('exclusive rename refuses to overwrite', async () => {
    const from = tmp('from.bin');
    const to = tmp('to.bin');
    writeFileSync(from, 'a');
    writeFileSync(to, 'b');
    expect(() => exclusiveRename(from, to)).toThrow('refusing to overwrite');
    expect(await Bun.file(to).text()).toBe('b');
  });

  test('exclusive rename moves when dest is free', async () => {
    const from = tmp('move.bin');
    const destDir = from.slice(0, from.lastIndexOf('/'));
    const to = join(destDir, 'dest.bin');
    writeFileSync(from, 'abc');
    exclusiveRename(from, to);
    expect(existsSync(from)).toBe(false);
    expect(await Bun.file(to).text()).toBe('abc');
  });

  test('force replace keeps one prev for the target', () => {
    const dir = tmp('x').slice(0, -1);
    const target = join(dir, 'fundly.db');
    const restored = join(dir, 'fundly.db.restored');
    writeFileSync(target, 'old');
    writeFileSync(restored, 'new');
    const prev = replaceWithForce(restored, target);
    expect(existsSync(target)).toBe(true);
    expect(listTargetPrevs(target)).toEqual([prev]);
  });

  test('recoverInterruptedRestore puts prev back when target is gone', () => {
    const dir = tmp('x').slice(0, -1);
    const target = join(dir, 'fundly.db');
    const prev = `${target}.prev-20260822T010000`;
    seedMini(prev);
    expect(() => recoverInterruptedRestore(target)).toThrow('interrupted replace');
    assertFundlyDb(target);
  });
});

describe('snapshot io', () => {
  test('vacuum + gzip + gunzip round trip', async () => {
    const src = tmp('src.db');
    seedMini(src);
    const dest = `${src}.copy.db`;
    vacuumInto(src, dest);
    assertFundlyDb(dest);
    const gz = `${dest}.gz`;
    await gzipFile(dest, gz);
    const out = `${dest}.out.db`;
    await gunzipFile(gz, out);
    assertFundlyDb(out);
  });

  test('disk precheck rejects huge need', () => {
    expect(() => assertDiskSpace(tmpdir(), Number.MAX_SAFE_INTEGER)).toThrow('free bytes');
  });
});
