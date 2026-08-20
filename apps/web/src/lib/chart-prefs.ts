import { DEFAULT_BENCHMARKS, mergeBenchmarks } from './benchmark-defaults';
import { parseRefRates } from './chart-growth';

export const CHART_PREFS_KEY = 'fundly_chart_prefs';
export const CHART_PREFS_EVENT = 'fundly-chart-prefs';

export type ChartPrefs = {
  refRates: number[];
  benchmarks: Record<string, string>;
};

export const DEFAULT_CHART_PREFS: ChartPrefs = {
  refRates: [],
  benchmarks: mergeBenchmarks({}),
};

export function defaultChartPrefs(): ChartPrefs {
  return DEFAULT_CHART_PREFS;
}

let cachedRaw: string | null = null;
let cachedPrefs: ChartPrefs = DEFAULT_CHART_PREFS;

export function parseChartPrefs(raw: unknown): ChartPrefs {
  const base = defaultChartPrefs();
  if (!raw || typeof raw !== 'object') return base;
  const rec = raw as { refRates?: unknown; benchmarks?: unknown };
  const benchmarks =
    rec.benchmarks && typeof rec.benchmarks === 'object' && !Array.isArray(rec.benchmarks)
      ? mergeBenchmarks(rec.benchmarks as Record<string, string>)
      : base.benchmarks;
  return { refRates: parseRefRates(rec.refRates), benchmarks };
}

export function readStoredChartPrefs(): ChartPrefs {
  if (typeof window === 'undefined') return DEFAULT_CHART_PREFS;
  try {
    const raw = window.localStorage.getItem(CHART_PREFS_KEY);
    if (!raw) {
      cachedRaw = null;
      cachedPrefs = DEFAULT_CHART_PREFS;
      return cachedPrefs;
    }
    if (raw === cachedRaw) return cachedPrefs;
    cachedRaw = raw;
    cachedPrefs = parseChartPrefs(JSON.parse(raw));
    return cachedPrefs;
  } catch {
    return DEFAULT_CHART_PREFS;
  }
}

export function writeStoredChartPrefs(prefs: ChartPrefs): void {
  const next = parseChartPrefs(prefs);
  const serialized = JSON.stringify(next);
  window.localStorage.setItem(CHART_PREFS_KEY, serialized);
  cachedRaw = serialized;
  cachedPrefs = next;
  window.dispatchEvent(new Event(CHART_PREFS_EVENT));
}

export function allBenchmarkTypes(): string[] {
  return Object.keys(DEFAULT_BENCHMARKS);
}
