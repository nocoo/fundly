import { Hono } from 'hono';
import type { AppEnv } from '../lib/types';
import { APP_VERSION } from '../lib/version';

const app = new Hono<AppEnv>();
const bootedAt = Date.now();

export async function livePayload(_env: AppEnv['Bindings']) {
  return {
    status: 'ok' as const,
    version: APP_VERSION,
    component: 'worker',
    timestamp: new Date().toISOString(),
    uptime: Math.round((Date.now() - bootedAt) / 1000),
  };
}

app.get('/api/live', async (c) => {
  const body = await livePayload(c.env);
  return c.json(body, body.status === 'ok' ? 200 : 503, { 'Cache-Control': 'no-store' });
});

export default app;
