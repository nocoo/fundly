#!/usr/bin/env bun
import { writeBackupJob } from '../src/backup/job.ts';
import { resolveEnvironment, resolveSqlite, runBackup } from '../src/backup/run.ts';
import { logger } from '../src/utils/logger.ts';

const sqlite = resolveSqlite();
const startedAt = new Date().toISOString();
writeBackupJob(sqlite, { status: 'running', pid: process.pid, startedAt });

try {
  const created = await runBackup({ environment: resolveEnvironment() });
  writeBackupJob(sqlite, {
    status: 'ok',
    pid: process.pid,
    startedAt,
    finishedAt: new Date().toISOString(),
    id: created.id,
    file_size: created.file_size,
  });
  logger.info('backup uploaded', created);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  writeBackupJob(sqlite, {
    status: 'error',
    pid: process.pid,
    startedAt,
    finishedAt: new Date().toISOString(),
    message,
  });
  logger.error('backup failed', { message });
  process.exitCode = 1;
}
