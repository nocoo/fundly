import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import type { AppEnv } from '../lib/types';
import { isLocalhost } from './is-localhost';

function makeApp() {
  const app = new Hono<AppEnv>();
  app.get('/probe', (c) => c.json({ local: isLocalhost(c) }));
  return app;
}

describe('isLocalhost', () => {
  it('treats localhost without cf as local', async () => {
    const res = await makeApp().request('http://localhost:8787/probe', {
      headers: { host: 'localhost:8787' },
    });
    expect(await res.json()).toEqual({ local: true });
  });

  it('treats fundly.dev.hexly.ai without cf as local', async () => {
    const res = await makeApp().request('https://fundly.dev.hexly.ai/probe', {
      headers: { host: 'fundly.dev.hexly.ai' },
    });
    expect(await res.json()).toEqual({ local: true });
  });

  it('rejects a spoofed localhost Host when cf is present', async () => {
    const req = new Request('https://fundly.hexly.ai/probe', {
      headers: { host: 'localhost' },
    });
    Object.defineProperty(req, 'cf', { value: { colo: 'SJC' } });
    const res = await makeApp().request(req);
    expect(await res.json()).toEqual({ local: false });
  });
});
