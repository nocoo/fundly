import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { apiNotFound, mutableAssetResponse } from './lib/assets';
import type { AppEnv } from './lib/types';
import { accessAuth } from './middleware/access-auth';
import dataRoutes from './routes/data';
import liveRoutes from './routes/live';
import meRoutes from './routes/me';

const app = new Hono<AppEnv>();

app.use('*', secureHeaders());
app.use('/api/*', accessAuth);

app.route('/', liveRoutes);
app.route('/', meRoutes);
app.route('/', dataRoutes);

app.all('/api/*', () => apiNotFound());

app.all('*', async (c) => {
  const res = await c.env.ASSETS.fetch(c.req.raw);
  return mutableAssetResponse(res);
});

export default app;
