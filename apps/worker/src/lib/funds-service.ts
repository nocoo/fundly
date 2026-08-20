import type { QueryExec } from './executor';
import { type FieldView, mapFundDetail, presentField } from './fund-detail';
import { type FundExtras, parseFundExtras } from './fund-extra';
import { type FundListQuery, fundListSql } from './fund-query';

export async function listFunds(exec: QueryExec, query: FundListQuery) {
  const built = fundListSql(query);
  const [rows, countRow] = await Promise.all([
    exec.all<Record<string, unknown>>(built.listSql, built.listParams),
    exec.first<{ n: number }>(built.countSql, built.countParams),
  ]);
  return {
    items: rows,
    total: countRow?.n ?? 0,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function getFundDetail(exec: QueryExec, code: string) {
  const full = await exec.first<Record<string, unknown>>(
    `SELECT b.*, p.return_1m, p.return_3m, p.return_6m, p.return_1y, p.return_2y, p.return_3y, p.return_5y,
            p.return_ytd, p.return_since_start, p.rank_pct_1m, p.rank_pct_3m, p.rank_pct_6m, p.rank_pct_1y,
            p.rank_pct_2y, p.rank_pct_3y, p.rank_pct_5y, p.pass_4433, p.data_date
     FROM fund_basic_info b
     LEFT JOIN fund_performance p ON p.fund_code = b.fund_code
     WHERE b.fund_code = ?`,
    [code],
  );
  if (!full) return null;
  const extra = await exec.first<Record<string, unknown>>(
    'SELECT * FROM fund_trend_extra WHERE fund_code = ?',
    [code],
  );
  const extras = parseFundExtras(extra);
  const navCount = await exec.first<{ n: number }>(
    'SELECT COUNT(*) AS n FROM fund_nav WHERE fund_code = ?',
    [code],
  );
  return {
    fields: applyExtraFallbacks(mapFundDetail(full), extras),
    extras,
    navCount: navCount?.n ?? 0,
  };
}

export function applyExtraFallbacks(fields: FieldView[], extras: FundExtras): FieldView[] {
  const latest = extras.scale?.latest;
  if (!latest) return fields;
  return fields.map((field) => {
    if (field.key === 'fund_scale' && field.empty) {
      return presentField(field.key, field.label, field.group, latest.value);
    }
    if (field.key === 'scale_date' && field.empty) {
      return presentField(field.key, field.label, field.group, latest.date);
    }
    return field;
  });
}

export function parseNavQuery(input: { from?: string | null; limit?: string | number | null }): {
  from?: string;
  limit: number;
} {
  const from =
    typeof input.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.from)
      ? input.from
      : undefined;
  const raw = Number(input.limit);
  const fallback = from ? 3000 : 400;
  const limit = Number.isFinite(raw) && raw >= 1 ? Math.min(3000, Math.floor(raw)) : fallback;
  return from ? { from, limit } : { limit };
}

export async function getFundNav(
  exec: QueryExec,
  code: string,
  opts: number | { from?: string | null; limit?: string | number | null } = 400,
) {
  const parsed = typeof opts === 'number' ? parseNavQuery({ limit: opts }) : parseNavQuery(opts);
  if (parsed.from) {
    return exec.all<{
      nav_date: string;
      unit_nav: number;
      acc_nav: number | null;
      daily_return: number | null;
    }>(
      `SELECT nav_date, unit_nav, acc_nav, daily_return FROM fund_nav
       WHERE fund_code = ? AND nav_date >= ? ORDER BY nav_date ASC LIMIT ?`,
      [code, parsed.from, parsed.limit],
    );
  }
  return exec.all<{
    nav_date: string;
    unit_nav: number;
    acc_nav: number | null;
    daily_return: number | null;
  }>(
    `SELECT nav_date, unit_nav, acc_nav, daily_return FROM (
        SELECT nav_date, unit_nav, acc_nav, daily_return FROM fund_nav
        WHERE fund_code = ? ORDER BY nav_date DESC LIMIT ?
      ) newest ORDER BY nav_date ASC`,
    [code, parsed.limit],
  );
}

export async function listFundTypes(exec: QueryExec) {
  return exec.all<{ fund_type: string; n: number }>(
    'SELECT fund_type, COUNT(*) AS n FROM fund_basic_info GROUP BY fund_type ORDER BY n DESC',
  );
}

export async function getDataStats(exec: QueryExec) {
  const tables = [
    'fund_basic_info',
    'fund_performance',
    'fund_nav',
    'fund_trend_extra',
    'fetch_log',
  ] as const;
  const counts: Record<string, number> = {};
  for (const t of tables) {
    const row = await exec.first<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`);
    counts[t] = row?.n ?? 0;
  }
  const span = await exec.first<{ min_date: string | null; max_date: string | null }>(
    'SELECT MIN(nav_date) AS min_date, MAX(nav_date) AS max_date FROM fund_nav',
  );
  const lastFetch = await exec.first<{ created_at: number | null; status: string | null }>(
    'SELECT created_at, status FROM fetch_log ORDER BY created_at DESC LIMIT 1',
  );
  const lastPerf = await exec.first<{ data_date: string | null }>(
    'SELECT MAX(data_date) AS data_date FROM fund_performance',
  );
  return {
    counts,
    navSpan: { min: span?.min_date ?? null, max: span?.max_date ?? null },
    lastFetchAt: lastFetch?.created_at ?? null,
    lastFetchStatus: lastFetch?.status ?? null,
    lastPerfDate: lastPerf?.data_date ?? null,
  };
}
