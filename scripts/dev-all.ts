#!/usr/bin/env bun

import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');

const children = [spawnChild(['bun', 'run', 'dev:api']), spawnChild(['bun', 'run', 'dev:web'])];

function spawnChild(cmd: string[]): Bun.Subprocess {
  return Bun.spawn(cmd, {
    cwd: root,
    stdout: 'inherit',
    stderr: 'inherit',
    stdin: 'ignore',
  });
}

let shuttingDown = false;

function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    child.kill();
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('dev:all → api :7045 + web :7044  https://fundly.dev.hexly.ai');

const code = await Promise.race(children.map((child) => child.exited));
shutdown();
await Promise.all(children.map((child) => child.exited));
process.exit(code ?? 1);
