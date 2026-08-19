import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

export function tokenFromWranglerJson(stdout: string): string {
  const parsed = JSON.parse(stdout) as { token?: unknown; access_token?: unknown };
  const token = parsed.token ?? parsed.access_token;
  if (typeof token !== 'string' || !token)
    throw new Error('wrangler auth token json missing token');
  return token;
}

export function cloudflareApiToken(): string {
  const env = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (env) return env;
  const wrangler =
    process.env.WRANGLER_BIN ?? resolve(import.meta.dirname, '../node_modules/.bin/wrangler');
  const res = spawnSync(wrangler, ['auth', 'token', '--json'], { encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error(
      res.stderr.trim() || 'CLOUDFLARE_API_TOKEN missing; wrangler auth token failed',
    );
  }
  return tokenFromWranglerJson(res.stdout);
}
