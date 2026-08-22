import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export type BackupJob = {
  status: 'running' | 'ok' | 'error';
  pid?: number;
  startedAt: string;
  finishedAt?: string;
  message?: string;
  id?: string;
  file_size?: number;
};

export function jobPath(sqlite: string): string {
  return `${sqlite}.backy-job.json`;
}

export function readBackupJob(sqlite: string): BackupJob | null {
  const path = jobPath(sqlite);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as BackupJob;
  } catch {
    return null;
  }
}

export function writeBackupJob(sqlite: string, job: BackupJob): void {
  writeFileSync(jobPath(sqlite), `${JSON.stringify(job)}\n`);
}

export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function resolveBackupJob(sqlite: string): BackupJob | null {
  const job = readBackupJob(sqlite);
  if (!job) return null;
  if (job.status === 'running' && job.pid && !processAlive(job.pid)) {
    const dead: BackupJob = {
      ...job,
      status: 'error',
      finishedAt: new Date().toISOString(),
      message: 'backup process exited without finishing',
    };
    writeBackupJob(sqlite, dead);
    return dead;
  }
  return job;
}

export function isBackupRunning(sqlite: string): boolean {
  const job = resolveBackupJob(sqlite);
  return job?.status === 'running';
}
