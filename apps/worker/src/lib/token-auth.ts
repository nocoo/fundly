import type { Context, Hono } from 'hono';
import { TOKEN_SCOPES, type TokenScope, type TokenStore } from './api-tokens';
import type { AuthConfig } from './auth-config';
import { readSessionUser, requireSession } from './auth-routes';
import { defaultOriginPolicy, type OriginPolicy, rejectsMutationOrigin } from './origin-policy';
import { READ_RESOURCES } from './read-resources';

export const ROUTE_SCOPES: readonly { path: RegExp; scope: TokenScope }[] = [
  { path: /^\/api\/(?:funds(?:\/[^/]+(?:\/(?:nav|siblings))?)?|fund-types)$/, scope: 'funds:read' },
  {
    path: /^\/api\/market\/(?:overview|bars\/[^/]+|series\/[^/]+|industries\/[^/]+\/constituents|etfs\/[^/]+)$/,
    scope: 'market:read',
  },
  { path: /^\/api\/selection\/(?:stocks|etfs)(?:\/[^/]+(?:\/bars)?)?$/, scope: 'stocks:read' },
  { path: /^\/api\/daily(?:\/[^/]+)?$/, scope: 'daily:read' },
  { path: /^\/api\/(?:stats|source)$/, scope: 'stats:read' },
  ...READ_RESOURCES.map((resource) => ({
    path: new RegExp(`^${resource.path}$`),
    scope: resource.scope,
  })),
];
export function scopeForPath(path: string): TokenScope | undefined {
  return ROUTE_SCOPES.find((rule) => rule.path.test(path))?.scope;
}
export async function requireSessionOrToken(
  c: Context,
  auth: AuthConfig,
  store: TokenStore,
  next: () => Promise<void>,
  originPolicy: OriginPolicy = defaultOriginPolicy(auth.originOverride),
): Promise<Response | undefined> {
  if (rejectsMutationOrigin(c, originPolicy)) return c.json({ error: 'Origin not allowed' }, 403);
  if (await readSessionUser(c, auth)) {
    await next();
    return;
  }
  const authorization = c.req.header('authorization');
  if (!authorization) return requireSession(c, auth, next);
  c.header('Cache-Control', 'no-store');
  if (!['GET', 'HEAD'].includes(c.req.method))
    return c.json({ error: 'Tokens are read-only' }, 403);
  const scope = scopeForPath(c.req.path);
  if (!scope) return c.json({ error: 'Session required' }, 403);
  const match = /^Bearer (fdk_\S+)$/.exec(authorization);
  const token = match ? store.authenticate(match[1] ?? '') : null;
  if (!token) return c.json({ error: 'Invalid or expired token' }, 401);
  if (!token.scopes.includes('*:read') && !token.scopes.includes(scope))
    return c.json({ error: 'Insufficient scope' }, 403);
  await next();
}
export function registerTokenRoutes(app: Hono, auth: AuthConfig, store: TokenStore): void {
  const sessionOnly = async (c: Context, next: () => Promise<void>) => {
    c.header('Cache-Control', 'no-store');
    if (!(await readSessionUser(c, auth))) return c.json({ error: 'Session required' }, 401);
    if (
      c.req.method === 'POST' &&
      c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json'
    ) {
      return c.json({ error: 'Content-Type must be application/json' }, 415);
    }
    await next();
  };
  app.use('/api/tokens', sessionOnly);
  app.use('/api/tokens/*', sessionOnly);
  app.get('/api/tokens', (c) => c.json({ items: store.list() }));
  app.post('/api/tokens', async (c) => {
    const user = await readSessionUser(c, auth);
    if (!user) return c.json({ error: 'Session required' }, 401);
    const body: unknown = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object') return c.json({ error: 'Invalid JSON object' }, 400);
    const { name, scopes, expires_in_days: days } = body as Record<string, unknown>;
    if (
      typeof name !== 'string' ||
      !name.trim() ||
      name.trim().length > 100 ||
      !Array.isArray(scopes) ||
      !scopes.length ||
      !scopes.every(
        (scope: unknown) => typeof scope === 'string' && TOKEN_SCOPES.includes(scope as TokenScope),
      ) ||
      (days !== undefined &&
        (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > 3650))
    )
      return c.json(
        { error: 'Provide name (1–100 chars), valid scopes, and optional expiry (1–3650 days)' },
        400,
      );
    return c.json(
      store.create(
        name.trim(),
        [...new Set(scopes)] as TokenScope[],
        user.email,
        days as number | undefined,
      ),
      201,
    );
  });
  app.post('/api/tokens/:id/revoke', (c) =>
    store.revoke(c.req.param('id')) ? c.json({ ok: true }) : c.json({ error: 'Not found' }, 404),
  );
  app.delete('/api/tokens/:id', (c) => {
    const result = store.delete(c.req.param('id'));
    return result === 'deleted'
      ? c.json({ ok: true })
      : result === 'active'
        ? c.json({ error: 'Revoke token before deleting' }, 409)
        : c.json({ error: 'Not found' }, 404);
  });
}
