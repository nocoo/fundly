import { Database } from 'bun:sqlite';
import { chmodSync } from 'node:fs';

/** A separate SQLite lock is held during collection; the OS releases it after a crash. */
export function acquireMarketLock(sqlitePath: string): () => void {
  const path = `${sqlitePath}.macro.lock`;
  const lock = new Database(path, { create: true });
  try {
    chmodSync(path, 0o600);
    lock.exec('PRAGMA busy_timeout = 0');
    lock.exec('CREATE TABLE IF NOT EXISTS collection_guard (id INTEGER PRIMARY KEY)');
    lock.exec('BEGIN EXCLUSIVE');
  } catch (error) {
    lock.close();
    const code = (error as { code?: string }).code;
    if (code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED') {
      throw new Error('Another macro collector is already running for this SQLite database');
    }
    throw error;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    try {
      if (lock.inTransaction) lock.exec('ROLLBACK');
    } finally {
      lock.close();
    }
  };
}
