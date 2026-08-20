import { DEFAULT_BENCHMARKS, mergeBenchmarks } from './benchmark-defaults';
import { parseRefRates } from './chart-growth';

export const CHART_PREFS_KEY = 'fundly_chart_prefs';
export const CHART_PREFS_EVENT = 'fundly-chart-prefs';

export type ChartPrefs = {
  refRates: number[];
  benchmarks: Record<string, string>;
};

export function defaultChartPrefs(): ChartPrefs {
  return { refRates: [], benchmarks: mergeBenchmarks({}) };
}

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
  if (typeof window === 'undefined') return defaultChartPrefs();
  try {
    const raw = window.localStorage.getItem(CHART_PREFS_KEY);
    return raw ? parseChartPrefs(JSON.parse(raw)) : defaultChartPrefs();
  } catch {
    return defaultChartPrefs();
  }
}

export function writeStoredChartPrefs(prefs: ChartPrefs): void {
  const next = parseChartPrefs(prefs);
  window.localStorage.setItem(CHART_PREFS_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(CHART_PREFS_EVENT));
}

export function allBenchmarkTypes(): string[] {
  return Object.keys(DEFAULT_BENCHMARKS);
}
