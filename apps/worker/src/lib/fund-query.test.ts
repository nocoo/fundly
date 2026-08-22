import { Database } from 'bun:sqlite';
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
    expect(built.listSql).toContain('p.return_1y DESC, b.fund_code ASC');
    expect(built.listSql).toContain('LIMIT ? OFFSET ?');
    expect(built.listParams.at(-2)).toBe(200);
    expect(built.listParams.at(-1)).toBe(400);
    expect(built.countSql).toContain('COUNT(*)');
    expect(built.countSql).toContain('LEFT JOIN fund_performance p ON p.fund_code = b.fund_code');
    expect(built.countParams).toHaveLength(5);
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

  it('keeps unavailable risk sorts instead of rewriting them', () => {
    const q = parseFundListQuery({ sort: 'sharpe_1y', dir: 'asc', minSamples: '200' });
    const resolved = resolveFundListQuery(q, false);
    expect(resolved.sort).toBe('sharpe_1y');
    const built = fundListSql(resolved, { risk: false });
    expect(built.listSql).toContain('WHERE 0=1');
    expect(built.countSql).toBe('SELECT 0 AS n');
  });

  it('builds peer percentiles before user filters for picks', () => {
    const q = parseFundListQuery({
      lens: 'picks',
      typeL1: '混合型',
      feePeer: '50',
      ddPeer: '50',
      sort: 'select_score',
      dir: 'desc',
    });
    const built = fundListSql(q, { risk: true, select: true });
    expect(built.listSql).toContain('AS fee_pct');
    expect(built.listSql).toContain('FROM (');
    expect(built.listSql).toContain('fee_pct <= ?');
    expect(q.feePeer).toBe(50);
  });

  it('executes picks SQL against sqlite', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE fund_basic_info (fund_code TEXT, fund_name TEXT, fund_type TEXT, pinyin_abbr TEXT, pinyin_full TEXT, in_mvp_pool INTEGER);
      CREATE TABLE fund_performance (fund_code TEXT, return_1m REAL, return_3m REAL, return_6m REAL, return_1y REAL, data_date TEXT, rank_pct_1m REAL, rank_pct_3m REAL, rank_pct_6m REAL, rank_pct_1y REAL, pass_4433 INTEGER);
      CREATE TABLE fund_risk_metrics (
        fund_code TEXT, sharpe_1y REAL, sharpe_3y REAL, sharpe_5y REAL,
        max_drawdown_1y REAL, max_drawdown_3y REAL, max_drawdown_5y REAL, max_drawdown_all REAL,
        volatility_1y REAL, volatility_3y REAL, volatility_5y REAL,
        calmar_1y REAL, calmar_3y REAL, sortino_1y REAL, sortino_3y REAL,
        nav_samples_1y INTEGER, nav_samples_3y INTEGER, nav_samples_5y INTEGER
      );
      CREATE TABLE fund_select_metrics (
        fund_code TEXT, ulcer_1y REAL, underwater_ratio_1y REAL, max_underwater_days_1y INTEGER,
        max_consec_down_1y INTEGER, down_day_ratio_1y REAL, worst_month_1y REAL,
        recovery_days_1y INTEGER, recovery_status_1y TEXT, dca_cagr_3y REAL, dca_vs_lump_3y REAL,
        dca_month_win_3y REAL, dca_month_vol_3y REAL, all_in_fee_pct REAL, select_score REAL,
        excess_hs300_1y REAL, scale_yi REAL, top10_weight_pct REAL, equity_ratio_pct REAL,
        inst_holder_pct REAL, sales_fee_known INTEGER, share_class TEXT
      );
    `);
    db.exec(`INSERT INTO fund_basic_info VALUES ('000001','测试','混合型-偏股','CS','CESHI',1)`);
    db.exec(`INSERT INTO fund_performance VALUES ('000001',1,2,3,4,'2026-08-01',10,10,10,10,1)`);
    db.exec(
      `INSERT INTO fund_risk_metrics VALUES ('000001',1,1,1,10,10,10,10,5,5,5,0.5,0.5,0.5,0.5,250,250,250)`,
    );
    db.exec(
      `INSERT INTO fund_select_metrics VALUES ('000001',1,1,1,1,1,1,1,'recovered',1,1,1,1,1.2,80,1,10,20,60,10,1,'A')`,
    );
    const q = parseFundListQuery({
      lens: 'picks',
      typeL1: '混合型',
      feePeer: '50',
      sort: 'select_score',
      dir: 'desc',
    });
    const built = fundListSql(q, { risk: true, select: true });
    expect(() => db.query(built.listSql).all(...built.listParams)).not.toThrow();
    db.close();
  });

  it('returns empty sql when select or money satellites are missing', () => {
    const hold = fundListSql(parseFundListQuery({ sort: 'ulcer_1y' }), { select: false });
    expect(hold.listSql).toContain('WHERE 0=1');
    const picks = fundListSql(
      parseFundListQuery({ lens: 'picks', feePeer: '50', sort: 'select_score' }),
      { select: false },
    );
    expect(picks.listSql).toContain('WHERE 0=1');
    const money = fundListSql(parseFundListQuery({ sort: 'seven_day_yield' }), { money: false });
    expect(money.listSql).toContain('WHERE 0=1');
    expect(money.listSql).not.toContain('y.seven_day_yield');
  });

  it('joins the latest fresh seven-day yield', () => {
    const built = fundListSql(parseFundListQuery({ sort: 'seven_day_yield', dir: 'desc' }), {
      money: true,
    });
    expect(built.listSql).toContain('fund_money_yield');
    expect(built.listSql).toContain("date((SELECT MAX(nav_date) FROM fund_money_yield), '-7 day')");
    expect(built.listSql).toContain('ORDER BY y.seven_day_yield DESC');
  });

  it('orders recovered funds before open then insufficient', () => {
    const built = fundListSql(
      parseFundListQuery({ sort: 'recovery_days_1y', dir: 'asc', metricNotNull: '1' }),
      { select: true },
    );
    expect(built.listSql).toContain("WHEN 'recovered' THEN 0 WHEN 'open' THEN 1 ELSE 2 END");
    expect(built.listSql).toContain("IN ('recovered', 'open')");
    expect(built.listSql).toContain('s.recovery_status_1y');
  });

  it('recalls search tokens with AND and scores exact codes first', () => {
    const built = fundListSql(parseFundListQuery({ q: '易方达300', sort: 'fund_code' }));
    expect((built.listSql.match(/LIKE \?/g) ?? []).length).toBeGreaterThanOrEqual(8);
    expect(built.listSql).toContain('ORDER BY (');
    expect(built.listParams[0]).toBe('%易方达%');
    expect(built.listParams).toContain('易方达300');
    const empty = fundListSql(parseFundListQuery({ q: '***' }));
    expect(empty.listSql).toContain('0=1');
  });

  it('keeps peer percentiles at or below 100 when a peer is null', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE fund_basic_info (fund_code TEXT, fund_name TEXT, fund_type TEXT, pinyin_abbr TEXT, pinyin_full TEXT, in_mvp_pool INTEGER);
      CREATE TABLE fund_performance (fund_code TEXT, return_1m REAL, return_3m REAL, return_6m REAL, return_1y REAL, data_date TEXT, rank_pct_1m REAL, rank_pct_3m REAL, rank_pct_6m REAL, rank_pct_1y REAL, pass_4433 INTEGER);
      CREATE TABLE fund_select_metrics (
        fund_code TEXT, ulcer_1y REAL, underwater_ratio_1y REAL, max_underwater_days_1y INTEGER,
        max_consec_down_1y INTEGER, down_day_ratio_1y REAL, worst_month_1y REAL,
        recovery_days_1y INTEGER, recovery_status_1y TEXT, dca_cagr_3y REAL, dca_vs_lump_3y REAL,
        dca_month_win_3y REAL, dca_month_vol_3y REAL, all_in_fee_pct REAL, select_score REAL,
        excess_hs300_1y REAL, scale_yi REAL, top10_weight_pct REAL, equity_ratio_pct REAL,
        inst_holder_pct REAL, sales_fee_known INTEGER, share_class TEXT
      );
    `);
    db.exec(`INSERT INTO fund_basic_info VALUES ('000001','有费','混合型-偏股','A','A',1)`);
    db.exec(`INSERT INTO fund_basic_info VALUES ('000002','无费','混合型-偏股','B','B',1)`);
    db.exec(`INSERT INTO fund_performance VALUES ('000001',1,1,1,1,'2026-08-01',10,10,10,10,1)`);
    db.exec(`INSERT INTO fund_performance VALUES ('000002',1,1,1,1,'2026-08-01',10,10,10,10,1)`);
    db.exec(
      `INSERT INTO fund_select_metrics VALUES ('000001',1,1,1,1,1,1,1,'recovered',1,1,1,1,1.0,80,1,10,20,60,10,1,'A')`,
    );
    db.exec(
      `INSERT INTO fund_select_metrics VALUES ('000002',1,1,1,1,1,1,1,'open',1,1,1,1,NULL,70,1,NULL,20,60,10,0,'C')`,
    );
    const q = parseFundListQuery({
      lens: 'picks',
      typeL1: '混合型',
      feePeer: '100',
      sort: 'select_score',
      dir: 'desc',
    });
    const built = fundListSql(q, { select: true });
    const rows = db.query(built.listSql).all(...built.listParams) as Array<{ fee_pct: number }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.fee_pct).toBeLessThanOrEqual(100);
    db.close();
  });
});
