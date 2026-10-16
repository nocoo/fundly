import type { Context, MiddlewareHandler } from 'hono';

export type OriginPolicy = {
  canonicalOrigin?: string;
  allowedOrigins: readonly string[];
  development: boolean;
};
export function defaultOriginPolicy(canonicalOrigin?: string): OriginPolicy {
  return {
    canonicalOrigin,
    allowedOrigins: (process.env.API_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    development: process.env.NODE_ENV !== 'production',
  };
}
export function isAllowedOrigin(origin: string, requestUrl: string, policy: OriginPolicy): boolean {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) return false;
  if (
    origin === new URL(requestUrl).origin ||
    origin === policy.canonicalOrigin ||
    policy.allowedOrigins.includes(origin)
  )
    return true;
  return policy.development && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
}
export function rejectsMutationOrigin(c: Context, policy: OriginPolicy): boolean {
  const origin = c.req.header('origin');
  return (
    !['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) &&
    origin !== undefined &&
    !isAllowedOrigin(origin, c.req.url, policy)
  );
}
export function apiCors(policy: OriginPolicy): MiddlewareHandler {
  return async (c, next) => {
    c.header('Vary', 'Origin', { append: true });
    const origin = c.req.header('origin');
    const allowed = origin !== undefined && isAllowedOrigin(origin, c.req.url, policy);
    if (allowed) {
      c.header('Access-Control-Allow-Origin', origin);
      c.header('Access-Control-Allow-Credentials', 'true');
    }
    if (c.req.method === 'OPTIONS') {
      if (!allowed) return c.json({ error: 'Origin not allowed' }, 403);
      c.header('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, DELETE, OPTIONS');
      c.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      return c.body(null, 204);
    }
    await next();
  };
}
