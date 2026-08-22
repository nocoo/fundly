#!/usr/bin/env bun
import { DEFAULT_DB_PATH } from '../src/db/repo.ts';

const path = process.argv[2] ?? process.env.FUNDLY_SQLITE ?? DEFAULT_DB_PATH;
const steps = [
  {
    cmd: ['bun', 'run', 'scripts/fetch-daily.ts', path],
    env: { FUNDLY_DAILY_POOL: 'all', FUNDLY_DAILY_STRICT: '1' },
  },
  { cmd: ['bun', 'run', 'scripts/refresh-ranks.ts', path], env: {} },
  { cmd: ['bun', 'run', 'scripts/compute-risk-metrics.ts', path], env: {} },
  { cmd: ['bun', 'run', 'scripts/compute-select-metrics.ts', path], env: {} },
];

for (const step of steps) {
  const proc = Bun.spawnSync({
    cmd: step.cmd,
    env: { ...process.env, ...step.env },
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if (proc.exitCode !== 0) {
    process.exit(proc.exitCode ?? 1);
  }
}
