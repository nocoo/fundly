import { describe, expect, it } from 'bun:test';
import { APP_VERSION } from '../lib/version';
import { livePayload } from './live';

describe('livePayload', () => {
  it('reports ok when DB probe succeeds', async () => {
    const env = {
      DB: {
        prepare: () => ({
          first: async () => ({ ok: 1 }),
        }),
      },
    } as never;
    const body = await livePayload(env);
    expect(body.status).toBe('ok');
    expect(body.version).toBe(APP_VERSION);
    expect(body.database.connected).toBe(true);
  });

  it('reports error when DB binding is missing', async () => {
    const body = await livePayload({} as never);
    expect(body.status).toBe('error');
    expect(body.database.connected).toBe(false);
  });

  it('reports error when DB probe throws', async () => {
    const env = {
      DB: {
        prepare: () => ({
          first: async () => {
            throw new Error('down');
          },
        }),
      },
    } as never;
    const body = await livePayload(env);
    expect(body.status).toBe('error');
    expect(body.database.connected).toBe(false);
  });
});
