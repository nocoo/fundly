#!/usr/bin/env bun
/** Ephemeral HTTP + SQLite harness for Playwright L4 smoke tests. */

import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { initSchema, openDb } from '../../../src/db/repo.ts';
import { createApi } from '../../worker/scripts/app.ts';
import { loadAuthConfig } from '../../worker/src/lib/auth-config.ts';

const webDir = resolve(import.meta.dirname, '..');
const staticDir = resolve(webDir, '../worker/static');

if (!existsSync(join(staticDir, 'index.html'))) {
  throw new Error(`Built frontend missing at ${staticDir}; run "bun run build:web" first`);
}

const tempDir = await mkdtemp(join(tmpdir(), 'fundly-l4-e2e-'));
const sqlitePath = join(tempDir, 'fundly.db');
const authDbPath = join(tempDir, 'auth.db');

const db = openDb(sqlitePath);
initSchema(db);
db.close();

const app = createApi(sqlitePath, {
  staticDir,
  authDbPath,
  auth: loadAuthConfig({ AUTH_DISABLED: '1' }, true),
  component: 'e2e',
});

const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  fetch: app.fetch,
});

let exitCode = 1;
try {
  const proc = Bun.spawn([resolve(webDir, 'node_modules/.bin/playwright'), 'test'], {
    cwd: webDir,
    env: {
      ...process.env,
      PLAYWRIGHT_BASE_URL: `http://127.0.0.1:${server.port}`,
    },
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  exitCode = await proc.exited;
} finally {
  await server.stop(true);
  await rm(tempDir, { recursive: true, force: true });
}

process.exit(exitCode);
