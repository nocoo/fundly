import type { Context } from 'hono';
import type { AppEnv } from '../lib/types';

function looksLocalHost(host: string): boolean {
  return (
    host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.endsWith('.dev.hexly.ai')
  );
}

/**
 * Local API bypass is env-gated, not `request.cf`-gated.
 * Wrangler 4 injects `cf` even in `wrangler dev`, so treating `cf` as
 * "real edge" would reject Vite/Caddy traffic after Host rewrite.
 *
 * Production (`ENVIRONMENT=production`) never bypasses.
 * Any other environment trusts localhost / 127.0.0.1 / *.dev.hexly.ai.
 */
export function isLocalhost(c: Context<AppEnv>): boolean {
  if (c.env.ENVIRONMENT === 'production') return false;
  return looksLocalHost(c.req.header('host') || '');
}
