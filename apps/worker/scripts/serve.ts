#!/usr/bin/env bun
/** Production server: API + Vite static, sqlite on FUNDLY_SQLITE. */

import { resolve } from 'node:path';
import { createApi, defaultSqlitePath } from './app.ts';

const PORT = Number(process.env.PORT ?? process.env.FUNDLY_API_PORT ?? 8080);
const SQLITE_PATH = defaultSqlitePath();
const STATIC_DIR = resolve(import.meta.dirname, '../static');
const app = createApi(SQLITE_PATH, { staticDir: STATIC_DIR, component: 'railway' });

export default {
  port: PORT,
  hostname: '0.0.0.0',
  fetch: app.fetch,
};

console.log(`fundly serve :${PORT} sqlite=${SQLITE_PATH} static=${STATIC_DIR}`);
