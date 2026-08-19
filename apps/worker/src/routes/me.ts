import { Hono } from 'hono';
import type { AppEnv } from '../lib/types';

export interface AccessJwtPayload {
  email?: string;
  name?: string;
}

export function decodeJwtPayload(jwt: string): AccessJwtPayload | null {
  const parts = jwt.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const payload = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(payload) as AccessJwtPayload;
  } catch {
    return null;
  }
}

const app = new Hono<AppEnv>();

app.get('/api/me', (c) => {
  const ctxEmail = c.get('accessEmail');
  if (ctxEmail) {
    return c.json({
      email: ctxEmail,
      name: ctxEmail.split('@')[0] ?? null,
      avatar: null,
      authenticated: true,
    });
  }

  const jwt = c.req.header('Cf-Access-Jwt-Assertion');
  if (!jwt) {
    return c.json({
      email: null,
      name: null,
      avatar: null,
      authenticated: false,
    });
  }

  const payload = decodeJwtPayload(jwt);
  if (!payload) {
    return c.json({
      email: null,
      name: null,
      avatar: null,
      authenticated: false,
    });
  }

  const email = payload.email ?? null;
  return c.json({
    email,
    name: payload.name ?? email?.split('@')[0] ?? null,
    avatar: null,
    authenticated: true,
  });
});

export default app;
