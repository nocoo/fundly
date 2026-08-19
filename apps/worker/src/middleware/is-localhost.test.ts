import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import type { AppEnv } from '../lib/types';
import { isLocalhost } from './is-localhost';

function makeApp() {
  const app = new Hono<AppEnv>();
  app.get('/probe', (c) => c.json({ local: isLocalhost(c) }));
  return app;
}

async function probe(
  environment: string | undefined,
  host: string,
  withCf: boolean,
): Promise<{ local: boolean }> {
  const req = new Request('http://127.0.0.1:8787/probe', { headers: { host } });
  if (withCf) Object.defineProperty(req, 'cf', { value: { colo: 'SJC' } });
  const res = await makeApp().request(req, undefined, { ENVIRONMENT: environment });
  return (await res.json()) as { local: boolean };
}

describe('isLocalhost', () => {
  it('bypasses wrangler-style cf + 127.0.0.1 in development', async () => {
    expect(await probe('development', '127.0.0.1:8787', true)).toEqual({ local: true });
  });

  it('bypasses fundly.dev.hexly.ai in development even with cf', async () => {
    expect(await probe('development', 'fundly.dev.hexly.ai', true)).toEqual({ local: true });
  });

  it('never bypasses in production, even with a local Host', async () => {
    expect(await probe('production', 'localhost:8787', true)).toEqual({ local: false });
    expect(await probe('production', 'fundly.dev.hexly.ai', true)).toEqual({ local: false });
  });
});
