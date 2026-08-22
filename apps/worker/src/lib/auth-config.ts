export type AuthConfig = {
  enabled: boolean;
  required: boolean;
  clientId: string;
  clientSecret: string;
  sessionSecret: string;
  allowedEmails: string[];
  originOverride?: string;
};

export type AuthEnv = {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
  ALLOWED_EMAILS?: string;
  AUTH_DISABLED?: string;
  AUTH_ORIGIN?: string;
};

export function parseAllowedEmails(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailAllowed(email: string | null | undefined, allowed: string[]): boolean {
  if (allowed.length === 0) return true;
  const normalized = email?.trim().toLowerCase() ?? '';
  return Boolean(normalized) && allowed.includes(normalized);
}

export function loadAuthConfig(
  env: AuthEnv | Record<string, string | undefined>,
  required = false,
): AuthConfig {
  const disabled = env.AUTH_DISABLED === '1';
  const clientId = env.GOOGLE_CLIENT_ID?.trim() ?? '';
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim() ?? '';
  const sessionSecret = env.SESSION_SECRET?.trim() ?? '';
  const originOverride = env.AUTH_ORIGIN?.trim() || undefined;
  const enabled = !disabled && Boolean(clientId && clientSecret && sessionSecret);
  return {
    enabled,
    required: required && !disabled,
    clientId,
    clientSecret,
    sessionSecret,
    allowedEmails: parseAllowedEmails(env.ALLOWED_EMAILS),
    originOverride,
  };
}
