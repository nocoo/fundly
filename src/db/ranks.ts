import type { Database } from 'bun:sqlite';
import {
  isCrawledReturnField,
  pass4433,
  planReturnLookups,
  RANK_RETURN_FIELDS,
  type RankReturnField,
  rankPeerGroups,
  resolveFundReturns,
} from '../metrics/index.ts';

type PerfRow = {
  fund_code: string;
  fund_type: string;
  return_1m: number | null;
  return_3m: number | null;
  return_6m: number | null;
  return_1y: number | null;
  return_2y: number | null;
  return_3y: number | null;
  return_5y: number | null;
};

type NavRow = { nav_date: string; acc_nav: number | null; unit_nav: number | null };

export type RankRefreshResult = {
  funds: number;
  types: number;
  pass4433: number;
};

function crawledOf(row: PerfRow): Partial<Record<RankReturnField, number | null>> {
  return {
    return_1m: row.return_1m,
    return_3m: row.return_3m,
    return_6m: row.return_6m,
    return_1y: row.return_1y,
  };
}

export function refreshRanks(db: Database): RankRefreshResult {
  const funds = db
    .query(
      `SELECT b.fund_code, b.fund_type,
              p.return_1m, p.return_3m, p.return_6m, p.return_1y,
              p.return_2y, p.return_3y, p.return_5y
       FROM fund_basic_info b
       JOIN fund_performance p ON p.fund_code = b.fund_code`,
    )
    .all() as PerfRow[];

  const lastStmt = db.query(
    `SELECT nav_date, acc_nav, unit_nav FROM fund_nav
     WHERE fund_code = ? ORDER BY nav_date DESC LIMIT 1`,
  );
  const asOfStmt = db.query(
    `SELECT acc_nav, unit_nav FROM fund_nav
     WHERE fund_code = ? AND nav_date <= ? ORDER BY nav_date DESC LIMIT 1`,
  );

  const resolved = funds.map((row) => {
    const last = lastStmt.get(row.fund_code) as NavRow | null;
    const crawled = crawledOf(row);
    const needNav = RANK_RETURN_FIELDS.filter(
      (field) => !(isCrawledReturnField(field) && crawled[field] != null),
    );
    const plan = planReturnLookups(needNav, last?.nav_date ?? null);
    const asOf: Partial<
      Record<RankReturnField, { acc: number | null; unit: number | null } | null>
    > = {};
    for (const window of plan.windows) {
      const at = asOfStmt.get(row.fund_code, window.start) as {
        acc_nav: number | null;
        unit_nav: number | null;
      } | null;
      asOf[window.field as RankReturnField] = at ? { acc: at.acc_nav, unit: at.unit_nav } : null;
    }
    const returns = resolveFundReturns({
      fields: RANK_RETURN_FIELDS,
      crawled,
      last: last ? { date: last.nav_date, acc: last.acc_nav, unit: last.unit_nav } : null,
      asOf,
    }) as Record<RankReturnField, number | null>;
    return { fundCode: row.fund_code, fundType: row.fund_type, returns };
  });

  const types = new Set(resolved.map((item) => item.fundType)).size;
  const ranks = rankPeerGroups(resolved);
  const upd = db.prepare(
    `UPDATE fund_performance SET
       rank_pct_1m = ?, rank_pct_3m = ?, rank_pct_6m = ?, rank_pct_1y = ?,
       rank_pct_2y = ?, rank_pct_3y = ?, rank_pct_5y = ?, pass_4433 = ?, updated_at = ?
     WHERE fund_code = ?`,
  );
  const now = Date.now();
  let pass = 0;
  db.transaction(() => {
    for (const item of resolved) {
      const row = ranks.get(item.fundCode);
      if (!row) continue;
      const flag = pass4433(row);
      if (flag === 1) pass += 1;
      upd.run(
        row.rank_pct_1m,
        row.rank_pct_3m,
        row.rank_pct_6m,
        row.rank_pct_1y,
        row.rank_pct_2y,
        row.rank_pct_3y,
        row.rank_pct_5y,
        flag,
        now,
        item.fundCode,
      );
    }
  })();

  return { funds: resolved.length, types, pass4433: pass };
}
