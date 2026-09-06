import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { marketNumber } from '../utils/market-validation.ts';
import { FUYAO_BASE_URL } from './fuyao.ts';

export interface MarketReaderOptions {
  mode: 'live' | 'evidence';
  evidenceDir?: string;
  apiKey?: string;
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
  intervalMs?: number;
  timeoutMs?: number;
}

export interface FuyaoData {
  item: Array<Record<string, unknown>>;
  timestamp?: number;
  total?: number;
  thscode?: string;
  adjust?: string;
  interval?: string;
  report?: string;
  pagination?: { total: number; pages: number; page: number; size: number };
  collectedAt: number;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class MarketReadError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

/** Evidence mode is explicit; network failures never fall back to archived responses. */
export class MarketReader {
  readonly mode: 'live' | 'evidence';
  readonly startedAt = Date.now();
  collectedAt = 0;
  firstCollectedAt = Number.POSITIVE_INFINITY;
  requestCount = 0;
  private lastApiStart = 0;

  constructor(private readonly options: MarketReaderOptions) {
    this.mode = options.mode;
  }

  private stamp(at: number): void {
    this.collectedAt = Math.max(this.collectedAt, at);
    this.firstCollectedAt = Math.min(this.firstCollectedAt, at);
  }

  async text(
    url: string,
    evidencePath?: string,
    authenticated = false,
  ): Promise<{ text: string; collectedAt: number }> {
    if (this.mode === 'evidence') {
      if (!this.options.evidenceDir || !evidencePath)
        throw new MarketReadError('No archived response for this request', 404);
      const path = resolve(this.options.evidenceDir, evidencePath);
      if (!(await Bun.file(path).exists()))
        throw new MarketReadError(`Missing evidence: ${evidencePath}`, 404);
      const receiptPath = path.replace(/\.(json|txt|csv|raw)$/, '.receipt.json');
      let at = (await stat(path)).mtimeMs;
      if (await Bun.file(receiptPath).exists()) {
        const receipt = await Bun.file(receiptPath).json();
        const parsed = Date.parse(String(receipt.retrieved_at ?? ''));
        if (Number.isFinite(parsed)) at = parsed;
      }
      this.stamp(at);
      return { text: await Bun.file(path).text(), collectedAt: at };
    }

    if (authenticated && !this.options.apiKey)
      throw new MarketReadError('HITHINK_FINANCE_API_KEY is not configured', 401);
    if (authenticated && new URL(url).origin !== FUYAO_BASE_URL)
      throw new MarketReadError('Invalid financial API origin', 400);
    const fetchImpl = this.options.fetchImpl ?? fetch;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (authenticated) {
        const wait = (this.options.intervalMs ?? 400) - (Date.now() - this.lastApiStart);
        if (wait > 0) await Bun.sleep(wait);
        this.lastApiStart = Date.now();
      }
      try {
        this.requestCount++;
        const headers: Record<string, string> = {
          'User-Agent': 'Fundly (+https://github.com/nocoo/fundly)',
          Accept: '*/*',
        };
        if (authenticated && this.options.apiKey) headers['X-api-key'] = this.options.apiKey;
        const response = await fetchImpl(url, {
          headers,
          redirect: authenticated ? 'error' : 'follow',
          signal: AbortSignal.timeout(this.options.timeoutMs ?? 15000),
        });
        if (!response.ok)
          throw new MarketReadError(
            `HTTP ${response.status} from ${new URL(url).hostname}`,
            response.status,
          );
        const text = await response.text();
        const at = Date.now();
        this.stamp(at);
        return { text, collectedAt: at };
      } catch (error) {
        if (error instanceof MarketReadError && error.status !== 429 && error.status < 500)
          throw error;
        if (attempt === 2)
          throw error instanceof MarketReadError
            ? error
            : new MarketReadError(`Request failed or timed out at ${new URL(url).hostname}`);
        await Bun.sleep(400 * 2 ** attempt);
      }
    }
    throw new MarketReadError('Request did not complete');
  }

  async fuyao(
    path: string,
    params: Record<string, string | number> = {},
    evidenceFile?: string,
  ): Promise<FuyaoData> {
    const url = new URL(path, FUYAO_BASE_URL);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    const response = await this.text(
      url.href,
      evidenceFile ? `fuyao/${evidenceFile}` : undefined,
      true,
    );
    let payload: unknown;
    try {
      payload = JSON.parse(response.text);
    } catch {
      throw new MarketReadError(`Invalid JSON at ${path}`);
    }
    if (!record(payload) || payload.code !== 0)
      throw new MarketReadError(
        'Fuyao business error ' +
          (record(payload) ? String(payload.code) : 'unknown') +
          ' at ' +
          path,
      );
    const data = payload.data;
    if (!record(data) || !Array.isArray(data.item) || !data.item.every(record))
      throw new MarketReadError(`Invalid item schema at ${path}`);
    const total = marketNumber(data.total);
    const timestamp = marketNumber(data.timestamp);
    return {
      item: data.item,
      ...(total === null ? {} : { total }),
      ...(timestamp === null ? {} : { timestamp }),
      ...(typeof data.thscode === 'string' ? { thscode: data.thscode } : {}),
      ...(typeof data.adjust === 'string' ? { adjust: data.adjust } : {}),
      ...(typeof data.interval === 'string' ? { interval: data.interval } : {}),
      ...(typeof data.report === 'string' ? { report: data.report } : {}),
      ...(record(data.pagination)
        ? { pagination: data.pagination as FuyaoData['pagination'] }
        : {}),
      collectedAt: response.collectedAt,
    };
  }
}
