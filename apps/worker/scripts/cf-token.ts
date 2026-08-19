import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

export function cloudflareApiToken(): string {
  const env = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (env) return env;
  const wrangler =
    process.env.WRANGLER_BIN ?? resolve(import.meta.dirname, '../node_modules/.bin/wrangler');
  const res = spawnSync(wrangler, ['auth', 'token'], { encoding: 'utf8' });
  const token = res.stdout.trim().split('\n').at(-1)?.trim() ?? '';
  if (res.status !== 0 || !token) {
    throw new Error(
      res.stderr.trim() || 'CLOUDFLARE_API_TOKEN missing; wrangler auth token failed',
    );
  }
  return token;
}
