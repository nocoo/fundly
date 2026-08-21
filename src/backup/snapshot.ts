import { Database } from 'bun:sqlite';
import {
  closeSync,
  constants,
  createReadStream,
  createWriteStream,
  existsSync,
  linkSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  statfsSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createGzip } from 'node:zlib';
import { SCHEMA_VERSION } from '../db/schema.ts';

export function snapPath(sqlite: string): string {
  return `${sqlite}.backy-snap.db`;
}

export function snapGzipPath(sqlite: string): string {
  return `${sqlite}.backy-snap.db.gz`;
}

export function lockPath(sqlite: string): string {
  return `${sqlite}.backy.lock`;
}

export function downloadPath(target: string): string {
  return `${target}.backy-dl.gz`;
}

export function restoredPath(target: string): string {
  return `${target}.restored`;
}

export function assertDiskSpace(dir: string, needBytes: number): void {
  const info = statfsSync(dir);
  const free = Number(info.bavail) * Number(info.bsize);
  if (free < needBytes) {
    throw new Error(`need ${needBytes} free bytes under ${dir}, have ${free}`);
  }
}

export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readLockPid(path: string): number | null {
  try {
    const n = Number(readFileSync(path, 'utf8').trim());
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function acquireLock(sqlite: string): void {
  const path = lockPath(sqlite);
  try {
    const fd = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY);
    writeFileSync(fd, `${process.pid}\n`);
    closeSync(fd);
    return;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== 'EEXIST') throw error;
  }
  const pid = readLockPid(path);
  if (pid && processAlive(pid)) {
    throw new Error(`backup lock held by pid ${pid}`);
  }
  try {
    unlinkSync(path);
  } catch {
    /* gone */
  }
  const fd = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY);
  writeFileSync(fd, `${process.pid}\n`);
  closeSync(fd);
}

export function releaseLock(sqlite: string): void {
  try {
    unlinkSync(lockPath(sqlite));
  } catch {
    /* already gone */
  }
}

export function removeIfExists(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    /* missing */
  }
}

export function clearStaleWorkFiles(sqlite: string): void {
  removeIfExists(snapPath(sqlite));
  removeIfExists(snapGzipPath(sqlite));
  removeIfExists(downloadPath(sqlite));
  removeIfExists(restoredPath(sqlite));
}

export function openExisting(path: string, readwrite: boolean): Database {
  if (!existsSync(path)) throw new Error(`database not found: ${path}`);
  return new Database(path, readwrite ? { create: false } : { create: false, readonly: true });
}

export function assertFundlyDb(path: string): void {
  const db = openExisting(path, false);
  try {
    const version = db.query('SELECT version FROM schema_version LIMIT 1').get() as {
      version: number;
    } | null;
    if (version?.version !== SCHEMA_VERSION) {
      throw new Error(`unexpected schema_version: ${version?.version ?? 'missing'}`);
    }
    for (const table of ['fund_basic_info', 'fund_performance', 'fund_nav'] as const) {
      const row = db
        .query(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?`)
        .get(table) as { ok: number } | null;
      if (!row) throw new Error(`missing table ${table}`);
    }
    const basic = db.query('SELECT COUNT(*) AS n FROM fund_basic_info').get() as { n: number };
    const nav = db.query('SELECT COUNT(*) AS n FROM fund_nav').get() as { n: number };
    if (basic.n <= 0 || nav.n <= 0) throw new Error('fundly database is empty');
  } finally {
    db.close();
  }
}

export function assertCheckpointIdle(row: { busy: number }): void {
  if (row.busy !== 0) throw new Error('database is busy; stop other processes first');
}

export function checkpointWal(path: string): void {
  const db = openExisting(path, true);
  try {
    const row = db.query('PRAGMA wal_checkpoint(TRUNCATE)').get() as { busy: number };
    assertCheckpointIdle(row);
  } finally {
    db.close();
  }
}

export async function gzipFile(src: string, dest: string): Promise<void> {
  await pipeline(createReadStream(src), createGzip({ level: 6 }), createWriteStream(dest));
}

export async function gunzipFile(src: string, dest: string): Promise<void> {
  await pipeline(createReadStream(src), createGunzip(), createWriteStream(dest));
}

export function vacuumInto(src: string, dest: string): void {
  removeIfExists(dest);
  const db = openExisting(src, false);
  try {
    db.exec(`VACUUM INTO ${sqlString(dest)}`);
  } finally {
    db.close();
  }
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function exclusiveRename(from: string, to: string): void {
  try {
    linkSync(from, to);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'EEXIST') throw new Error(`refusing to overwrite ${to}`);
    throw error;
  }
  unlinkSync(from);
}

export function prevStamp(now = new Date()): string {
  return now.toISOString().replaceAll(/[-:]/g, '').replace('T', 'T').slice(0, 15);
}

export function listTargetPrevs(target: string): string[] {
  const dir = dirname(target);
  const prefix = `${target.split('/').pop()}.prev-`;
  return readdirSync(dir)
    .filter((name) => name.startsWith(prefix))
    .map((name) => `${dir}/${name}`)
    .sort();
}

export function rotatePrev(target: string, keep: string): void {
  for (const path of listTargetPrevs(target)) {
    if (path !== keep) removeIfExists(path);
  }
}

export function replaceWithForce(restored: string, target: string): string {
  const prev = `${target}.prev-${prevStamp()}`;
  renameSync(target, prev);
  try {
    renameSync(restored, target);
  } catch (error) {
    renameSync(prev, target);
    throw error;
  }
  rotatePrev(target, prev);
  removeIfExists(`${target}-wal`);
  removeIfExists(`${target}-shm`);
  return prev;
}

export function recoverInterruptedRestore(target: string): void {
  removeIfExists(downloadPath(target));
  removeIfExists(restoredPath(target));
  if (existsSync(target)) return;
  const prevs = listTargetPrevs(target);
  const latest = prevs.at(-1);
  if (!latest) return;
  try {
    assertFundlyDb(latest);
  } catch {
    return;
  }
  renameSync(latest, target);
  throw new Error('restored previous database after interrupted replace');
}

export function backupNeedBytes(sqlite: string): number {
  return Math.ceil(statSync(sqlite).size * 1.2);
}

export function restoreNeedBytes(gzipBytes: number): number {
  return gzipBytes + Math.ceil(gzipBytes * 6);
}
