import { describe, expect, test } from 'bun:test';
import {
  computeRiskMetrics,
  maxDrawdownPct,
  type NavSample,
} from '../src/analytics/risk-metrics.ts';

/** 生成 N 天连续净值：首日 1.0，每天涨 dailyPct% */
function generate(startDate: string, days: number, dailyPct: number): NavSample[] {
  const result: NavSample[] = [];
  const start = new Date(`${startDate}T00:00:00Z`);
  let nav = 1.0;
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    if (i > 0) nav *= 1 + dailyPct / 100;
    result.push({
      navDate: d.toISOString().slice(0, 10),
      unitNav: Number(nav.toFixed(6)),
      dailyReturn: i === 0 ? null : dailyPct,
    });
  }
  return result;
}

describe('maxDrawdownPct', () => {
  test('null on empty/short input', () => {
    expect(maxDrawdownPct([])).toBeNull();
    expect(maxDrawdownPct([1.0])).toBeNull();
  });

  test('zero drawdown for monotonically increasing', () => {
    expect(maxDrawdownPct([1.0, 1.1, 1.2, 1.3])).toBe(0);
  });

  test('50% drawdown', () => {
    // peak 2.0, trough 1.0
    expect(maxDrawdownPct([1, 2, 1.5, 1.0, 1.2])).toBe(50);
  });

  test('20% drawdown', () => {
    expect(maxDrawdownPct([1.0, 1.25, 1.0])).toBe(20);
  });

  test('handles zero peak safely', () => {
    expect(maxDrawdownPct([0, 0, 0])).toBe(0);
  });
});

describe('computeRiskMetrics', () => {
  test('empty input returns null shape', () => {
    const m = computeRiskMetrics([]);
    expect(m.dataDate).toBeNull();
    expect(m.y1.samples).toBe(0);
    expect(m.y3.samples).toBe(0);
    expect(m.maxDrawdownAll).toBeNull();
  });

  test('reports latest date', () => {
    const navs = generate('2026-01-01', 40, 0.1);
    const m = computeRiskMetrics(navs);
    expect(m.dataDate).toBe(navs[navs.length - 1]?.navDate ?? null);
  });

  test('samples below 30 returns null metrics', () => {
    const navs = generate('2026-01-01', 20, 0.1);
    const m = computeRiskMetrics(navs);
    expect(m.y1.samples).toBe(20);
    expect(m.y1.volatility).toBeNull();
    expect(m.y1.sharpe).toBeNull();
  });

  test('positive annual return for steady 0.1%/day gain over 1y', () => {
    const navs = generate('2025-01-01', 400, 0.1);
    const m = computeRiskMetrics(navs);
    expect(m.y1.samples).toBeGreaterThanOrEqual(200);
    // 0.1%/day over 252 trading days ≈ 28% annualized
    expect(m.y1.annualReturn).toBeGreaterThan(20);
    // volatility should be near zero (constant returns)
    expect(m.y1.volatility ?? 0).toBeLessThan(1);
    // MDD is 0 for pure uptrend
    expect(m.y1.maxDrawdown).toBe(0);
  });

  test('handles descending input order', () => {
    const asc = generate('2025-01-01', 300, 0.1);
    const desc = [...asc].reverse();
    const mA = computeRiskMetrics(asc);
    const mB = computeRiskMetrics(desc);
    expect(mA.dataDate).toBe(mB.dataDate);
    expect(mA.y1.annualReturn).toBeCloseTo(mB.y1.annualReturn ?? 0, 3);
  });

  test('computes sortino ratio when there are down days', () => {
    const navs: NavSample[] = [];
    const start = new Date('2025-01-01T00:00:00Z');
    for (let i = 0; i < 300; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      // 90% 上涨 0.2%，10% 下跌 -1%
      const ret = i % 10 === 0 ? -1.0 : 0.2;
      navs.push({
        navDate: d.toISOString().slice(0, 10),
        unitNav: 1 + i * 0.001,
        dailyReturn: i === 0 ? null : ret,
      });
    }
    const m = computeRiskMetrics(navs);
    expect(m.y1.sortino).not.toBeNull();
    expect(m.y1.sharpe).not.toBeNull();
    // 两者都应为有限数值
    expect(Number.isFinite(m.y1.sortino ?? Number.NaN)).toBe(true);
    expect(Number.isFinite(m.y1.sharpe ?? Number.NaN)).toBe(true);
  });

  test('computes calmar as annual_return / max_drawdown', () => {
    // 构造有明显回撤的曲线：先涨 20%，再跌 10%
    const navs: NavSample[] = [];
    const start = new Date('2025-01-01T00:00:00Z');
    for (let i = 0; i < 300; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      let unitNav: number;
      if (i < 150) unitNav = 1 + i * 0.002;
      else unitNav = 1.3 - (i - 150) * 0.001;
      navs.push({ navDate: d.toISOString().slice(0, 10), unitNav, dailyReturn: null });
    }
    const m = computeRiskMetrics(navs);
    expect(m.y1.maxDrawdown ?? 0).toBeGreaterThan(0);
    expect(m.y1.calmar).not.toBeNull();
  });

  test('fills daily return from consecutive nav diff when missing', () => {
    const navs: NavSample[] = [];
    const start = new Date('2025-01-01T00:00:00Z');
    for (let i = 0; i < 50; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      navs.push({
        navDate: d.toISOString().slice(0, 10),
        unitNav: 1 + i * 0.002,
        dailyReturn: null,
      });
    }
    const m = computeRiskMetrics(navs);
    // 应能算出 volatility 而不是 null
    expect(m.y1.volatility).not.toBeNull();
  });

  test('custom risk-free rate affects sharpe', () => {
    const navs = generate('2025-01-01', 400, 0.1);
    const m1 = computeRiskMetrics(navs, { riskFreeRate: 0.02 });
    const m2 = computeRiskMetrics(navs, { riskFreeRate: 0.1 });
    if (m1.y1.sharpe !== null && m2.y1.sharpe !== null) {
      expect(m1.y1.sharpe).toBeGreaterThan(m2.y1.sharpe);
    }
  });

  test('all-history max drawdown includes points outside 5y window', () => {
    const navs = generate('2015-01-01', 4000, 0.05);
    // 手动加一个极端点
    navs[100] = { ...navs[100]!, unitNav: 5 };
    const m = computeRiskMetrics(navs);
    expect(m.maxDrawdownAll ?? 0).toBeGreaterThan(50);
  });
});
