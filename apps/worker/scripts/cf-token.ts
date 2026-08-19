import { readFileSync } from 'node:fs';

export function cloudflareApiToken(): string {
  const env = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (env) return env;
  const text = readFileSync(
    `${process.env.HOME}/Library/Preferences/.wrangler/config/default.toml`,
    'utf8',
  );
  const line = text.split('\n').find((l) => l.startsWith('oauth_token'));
  if (!line) throw new Error('CLOUDFLARE_API_TOKEN or wrangler oauth_token not found');
  return line.split('=', 2)[1]?.trim().replaceAll('"', '') ?? '';
}
