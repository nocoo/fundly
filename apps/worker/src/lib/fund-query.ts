import type { SqlBinding } from './executor';

export const RETURN_SORT_KEYS = ['return_1y', 'return_1m', 'return_3m', 'return_6m'] as const;
export const RISK_SORT_KEYS = [
  'sharpe_1y',
  'max_drawdown_1y',
  'volatility_1y',
  'calmar_1y',
] as const;

export type FundSortKey =
  | 'fund_code'
  | 'fund_name'
  | 'fund_type'
  | 'data_date'
  | (typeof RETURN_SORT_KEYS)[number]
  | (typeof RISK_SORT_KEYS)[number];

export type SortDir = 'asc' | 'desc';

export interface FundListQuery {
  q?: string;
  fundType?: string;
  typeL1?: string;
  typeL2?: string;
  mvpOnly?: boolean;
  hasNav?: boolean;
  pass4433?: boolean;
  metricNotNull?: boolean;
  minSamples?: number;
  sort: FundSortKey;
  dir: SortDir;
  page: number;
  pageSize: number;
}

const SORT_COLUMNS: Record<FundSortKey, string> = {
  fund_code: 'b.fund_code',
  fund_name: 'b.fund_name',
  fund_type: 'b.fund_type',
  return_1y: 'p.return_1y',
  return_1m: 'p.return_1m',
  return_3m: 'p.return_3m',
  return_6m: 'p.return_6m',
  data_date: 'p.data_date',
  sharpe_1y: 'r.sharpe_1y',
  max_drawdown_1y: 'r.max_drawdown_1y',
  volatility_1y: 'r.volatility_1y',
  calmar_1y: 'r.calmar_1y',
};

const RISK_SORT_SET = new Set<string>(RISK_SORT_KEYS);

export function isFundSortKey(value: string): value is FundSortKey {
  return Object.hasOwn(SORT_COLUMNS, value);
}

export function isRiskSortKey(value: string): value is (typeof RISK_SORT_KEYS)[number] {
  return RISK_SORT_SET.has(value);
}

export const DEFAULT_PAGE_SIZE = 200;

function flag(value: string | boolean | null | undefined): boolean {
  return value === true || value === '1' || value === 'true';
}

export function parseFundListQuery(input: {
  q?: string | null;
  fundType?: string | null;
  typeL1?: string | null;
  typeL2?: string | null;
  mvpOnly?: string | boolean | null;
  hasNav?: string | boolean | null;
  pass4433?: string | boolean | null;
  metricNotNull?: string | boolean | null;
  minSamples?: string | number | null;
  sort?: string | null;
  dir?: string | null;
  page?: string | number | null;
  pageSize?: string | number | null;
}): FundListQuery {
  const sort = input.sort && isFundSortKey(input.sort) ? input.sort : 'fund_code';
  const dir: SortDir = input.dir === 'desc' ? 'desc' : 'asc';
  const rawPage = Number(input.page);
  const page =
    Number.isFinite(rawPage) && rawPage >= 1 ? Math.min(100_000, Math.floor(rawPage)) : 1;
  const rawSize = Number(input.pageSize);
  const pageSize =
    Number.isFinite(rawSize) && rawSize >= 1
      ? Math.min(500, Math.floor(rawSize))
      : DEFAULT_PAGE_SIZE;
  const typeL1Raw = input.typeL1?.trim();
  const typeL1 = typeL1Raw && typeL1Raw !== 'all' ? typeL1Raw : undefined;
  const rawSamples = Number(input.minSamples);
  const minSamples =
    Number.isFinite(rawSamples) && rawSamples >= 1
      ? Math.min(10_000, Math.floor(rawSamples))
      : undefined;
  return {
    q: input.q?.trim() || undefined,
    fundType: input.fundType?.trim() || undefined,
    typeL1,
    typeL2: input.typeL2?.trim() || undefined,
    mvpOnly: flag(input.mvpOnly),
    hasNav: flag(input.hasNav),
    pass4433: flag(input.pass4433),
    metricNotNull: flag(input.metricNotNull),
    minSamples,
    sort,
    dir,
    page,
    pageSize,
  };
}

export function resolveFundListQuery(query: FundListQuery, risk: boolean): FundListQuery {
  if (isRiskSortKey(query.sort) && !risk) {
    return { ...query, sort: 'return_1y', dir: 'desc', minSamples: undefined };
  }
  return query;
}

export function buildFundListClauses(
  query: FundListQuery,
  opts: { risk: boolean } = { risk: false },
): {
  whereSql: string;
  orderSql: string;
  limitSql: string;
  filterParams: SqlBinding[];
  limitParams: SqlBinding[];
} {
  const where: string[] = [];
  const filterParams: SqlBinding[] = [];
  if (query.q) {
    where.push("(b.fund_code LIKE ? OR b.fund_name LIKE ? OR IFNULL(b.pinyin_abbr, '') LIKE ?)");
    const like = `%${query.q}%`;
    filterParams.push(like, like, like);
  }
  if (query.typeL1 && query.typeL2) {
    where.push('b.fund_type = ?');
    filterParams.push(`${query.typeL1}-${query.typeL2}`);
  } else if (query.typeL1) {
    where.push('(b.fund_type = ? OR b.fund_type LIKE ?)');
    filterParams.push(query.typeL1, `${query.typeL1}-%`);
  } else if (query.fundType) {
    where.push('b.fund_type = ?');
    filterParams.push(query.fundType);
  }
  if (query.mvpOnly) {
    where.push('b.in_mvp_pool = 1');
  }
  if (query.hasNav) {
    where.push('EXISTS (SELECT 1 FROM fund_nav n WHERE n.fund_code = b.fund_code)');
  }
  if (query.pass4433) {
    where.push('p.pass_4433 = 1');
  }
  if (query.metricNotNull) {
    where.push(`${SORT_COLUMNS[query.sort]} IS NOT NULL`);
  }
  if (opts.risk && isRiskSortKey(query.sort) && query.minSamples != null) {
    where.push('r.nav_samples_1y >= ?');
    filterParams.push(query.minSamples);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const dirSql = query.dir === 'desc' ? 'DESC' : 'ASC';
  const orderSql =
    query.sort === 'fund_code'
      ? `ORDER BY b.fund_code ${dirSql}`
      : `ORDER BY ${SORT_COLUMNS[query.sort]} ${dirSql}, b.fund_code ASC`;
  const offset = (query.page - 1) * query.pageSize;
  return {
    whereSql,
    orderSql,
    limitSql: 'LIMIT ? OFFSET ?',
    filterParams,
    limitParams: [query.pageSize, offset],
  };
}

export function fundListFromSql(opts: { risk: boolean } = { risk: false }): string {
  const riskJoin = opts.risk ? ' LEFT JOIN fund_risk_metrics r ON r.fund_code = b.fund_code' : '';
  return `FROM fund_basic_info b
    LEFT JOIN fund_performance p ON p.fund_code = b.fund_code${riskJoin}`;
}

export function fundListSelectSql(opts: { risk: boolean } = { risk: false }): string {
  const riskCols = opts.risk
    ? 'r.sharpe_1y, r.max_drawdown_1y, r.volatility_1y, r.calmar_1y, r.nav_samples_1y'
    : 'NULL AS sharpe_1y, NULL AS max_drawdown_1y, NULL AS volatility_1y, NULL AS calmar_1y, NULL AS nav_samples_1y';
  return `SELECT b.fund_code, b.fund_name, b.fund_type, b.pinyin_abbr, b.in_mvp_pool,
      p.return_1m, p.return_3m, p.return_6m, p.return_1y, p.data_date,
      p.rank_pct_1m, p.rank_pct_3m, p.rank_pct_6m, p.rank_pct_1y, p.pass_4433,
      ${riskCols}
    ${fundListFromSql(opts)}`;
}

export const FUND_LIST_SELECT = fundListSelectSql({ risk: false });

export function fundListSql(
  query: FundListQuery,
  opts: { risk: boolean } = { risk: false },
): {
  listSql: string;
  countSql: string;
  listParams: SqlBinding[];
  countParams: SqlBinding[];
} {
  const c = buildFundListClauses(query, opts);
  const from = fundListFromSql(opts);
  return {
    listSql: `${fundListSelectSql(opts)} ${c.whereSql} ${c.orderSql} ${c.limitSql}`,
    countSql: `SELECT COUNT(*) AS n ${from} ${c.whereSql}`,
    listParams: [...c.filterParams, ...c.limitParams],
    countParams: [...c.filterParams],
  };
}
