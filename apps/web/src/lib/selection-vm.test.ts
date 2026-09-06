import { describe, expect, it } from 'bun:test';
import { etfUrlSearch, parseEtfSearch } from './etf-vm';
import { parseStockSearch, stockUrlSearch } from './stock-vm';

describe('ETF search and URL round-trip serialization', () => {
  it('preserves disabled pick filter thresholds and non-default values without resetting to defaults', () => {
    // 默认 picks 镜头门槛全部开启 (maxFee=0.6, minScale=2.0, maxDrawdown=35, minTurnover=10000000)
    const initial = parseEtfSearch('', 'picks');
    expect(initial.maxFeeEnabled).toBe(true);
    expect(initial.minScaleEnabled).toBe(true);
    expect(initial.maxFee).toBe(0.6);
    expect(initial.minScale).toBe(2.0);

    // 显式关闭 maxFee 和 minScale，且修改 maxFee 为 0.4
    const modifiedState = {
      ...initial,
      maxFeeEnabled: false,
      maxFee: 0.4,
      minScaleEnabled: false,
      minScale: 5.0,
    };
    const url = etfUrlSearch(modifiedState, 'picks');
    expect(url).toContain('feeOn=0');
    expect(url).toContain('maxFee=0.4');
    expect(url).toContain('scaleOn=0');
    expect(url).toContain('minScale=5');

    // 反向解析：即使关闭状态，自定义数值也完整保留！
    const parsed = parseEtfSearch(url, 'picks');
    expect(parsed.maxFeeEnabled).toBe(false);
    expect(parsed.maxFee).toBe(0.4);
    expect(parsed.minScaleEnabled).toBe(false);
    expect(parsed.minScale).toBe(5.0);
    expect(parsed.maxDrawdownEnabled).toBe(true);
  });

  it('preserves ticker sort when explicitly chosen in research lens', () => {
    const state = parseEtfSearch('?sort=ticker&order=asc', 'risk');
    expect(state.sort).toBe('ticker');
    expect(state.order).toBe('asc');
    const url = etfUrlSearch(state, 'risk');
    expect(url).toContain('sort=ticker');
  });

  it('sanitizes NaN and invalid page parameters to positive integer', () => {
    expect(parseEtfSearch('?page=NaN', 'browse').page).toBe(1);
    expect(parseEtfSearch('?page=-5', 'browse').page).toBe(1);
    expect(parseEtfSearch('?page=3.8', 'browse').page).toBe(3);
  });
});

describe('Stock search and URL round-trip serialization', () => {
  it('correctly defaults minRoe to 8.0 when absent and preserves explicit 0.0', () => {
    // 1. 空参数或无 minRoe 时默认 8.0，不能变成 0
    const emptyPicks = parseStockSearch('', 'picks');
    expect(emptyPicks.minRoe).toBe(8.0);
    expect(emptyPicks.minRoeEnabled).toBe(true);

    // 2. 显式设为合法数值 0.0 时，不能被跳回 8.0！
    const zeroRoe = parseStockSearch('?minRoe=0', 'picks');
    expect(zeroRoe.minRoe).toBe(0.0);
    expect(zeroRoe.minRoeEnabled).toBe(true);
    const zeroUrl = stockUrlSearch(zeroRoe, 'picks');
    expect(zeroUrl).toContain('minRoe=0');

    // 3. 再次反向解析
    const parsedZero = parseStockSearch(zeroUrl, 'picks');
    expect(parsedZero.minRoe).toBe(0.0);
  });

  it('preserves disabled pick filters with custom non-default values', () => {
    const initial = parseStockSearch('', 'picks');
    const toggled = {
      ...initial,
      excludeSt: false,
      maxPeEnabled: false,
      maxPe: 25.0,
      minTurnoverEnabled: false,
      minTurnover: 80000000,
    };
    const url = stockUrlSearch(toggled, 'picks');
    expect(url).toContain('stOn=0');
    expect(url).toContain('peOn=0');
    expect(url).toContain('maxPe=25');
    expect(url).toContain('toOn=0');
    expect(url).toContain('minTurnover=80000000');

    const parsed = parseStockSearch(url, 'picks');
    expect(parsed.excludeSt).toBe(false);
    expect(parsed.maxPeEnabled).toBe(false);
    expect(parsed.maxPe).toBe(25.0);
    expect(parsed.minTurnoverEnabled).toBe(false);
    expect(parsed.minTurnover).toBe(80000000);
  });

  it('preserves ticker sort in all research lenses instead of falling back to default', () => {
    for (const lens of ['valuation', 'quality', 'growth', 'cashflow', 'trend', 'picks'] as const) {
      const state = parseStockSearch('?sort=ticker&order=asc', lens);
      expect(state.sort).toBe('ticker');
      const url = stockUrlSearch(state, lens);
      expect(url).toContain('sort=ticker');
    }
  });

  it('handles exchange SH,SZ vs all and ST exclusion rules', () => {
    const researchDefault = parseStockSearch('', 'valuation');
    expect(researchDefault.exchange).toBe('SH,SZ');
    // 非 picks 镜头默认包含 ST
    expect(researchDefault.excludeSt).toBe(false);

    const picksDefault = parseStockSearch('', 'picks');
    // picks 镜头默认排除 ST
    expect(picksDefault.excludeSt).toBe(true);

    const explicitAll = parseStockSearch('?exchange=all', 'valuation');
    expect(explicitAll.exchange).toBe('all');
    expect(stockUrlSearch(explicitAll, 'valuation')).toContain('exchange=all');
  });

  it('handles financial exclusion vs financial only cleanly', () => {
    const cashflow = parseStockSearch('', 'cashflow');
    expect(cashflow.excludeFinancial).toBe(true);

    // 切到金融业专属比较
    const finOnly = parseStockSearch('?finOnly=1', 'cashflow');
    expect(finOnly.isFinancial).toBe(true);
    expect(finOnly.excludeFinancial).toBe(false);

    // 显式不排除金融 (包含全部)
    const allEnterprises = parseStockSearch('?excludeFin=0', 'cashflow');
    expect(allEnterprises.excludeFinancial).toBe(false);
    expect(allEnterprises.isFinancial).toBeUndefined();
  });

  it('sanitizes NaN, Infinity and non-integer pages', () => {
    expect(parseStockSearch('?page=NaN', 'browse').page).toBe(1);
    expect(parseStockSearch('?page=Infinity', 'browse').page).toBe(1);
    expect(parseStockSearch('?page=4.2', 'browse').page).toBe(4);
  });
});
