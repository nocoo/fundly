#!/usr/bin/env bun
/** Local API: reads FUNDLY_SQLITE / data/fundly.db */

import { createApi, defaultSqlitePath } from './app.ts';

const PORT = Number(process.env.FUNDLY_API_PORT ?? 7045);
const SQLITE_PATH = defaultSqlitePath();
const app = createApi(SQLITE_PATH);

export default {
  port: PORT,
  fetch: app.fetch,
};

console.log(`fundly local api http://127.0.0.1:${PORT} sqlite=${SQLITE_PATH}`);
