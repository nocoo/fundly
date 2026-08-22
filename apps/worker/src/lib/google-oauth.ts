export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

export type GoogleProfile = {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomToken(bytes = 32): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return toBase64Url(new Uint8Array(hash));
}

export function callbackUrl(origin: string): string {
  return `${origin.replace(/\/$/, '')}/api/auth/callback`;
}

export async function buildAuthorizeUrl(input: {
  clientId: string;
  origin: string;
  state: string;
  verifier: string;
}): Promise<string> {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', callbackUrl(input.origin));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', input.state);
  url.searchParams.set('code_challenge', await pkceChallenge(input.verifier));
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('prompt', 'select_account');
  return url.toString();
}

export async function exchangeCode(
  input: {
    clientId: string;
    clientSecret: string;
    origin: string;
    code: string;
    verifier: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleProfile> {
  const tokenRes = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: input.code,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: callbackUrl(input.origin),
      grant_type: 'authorization_code',
      code_verifier: input.verifier,
    }),
  });
  const tokenBody = (await tokenRes.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
  };
  if (!tokenRes.ok || !tokenBody.access_token) {
    throw new Error(tokenBody.error ?? `google token http ${tokenRes.status}`);
  }

  const profileRes = await fetchImpl(GOOGLE_USERINFO_URL, {
    headers: { authorization: `Bearer ${tokenBody.access_token}` },
  });
  const profile = (await profileRes.json().catch(() => ({}))) as Partial<GoogleProfile>;
  if (!profileRes.ok || !profile.email || !profile.sub) {
    throw new Error(`google userinfo http ${profileRes.status}`);
  }
  if (profile.email_verified === false) {
    throw new Error('google email is not verified');
  }
  return {
    sub: profile.sub,
    email: profile.email,
    email_verified: profile.email_verified,
    name: profile.name,
    picture: profile.picture,
  };
}

export function requestOrigin(input: {
  url: string;
  host?: string | null;
  proto?: string | null;
  override?: string | null;
}): string {
  if (input.override?.trim()) return input.override.trim().replace(/\/$/, '');
  const parsed = new URL(input.url);
  const proto = (input.proto ?? parsed.protocol.replace(':', '')).replace(/:$/, '');
  const host = input.host ?? parsed.host;
  return `${proto}://${host}`;
}
