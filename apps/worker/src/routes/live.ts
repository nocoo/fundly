import { Hono } from 'hono';
import type { AppEnv } from '../lib/types';
import { APP_VERSION } from '../lib/version';

const app = new Hono<AppEnv>();
const bootedAt = Date.now();

export async function livePayload(env: AppEnv['Bindings']) {
  let database = { connected: false };
  try {
    if (!env.DB) throw new Error('missing DB binding');
    const row = await env.DB.prepare('SELECT version FROM schema_version LIMIT 1').first();
    if (!row) throw new Error('schema missing');
    database = { connected: true };
  } catch {
    database = { connected: false };
  }
  return {
    status: database.connected ? 'ok' : 'error',
    version: APP_VERSION,
    component: 'worker',
    timestamp: new Date().toISOString(),
    uptime: Math.round((Date.now() - bootedAt) / 1000),
    database,
  };
}

app.get('/api/live', async (c) => {
  const body = await livePayload(c.env);
  return c.json(body, body.status === 'ok' ? 200 : 503, { 'Cache-Control': 'no-store' });
});

export default app;
