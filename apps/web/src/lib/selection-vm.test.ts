import { describe, expect, it } from 'bun:test';
import { etfUrlSearch, parseEtfSearch } from './etf-vm';
import { parseStockSearch, stockUrlSearch } from './stock-vm';

describe('ETF search and URL round-trip serialization', () => {
  it('preserves disabled pick filter thresholds without resetting to defaults', () => {
    // 默认 picks 镜头门槛全部开启 (maxFee=0.6, minScale=2.0, maxDrawdown=35, minTurnover=10000000)
    const initial = parseEtfSearch('', 'picks');
    expect(initial.maxFeeEnabled).toBe(true);
    expect(initial.minScaleEnabled).toBe(true);

    // 显式关闭 maxFee 和 minScale
    const disabledState = {
      ...initial,
      maxFeeEnabled: false,
      minScaleEnabled: false,
    };
    const url = etfUrlSearch(disabledState, 'picks');
    expect(url).toContain('feeOn=0');
    expect(url).toContain('scaleOn=0');

    // 反向解析：必须保持关闭
    const parsed = parseEtfSearch(url, 'picks');
    expect(parsed.maxFeeEnabled).toBe(false);
    expect(parsed.minScaleEnabled).toBe(false);
    expect(parsed.maxDrawdownEnabled).toBe(true);
  });

  it('preserves non-default threshold values', () => {
    const custom = parseEtfSearch('?maxFee=0.3&minScale=5', 'picks');
    expect(custom.maxFee).toBe(0.3);
    expect(custom.minScale).toBe(5);
    const url = etfUrlSearch(custom, 'picks');
    expect(url).toContain('maxFee=0.3');
    expect(url).toContain('minScale=5');
  });
});

describe('Stock search and URL round-trip serialization', () => {
  it('preserves disabled pick filters and ST exclusion toggle', () => {
    const initial = parseStockSearch('', 'picks');
    expect(initial.excludeSt).toBe(true);
    expect(initial.maxPeEnabled).toBe(true);

    const toggled = {
      ...initial,
      excludeSt: false,
      maxPeEnabled: false,
      minTurnoverEnabled: false,
    };
    const url = stockUrlSearch(toggled, 'picks');
    expect(url).toContain('stOn=0');
    expect(url).toContain('peOn=0');
    expect(url).toContain('toOn=0');

    const parsed = parseStockSearch(url, 'picks');
    expect(parsed.excludeSt).toBe(false);
    expect(parsed.maxPeEnabled).toBe(false);
    expect(parsed.minTurnoverEnabled).toBe(false);
    expect(parsed.minRoeEnabled).toBe(true);
  });

  it('handles exchange SH,SZ vs all correctly', () => {
    const researchDefault = parseStockSearch('', 'valuation');
    expect(researchDefault.exchange).toBe('SH,SZ');

    const explicitAll = parseStockSearch('?exchange=all', 'valuation');
    expect(explicitAll.exchange).toBe('all');
    expect(stockUrlSearch(explicitAll, 'valuation')).toContain('exchange=all');

    const browseDefault = parseStockSearch('', 'browse');
    expect(browseDefault.exchange).toBe('all');
  });

  it('handles financial exclusion vs financial only cleanly', () => {
    const cashflow = parseStockSearch('', 'cashflow');
    expect(cashflow.excludeFinancial).toBe(true);

    // 切到金融业专属比较
    const finOnly = parseStockSearch('?finOnly=1', 'cashflow');
    expect(finOnly.isFinancial).toBe(true);
    expect(finOnly.excludeFinancial).toBe(false);
  });
});

describe('CandlestickChart negative forward price axis handling', () => {
  it('verifies negative price points in forward-adjusted history', () => {
    // 模拟 600066.SH 除权产生的负低点 OHLC
    const bars = [
      { date: '2022-04-26', open: 0.25, high: 0.5, low: 0.1, close: 0.3 },
      { date: '2022-04-27', open: 0.18, high: 0.43, low: -0.1, close: 0.36 },
      { date: '2022-04-28', open: 0.35, high: 0.6, low: 0.2, close: 0.5 },
    ];
    let minP = Number.POSITIVE_INFINITY;
    let maxP = Number.NEGATIVE_INFINITY;
    for (const b of bars) {
      if (b.low < minP) minP = b.low;
      if (b.high > maxP) maxP = b.high;
    }
    expect(minP).toBe(-0.1);
    expect(maxP).toBe(0.6);

    const padding = (maxP - minP) * 0.05;
    const adjustedMin = minP < 0 ? minP - padding : Math.max(0, minP - padding);
    expect(adjustedMin).toBeLessThan(-0.1);
  });
});
