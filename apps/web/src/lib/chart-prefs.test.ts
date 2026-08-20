import { describe, expect, it } from 'bun:test';
import { defaultChartPrefs, parseChartPrefs, readStoredChartPrefs } from './chart-prefs';

describe('parseChartPrefs', () => {
  it('fills missing benchmarks from defaults', () => {
    const prefs = parseChartPrefs({ refRates: [2, 4], benchmarks: { '指数型-股票': '510300' } });
    expect(prefs.refRates).toEqual([2, 4]);
    expect(prefs.benchmarks['指数型-股票']).toBe('510300');
    expect(prefs.benchmarks['货币型-普通货币']).toBe(
      defaultChartPrefs().benchmarks['货币型-普通货币'],
    );
  });
});

describe('readStoredChartPrefs', () => {
  it('returns the same snapshot object when storage is unchanged', () => {
    expect(readStoredChartPrefs()).toBe(readStoredChartPrefs());
  });
});
