import { describe, expect, it } from 'bun:test';
import { DEFAULT_PAGE_SIZE, fundListSql, parseFundListQuery } from './fund-query';

describe('parseFundListQuery', () => {
  it('defaults to page size 200, fund_code asc, page 1', () => {
    const q = parseFundListQuery({});
    expect(q.pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(q.page).toBe(1);
    expect(q.sort).toBe('fund_code');
    expect(q.dir).toBe('asc');
    expect(q.mvpOnly).toBe(false);
  });

  it('combines text, type, mvp and hasNav filters', () => {
    const q = parseFundListQuery({
      q: '华夏',
      fundType: '混合型-灵活',
      mvpOnly: '1',
      hasNav: 'true',
      sort: 'return_1y',
      dir: 'desc',
      page: '2',
    });
    expect(q.q).toBe('华夏');
    expect(q.fundType).toBe('混合型-灵活');
    expect(q.mvpOnly).toBe(true);
    expect(q.hasNav).toBe(true);
    expect(q.sort).toBe('return_1y');
    expect(q.dir).toBe('desc');
    expect(q.page).toBe(2);
    expect(parseFundListQuery({ page: 'Infinity' }).page).toBe(1);
    expect(parseFundListQuery({ page: '1.9' }).page).toBe(1);
  });
});

describe('fundListSql', () => {
  it('emits combined WHERE, header sort, and 200-row page', () => {
    const q = parseFundListQuery({
      q: '华夏',
      fundType: '股票型',
      mvpOnly: '1',
      sort: 'return_1y',
      dir: 'desc',
      page: '3',
    });
    const built = fundListSql(q);
    expect(built.listSql).toContain('b.fund_code LIKE ?');
    expect(built.listSql).toContain('b.fund_type = ?');
    expect(built.listSql).toContain('b.in_mvp_pool = 1');
    expect(built.listSql).toContain('ORDER BY p.return_1y DESC');
    expect(built.listSql).toContain('LIMIT ? OFFSET ?');
    expect(built.listParams.at(-2)).toBe(200);
    expect(built.listParams.at(-1)).toBe(400);
    expect(built.countSql).toContain('COUNT(*)');
    expect(built.countParams).toHaveLength(4);
  });
});
