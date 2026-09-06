import { describe, expect, it } from 'bun:test';
import {
  fundDetailLink,
  isDomesticStockHolding,
  isFundDetailPath,
  listBackLabel,
  listHref,
  originFromList,
  parseListHref,
  parseListOrigin,
  readReturnEtf,
  resolveListOrigin,
  resolveNavigationOrigin,
} from './list-origin';

describe('list origin', () => {
  it('direct research detail ignores stored lists while explicit cross-asset origins are preserved', () => {
    const before = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: {
          getItem: () => JSON.stringify({ path: '/select-etf/risk', search: '?years=5&page=3' }),
        },
      },
    });
    try {
      expect(resolveNavigationOrigin('/stocks/600519.SH', null)).toEqual({
        path: '/stocks',
        search: '',
      });
      expect(resolveNavigationOrigin('/etfs/510300.SH', null)).toEqual({
        path: '/etfs',
        search: '',
      });
      expect(
        resolveNavigationOrigin('/stocks/600519.SH', { list: '/select-etf/cost?years=3&page=2' }),
      ).toEqual({ path: '/select-etf/cost', search: '?years=3&page=2' });
      expect(resolveNavigationOrigin('/select-stock/valuation', null)).toBeNull();
    } finally {
      if (before) Object.defineProperty(globalThis, 'window', before);
      else Reflect.deleteProperty(globalThis, 'window');
    }
  });

  it('only domestic equity holdings open A-share details and return destinations stay internal', () => {
    expect(isDomesticStockHolding('600519.SH', 'stock')).toBe(true);
    expect(isDomesticStockHolding('00700.HK', 'stock')).toBe(false);
    expect(isDomesticStockHolding('019789.SH', 'bond')).toBe(false);
    expect(readReturnEtf({ returnEtf: '510300.SH' })).toBe('510300.SH');
    expect(readReturnEtf({ returnEtf: 'https://example.com' })).toBeNull();
  });
  it('builds a list href and detail location', () => {
    const origin = { path: '/ranking' as const, search: '?dim=sharpe_1y' };
    expect(listHref(origin)).toBe('/ranking?dim=sharpe_1y');
    expect(fundDetailLink('000001', origin)).toEqual({
      to: '/funds/000001',
      state: { list: '/ranking?dim=sharpe_1y' },
    });
    expect(listBackLabel(origin)).toBe('返回基金排名');
    expect(listBackLabel({ path: '/funds', search: '' })).toBe('返回基金浏览');
  });

  it('parses stored origin and router state', () => {
    expect(parseListOrigin({ path: '/funds', search: '?q=华夏' })).toEqual({
      path: '/funds',
      search: '?q=华夏',
    });
    expect(parseListHref('/ranking?typeL1=all')).toEqual({
      path: '/select/return',
      search: '?typeL1=all',
    });
    expect(resolveListOrigin({ list: '/ranking?page=2' })).toEqual({
      path: '/select/return',
      search: '?page=2',
    });
    expect(parseListHref('/ranking?dim=sharpe_1y')).toEqual({
      path: '/select/risk',
      search: '?dim=sharpe_1y',
    });
    expect(parseListOrigin({ path: '/settings' })).toBeNull();
  });

  it('reads the current list location', () => {
    expect(originFromList('/ranking', '?pass4433=1')).toEqual({
      path: '/select/return',
      search: '?pass4433=1',
    });
    expect(originFromList('/select/return', '?typeL1=混合型')).toEqual({
      path: '/select/return',
      search: '?typeL1=混合型',
    });
    expect(originFromList('/data', '')).toBeNull();
    expect(isFundDetailPath('/funds/000001')).toBe(true);
    expect(isFundDetailPath('/funds')).toBe(false);
    expect(originFromList('/select-etf/liquidity', '?years=3')).toEqual({
      path: '/select-etf/liquidity',
      search: '?years=3',
    });
    expect(originFromList('/select-stock/valuation', '?exchange=SH')).toEqual({
      path: '/select-stock/valuation',
      search: '?exchange=SH',
    });
  });
});
