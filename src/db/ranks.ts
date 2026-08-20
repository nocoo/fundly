import type { Database } from 'bun:sqlite';
import {
  assignRanks,
  navReturn,
  pass4433,
  RANK_RETURN_FIELDS,
  type RankReturnField,
  windowStartDate,
} from '../utils/period-returns.ts';

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

function crawledReturn(row: PerfRow, field: RankReturnField): number | null {
  const value = row[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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

  const resolved: Array<{
    fundCode: string;
    fundType: string;
    returns: Record<RankReturnField, number | null>;
  }> = [];

  for (const row of funds) {
    const last = lastStmt.get(row.fund_code) as NavRow | null;
    const lastEnds = last ? { acc: last.acc_nav, unit: last.unit_nav } : null;
    const returns = {} as Record<RankReturnField, number | null>;
    for (const field of RANK_RETURN_FIELDS) {
      const crawled = crawledReturn(row, field);
      if (crawled != null) {
        returns[field] = crawled;
        continue;
      }
      if (!last) {
        returns[field] = null;
        continue;
      }
      const start = windowStartDate(last.nav_date, field);
      if (!start || start >= last.nav_date) {
        returns[field] = null;
        continue;
      }
      const at = asOfStmt.get(row.fund_code, start) as {
        acc_nav: number | null;
        unit_nav: number | null;
      } | null;
      returns[field] = navReturn(at ? { acc: at.acc_nav, unit: at.unit_nav } : null, lastEnds);
    }
    resolved.push({ fundCode: row.fund_code, fundType: row.fund_type, returns });
  }

  const byType = new Map<string, typeof resolved>();
  for (const item of resolved) {
    const list = byType.get(item.fundType) ?? [];
    list.push(item);
    byType.set(item.fundType, list);
  }

  const ranks = new Map<
    string,
    {
      rank_pct_1m: number | null;
      rank_pct_3m: number | null;
      rank_pct_6m: number | null;
      rank_pct_1y: number | null;
      rank_pct_2y: number | null;
      rank_pct_3y: number | null;
      rank_pct_5y: number | null;
    }
  >();

  for (const group of byType.values()) {
    const assigned = {
      rank_pct_1m: assignRanks(
        group.map((item) => ({ fundCode: item.fundCode, value: item.returns.return_1m })),
      ),
      rank_pct_3m: assignRanks(
        group.map((item) => ({ fundCode: item.fundCode, value: item.returns.return_3m })),
      ),
      rank_pct_6m: assignRanks(
        group.map((item) => ({ fundCode: item.fundCode, value: item.returns.return_6m })),
      ),
      rank_pct_1y: assignRanks(
        group.map((item) => ({ fundCode: item.fundCode, value: item.returns.return_1y })),
      ),
      rank_pct_2y: assignRanks(
        group.map((item) => ({ fundCode: item.fundCode, value: item.returns.return_2y })),
      ),
      rank_pct_3y: assignRanks(
        group.map((item) => ({ fundCode: item.fundCode, value: item.returns.return_3y })),
      ),
      rank_pct_5y: assignRanks(
        group.map((item) => ({ fundCode: item.fundCode, value: item.returns.return_5y })),
      ),
    };
    for (const item of group) {
      ranks.set(item.fundCode, {
        rank_pct_1m: assigned.rank_pct_1m.get(item.fundCode) ?? null,
        rank_pct_3m: assigned.rank_pct_3m.get(item.fundCode) ?? null,
        rank_pct_6m: assigned.rank_pct_6m.get(item.fundCode) ?? null,
        rank_pct_1y: assigned.rank_pct_1y.get(item.fundCode) ?? null,
        rank_pct_2y: assigned.rank_pct_2y.get(item.fundCode) ?? null,
        rank_pct_3y: assigned.rank_pct_3y.get(item.fundCode) ?? null,
        rank_pct_5y: assigned.rank_pct_5y.get(item.fundCode) ?? null,
      });
    }
  }

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

  return { funds: resolved.length, types: byType.size, pass4433: pass };
}
