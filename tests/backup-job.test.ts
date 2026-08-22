import { describe, expect, test } from 'bun:test';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveBackupJob, writeBackupJob } from '../src/backup/job.ts';

function tmpSqlite(): string {
  const dir = join(tmpdir(), `fundly-job-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return join(dir, 'fundly.db');
}

describe('backup job file', () => {
  test('marks a running job with a dead pid as error', () => {
    const sqlite = tmpSqlite();
    writeBackupJob(sqlite, {
      status: 'running',
      pid: 99999999,
      startedAt: '2026-08-22T00:00:00.000Z',
    });
    const job = resolveBackupJob(sqlite);
    expect(job?.status).toBe('error');
    expect(job?.message).toContain('exited');
  });

  test('keeps a live pid as running', () => {
    const sqlite = tmpSqlite();
    writeBackupJob(sqlite, {
      status: 'running',
      pid: process.pid,
      startedAt: '2026-08-22T00:00:00.000Z',
    });
    expect(resolveBackupJob(sqlite)?.status).toBe('running');
  });
});
