import { describe, expect, it } from 'bun:test';
import {
  allBenchmarkTypes,
  defaultChartPrefs,
  parseChartPrefs,
  readStoredChartPrefs,
  writeStoredChartPrefs,
} from './chart-prefs';

describe('parseChartPrefs', () => {
  it('fills missing benchmarks from defaults', () => {
    const prefs = parseChartPrefs({ refRates: [2, 4], benchmarks: { '指数型-股票': '510300' } });
    expect(prefs.refRates).toEqual([2, 4]);
    expect(prefs.benchmarks['指数型-股票']).toBe('510300');
    expect(prefs.benchmarks['货币型-普通货币']).toBe(
      defaultChartPrefs().benchmarks['货币型-普通货币'],
    );
    expect(allBenchmarkTypes().length).toBeGreaterThan(0);
  });
});

describe('readStoredChartPrefs', () => {
  it('returns the same snapshot object when storage is unchanged and writes updates', () => {
    expect(readStoredChartPrefs()).toBe(readStoredChartPrefs());
    const store = new Map<string, string>();
    const events: string[] = [];
    const prev = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: {
          getItem: (k: string) => store.get(k) ?? null,
          setItem: (k: string, v: string) => store.set(k, v),
        },
        dispatchEvent: (e: Event) => events.push(e.type),
      },
    });
    try {
      expect(readStoredChartPrefs()).toEqual(defaultChartPrefs());
      writeStoredChartPrefs({ refRates: [3], benchmarks: {} });
      const loaded = readStoredChartPrefs();
      expect(loaded.refRates).toEqual([3]);
      expect(readStoredChartPrefs()).toBe(loaded);
      expect(events).toHaveLength(1);
    } finally {
      if (prev) Object.defineProperty(globalThis, 'window', prev);
      else Reflect.deleteProperty(globalThis, 'window');
    }
  });
});
