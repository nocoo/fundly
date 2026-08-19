/**
 * HTTP 客户端：带重试、超时、User-Agent 伪装
 */

import { sleep } from './pool.ts';

export interface HttpOptions {
  timeout?: number;
  retries?: number;
  headers?: Record<string, string>;
}

const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Referer: 'http://fund.eastmoney.com/',
  Accept: '*/*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly httpCode: number | null,
    public readonly url: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * 带重试的 GET 请求，返回响应文本
 * 遇 429/5xx 指数退避重试（1s, 2s, 4s ...）
 */
export async function fetchText(url: string, options: HttpOptions = {}): Promise<string> {
  const { timeout = 15000, retries = 3, headers = {} } = options;
  const mergedHeaders = { ...DEFAULT_HEADERS, ...headers };

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(url, {
        headers: mergedHeaders,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        return await res.text();
      }

      // 429 / 5xx 走退避重试；其它状态码直接抛
      if (res.status === 429 || res.status >= 500) {
        lastError = new HttpError(`HTTP ${res.status}`, res.status, url);
        if (attempt < retries) {
          await sleep(1000 * 2 ** attempt);
          continue;
        }
      }
      throw new HttpError(`HTTP ${res.status}`, res.status, url);
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof HttpError) throw err;
      lastError = err as Error;
      if (attempt < retries) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      throw new HttpError(`fetch failed: ${lastError.message}`, null, url);
    }
  }
  throw new HttpError(`fetch failed: ${lastError?.message ?? 'unknown'}`, null, url);
}
