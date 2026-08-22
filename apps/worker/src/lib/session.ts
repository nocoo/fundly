import { jwtVerify, SignJWT } from 'jose';

export const SESSION_COOKIE = 'fundly_session';
export const OAUTH_COOKIE = 'fundly_oauth';
export const SESSION_TTL_SEC = 60 * 60 * 24 * 30;
export const OAUTH_TTL_SEC = 60 * 10;

export type SessionUser = {
  email: string;
  name: string | null;
  avatar: string | null;
  sub: string;
};

export type OAuthState = {
  state: string;
  verifier: string;
  redirect: string;
};

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signSession(
  user: SessionUser,
  secret: string,
  ttlSec = SESSION_TTL_SEC,
): Promise<string> {
  return new SignJWT({
    email: user.email,
    name: user.name,
    avatar: user.avatar,
    sub: user.sub,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ttlSec}s`)
    .sign(secretKey(secret));
}

export async function verifySession(token: string, secret: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(secret));
    const email = typeof payload.email === 'string' ? payload.email : '';
    const sub = typeof payload.sub === 'string' ? payload.sub : '';
    if (!email || !sub) return null;
    return {
      email,
      name: typeof payload.name === 'string' ? payload.name : null,
      avatar: typeof payload.avatar === 'string' ? payload.avatar : null,
      sub,
    };
  } catch {
    return null;
  }
}

export async function signOAuthState(
  value: OAuthState,
  secret: string,
  ttlSec = OAUTH_TTL_SEC,
): Promise<string> {
  return new SignJWT(value)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ttlSec}s`)
    .sign(secretKey(secret));
}

export async function verifyOAuthState(token: string, secret: string): Promise<OAuthState | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(secret));
    const state = typeof payload.state === 'string' ? payload.state : '';
    const verifier = typeof payload.verifier === 'string' ? payload.verifier : '';
    const redirect = typeof payload.redirect === 'string' ? payload.redirect : '/';
    if (!state || !verifier) return null;
    return { state, verifier, redirect };
  } catch {
    return null;
  }
}

export function cookieSecure(origin: string): boolean {
  return origin.startsWith('https://');
}

export function safeRedirectPath(raw: string | null | undefined): string {
  if (!raw?.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}
