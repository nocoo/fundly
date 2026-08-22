import { describe, expect, it } from 'bun:test';
import { APP_VERSION } from '../lib/version';
import { livePayload } from './live';

describe('livePayload', () => {
  it('reports ok without a database binding', async () => {
    const body = await livePayload({} as never);
    expect(body.status).toBe('ok');
    expect(body.version).toBe(APP_VERSION);
  });
});
