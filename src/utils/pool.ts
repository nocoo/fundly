/**
 * 简易令牌桶限流器 + 并发池
 *
 * 用法：
 *   const pool = new ConcurrencyPool(5);
 *   const limiter = new RateLimiter(5); // 5 QPS
 *   await pool.run(items, async (item) => {
 *     await limiter.acquire();
 *     return handle(item);
 *   });
 */

/** 简单的 sleep */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 令牌桶限流器（QPS 上限） */
export class RateLimiter {
  private lastRefill: number;
  private tokens: number;
  private readonly capacity: number;
  private readonly refillPerMs: number;

  constructor(qps: number, capacity?: number) {
    if (qps <= 0) throw new Error('qps must be > 0');
    this.capacity = capacity ?? qps;
    this.tokens = this.capacity;
    this.refillPerMs = qps / 1000;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    while (true) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const waitMs = Math.ceil((1 - this.tokens) / this.refillPerMs);
      await sleep(waitMs);
    }
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed <= 0) return;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerMs);
    this.lastRefill = now;
  }
}

/** 固定容量并发池，按顺序返回结果 */
export class ConcurrencyPool {
  constructor(private readonly concurrency: number) {
    if (concurrency <= 0) throw new Error('concurrency must be > 0');
  }

  async run<T, R>(
    items: readonly T[],
    handler: (item: T, index: number) => Promise<R>,
    onProgress?: (done: number, total: number) => void,
  ): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let cursor = 0;
    let done = 0;

    const worker = async (): Promise<void> => {
      while (true) {
        const idx = cursor++;
        if (idx >= items.length) return;
        const item = items[idx] as T;
        results[idx] = await handler(item, idx);
        done += 1;
        onProgress?.(done, items.length);
      }
    };

    const workers = Array.from({ length: Math.min(this.concurrency, items.length) }, () =>
      worker(),
    );
    await Promise.all(workers);
    return results;
  }
}
