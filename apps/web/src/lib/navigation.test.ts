import { describe, expect, it } from 'bun:test';
import { isItemActive, NAV_GROUPS, shouldGroupBeOpenOnMount } from './navigation';

describe('isItemActive', () => {
  it("matches '/' exactly only on '/'", () => {
    expect(isItemActive('/', '/')).toBe(true);
    expect(isItemActive('/', '/funds')).toBe(false);
  });

  it('matches a non-root href as a prefix', () => {
    expect(isItemActive('/funds', '/funds')).toBe(true);
    expect(isItemActive('/funds', '/funds/000001')).toBe(true);
    expect(isItemActive('/funds', '/funds-old')).toBe(false);
    expect(isItemActive('/ranking', '/funds')).toBe(false);
  });

  it('highlights 日报 for list and detail paths', () => {
    expect(isItemActive('/daily', '/daily')).toBe(true);
    expect(isItemActive('/daily', '/daily/2026-09-09')).toBe(true);
    expect(isItemActive('/daily', '/daily-archive')).toBe(false);
    expect(isItemActive('/market', '/daily/2026-09-09')).toBe(false);
  });

  it('keeps the originating list active on a fund detail', () => {
    expect(isItemActive('/ranking', '/funds/000001', { path: '/ranking', search: '' })).toBe(true);
    expect(isItemActive('/funds', '/funds/000001', { path: '/ranking', search: '' })).toBe(false);
  });

  it('keeps the originating list active on an ETF detail', () => {
    expect(
      isItemActive('/select-etf/liquidity', '/etfs/510300.SH', {
        path: '/select-etf/liquidity',
        search: '',
      }),
    ).toBe(true);
    expect(
      isItemActive('/etfs', '/etfs/510300.SH', {
        path: '/select-etf/liquidity',
        search: '',
      }),
    ).toBe(false);
    expect(isItemActive('/etfs', '/etfs/510300.SH', null)).toBe(true);
  });

  it('keeps the originating list active on a stock detail', () => {
    expect(
      isItemActive('/select-stock/valuation', '/stocks/600519.SH', {
        path: '/select-stock/valuation',
        search: '',
      }),
    ).toBe(true);
    expect(
      isItemActive('/stocks', '/stocks/600519.SH', {
        path: '/select-stock/valuation',
        search: '',
      }),
    ).toBe(false);
    expect(isItemActive('/stocks', '/stocks/600519.SH', null)).toBe(true);
  });
});

describe('shouldGroupBeOpenOnMount', () => {
  it('opens the group containing the current route', () => {
    const ranking = NAV_GROUPS.find((g) => g.label === '选基');
    if (!ranking) throw new Error("expected '选基' group");
    expect(shouldGroupBeOpenOnMount(ranking, '/select/return')).toBe(true);
  });

  it('respects defaultOpen=true even without a route match', () => {
    const overview = NAV_GROUPS.find((g) => g.label === '总览');
    if (!overview) throw new Error("expected '总览' group");
    expect(shouldGroupBeOpenOnMount(overview, '/funds')).toBe(true);
  });

  it('honours an explicit defaultOpen=false when no item matches', () => {
    expect(
      shouldGroupBeOpenOnMount({ items: [{ href: '/hidden' }], defaultOpen: false }, '/funds'),
    ).toBe(false);
  });
});
