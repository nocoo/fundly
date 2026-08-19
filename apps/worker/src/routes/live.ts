import { Hono } from 'hono';
import type { AppEnv } from '../lib/types';

const app = new Hono<AppEnv>();
const bootedAt = Date.now();

app.get('/api/live', (c) => {
  return c.json(
    {
      status: 'ok',
      version: '0.1.0',
      component: 'worker',
      timestamp: new Date().toISOString(),
      uptime: Math.round((Date.now() - bootedAt) / 1000),
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
});

export default app;
