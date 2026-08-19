import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import type { AppEnv } from '../lib/types';
import { isLocalhost, looksLocalHost } from './is-localhost';

function makeApp() {
  const app = new Hono<AppEnv>();
  app.get('/probe', (c) => c.json({ local: isLocalhost(c) }));
  return app;
}

async function probe(
  environment: string | undefined,
  url: string,
  host?: string,
): Promise<{ local: boolean }> {
  const headers = host ? { host } : undefined;
  const req = new Request(url, headers ? { headers } : undefined);
  Object.defineProperty(req, 'cf', { value: { colo: 'SJC' } });
  const res = await makeApp().request(req, undefined, { ENVIRONMENT: environment });
  return (await res.json()) as { local: boolean };
}

describe('looksLocalHost', () => {
  it('accepts localhost, loopback, and the Caddy domain', () => {
    expect(looksLocalHost('localhost:8787')).toBe(true);
    expect(looksLocalHost('127.0.0.1:8787')).toBe(true);
    expect(looksLocalHost('fundly.dev.hexly.ai')).toBe(true);
    expect(looksLocalHost('fundly.hexly.ai')).toBe(false);
  });
});

describe('isLocalhost', () => {
  it('bypasses when the request URL is loopback in development', async () => {
    expect(await probe('development', 'http://127.0.0.1:8787/probe')).toEqual({ local: true });
  });

  it('bypasses when only the Host header is the Caddy domain', async () => {
    expect(
      await probe('development', 'http://127.0.0.1:8787/probe', 'fundly.dev.hexly.ai'),
    ).toEqual({
      local: true,
    });
  });

  it('does not bypass when ENVIRONMENT is missing or not development', async () => {
    expect(await probe(undefined, 'http://127.0.0.1:8787/probe')).toEqual({ local: false });
    expect(await probe('production', 'http://127.0.0.1:8787/probe', 'localhost')).toEqual({
      local: false,
    });
    expect(await probe('staging', 'http://fundly.dev.hexly.ai/probe')).toEqual({ local: false });
  });
});
