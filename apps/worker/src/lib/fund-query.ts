export type FundSortKey =
  | 'fund_code'
  | 'fund_name'
  | 'fund_type'
  | 'return_1y'
  | 'return_1m'
  | 'return_3m'
  | 'return_6m'
  | 'data_date';

export type SortDir = 'asc' | 'desc';

export interface FundListQuery {
  q?: string;
  fundType?: string;
  mvpOnly?: boolean;
  hasNav?: boolean;
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
};

export const DEFAULT_PAGE_SIZE = 200;

export function parseFundListQuery(input: {
  q?: string | null;
  fundType?: string | null;
  mvpOnly?: string | boolean | null;
  hasNav?: string | boolean | null;
  sort?: string | null;
  dir?: string | null;
  page?: string | number | null;
  pageSize?: string | number | null;
}): FundListQuery {
  const sort = (input.sort && input.sort in SORT_COLUMNS ? input.sort : 'fund_code') as FundSortKey;
  const dir: SortDir = input.dir === 'desc' ? 'desc' : 'asc';
  const page = Math.max(1, Number(input.page) || 1);
  const rawSize = Number(input.pageSize);
  const pageSize =
    Number.isFinite(rawSize) && rawSize > 0
      ? Math.min(500, Math.floor(rawSize))
      : DEFAULT_PAGE_SIZE;
  return {
    q: input.q?.trim() || undefined,
    fundType: input.fundType?.trim() || undefined,
    mvpOnly: input.mvpOnly === true || input.mvpOnly === '1' || input.mvpOnly === 'true',
    hasNav: input.hasNav === true || input.hasNav === '1' || input.hasNav === 'true',
    sort,
    dir,
    page,
    pageSize,
  };
}

export function buildFundListClauses(query: FundListQuery): {
  whereSql: string;
  orderSql: string;
  limitSql: string;
  filterParams: unknown[];
  limitParams: unknown[];
} {
  const where: string[] = [];
  const filterParams: unknown[] = [];
  if (query.q) {
    where.push("(b.fund_code LIKE ? OR b.fund_name LIKE ? OR IFNULL(b.pinyin_abbr, '') LIKE ?)");
    const like = `%${query.q}%`;
    filterParams.push(like, like, like);
  }
  if (query.fundType) {
    where.push('b.fund_type = ?');
    filterParams.push(query.fundType);
  }
  if (query.mvpOnly) {
    where.push('b.in_mvp_pool = 1');
  }
  if (query.hasNav) {
    where.push('EXISTS (SELECT 1 FROM fund_nav n WHERE n.fund_code = b.fund_code)');
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderSql = `ORDER BY ${SORT_COLUMNS[query.sort]} ${query.dir === 'desc' ? 'DESC' : 'ASC'}`;
  const offset = (query.page - 1) * query.pageSize;
  return {
    whereSql,
    orderSql,
    limitSql: 'LIMIT ? OFFSET ?',
    filterParams,
    limitParams: [query.pageSize, offset],
  };
}

export const FUND_LIST_SELECT = `SELECT b.fund_code, b.fund_name, b.fund_type, b.pinyin_abbr, b.in_mvp_pool,
      p.return_1m, p.return_3m, p.return_6m, p.return_1y, p.data_date
    FROM fund_basic_info b
    LEFT JOIN fund_performance p ON p.fund_code = b.fund_code`;

export function fundListSql(query: FundListQuery): {
  listSql: string;
  countSql: string;
  listParams: unknown[];
  countParams: unknown[];
} {
  const c = buildFundListClauses(query);
  return {
    listSql: `${FUND_LIST_SELECT} ${c.whereSql} ${c.orderSql} ${c.limitSql}`,
    countSql: `SELECT COUNT(*) AS n FROM fund_basic_info b ${c.whereSql}`,
    listParams: [...c.filterParams, ...c.limitParams],
    countParams: [...c.filterParams],
  };
}
