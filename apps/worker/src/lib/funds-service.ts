import { parseShareClass } from '../../../../src/analytics/share-class';
import { parseSearchQuery, searchQueryKind } from '../../../../src/metrics/fund-search';
import type { QueryExec } from './executor';
import { type FieldView, mapFundDetail, presentField } from './fund-detail';
import { type FundExtras, parseFundExtras } from './fund-extra';
import {
  EMPTY_RISK_DIMS,
  EMPTY_SELECT_DIMS,
  type FundListQuery,
  fundListSql,
  isRiskSortKey,
  isSelectSortKey,
  type RiskDimCaps,
  resolveFundListQuery,
  SELECT_SORT_KEYS,
  type SelectDimCaps,
} from './fund-query';
import {
  formatRankTriple,
  isLiveReturnField,
  isNavOnlyReturnField,
  LIVE_RETURN_FIELDS,
  navReturn,
  parseRankStats,
  planReturnLookups,
  type ReturnField,
  resolveFundReturns,
} from './period-returns';

export async function listFundSiblings(exec: QueryExec, code: string) {
  if (!(await hasTable(exec, 'fund_select_metrics'))) return [];
  const self = await exec.first<{ share_group_key: string }>(
    'SELECT share_group_key FROM fund_select_metrics WHERE fund_code = ?',
    [code],
  );
  if (!self?.share_group_key) return [];
  return exec.all<Record<string, unknown>>(
    `SELECT b.fund_code, b.fund_name, s.share_class, s.all_in_fee_pct, s.sales_fee_known
     FROM fund_select_metrics s
     JOIN fund_basic_info b ON b.fund_code = s.fund_code
     WHERE s.share_group_key = ? AND s.fund_code != ?
     ORDER BY s.share_class, b.fund_code`,
    [self.share_group_key, code],
  );
}

export async function listFunds(exec: QueryExec, query: FundListQuery) {
  const needCaps = Boolean(
    query.includeCaps || isRiskSortKey(query.sort) || isSelectSortKey(query.sort),
  );
  const riskDims = needCaps ? await riskDimCaps(exec) : EMPTY_RISK_DIMS;
  const selectDims = needCaps ? await selectDimCaps(exec) : EMPTY_SELECT_DIMS;
  const risk = riskSortEnabledAny(riskDims);
  const select = selectSortEnabledAny(selectDims);
  const [hasRisk, hasSelect, hasMoney, hasFees] = await Promise.all([
    needCaps ? hasTable(exec, 'fund_risk_metrics') : Promise.resolve(false),
    needCaps ? hasTable(exec, 'fund_select_metrics') : Promise.resolve(false),
    needCaps || query.sort === 'seven_day_yield'
      ? hasTable(exec, 'fund_money_yield')
      : Promise.resolve(false),
    needCaps ? hasTable(exec, 'fund_fees') : Promise.resolve(false),
  ]);
  const [riskCols, selectCols, feeCols] = await Promise.all([
    hasRisk ? columnSet(exec, 'fund_risk_metrics') : Promise.resolve(new Set<string>()),
    hasSelect ? columnSet(exec, 'fund_select_metrics') : Promise.resolve(new Set<string>()),
    hasFees ? columnSet(exec, 'fund_fees') : Promise.resolve(new Set<string>()),
  ]);
  const resolved = resolveFundListQuery(query, riskDims, selectDims);
  const parsed = resolved.q ? parseSearchQuery(resolved.q) : null;
  const shareOpts = await shareLetterOpts(exec, parsed);
  const built = fundListSql(resolved, {
    risk: hasRisk,
    select: hasSelect,
    money: hasMoney,
    fees: hasFees,
    ...shareOpts,
    riskCols,
    selectCols,
    feeCols,
  });
  const [rows, countRow] = await Promise.all([
    exec.all<Record<string, unknown>>(built.listSql, built.listParams),
    exec.first<{ n: number }>(built.countSql, built.countParams),
  ]);
  return {
    items: rows,
    total: countRow?.n ?? 0,
    page: resolved.page,
    pageSize: resolved.pageSize,
    sort: resolved.sort,
    capabilities: { risk, riskDims, select, selectDims },
  };
}

function splitShareCodes(
  rows: Array<{ fund_code: string; letter: string }>,
  letter: string,
): { matched: string[]; others: string[] } {
  const matched: string[] = [];
  const others: string[] = [];
  for (const row of rows) {
    if (row.letter === letter) matched.push(row.fund_code);
    else if (row.letter) others.push(row.fund_code);
  }
  return { matched, others };
}

async function shareLetterOpts(
  exec: QueryExec,
  parsed: ReturnType<typeof parseSearchQuery> | null,
): Promise<{ shareCodes?: string[]; scoreShareCodes?: string[]; otherShareCodes?: string[] }> {
  if (!parsed?.shareLetter) return {};
  const letter = parsed.shareLetter;
  const kind = searchQueryKind(parsed);
  if (kind === 'share') {
    const names = await exec.all<{ fund_code: string; fund_name: string }>(
      'SELECT fund_code, fund_name FROM fund_basic_info',
    );
    return {
      shareCodes: names
        .filter((row) => parseShareClass(row.fund_name).letter === letter)
        .map((row) => row.fund_code),
    };
  }
  if (await hasTable(exec, 'fund_select_metrics')) {
    const cols = await columnSet(exec, 'fund_select_metrics');
    if (cols.has('share_class')) {
      const rows = await exec.all<{ fund_code: string; share_class: string }>(
        `SELECT fund_code, share_class FROM fund_select_metrics WHERE share_class != ''`,
      );
      const split = splitShareCodes(
        rows.map((row) => ({ fund_code: row.fund_code, letter: row.share_class.slice(-1) })),
        letter,
      );
      return { scoreShareCodes: split.matched, otherShareCodes: split.others };
    }
  }
  const names = await exec.all<{ fund_code: string; fund_name: string }>(
    'SELECT fund_code, fund_name FROM fund_basic_info',
  );
  const split = splitShareCodes(
    names.map((row) => ({
      fund_code: row.fund_code,
      letter: parseShareClass(row.fund_name).letter,
    })),
    letter,
  );
  return { scoreShareCodes: split.matched, otherShareCodes: split.others };
}

async function hasTable(exec: QueryExec, name: string): Promise<boolean> {
  const row = await exec.first<{ n: number }>(
    `SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?`,
    [name],
  );
  return (row?.n ?? 0) > 0;
}

function riskSortEnabledAny(caps: RiskDimCaps): boolean {
  return Object.values(caps).some(Boolean);
}

function selectSortEnabledAny(caps: SelectDimCaps): boolean {
  return Object.values(caps).some(Boolean);
}

async function columnSet(exec: QueryExec, table: string): Promise<Set<string>> {
  const rows = await exec.all<{ name: string }>(`PRAGMA table_info(${table})`);
  return new Set(rows.map((row) => row.name));
}

async function selectDimCaps(exec: QueryExec): Promise<SelectDimCaps> {
  const out = { ...EMPTY_SELECT_DIMS };
  if (await hasTable(exec, 'fund_select_metrics')) {
    const cols = await columnSet(exec, 'fund_select_metrics');
    const keys = SELECT_SORT_KEYS.filter((key) => key !== 'seven_day_yield' && cols.has(key));
    if (keys.length > 0) {
      const parts = keys.flatMap((key) => {
        if (key === 'recovery_days_1y') {
          return cols.has('recovery_status_1y')
            ? [
                `EXISTS(SELECT 1 FROM fund_select_metrics WHERE recovery_status_1y IN ('recovered', 'open')) AS ${key}`,
              ]
            : [];
        }
        return [`EXISTS(SELECT 1 FROM fund_select_metrics WHERE ${key} IS NOT NULL) AS ${key}`];
      });
      if (parts.length > 0) {
        const row = await exec.first<Record<string, number>>(`SELECT ${parts.join(', ')}`);
        for (const key of keys) out[key] = Boolean(row?.[key]);
      }
    }
  }
  if (await hasTable(exec, 'fund_money_yield')) {
    const row = await exec.first<{ n: number }>(
      `SELECT EXISTS(
         SELECT 1 FROM fund_money_yield
         WHERE seven_day_yield IS NOT NULL
           AND nav_date >= date((SELECT MAX(nav_date) FROM fund_money_yield), '-7 day')
       ) AS n`,
    );
    out.seven_day_yield = Boolean(row?.n);
  }
  if (!out.all_in_fee_pct && (await hasTable(exec, 'fund_fees'))) {
    const feeCols = await columnSet(exec, 'fund_fees');
    if (feeCols.has('mgmt_fee_pct') && feeCols.has('custodian_fee_pct')) {
      const row = await exec.first<{ n: number }>(
        `SELECT EXISTS(
           SELECT 1 FROM fund_fees
           WHERE mgmt_fee_pct IS NOT NULL AND custodian_fee_pct IS NOT NULL
         ) AS n`,
      );
      out.all_in_fee_pct = Boolean(row?.n);
    }
  }
  return out;
}

async function riskDimCaps(exec: QueryExec): Promise<RiskDimCaps> {
  if (!(await hasTable(exec, 'fund_risk_metrics'))) return EMPTY_RISK_DIMS;
  const cols = await columnSet(exec, 'fund_risk_metrics');
  const keys = (Object.keys(EMPTY_RISK_DIMS) as Array<keyof RiskDimCaps>).filter((key) =>
    cols.has(key),
  );
  if (keys.length === 0) return EMPTY_RISK_DIMS;
  const parts = keys.map(
    (key) => `EXISTS(SELECT 1 FROM fund_risk_metrics WHERE ${key} IS NOT NULL) AS ${key}`,
  );
  const row = await exec.first<Record<string, number>>(`SELECT ${parts.join(', ')}`);
  const out = { ...EMPTY_RISK_DIMS };
  for (const key of keys) out[key] = Boolean(row?.[key]);
  return out;
}

async function satelliteColumns(exec: QueryExec): Promise<string> {
  const [fees, managers] = await Promise.all([
    hasTable(exec, 'fund_fees'),
    hasTable(exec, 'fund_manager_link'),
  ]);
  const established = `(SELECT MIN(nav_date) FROM fund_nav n WHERE n.fund_code = b.fund_code)`;
  const manager = managers
    ? `(SELECT GROUP_CONCAT(x, '、') FROM (
         SELECT DISTINCT manager_id AS x FROM fund_manager_link l
         WHERE l.fund_code = b.fund_code AND l.end_date IS NULL
       ))`
    : 'NULL';
  const fee = fees
    ? `(SELECT mgmt_fee_pct FROM fund_fees fe WHERE fe.fund_code = b.fund_code)`
    : 'NULL';
  return `${established} AS established_date, ${manager} AS fund_manager, ${fee} AS fee_rate`;
}

export async function getFundDetail(exec: QueryExec, code: string) {
  const extraCols = await satelliteColumns(exec);
  const full = await exec.first<Record<string, unknown>>(
    `SELECT b.fund_code, b.fund_name, b.fund_type, b.pinyin_abbr, b.pinyin_full, b.in_mvp_pool,
            ${extraCols},
            p.return_1m, p.return_3m, p.return_6m, p.return_1y, p.return_2y, p.return_3y, p.return_5y,
            p.return_ytd, p.return_since_start, p.rank_pct_1m, p.rank_pct_3m, p.rank_pct_6m, p.rank_pct_1y,
            p.rank_pct_2y, p.rank_pct_3y, p.rank_pct_5y, p.pass_4433, p.rank_stats_json, p.data_date
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
  const fields = applyRankTriples(
    applyExtraFallbacks(mapFundDetail(full), extras),
    full.rank_stats_json,
  );
  const [navCount, moneyCount, live] = await Promise.all([
    exec.first<{ n: number }>('SELECT COUNT(*) AS n FROM fund_nav WHERE fund_code = ?', [code]),
    countMoneyYield(exec, code),
    loadLiveReturns(exec, code, fields),
  ]);
  return {
    fields: applyReturnFallbacks(fields, live),
    extras,
    navCount: (navCount?.n ?? 0) > 0 ? (navCount?.n ?? 0) : moneyCount,
  };
}

async function countMoneyYield(exec: QueryExec, code: string): Promise<number> {
  if (!(await hasTable(exec, 'fund_money_yield'))) return 0;
  const row = await exec.first<{ n: number }>(
    'SELECT COUNT(*) AS n FROM fund_money_yield WHERE fund_code = ?',
    [code],
  );
  return row?.n ?? 0;
}

async function loadLiveReturns(
  exec: QueryExec,
  code: string,
  fields: FieldView[],
): Promise<Partial<Record<ReturnField, number | null>>> {
  const empty = LIVE_RETURN_FIELDS.filter(
    (key) => !isNavOnlyReturnField(key) && fields.find((field) => field.key === key)?.empty,
  );
  if (empty.length === 0) return {};
  const last = await exec.first<{ nav_date: string; acc_nav: number | null; unit_nav: number }>(
    `SELECT nav_date, acc_nav, unit_nav FROM fund_nav WHERE fund_code = ? ORDER BY nav_date DESC LIMIT 1`,
    [code],
  );
  const plan = planReturnLookups(empty, last?.nav_date ?? null);
  const [first, ...asOfRows] = await Promise.all([
    plan.needFirst
      ? exec.first<{ acc_nav: number | null; unit_nav: number }>(
          `SELECT acc_nav, unit_nav FROM fund_nav WHERE fund_code = ? ORDER BY nav_date ASC LIMIT 1`,
          [code],
        )
      : Promise.resolve(null),
    ...plan.windows.map((window) =>
      exec.first<{ acc_nav: number | null; unit_nav: number }>(
        `SELECT acc_nav, unit_nav FROM fund_nav
         WHERE fund_code = ? AND nav_date <= ? ORDER BY nav_date DESC LIMIT 1`,
        [code, window.start],
      ),
    ),
  ]);
  const asOf: Partial<Record<ReturnField, { acc: number | null; unit: number | null } | null>> = {};
  plan.windows.forEach((window, index) => {
    const row = asOfRows[index];
    asOf[window.field] = row ? { acc: row.acc_nav, unit: row.unit_nav } : null;
  });
  return resolveFundReturns({
    fields: empty,
    last: last ? { date: last.nav_date, acc: last.acc_nav, unit: last.unit_nav } : null,
    first: first ? { acc: first.acc_nav, unit: first.unit_nav } : null,
    asOf,
  });
}

export function returnFromNavPair(
  ends: {
    first_acc: number | null;
    first_unit: number | null;
    last_acc: number | null;
    last_unit: number | null;
  } | null,
): number | null {
  if (!ends) return null;
  return navReturn(
    { acc: ends.first_acc, unit: ends.first_unit },
    { acc: ends.last_acc, unit: ends.last_unit },
  );
}

export function applyRankTriples(fields: FieldView[], raw: unknown): FieldView[] {
  const stats = parseRankStats(raw);
  if (!stats) return fields;
  return fields.map((field) => {
    if (!field.key.startsWith('rank_pct_')) return field;
    const triple = formatRankTriple(stats[field.key as keyof typeof stats]);
    if (!triple) return field;
    return presentField(field.key, field.label, field.group, triple);
  });
}

export function applyReturnFallbacks(
  fields: FieldView[],
  values: Partial<Record<ReturnField, number | null>>,
): FieldView[] {
  return fields.map((field) => {
    if (!field.empty) return field;
    if (!isLiveReturnField(field.key)) return field;
    const value = values[field.key as ReturnField];
    if (value == null) return field;
    return presentField(field.key, field.label, field.group, value);
  });
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

export type FundNavRow = {
  nav_date: string;
  unit_nav: number | null;
  acc_nav: number | null;
  daily_return: number | null;
  million_income: number | null;
  seven_day_yield: number | null;
};

export async function getFundNav(
  exec: QueryExec,
  code: string,
  opts: number | { from?: string | null; limit?: string | number | null } = 400,
) {
  const parsed = typeof opts === 'number' ? parseNavQuery({ limit: opts }) : parseNavQuery(opts);
  const navRows = parsed.from
    ? await exec.all<FundNavRow>(
        `SELECT nav_date, unit_nav, acc_nav, daily_return,
                NULL AS million_income, NULL AS seven_day_yield
         FROM fund_nav
         WHERE fund_code = ? AND nav_date >= ? ORDER BY nav_date ASC LIMIT ?`,
        [code, parsed.from, parsed.limit],
      )
    : await exec.all<FundNavRow>(
        `SELECT nav_date, unit_nav, acc_nav, daily_return,
                NULL AS million_income, NULL AS seven_day_yield
         FROM (
            SELECT nav_date, unit_nav, acc_nav, daily_return FROM fund_nav
            WHERE fund_code = ? ORDER BY nav_date DESC LIMIT ?
          ) newest ORDER BY nav_date ASC`,
        [code, parsed.limit],
      );
  if (navRows.length > 0) return navRows;
  if (!(await hasTable(exec, 'fund_money_yield'))) return navRows;
  if (parsed.from) {
    return exec.all<FundNavRow>(
      `SELECT nav_date, NULL AS unit_nav, NULL AS acc_nav, NULL AS daily_return,
              million_income, seven_day_yield
       FROM fund_money_yield
       WHERE fund_code = ? AND nav_date >= ? ORDER BY nav_date ASC LIMIT ?`,
      [code, parsed.from, parsed.limit],
    );
  }
  return exec.all<FundNavRow>(
    `SELECT nav_date, NULL AS unit_nav, NULL AS acc_nav, NULL AS daily_return,
            million_income, seven_day_yield
     FROM (
        SELECT nav_date, million_income, seven_day_yield FROM fund_money_yield
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

const STAT_TABLES = [
  'fund_basic_info',
  'fund_performance',
  'fund_nav',
  'fund_trend_extra',
  'fetch_log',
  'fund_risk_metrics',
  'fund_dividend',
  'fund_fees',
  'fund_manager',
  'fund_manager_link',
  'fund_portfolio',
  'fund_money_yield',
] as const;

export async function getDataStats(exec: QueryExec) {
  const counts: Record<string, number> = {};
  for (const t of STAT_TABLES) {
    if (!(await hasTable(exec, t))) continue;
    const row = await exec.first<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`);
    counts[t] = row?.n ?? 0;
  }
  const span = await exec.first<{ min_date: string | null; max_date: string | null }>(
    'SELECT MIN(nav_date) AS min_date, MAX(nav_date) AS max_date FROM fund_nav',
  );
  const lastFetch = (await hasTable(exec, 'fetch_log'))
    ? await exec.first<{ created_at: number | null; status: string | null }>(
        'SELECT created_at, status FROM fetch_log ORDER BY created_at DESC LIMIT 1',
      )
    : null;
  const lastPerf = (await hasTable(exec, 'fund_performance'))
    ? await exec.first<{ data_date: string | null }>(
        'SELECT MAX(data_date) AS data_date FROM fund_performance',
      )
    : null;
  const mvp = await exec.first<{ n: number }>(
    'SELECT COUNT(*) AS n FROM fund_basic_info WHERE in_mvp_pool = 1',
  );
  const pass4433 = (await hasTable(exec, 'fund_performance'))
    ? await exec.first<{ n: number }>(
        'SELECT COUNT(*) AS n FROM fund_performance WHERE pass_4433 = 1',
      )
    : null;
  const fetchStatus = (await hasTable(exec, 'fetch_log'))
    ? await exec.all<{ status: string; n: number }>(
        `SELECT COALESCE(status, 'unknown') AS status, COUNT(*) AS n
         FROM fetch_log GROUP BY status ORDER BY n DESC`,
      )
    : [];
  return {
    counts,
    navSpan: { min: span?.min_date ?? null, max: span?.max_date ?? null },
    lastFetchAt: lastFetch?.created_at ?? null,
    lastFetchStatus: lastFetch?.status ?? null,
    lastPerfDate: lastPerf?.data_date ?? null,
    flags: { mvp: mvp?.n ?? 0, pass4433: pass4433?.n ?? 0 },
    fetchStatus,
  };
}
