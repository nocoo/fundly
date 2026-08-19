import { describe, expect, it } from 'bun:test';
import { apiNotFound, mutableAssetResponse } from './assets';

describe('mutableAssetResponse', () => {
  it('returns a response whose headers can be mutated', () => {
    const original = new Response('ok', { headers: { 'content-type': 'text/html' } });
    const copy = mutableAssetResponse(original);
    expect(copy).not.toBe(original);
    copy.headers.set('x-frame-options', 'SAMEORIGIN');
    expect(copy.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(copy.headers.get('content-type')).toContain('text/html');
  });
});

describe('apiNotFound', () => {
  it('returns JSON 404', async () => {
    const res = apiNotFound();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
  });
});
