import { describe, expect, it } from 'bun:test';
import {
  DEFAULT_PAGE_SIZE,
  fundListSql,
  parseFundListQuery,
  resolveFundListQuery,
} from './fund-query';

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
    expect(parseFundListQuery({ page: '0.5', pageSize: '0.5' })).toMatchObject({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
    });
  });

  it('rejects prototype sort keys and treats typeL1=all as no filter', () => {
    expect(parseFundListQuery({ sort: 'toString' }).sort).toBe('fund_code');
    expect(parseFundListQuery({ sort: 'constructor' }).sort).toBe('fund_code');
    expect(parseFundListQuery({ sort: '__proto__' }).sort).toBe('fund_code');
    expect(parseFundListQuery({ sort: 'sharpe_1y' }).sort).toBe('sharpe_1y');
    expect(parseFundListQuery({ typeL1: 'all' }).typeL1).toBeUndefined();
    expect(parseFundListQuery({ typeL1: '混合型' }).typeL1).toBe('混合型');
  });

  it('parses ranking flags', () => {
    const q = parseFundListQuery({
      pass4433: '1',
      metricNotNull: 'true',
      minSamples: '200',
      sort: 'max_drawdown_1y',
      dir: 'asc',
    });
    expect(q.pass4433).toBe(true);
    expect(q.metricNotNull).toBe(true);
    expect(q.minSamples).toBe(200);
    expect(q.sort).toBe('max_drawdown_1y');
    expect(q.dir).toBe('asc');
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
    expect(built.listSql).toContain('ORDER BY p.return_1y DESC, b.fund_code ASC');
    expect(built.listSql).toContain('LIMIT ? OFFSET ?');
    expect(built.listParams.at(-2)).toBe(200);
    expect(built.listParams.at(-1)).toBe(400);
    expect(built.countSql).toContain('COUNT(*)');
    expect(built.countSql).toContain('LEFT JOIN fund_performance p ON p.fund_code = b.fund_code');
    expect(built.countParams).toHaveLength(4);
  });

  it('filters L1 as prefix and L2 as exact joined type', () => {
    const l1 = fundListSql(parseFundListQuery({ typeL1: '混合型' }));
    expect(l1.listSql).toContain('b.fund_type = ? OR b.fund_type LIKE ?');
    expect(l1.countParams).toEqual(['混合型', '混合型-%']);
    const both = fundListSql(parseFundListQuery({ typeL1: '混合型', typeL2: '偏股' }));
    expect(both.listSql).toContain('b.fund_type = ?');
    expect(both.countParams).toEqual(['混合型-偏股']);
  });

  it('keeps list and count on the same join and ranking filters', () => {
    const q = parseFundListQuery({
      typeL1: '混合型',
      sort: 'sharpe_1y',
      dir: 'desc',
      pass4433: '1',
      metricNotNull: '1',
      minSamples: '200',
    });
    const built = fundListSql(q, { risk: true });
    expect(built.listSql).toContain('LEFT JOIN fund_risk_metrics r ON r.fund_code = b.fund_code');
    expect(built.countSql).toContain('LEFT JOIN fund_risk_metrics r ON r.fund_code = b.fund_code');
    expect(built.listSql).toContain('p.pass_4433 = 1');
    expect(built.countSql).toContain('p.pass_4433 = 1');
    expect(built.listSql).toContain('r.sharpe_1y IS NOT NULL');
    expect(built.countSql).toContain('r.sharpe_1y IS NOT NULL');
    expect(built.listSql).toContain('r.nav_samples_1y >= ?');
    expect(built.countParams).toEqual(['混合型', '混合型-%', 200]);
    expect(built.listParams.slice(0, 3)).toEqual(built.countParams);
  });

  it('does not join risk metrics when sorting returns', () => {
    const built = fundListSql(parseFundListQuery({ sort: 'return_1y', dir: 'desc' }), {
      risk: true,
    });
    expect(built.listSql).not.toContain('fund_risk_metrics');
    expect(built.countSql).not.toContain('fund_risk_metrics');
    expect(built.listSql).toContain('NULL AS sharpe_1y');
  });

  it('falls back risk sorts when the table is unavailable', () => {
    const q = parseFundListQuery({ sort: 'sharpe_1y', dir: 'asc', minSamples: '200' });
    const resolved = resolveFundListQuery(q, false);
    expect(resolved.sort).toBe('return_1y');
    expect(resolved.dir).toBe('desc');
    expect(resolved.minSamples).toBeUndefined();
    const built = fundListSql(resolved, { risk: false });
    expect(built.listSql).not.toContain('fund_risk_metrics');
    expect(built.listSql).toContain('NULL AS sharpe_1y');
  });
});
