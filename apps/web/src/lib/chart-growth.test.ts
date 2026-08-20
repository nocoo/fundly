import { describe, expect, it } from 'bun:test';
import { annualizedGrowth, buildGrowthPoints, growthFromBase, parseRefRates } from './chart-growth';

describe('growth math', () => {
  it('indexes nav against the first print', () => {
    expect(growthFromBase(1.2, 1)).toBeCloseTo(20);
    expect(growthFromBase(0.8, 1)).toBeCloseTo(-20);
    expect(growthFromBase(1, 0)).toBe(0);
  });

  it('compounds an annualized reference path', () => {
    expect(annualizedGrowth(0, 365.25)).toBeCloseTo(0);
    expect(annualizedGrowth(100, 365.25)).toBeCloseTo(100);
    expect(annualizedGrowth(2, 0)).toBe(0);
  });
});

describe('parseRefRates', () => {
  it('keeps at most two finite rates', () => {
    expect(parseRefRates([2, 4, 6])).toEqual([2, 4]);
    expect(parseRefRates(['2', 'x', 2])).toEqual([2]);
    expect(parseRefRates(null)).toEqual([]);
  });
});

describe('buildGrowthPoints', () => {
  it('adds fund, bench and reference series from a shared start', () => {
    const points = buildGrowthPoints(
      [
        { date: '2024-01-01', nav: 1 },
        { date: '2024-01-02', nav: 1.1 },
      ],
      {
        bench: [
          { date: '2024-01-01', nav: 2 },
          { date: '2024-01-02', nav: 2.2 },
        ],
        refRates: [0],
      },
    );
    expect(points).toHaveLength(2);
    expect(points[0]).toMatchObject({ name: '2024-01-01', growth: 0, bench: 0, ref_0: 0 });
    expect(points[1]?.growth).toBeCloseTo(10);
    expect(points[1]?.bench).toBeCloseTo(10);
  });
});
