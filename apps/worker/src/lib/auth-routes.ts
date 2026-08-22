import type { Context, Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AuthConfig } from './auth-config';
import { isEmailAllowed } from './auth-config';
import { buildAuthorizeUrl, exchangeCode, randomToken, requestOrigin } from './google-oauth';
import {
  cookieSecure,
  OAUTH_COOKIE,
  OAUTH_TTL_SEC,
  SESSION_COOKIE,
  SESSION_TTL_SEC,
  safeRedirectPath,
  signOAuthState,
  signSession,
  verifyOAuthState,
  verifySession,
} from './session';

export type MeResponse = {
  email: string | null;
  name: string | null;
  avatar: string | null;
  authenticated: boolean;
  authRequired: boolean;
};

function originOf(c: Context, auth: AuthConfig): string {
  return requestOrigin({
    url: c.req.url,
    host: c.req.header('x-forwarded-host') ?? c.req.header('host'),
    proto: c.req.header('x-forwarded-proto'),
    override: auth.originOverride,
  });
}

function cookieOpts(origin: string, maxAge: number) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax' as const,
    secure: cookieSecure(origin),
    maxAge,
  };
}

export async function readSessionUser(c: Context, auth: AuthConfig) {
  if (!auth.enabled) return null;
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  return verifySession(token, auth.sessionSecret);
}

export function mePayload(
  auth: AuthConfig,
  user: Awaited<ReturnType<typeof readSessionUser>>,
): MeResponse {
  if (!user) {
    return {
      email: null,
      name: null,
      avatar: null,
      authenticated: false,
      authRequired: auth.required || auth.enabled,
    };
  }
  return {
    email: user.email,
    name: user.name,
    avatar: user.avatar,
    authenticated: true,
    authRequired: auth.required || auth.enabled,
  };
}

export function registerAuthRoutes(app: Hono, auth: AuthConfig): void {
  app.get('/api/me', async (c) => c.json(mePayload(auth, await readSessionUser(c, auth))));

  app.get('/api/auth/google', async (c) => {
    if (!auth.enabled) return c.json({ error: 'auth not configured' }, 503);
    const origin = originOf(c, auth);
    const state = randomToken(16);
    const verifier = randomToken(32);
    const redirect = safeRedirectPath(c.req.query('from'));
    setCookie(
      c,
      OAUTH_COOKIE,
      await signOAuthState({ state, verifier, redirect }, auth.sessionSecret),
      cookieOpts(origin, OAUTH_TTL_SEC),
    );
    return c.redirect(
      await buildAuthorizeUrl({
        clientId: auth.clientId,
        origin,
        state,
        verifier,
      }),
    );
  });

  app.get('/api/auth/callback', async (c) => {
    const fail = (code: string) => c.redirect(`/login?error=${code}`);
    if (!auth.enabled) return fail('OAuthFailed');
    if (c.req.query('error')) return fail('OAuthFailed');
    const code = c.req.query('code');
    const state = c.req.query('state');
    const pending = await verifyOAuthState(getCookie(c, OAUTH_COOKIE) ?? '', auth.sessionSecret);
    deleteCookie(c, OAUTH_COOKIE, { path: '/' });
    if (!code || !state || !pending || pending.state !== state) return fail('OAuthFailed');

    let profile: Awaited<ReturnType<typeof exchangeCode>>;
    try {
      profile = await exchangeCode({
        clientId: auth.clientId,
        clientSecret: auth.clientSecret,
        origin: originOf(c, auth),
        code,
        verifier: pending.verifier,
      });
    } catch {
      return fail('OAuthFailed');
    }

    if (!isEmailAllowed(profile.email, auth.allowedEmails)) return fail('AccessDenied');

    const origin = originOf(c, auth);
    setCookie(
      c,
      SESSION_COOKIE,
      await signSession(
        {
          email: profile.email,
          name: profile.name ?? null,
          avatar: profile.picture ?? null,
          sub: profile.sub,
        },
        auth.sessionSecret,
      ),
      cookieOpts(origin, SESSION_TTL_SEC),
    );
    return c.redirect(safeRedirectPath(pending.redirect));
  });

  app.post('/api/auth/logout', (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    deleteCookie(c, OAUTH_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });
}

export async function requireSession(
  c: Context,
  auth: AuthConfig,
  next: () => Promise<void>,
): Promise<Response | undefined> {
  const path = new URL(c.req.url).pathname;
  if (path === '/api/live' || path === '/api/me' || path.startsWith('/api/auth/')) {
    await next();
    return;
  }
  if (!auth.enabled && !auth.required) {
    await next();
    return;
  }
  if (!auth.enabled && auth.required) {
    return c.json({ error: 'auth not configured' }, 503);
  }
  const user = await readSessionUser(c, auth);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  await next();
}
