import { describe, expect, test } from 'bun:test';
import { ConcurrencyPool, RateLimiter, sleep } from '../src/utils/pool.ts';

describe('sleep', () => {
  test('waits at least the requested ms', async () => {
    const t0 = Date.now();
    await sleep(30);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(25);
  });
});

describe('RateLimiter', () => {
  test('rejects invalid qps', () => {
    expect(() => new RateLimiter(0)).toThrow();
    expect(() => new RateLimiter(-1)).toThrow();
  });

  test('allows burst up to capacity immediately', async () => {
    const rl = new RateLimiter(10, 5);
    const t0 = Date.now();
    for (let i = 0; i < 5; i++) await rl.acquire();
    expect(Date.now() - t0).toBeLessThan(30);
  });

  test('throttles beyond capacity', async () => {
    const rl = new RateLimiter(20, 2); // 20 QPS, cap 2
    const t0 = Date.now();
    for (let i = 0; i < 6; i++) await rl.acquire();
    // 6 tokens @ 20/s => ~200ms after initial burst
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeGreaterThanOrEqual(150);
    expect(elapsed).toBeLessThan(500);
  });
});

describe('ConcurrencyPool', () => {
  test('rejects invalid concurrency', () => {
    expect(() => new ConcurrencyPool(0)).toThrow();
    expect(() => new ConcurrencyPool(-2)).toThrow();
  });

  test('preserves result order', async () => {
    const pool = new ConcurrencyPool(3);
    const items = [1, 2, 3, 4, 5, 6, 7];
    const results = await pool.run(items, async (n) => {
      await sleep(10 - n); // 后面的完成得更快，验证顺序不因完成时间乱
      return n * 2;
    });
    expect(results).toEqual([2, 4, 6, 8, 10, 12, 14]);
  });

  test('respects concurrency limit', async () => {
    const pool = new ConcurrencyPool(2);
    let active = 0;
    let peak = 0;
    await pool.run([1, 2, 3, 4, 5, 6], async () => {
      active += 1;
      peak = Math.max(peak, active);
      await sleep(20);
      active -= 1;
      return null;
    });
    expect(peak).toBe(2);
  });

  test('reports progress callback', async () => {
    const pool = new ConcurrencyPool(2);
    const progress: Array<[number, number]> = [];
    await pool.run(
      [1, 2, 3, 4],
      async (n) => n,
      (done, total) => progress.push([done, total]),
    );
    expect(progress.length).toBe(4);
    expect(progress[progress.length - 1]).toEqual([4, 4]);
  });

  test('handles empty input', async () => {
    const pool = new ConcurrencyPool(3);
    const results = await pool.run<number, number>([], async (n) => n);
    expect(results).toEqual([]);
  });
});
