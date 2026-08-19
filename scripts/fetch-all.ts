#!/usr/bin/env bun
/**
 * 一键跑：init-db → fetch-list → fetch-nav
 * Usage: bun run scripts/fetch-all.ts [db_path]
 */

import { spawnSync } from 'node:child_process';

const dbPath = process.argv[2];
const args = dbPath ? [dbPath] : [];

const steps = [
  ['scripts/init-db.ts', ...args],
  ['scripts/fetch-fund-list.ts', ...args],
  ['scripts/fetch-fund-nav.ts', ...args],
];

for (const step of steps) {
  const script = step[0] as string;
  const rest = step.slice(1);
  console.log(`\n=== running ${script} ===\n`);
  const res = spawnSync('bun', ['run', script, ...rest], { stdio: 'inherit' });
  if (res.status !== 0) {
    console.error(`step failed: ${script}`);
    process.exit(res.status ?? 1);
  }
}
