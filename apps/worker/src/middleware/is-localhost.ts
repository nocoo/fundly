import type { Context } from 'hono';
import type { AppEnv } from '../lib/types';

/**
 * Host headers are attacker-controlled. On Workers, `cf` is only present
 * when the request traversed the Cloudflare edge.
 *
 * 1. Edge (`cf` present): only `*.dev.hexly.ai` is treated as local.
 * 2. No `cf` (wrangler dev / unit tests): localhost, 127.0.0.1, *.dev.hexly.ai.
 */
export function isLocalhost(c: Context<AppEnv>): boolean {
  const host = c.req.header('host') || '';
  const onCfEdge = Boolean((c.req.raw as { cf?: unknown }).cf);

  if (onCfEdge) {
    return host.endsWith('.dev.hexly.ai');
  }

  return (
    host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.endsWith('.dev.hexly.ai')
  );
}
