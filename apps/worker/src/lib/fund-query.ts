import type { SqlBinding } from './executor';

export const RETURN_SORT_KEYS = ['return_1y', 'return_1m', 'return_3m', 'return_6m'] as const;
export const RISK_SORT_KEYS = [
  'sharpe_1y',
  'sharpe_3y',
  'sharpe_5y',
  'max_drawdown_1y',
  'max_drawdown_3y',
  'max_drawdown_5y',
  'max_drawdown_all',
  'volatility_1y',
  'volatility_3y',
  'volatility_5y',
  'calmar_1y',
  'calmar_3y',
  'sortino_1y',
  'sortino_3y',
] as const;

export const SELECT_SORT_KEYS = [
  'ulcer_1y',
  'underwater_ratio_1y',
  'max_underwater_days_1y',
  'max_consec_down_1y',
  'down_day_ratio_1y',
  'worst_month_1y',
  'recovery_days_1y',
  'dca_cagr_3y',
  'dca_vs_lump_3y',
  'dca_month_win_3y',
  'dca_month_vol_3y',
  'all_in_fee_pct',
  'select_score',
  'excess_hs300_1y',
  'scale_yi',
  'top10_weight_pct',
  'equity_ratio_pct',
  'inst_holder_pct',
  'seven_day_yield',
] as const;

export type FundSortKey =
  | 'fund_code'
  | 'fund_name'
  | 'fund_type'
  | 'data_date'
  | (typeof RETURN_SORT_KEYS)[number]
  | (typeof RISK_SORT_KEYS)[number]
  | (typeof SELECT_SORT_KEYS)[number];

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
  includeCaps?: boolean;
  lens?: 'picks';
  feePeer?: number;
  ddPeer?: number;
  scalePeer?: number;
  top10Max?: number;
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
  sharpe_3y: 'r.sharpe_3y',
  sharpe_5y: 'r.sharpe_5y',
  max_drawdown_3y: 'r.max_drawdown_3y',
  max_drawdown_5y: 'r.max_drawdown_5y',
  max_drawdown_all: 'r.max_drawdown_all',
  volatility_3y: 'r.volatility_3y',
  volatility_5y: 'r.volatility_5y',
  calmar_3y: 'r.calmar_3y',
  sortino_1y: 'r.sortino_1y',
  sortino_3y: 'r.sortino_3y',
  ulcer_1y: 's.ulcer_1y',
  underwater_ratio_1y: 's.underwater_ratio_1y',
  max_underwater_days_1y: 's.max_underwater_days_1y',
  max_consec_down_1y: 's.max_consec_down_1y',
  down_day_ratio_1y: 's.down_day_ratio_1y',
  worst_month_1y: 's.worst_month_1y',
  recovery_days_1y: 's.recovery_days_1y',
  dca_cagr_3y: 's.dca_cagr_3y',
  dca_vs_lump_3y: 's.dca_vs_lump_3y',
  dca_month_win_3y: 's.dca_month_win_3y',
  dca_month_vol_3y: 's.dca_month_vol_3y',
  all_in_fee_pct: 's.all_in_fee_pct',
  select_score: 's.select_score',
  excess_hs300_1y: 's.excess_hs300_1y',
  scale_yi: 's.scale_yi',
  top10_weight_pct: 's.top10_weight_pct',
  equity_ratio_pct: 's.equity_ratio_pct',
  inst_holder_pct: 's.inst_holder_pct',
  seven_day_yield: 'y.seven_day_yield',
};

const RISK_SORT_SET = new Set<string>(RISK_SORT_KEYS);
const SELECT_SORT_SET = new Set<string>(SELECT_SORT_KEYS);

export function isFundSortKey(value: string): value is FundSortKey {
  return Object.hasOwn(SORT_COLUMNS, value);
}

export function isRiskSortKey(value: string): value is (typeof RISK_SORT_KEYS)[number] {
  return RISK_SORT_SET.has(value);
}

export function isSelectSortKey(value: string): value is (typeof SELECT_SORT_KEYS)[number] {
  return SELECT_SORT_SET.has(value);
}

function peerCap(raw: string | number | null | undefined): number | undefined {
  if (raw == null || raw === '' || raw === 'off') return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > 100) return undefined;
  return Math.floor(n);
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
  includeCaps?: string | boolean | null;
  lens?: string | null;
  feePeer?: string | number | null;
  ddPeer?: string | number | null;
  scalePeer?: string | number | null;
  top10Max?: string | number | null;
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
    includeCaps: flag(input.includeCaps),
    lens: input.lens === 'picks' ? 'picks' : undefined,
    feePeer: peerCap(input.feePeer),
    ddPeer: peerCap(input.ddPeer),
    scalePeer: peerCap(input.scalePeer),
    top10Max: peerCap(input.top10Max),
    minSamples,
    sort,
    dir,
    page,
    pageSize,
  };
}

export type RiskDimCaps = Record<(typeof RISK_SORT_KEYS)[number], boolean>;

export const EMPTY_RISK_DIMS: RiskDimCaps = {
  sharpe_1y: false,
  sharpe_3y: false,
  sharpe_5y: false,
  max_drawdown_1y: false,
  max_drawdown_3y: false,
  max_drawdown_5y: false,
  max_drawdown_all: false,
  volatility_1y: false,
  volatility_3y: false,
  volatility_5y: false,
  calmar_1y: false,
  calmar_3y: false,
  sortino_1y: false,
  sortino_3y: false,
};

export type SelectDimCaps = Record<(typeof SELECT_SORT_KEYS)[number], boolean>;

export const EMPTY_SELECT_DIMS = Object.fromEntries(
  SELECT_SORT_KEYS.map((key) => [key, false]),
) as SelectDimCaps;

export function riskSortEnabled(sort: string, caps: RiskDimCaps | boolean): boolean {
  if (!isRiskSortKey(sort)) return false;
  return typeof caps === 'boolean' ? caps : Boolean(caps[sort]);
}

export function selectSortEnabled(sort: string, caps: SelectDimCaps | boolean): boolean {
  if (!isSelectSortKey(sort)) return false;
  return typeof caps === 'boolean' ? caps : Boolean(caps[sort]);
}

export function resolveFundListQuery(
  query: FundListQuery,
  risk: RiskDimCaps | boolean,
  select: SelectDimCaps | boolean = false,
): FundListQuery {
  if (isRiskSortKey(query.sort) && !riskSortEnabled(query.sort, risk)) {
    return { ...query, sort: 'return_1y', dir: 'desc', minSamples: undefined };
  }
  if (isSelectSortKey(query.sort) && !selectSortEnabled(query.sort, select)) {
    return query;
  }
  return query;
}

function searchTokens(q: string): string[] {
  return (q.toUpperCase().match(/[\u4e00-\u9fff]{2,}|[A-Z]{2,}|\d{2,}/g) ?? []).filter(Boolean);
}

function samplesColumn(sort: FundSortKey): string {
  if (sort.includes('_5y')) return 'r.nav_samples_5y';
  if (sort.includes('_3y')) return 'r.nav_samples_3y';
  return 'r.nav_samples_1y';
}

function qualify(expr: string, flat: boolean): string {
  return flat ? expr.replace(/\b[bprs]\./g, '') : expr;
}

export function buildFundListClauses(
  query: FundListQuery,
  opts: { risk?: boolean; select?: boolean; flat?: boolean } = {},
): {
  whereSql: string;
  orderSql: string;
  limitSql: string;
  filterParams: SqlBinding[];
  limitParams: SqlBinding[];
} {
  const where: string[] = [];
  const filterParams: SqlBinding[] = [];
  const flat = Boolean(opts.flat);
  if (query.q) {
    const tokens = searchTokens(query.q);
    const parts = tokens.length > 0 ? tokens : [query.q];
    for (const token of parts) {
      where.push(
        qualify(
          "(b.fund_code LIKE ? OR b.fund_name LIKE ? OR IFNULL(b.pinyin_abbr, '') LIKE ? OR IFNULL(b.pinyin_full, '') LIKE ?)",
          flat,
        ),
      );
      const like = `%${token}%`;
      filterParams.push(like, like, like, like);
    }
  }
  if (query.typeL1 && query.typeL2) {
    where.push(qualify('b.fund_type = ?', flat));
    filterParams.push(`${query.typeL1}-${query.typeL2}`);
  } else if (query.typeL1) {
    where.push(qualify('(b.fund_type = ? OR b.fund_type LIKE ?)', flat));
    filterParams.push(query.typeL1, `${query.typeL1}-%`);
  } else if (query.fundType) {
    where.push(qualify('b.fund_type = ?', flat));
    filterParams.push(query.fundType);
  }
  if (query.mvpOnly) {
    where.push(qualify('b.in_mvp_pool = 1', flat));
  }
  if (query.hasNav) {
    where.push(
      flat
        ? 'EXISTS (SELECT 1 FROM fund_nav n WHERE n.fund_code = ranked.fund_code)'
        : 'EXISTS (SELECT 1 FROM fund_nav n WHERE n.fund_code = b.fund_code)',
    );
  }
  if (query.pass4433) {
    where.push(qualify('p.pass_4433 = 1', flat));
  }
  if (query.metricNotNull) {
    where.push(`${qualify(SORT_COLUMNS[query.sort], flat)} IS NOT NULL`);
  }
  if (
    query.minSamples != null &&
    (isRiskSortKey(query.sort) ||
      query.lens === 'picks' ||
      query.sort.startsWith('ulcer') ||
      query.sort.includes('underwater') ||
      query.sort.includes('recovery'))
  ) {
    where.push(`${qualify(samplesColumn(query.sort), flat)} >= ?`);
    filterParams.push(query.minSamples);
  }
  if (query.top10Max != null) {
    where.push(qualify('s.top10_weight_pct IS NOT NULL AND s.top10_weight_pct <= ?', flat));
    filterParams.push(query.top10Max);
  }
  if (query.feePeer != null) {
    where.push('fee_pct IS NOT NULL AND fee_pct <= ?');
    filterParams.push(query.feePeer);
  }
  if (query.ddPeer != null) {
    where.push('dd_pct IS NOT NULL AND dd_pct <= ?');
    filterParams.push(query.ddPeer);
  }
  if (query.scalePeer != null) {
    where.push('scale_pct IS NOT NULL AND scale_pct <= ?');
    filterParams.push(query.scalePeer);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const dirSql = query.dir === 'desc' ? 'DESC' : 'ASC';
  const orderSql =
    query.sort === 'fund_code'
      ? `ORDER BY ${qualify('b.fund_code', flat)} ${dirSql}`
      : `ORDER BY ${qualify(SORT_COLUMNS[query.sort], flat)} ${dirSql}, ${qualify('b.fund_code', flat)} ASC`;
  const offset = (query.page - 1) * query.pageSize;
  return {
    whereSql,
    orderSql,
    limitSql: 'LIMIT ? OFFSET ?',
    filterParams,
    limitParams: [query.pageSize, offset],
  };
}

export function fundListFromSql(opts: { risk?: boolean; select?: boolean } = {}): string {
  const riskJoin = opts.risk ? ' LEFT JOIN fund_risk_metrics r ON r.fund_code = b.fund_code' : '';
  const selectJoin = opts.select
    ? ' LEFT JOIN fund_select_metrics s ON s.fund_code = b.fund_code'
    : '';
  return `FROM fund_basic_info b
    LEFT JOIN fund_performance p ON p.fund_code = b.fund_code${riskJoin}${selectJoin}`;
}

function peerRankSql(): string {
  return `
    CASE WHEN s.all_in_fee_pct IS NULL THEN NULL
    ELSE 100.0 * RANK() OVER (PARTITION BY b.fund_type, s.all_in_fee_pct IS NOT NULL ORDER BY s.all_in_fee_pct ASC)
      / COUNT(s.all_in_fee_pct) OVER (PARTITION BY b.fund_type, s.all_in_fee_pct IS NOT NULL)
    END AS fee_pct,
    CASE WHEN r.max_drawdown_1y IS NULL THEN NULL
    ELSE 100.0 * RANK() OVER (PARTITION BY b.fund_type, r.max_drawdown_1y IS NOT NULL ORDER BY r.max_drawdown_1y ASC)
      / COUNT(r.max_drawdown_1y) OVER (PARTITION BY b.fund_type, r.max_drawdown_1y IS NOT NULL)
    END AS dd_pct,
    CASE WHEN s.scale_yi IS NULL THEN NULL
    ELSE 100.0 * RANK() OVER (PARTITION BY b.fund_type, s.scale_yi IS NOT NULL ORDER BY s.scale_yi ASC)
      / COUNT(s.scale_yi) OVER (PARTITION BY b.fund_type, s.scale_yi IS NOT NULL)
    END AS scale_pct`;
}

export function fundListSelectSql(opts: { risk?: boolean; select?: boolean } = {}): string {
  const riskCols = opts.risk
    ? 'r.sharpe_1y, r.max_drawdown_1y, r.volatility_1y, r.calmar_1y, r.nav_samples_1y'
    : 'NULL AS sharpe_1y, NULL AS max_drawdown_1y, NULL AS volatility_1y, NULL AS calmar_1y, NULL AS nav_samples_1y';
  const selectCols = opts.select
    ? `s.ulcer_1y, s.underwater_ratio_1y, s.max_underwater_days_1y, s.max_consec_down_1y, s.down_day_ratio_1y,
       s.worst_month_1y, s.recovery_days_1y, s.dca_cagr_3y, s.dca_vs_lump_3y, s.dca_month_win_3y, s.dca_month_vol_3y,
       s.all_in_fee_pct, s.select_score, s.excess_hs300_1y, s.scale_yi, s.top10_weight_pct, s.equity_ratio_pct,
       s.inst_holder_pct, s.sales_fee_known`
    : `NULL AS ulcer_1y, NULL AS underwater_ratio_1y, NULL AS max_underwater_days_1y, NULL AS max_consec_down_1y,
       NULL AS down_day_ratio_1y, NULL AS worst_month_1y, NULL AS recovery_days_1y, NULL AS dca_cagr_3y,
       NULL AS dca_vs_lump_3y, NULL AS dca_month_win_3y, NULL AS dca_month_vol_3y, NULL AS all_in_fee_pct,
       NULL AS select_score, NULL AS excess_hs300_1y, NULL AS scale_yi, NULL AS top10_weight_pct,
       NULL AS equity_ratio_pct, NULL AS inst_holder_pct, NULL AS sales_fee_known`;
  return `SELECT b.fund_code, b.fund_name, b.fund_type, b.pinyin_abbr, b.pinyin_full, b.in_mvp_pool,
      p.return_1m, p.return_3m, p.return_6m, p.return_1y, p.data_date,
      p.rank_pct_1m, p.rank_pct_3m, p.rank_pct_6m, p.rank_pct_1y, p.pass_4433,
      ${riskCols}, ${selectCols}
    ${fundListFromSql(opts)}`;
}

export const FUND_LIST_SELECT = fundListSelectSql({ risk: false });

export function fundListSql(
  query: FundListQuery,
  opts: { risk?: boolean; select?: boolean } = {},
): {
  listSql: string;
  countSql: string;
  listParams: SqlBinding[];
  countParams: SqlBinding[];
} {
  const joinRisk = Boolean(
    opts.risk && (isRiskSortKey(query.sort) || query.ddPeer != null || query.lens === 'picks'),
  );
  const joinSelect = Boolean(
    opts.select &&
      (isSelectSortKey(query.sort) ||
        query.lens === 'picks' ||
        query.feePeer != null ||
        query.scalePeer != null ||
        query.top10Max != null),
  );
  const sqlOpts = { risk: joinRisk, select: joinSelect };
  const c = buildFundListClauses(query, sqlOpts);
  const from = fundListFromSql(sqlOpts);
  const needPeer = query.feePeer != null || query.ddPeer != null || query.scalePeer != null;
  if (needPeer) {
    const inner = `${fundListSelectSql(sqlOpts).replace('SELECT ', `SELECT ${peerRankSql()}, `)} `;
    const outer = buildFundListClauses(query, { ...sqlOpts, flat: true });
    return {
      listSql: `SELECT * FROM (${inner}) ranked ${outer.whereSql} ${outer.orderSql} ${outer.limitSql}`,
      countSql: `SELECT COUNT(*) AS n FROM (${inner}) ranked ${outer.whereSql}`,
      listParams: [...outer.filterParams, ...outer.limitParams],
      countParams: [...outer.filterParams],
    };
  }
  return {
    listSql: `${fundListSelectSql(sqlOpts)} ${c.whereSql} ${c.orderSql} ${c.limitSql}`,
    countSql: `SELECT COUNT(*) AS n ${from} ${c.whereSql}`,
    listParams: [...c.filterParams, ...c.limitParams],
    countParams: [...c.filterParams],
  };
}
