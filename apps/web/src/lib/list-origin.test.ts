import { describe, expect, it } from 'bun:test';
import {
  fundDetailLink,
  isFundDetailPath,
  listHref,
  originFromList,
  parseListHref,
  parseListOrigin,
  resolveListOrigin,
} from './list-origin';

describe('list origin', () => {
  it('builds a list href and detail location', () => {
    const origin = { path: '/ranking' as const, search: '?dim=sharpe_1y' };
    expect(listHref(origin)).toBe('/ranking?dim=sharpe_1y');
    expect(fundDetailLink('000001', origin)).toEqual({
      to: '/funds/000001',
      state: { list: '/ranking?dim=sharpe_1y' },
    });
  });

  it('parses stored origin and router state', () => {
    expect(parseListOrigin({ path: '/funds', search: '?q=华夏' })).toEqual({
      path: '/funds',
      search: '?q=华夏',
    });
    expect(parseListHref('/ranking?typeL1=all')).toEqual({
      path: '/ranking',
      search: '?typeL1=all',
    });
    expect(resolveListOrigin({ list: '/ranking?page=2' })).toEqual({
      path: '/ranking',
      search: '?page=2',
    });
    expect(parseListOrigin({ path: '/settings' })).toBeNull();
  });

  it('reads the current list location', () => {
    expect(originFromList('/ranking', '?pass4433=1')).toEqual({
      path: '/ranking',
      search: '?pass4433=1',
    });
    expect(originFromList('/data', '')).toBeNull();
    expect(isFundDetailPath('/funds/000001')).toBe(true);
    expect(isFundDetailPath('/funds')).toBe(false);
  });
});
