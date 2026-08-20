import { describe, expect, it } from 'bun:test';
import { DEFAULT_BENCHMARKS, mergeBenchmarks, resolveBenchmark } from './benchmark-defaults';

describe('resolveBenchmark', () => {
  it('never leaves a known type empty', () => {
    const merged = mergeBenchmarks({});
    for (const type of Object.keys(DEFAULT_BENCHMARKS)) {
      expect(merged[type]).toBeTruthy();
      expect(resolveBenchmark(type, {})?.code).toBe(DEFAULT_BENCHMARKS[type]?.code);
    }
  });

  it('prefers an override and falls back when cleared', () => {
    expect(resolveBenchmark('指数型-股票', { '指数型-股票': '510300' })?.code).toBe('510300');
    expect(resolveBenchmark('指数型-股票', { '指数型-股票': '  ' })?.code).toBe('510500');
  });
});
