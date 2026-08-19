import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { AppEnv } from './lib/types';
import { accessAuth } from './middleware/access-auth';
import liveRoutes from './routes/live';
import meRoutes from './routes/me';

const app = new Hono<AppEnv>();

app.use('*', secureHeaders());
app.use('/api/*', accessAuth);

app.route('/', liveRoutes);
app.route('/', meRoutes);

export default app;
