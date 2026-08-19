import { describe, expect, test } from 'bun:test';
import { fetchText, HttpError } from '../src/utils/http.ts';

describe('HttpError', () => {
  test('carries status and url', () => {
    const err = new HttpError('boom', 500, 'http://x');
    expect(err.name).toBe('HttpError');
    expect(err.message).toBe('boom');
    expect(err.httpCode).toBe(500);
    expect(err.url).toBe('http://x');
  });
});

describe('fetchText (integration with mock server)', () => {
  test('returns text on 200', async () => {
    const server = Bun.serve({
      port: 0,
      fetch: () => new Response('hello world', { status: 200 }),
    });
    try {
      const text = await fetchText(`http://localhost:${server.port}/`);
      expect(text).toBe('hello world');
    } finally {
      server.stop(true);
    }
  });

  test('retries on 500 then throws', async () => {
    let calls = 0;
    const server = Bun.serve({
      port: 0,
      fetch: () => {
        calls += 1;
        return new Response('err', { status: 500 });
      },
    });
    try {
      await expect(
        fetchText(`http://localhost:${server.port}/`, { retries: 2, timeout: 2000 }),
      ).rejects.toThrow('HTTP 500');
      expect(calls).toBe(3); // 1 + 2 retries
    } finally {
      server.stop(true);
    }
  });

  test('retries on 429 then succeeds', async () => {
    let calls = 0;
    const server = Bun.serve({
      port: 0,
      fetch: () => {
        calls += 1;
        if (calls < 2) return new Response('rate limited', { status: 429 });
        return new Response('ok now', { status: 200 });
      },
    });
    try {
      const text = await fetchText(`http://localhost:${server.port}/`, {
        retries: 2,
        timeout: 2000,
      });
      expect(text).toBe('ok now');
      expect(calls).toBe(2);
    } finally {
      server.stop(true);
    }
  });

  test('throws on 404 without retry', async () => {
    let calls = 0;
    const server = Bun.serve({
      port: 0,
      fetch: () => {
        calls += 1;
        return new Response('nope', { status: 404 });
      },
    });
    try {
      await expect(fetchText(`http://localhost:${server.port}/`, { retries: 2 })).rejects.toThrow(
        'HTTP 404',
      );
      expect(calls).toBe(1);
    } finally {
      server.stop(true);
    }
  });
});
