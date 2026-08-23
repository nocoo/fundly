import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';
import { parseShareClass } from '../../../../src/analytics/share-class';
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

  it('does not apply minSamples to max_drawdown_all', () => {
    const built = fundListSql(parseFundListQuery({ sort: 'max_drawdown_all', minSamples: '200' }), {
      risk: true,
    });
    expect(built.listSql).not.toContain('nav_samples_1y >=');
  });

  it('returns empty when the sort column is missing from a thin satellite table', () => {
    const built = fundListSql(parseFundListQuery({ sort: 'sharpe_3y' }), {
      risk: true,
      riskCols: new Set(['sharpe_1y', 'nav_samples_1y']),
    });
    expect(built.listSql).toContain('WHERE 0=1');
  });

  it('does not treat short bases like 甲A类 as share A', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE fund_basic_info (fund_code TEXT, fund_name TEXT, fund_type TEXT, pinyin_abbr TEXT, pinyin_full TEXT, in_mvp_pool INTEGER);
      CREATE TABLE fund_performance (fund_code TEXT, return_1m REAL, return_3m REAL, return_6m REAL, return_1y REAL, data_date TEXT, rank_pct_1m REAL, rank_pct_3m REAL, rank_pct_6m REAL, rank_pct_1y REAL, pass_4433 INTEGER);
    `);
    const names = [
      ['000001', '甲人民币A'],
      ['000002', '甲乙A'],
      ['000003', '指数A'],
      ['000004', '甲乙A\t'],
      ['000005', '甲乙A\n'],
      ['000006', '甲乙A\u00a0'],
      ['000007', '甲乙人民币a'],
      ['000008', '某沪深300ETF'],
      ['000009', '甲 A'],
    ];
    for (const [code, name] of names) {
      db.exec(`INSERT INTO fund_basic_info VALUES ('${code}','${name}','混合型-偏股','X','X',1)`);
      db.exec(`INSERT INTO fund_performance VALUES ('${code}',1,2,3,4,'2026-08-01',10,10,10,10,1)`);
    }
    const rowsForLetter = db
      .query('SELECT fund_code, fund_name FROM fund_basic_info')
      .all() as Array<{ fund_code: string; fund_name: string }>;
    const shareCodes = rowsForLetter
      .filter((row) => parseShareClass(row.fund_name).letter === 'A')
      .map((row) => row.fund_code);
    const built = fundListSql(parseFundListQuery({ q: 'A', sort: 'fund_code' }), { shareCodes });
    const rows = db.query(built.listSql).all(...built.listParams) as Array<{ fund_name: string }>;
    expect(rows.map((row) => row.fund_name).sort()).toEqual([
      '指数A',
      '甲乙A',
      '甲乙A\t',
      '甲乙A\n',
      '甲乙A\u00a0',
    ]);
    db.close();
  });

  it('does not treat currency-suffixed ETF/QDII tails as share letters', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE fund_basic_info (fund_code TEXT, fund_name TEXT, fund_type TEXT, pinyin_abbr TEXT, pinyin_full TEXT, in_mvp_pool INTEGER);
      CREATE TABLE fund_performance (fund_code TEXT, return_1m REAL, return_3m REAL, return_6m REAL, return_1y REAL, data_date TEXT, rank_pct_1m REAL, rank_pct_3m REAL, rank_pct_6m REAL, rank_pct_1y REAL, pass_4433 INTEGER);
    `);
    const names = [
      ['000001', '某沪深300ETF人民币'],
      ['000002', '某ET人民币F'],
      ['000003', '易方达安悦超短债F'],
      ['000004', '某全球QDII人民币'],
      ['000005', '指数I'],
      ['000006', '某ET 人民币F'],
      ['000007', '某QDI I'],
    ];
    for (const [code, name] of names) {
      db.query('INSERT INTO fund_basic_info VALUES (?, ?, ?, ?, ?, 1)').run(
        code,
        name,
        '混合型-偏股',
        'X',
        'X',
      );
      db.exec(`INSERT INTO fund_performance VALUES ('${code}',1,2,3,4,'2026-08-01',10,10,10,10,1)`);
    }
    const rowsForLetter = db
      .query('SELECT fund_code, fund_name FROM fund_basic_info')
      .all() as Array<{ fund_code: string; fund_name: string }>;
    const shareCodes = (letter: string) =>
      rowsForLetter
        .filter((row) => parseShareClass(row.fund_name).letter === letter)
        .map((row) => row.fund_code);
    const f = fundListSql(parseFundListQuery({ q: 'F', sort: 'fund_code' }), {
      shareCodes: shareCodes('F'),
    });
    const fRows = db.query(f.listSql).all(...f.listParams) as Array<{ fund_name: string }>;
    expect(fRows.map((row) => row.fund_name)).toEqual(['易方达安悦超短债F']);
    const i = fundListSql(parseFundListQuery({ q: 'I', sort: 'fund_code' }), {
      shareCodes: shareCodes('I'),
    });
    const iRows = db.query(i.listSql).all(...i.listParams) as Array<{ fund_name: string }>;
    expect(iRows.map((row) => row.fund_name)).toEqual(['指数I']);
    db.close();
  });

  it('keeps share-letter fallback SQL under the 100kb statement limit', () => {
    const worst = fundListSql(
      parseFundListQuery({
        q: 'A',
        sort: 'all_in_fee_pct',
        typeL1: '混合型',
        typeL2: '偏股',
        mvpOnly: '1',
        hasNav: '1',
        pass4433: '1',
        metricNotNull: '1',
        pageSize: '500',
      }),
      { fees: true },
    );
    expect(new TextEncoder().encode(worst.listSql).length).toBeLessThan(100_000);
    expect(new TextEncoder().encode(worst.countSql).length).toBeLessThan(100_000);
  });

  it('does not join select metrics for a plain share-letter query', () => {
    const built = fundListSql(parseFundListQuery({ q: 'A', sort: 'fund_code' }), {
      shareCodes: ['000002'],
    });
    expect(built.listSql).not.toContain('fund_select_metrics');
    expect(built.listSql).toContain('b.fund_code IN (?)');
  });

  it('scores stored share_class matches without boosting empty classes', () => {
    const built = fundListSql(parseFundListQuery({ q: '测试A', sort: 'fund_code' }), {
      scoreShareCodes: ['000002'],
    });
    expect(built.listParams).toContain('000002');
    expect(built.listParams).not.toContain('000001');
    expect(built.listSql).toContain('b.fund_code IN (?)');
  });

  it('projects share_class so picks search can score share letters', () => {
    const built = fundListSql(
      parseFundListQuery({
        q: 'A',
        lens: 'picks',
        feePeer: '50',
        sort: 'select_score',
        dir: 'desc',
      }),
      { select: true },
    );
    expect(built.listSql).toContain('share_class');
  });

  it('returns empty when peer filters reference missing columns', () => {
    const built = fundListSql(
      parseFundListQuery({ lens: 'picks', ddPeer: '50', sort: 'select_score' }),
      {
        select: true,
        risk: true,
        riskCols: new Set(['sharpe_1y']),
        selectCols: new Set(['select_score']),
      },
    );
    expect(built.listSql).toContain('WHERE 0=1');
  });

  it('sorts unknown sales fees after known all-in fees', () => {
    const built = fundListSql(parseFundListQuery({ sort: 'all_in_fee_pct', dir: 'asc' }), {
      select: true,
      fees: true,
    });
    expect(built.listSql).toContain('THEN 0 ELSE 1 END');
    expect(built.listSql).toContain('fee_shown_pct');
  });

  it('joins select metrics for cost sort when the table exists', () => {
    const built = fundListSql(parseFundListQuery({ sort: 'all_in_fee_pct' }), {
      select: true,
      fees: true,
    });
    expect(built.listSql).toContain('fund_select_metrics');
    expect(built.listSql).toContain('WHEN s.all_in_fee_pct IS NOT NULL THEN s.all_in_fee_pct');
  });

  it('flattens fee aliases in picks peer queries', () => {
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
      CREATE TABLE fund_fees (fund_code TEXT, mgmt_fee_pct REAL, custodian_fee_pct REAL, sales_service_fee_pct REAL);
    `);
    db.exec(`INSERT INTO fund_basic_info VALUES ('000001','测试','混合型-偏股','CS','CESHI',1)`);
    db.exec(`INSERT INTO fund_performance VALUES ('000001',1,2,3,4,'2026-08-01',10,10,10,10,1)`);
    db.exec(
      `INSERT INTO fund_select_metrics VALUES ('000001',1,1,1,1,1,1,1,'recovered',1,1,1,1,1.5,80,1,10,20,60,10,1,'A')`,
    );
    db.exec(`INSERT INTO fund_fees VALUES ('000001',1.2,0.2,0.1)`);
    const built = fundListSql(
      parseFundListQuery({
        sort: 'all_in_fee_pct',
        feePeer: '50',
        metricNotNull: '1',
      }),
      { select: true, fees: true },
    );
    expect(() => db.query(built.listSql).all(...built.listParams)).not.toThrow();
    db.close();
  });

  it('prefers select all-in over fees when both tables exist', () => {
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
      CREATE TABLE fund_fees (fund_code TEXT, mgmt_fee_pct REAL, custodian_fee_pct REAL, sales_service_fee_pct REAL);
    `);
    db.exec(`INSERT INTO fund_basic_info VALUES ('000001','贵','混合型-偏股','G','GUI',1)`);
    db.exec(`INSERT INTO fund_basic_info VALUES ('000002','便宜','混合型-偏股','P','PIANYI',1)`);
    db.exec(`INSERT INTO fund_performance VALUES ('000001',1,2,3,4,'2026-08-01',10,10,10,10,1)`);
    db.exec(`INSERT INTO fund_performance VALUES ('000002',1,2,3,4,'2026-08-01',10,10,10,10,1)`);
    db.exec(
      `INSERT INTO fund_select_metrics VALUES ('000001',1,1,1,1,1,1,1,'recovered',1,1,1,1,2.0,80,1,10,20,60,10,1,'A')`,
    );
    db.exec(
      `INSERT INTO fund_select_metrics VALUES ('000002',1,1,1,1,1,1,1,'recovered',1,1,1,1,1.0,80,1,10,20,60,10,1,'C')`,
    );
    db.exec(`INSERT INTO fund_fees VALUES ('000001',0.1,0.1,0.1)`);
    db.exec(`INSERT INTO fund_fees VALUES ('000002',3.0,1.0,1.0)`);
    const built = fundListSql(parseFundListQuery({ sort: 'all_in_fee_pct', metricNotNull: '1' }), {
      select: true,
      fees: true,
    });
    const rows = db.query(built.listSql).all(...built.listParams) as Array<{
      fund_code: string;
      fee_shown_pct: number;
    }>;
    expect(rows.map((row) => row.fund_code)).toEqual(['000002', '000001']);
    expect(rows[0]?.fee_shown_pct).toBe(1);
    expect(rows[1]?.fee_shown_pct).toBe(2);
    db.close();
  });

  it('can sort costs from fund_fees when select metrics are missing', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE fund_basic_info (fund_code TEXT, fund_name TEXT, fund_type TEXT, pinyin_abbr TEXT, pinyin_full TEXT, in_mvp_pool INTEGER);
      CREATE TABLE fund_performance (fund_code TEXT, return_1m REAL, return_3m REAL, return_6m REAL, return_1y REAL, data_date TEXT, rank_pct_1m REAL, rank_pct_3m REAL, rank_pct_6m REAL, rank_pct_1y REAL, pass_4433 INTEGER);
      CREATE TABLE fund_fees (fund_code TEXT, mgmt_fee_pct REAL, custodian_fee_pct REAL, sales_service_fee_pct REAL);
    `);
    db.exec(`INSERT INTO fund_basic_info VALUES ('000001','测试','混合型-偏股','CS','CESHI',1)`);
    db.exec(`INSERT INTO fund_performance VALUES ('000001',1,2,3,4,'2026-08-01',10,10,10,10,1)`);
    db.exec(`INSERT INTO fund_fees VALUES ('000001',1.2,0.2,NULL)`);
    const built = fundListSql(parseFundListQuery({ sort: 'all_in_fee_pct', metricNotNull: '1' }), {
      fees: true,
      feeCols: new Set(['mgmt_fee_pct', 'custodian_fee_pct', 'sales_service_fee_pct']),
    });
    const rows = db.query(built.listSql).all(...built.listParams) as Array<{
      fee_shown_pct: number;
    }>;
    expect(rows[0]?.fee_shown_pct).toBeCloseTo(1.4);
    db.close();
  });

  it('keeps top10Max above 100 and does not floor fractions', () => {
    expect(parseFundListQuery({ top10Max: '120' }).top10Max).toBe(120);
    expect(parseFundListQuery({ top10Max: '60.9' }).top10Max).toBe(60.9);
  });

  it('projects missing risk columns as null instead of selecting them', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE fund_basic_info (fund_code TEXT, fund_name TEXT, fund_type TEXT, pinyin_abbr TEXT, pinyin_full TEXT, in_mvp_pool INTEGER);
      CREATE TABLE fund_performance (fund_code TEXT, return_1m REAL, return_3m REAL, return_6m REAL, return_1y REAL, data_date TEXT, rank_pct_1m REAL, rank_pct_3m REAL, rank_pct_6m REAL, rank_pct_1y REAL, pass_4433 INTEGER);
      CREATE TABLE fund_risk_metrics (fund_code TEXT, sharpe_1y REAL, nav_samples_1y INTEGER);
    `);
    db.exec(`INSERT INTO fund_basic_info VALUES ('000001','测试','混合型-偏股','CS','CESHI',1)`);
    db.exec(`INSERT INTO fund_performance VALUES ('000001',1,2,3,4,'2026-08-01',10,10,10,10,1)`);
    db.exec(`INSERT INTO fund_risk_metrics VALUES ('000001',1.2,250)`);
    const q = parseFundListQuery({ sort: 'sharpe_1y', dir: 'desc' });
    const built = fundListSql(q, {
      risk: true,
      riskCols: new Set(['sharpe_1y', 'nav_samples_1y']),
    });
    expect(built.listSql).toContain('NULL AS sharpe_3y');
    expect(() => db.query(built.listSql).all(...built.listParams)).not.toThrow();
    db.close();
  });

  it('still joins risk samples when picks turns ddPeer off', () => {
    const built = fundListSql(
      parseFundListQuery({
        lens: 'picks',
        minSamples: '200',
        sort: 'select_score',
        dir: 'desc',
      }),
      { risk: true, select: true },
    );
    expect(built.listSql).toContain('fund_risk_metrics');
    expect(built.listSql).toContain('r.nav_samples_1y >= ?');
    expect(built.listSql).not.toContain('dd_pct');
  });

  it('excludes unknown sales fees from feePeer percentiles', () => {
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
    db.exec(`INSERT INTO fund_basic_info VALUES ('000001','已知','混合型-偏股','A','A',1)`);
    db.exec(`INSERT INTO fund_basic_info VALUES ('000002','未知','混合型-偏股','B','B',1)`);
    db.exec(`INSERT INTO fund_performance VALUES ('000001',1,1,1,1,'2026-08-01',10,10,10,10,1)`);
    db.exec(`INSERT INTO fund_performance VALUES ('000002',1,1,1,1,'2026-08-01',10,10,10,10,1)`);
    db.exec(
      `INSERT INTO fund_select_metrics VALUES ('000001',1,1,1,1,1,1,1,'recovered',1,1,1,1,2.0,80,1,10,20,60,10,1,'A')`,
    );
    db.exec(
      `INSERT INTO fund_select_metrics VALUES ('000002',1,1,1,1,1,1,1,'open',1,1,1,1,1.0,70,1,NULL,20,60,10,0,'C')`,
    );
    const q = parseFundListQuery({
      lens: 'picks',
      typeL1: '混合型',
      feePeer: '100',
      sort: 'select_score',
      dir: 'desc',
    });
    const built = fundListSql(q, { select: true });
    const rows = db.query(built.listSql).all(...built.listParams) as Array<{
      fund_code: string;
      fee_pct: number | null;
    }>;
    expect(rows.map((row) => row.fund_code)).toEqual(['000001']);
    expect(rows[0]?.fee_pct).toBe(100);
    db.close();
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
