import type { Context } from 'hono';
import type { AppEnv } from '../lib/types';

export function looksLocalHost(host: string): boolean {
  const hostname = host.split(':')[0] ?? '';
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.dev.hexly.ai');
}

function requestHosts(c: Context<AppEnv>): string[] {
  const hosts = [c.req.header('host') || ''];
  try {
    hosts.push(new URL(c.req.url).hostname);
  } catch {
    // ignore malformed urls
  }
  return hosts;
}

/**
 * Only `ENVIRONMENT=development` may bypass Access.
 * Production and any unknown/missing env stay fail-closed.
 * Check both the Host header and the request URL hostname — Wrangler
 * local often keeps the URL on 127.0.0.1 even when Vite forwards a
 * `fundly.dev.hexly.ai` Host.
 */
export function isLocalhost(c: Context<AppEnv>): boolean {
  if (c.env.ENVIRONMENT !== 'development') return false;
  return requestHosts(c).some(looksLocalHost);
}
