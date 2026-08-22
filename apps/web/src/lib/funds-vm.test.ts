import { describe, expect, it } from 'bun:test';
import {
  DEFAULT_FUNDS_FILTERS,
  fundsSearchEmpty,
  fundsUrlState,
  parseFundsSearch,
  parseStoredFundsFilters,
} from './funds-vm';

describe('funds filters', () => {
  it('parses search params and drops defaults from the url state', () => {
    const params = new URLSearchParams('q=华夏&typeL1=混合型&mvpOnly=1&dir=desc&page=3');
    const filters = parseFundsSearch(params);
    expect(filters.q).toBe('华夏');
    expect(filters.mvpOnly).toBe(true);
    expect(filters.dir).toBe('desc');
    expect(filters.page).toBe(3);
    expect(fundsUrlState(filters)).toMatchObject({
      q: '华夏',
      typeL1: '混合型',
      mvpOnly: '1',
      dir: 'desc',
      page: '3',
      sort: null,
    });
  });

  it('treats junk sort and page as defaults', () => {
    const filters = parseFundsSearch(new URLSearchParams('sort=__proto__&page=-2'));
    expect(filters.sort).toBe('fund_code');
    expect(filters.page).toBe(1);
    expect(fundsSearchEmpty(new URLSearchParams())).toBe(true);
    expect(fundsSearchEmpty(new URLSearchParams('q=a'))).toBe(false);
  });

  it('reads persisted json', () => {
    expect(parseStoredFundsFilters(null)).toBeNull();
    expect(
      parseStoredFundsFilters({
        q: ' 易方达 ',
        mvpOnly: true,
        sort: 'return_1y',
        page: '2',
      }),
    ).toMatchObject({
      q: '易方达',
      mvpOnly: true,
      sort: 'return_1y',
      page: 2,
      dir: 'asc',
    });
    expect(parseStoredFundsFilters({})).toEqual(DEFAULT_FUNDS_FILTERS);
  });
});
