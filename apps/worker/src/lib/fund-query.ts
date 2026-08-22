import { parseSearchQuery, searchQueryKind } from '../../../../src/metrics/fund-search';
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

function parseTop10Max(raw: string | number | null | undefined): number | undefined {
  if (raw == null || raw === '' || raw === 'off') return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
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
    top10Max: parseTop10Max(input.top10Max),
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
  _risk: RiskDimCaps | boolean = false,
  _select: SelectDimCaps | boolean = false,
): FundListQuery {
  return query;
}

const SHARE_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'] as const;

const SHARE_CURRENCIES = ['人民币', '美元现汇', '美元现钞', '美元汇', '美元'] as const;

function nameShareLetterSql(nameExpr: string): string {
  const productTails = ['ETF', 'LOF', 'FOF'].flatMap((tag) => [
    `'%${tag}'`,
    `'%${tag}类'`,
    ...SHARE_CURRENCIES.flatMap((cur) => [`'%${tag}${cur}'`, `'%${tag}类${cur}'`]),
  ]);
  const qdiiTails = [
    "'%QDII'",
    "'%QDII类'",
    ...SHARE_CURRENCIES.flatMap((cur) => [`'%QDII${cur}'`, `'%QDII类${cur}'`]),
  ];
  const blockedF = `(${productTails.map((tail) => `${nameExpr} LIKE ${tail}`).join(' OR ')})`;
  const blockedI = `(${qdiiTails.map((tail) => `${nameExpr} LIKE ${tail}`).join(' OR ')})`;
  const branches = SHARE_LETTERS.map((letter) => {
    const tails = [
      `'%${letter}'`,
      `'%${letter}类'`,
      ...SHARE_CURRENCIES.flatMap((cur) => [
        `'%${cur}${letter}'`,
        `'%${cur}${letter}类'`,
        `'%${letter}${cur}'`,
        `'%${letter}类${cur}'`,
      ]),
    ];
    const hit = `(${tails.map((tail) => `${nameExpr} LIKE ${tail}`).join(' OR ')})`;
    if (letter === 'F') return `WHEN ${hit} AND NOT ${blockedF} THEN 'F'`;
    if (letter === 'I') return `WHEN ${hit} AND NOT ${blockedI} THEN 'I'`;
    return `WHEN ${hit} THEN '${letter}'`;
  });
  return `CASE ${branches.join(' ')} ELSE '' END`;
}

function shareLetterExpr(
  hasSelect: boolean,
  flat: boolean,
  selectCols?: ReadonlySet<string>,
): string {
  if (hasSelect && (!selectCols || selectCols.has('share_class'))) {
    return `CASE WHEN ${qualify("IFNULL(s.share_class, '')", flat)} = '' THEN '' ELSE substr(${qualify('s.share_class', flat)}, -1, 1) END`;
  }
  return nameShareLetterSql(qualify('b.fund_name', flat));
}

function searchScoreSql(
  q: ReturnType<typeof parseSearchQuery>,
  hasSelect: boolean,
  flat: boolean,
  selectCols?: ReadonlySet<string>,
): { expr: string; params: SqlBinding[] } {
  const name = qualify('b.fund_name', flat);
  const code = qualify('b.fund_code', flat);
  const abbr = qualify("IFNULL(b.pinyin_abbr, '')", flat);
  const full = qualify("IFNULL(b.pinyin_full, '')", flat);
  const letter = shareLetterExpr(hasSelect, flat, selectCols);
  let shareSql = '0';
  if (q.shareLetter) {
    shareSql = `CASE WHEN ${letter} = ? THEN -1 WHEN ${letter} != '' THEN 3 ELSE 0 END`;
  }
  const expr = `(
    CASE
      WHEN ${code} = ? THEN 0
      WHEN ${code} LIKE ? THEN 1
      WHEN ${abbr} = ? OR ${full} = ? OR ${abbr} LIKE ? OR ${full} LIKE ? THEN 2
      WHEN ? != '' AND ${name} LIKE ? THEN 3
      WHEN ${q.tokens.length > 0 ? '1' : '0'} THEN 4
      ELSE 6
    END
    + CASE WHEN ${code} = ? THEN 0
           WHEN ${q.hasEtf ? '1' : '0'} != (${name} LIKE '%ETF%') THEN 4 ELSE 0 END
    + CASE WHEN ${code} = ? THEN 0
           WHEN ${q.hasLof ? '1' : '0'} != (${name} LIKE '%LOF%') THEN 4 ELSE 0 END
    + CASE WHEN ${code} = ? THEN 0
           WHEN ${q.hasLink ? '1' : '0'} != (${name} LIKE '%联接%' OR ${name} LIKE '%聯接%') THEN 4 ELSE 0 END
    + ${shareSql}
  )`;
  const caseParams: SqlBinding[] = [
    q.normalized,
    `${q.normalized}%`,
    q.normalized,
    q.normalized,
    `${q.normalized}%`,
    `${q.normalized}%`,
    q.core,
    q.core ? `%${q.core}%` : '',
    q.normalized,
    q.normalized,
    q.normalized,
  ];
  if (q.shareLetter) caseParams.push(q.shareLetter);
  return { expr, params: caseParams };
}

const HOLD_SAMPLE_KEYS = new Set([
  'ulcer_1y',
  'underwater_ratio_1y',
  'max_underwater_days_1y',
  'max_consec_down_1y',
  'down_day_ratio_1y',
  'recovery_days_1y',
]);

export function samplesColumn(sort: FundSortKey, lens?: FundListQuery['lens']): string | null {
  if (sort === 'max_drawdown_all') return null;
  if (sort.includes('_5y')) return 'r.nav_samples_5y';
  if (sort.includes('_3y')) return 'r.nav_samples_3y';
  if (isRiskSortKey(sort) || lens === 'picks' || HOLD_SAMPLE_KEYS.has(sort))
    return 'r.nav_samples_1y';
  return null;
}

function qualify(expr: string, flat: boolean): string {
  return flat ? expr.replace(/\b[bprsy]\./g, '') : expr;
}

const MONEY_YIELD_JOIN = `LEFT JOIN (
      SELECT y1.fund_code, y1.seven_day_yield
      FROM fund_money_yield y1
      JOIN (
        SELECT fund_code, MAX(nav_date) AS nav_date
        FROM fund_money_yield
        GROUP BY fund_code
      ) latest ON latest.fund_code = y1.fund_code AND latest.nav_date = y1.nav_date
      WHERE y1.nav_date >= date((SELECT MAX(nav_date) FROM fund_money_yield), '-7 day')
    ) y ON y.fund_code = b.fund_code`;

export function buildFundListClauses(
  query: FundListQuery,
  opts: FundListSqlOpts & { flat?: boolean } = {},
): {
  whereSql: string;
  orderSql: string;
  limitSql: string;
  filterParams: SqlBinding[];
  limitParams: SqlBinding[];
  scoreParams: SqlBinding[];
} {
  const where: string[] = [];
  const filterParams: SqlBinding[] = [];
  const scoreParams: SqlBinding[] = [];
  const flat = Boolean(opts.flat);
  const parsed = query.q ? parseSearchQuery(query.q) : null;
  const kind = parsed ? searchQueryKind(parsed) : null;
  if (parsed && kind === 'empty') {
    where.push('0=1');
  } else if (parsed && kind === 'code') {
    where.push(qualify('b.fund_code = ?', flat));
    filterParams.push(parsed.normalized);
  } else if (parsed && kind === 'tokens') {
    for (const token of parsed.tokens) {
      where.push(
        qualify(
          "(b.fund_code LIKE ? OR b.fund_name LIKE ? OR IFNULL(b.pinyin_abbr, '') LIKE ? OR IFNULL(b.pinyin_full, '') LIKE ?)",
          flat,
        ),
      );
      const like = `%${token}%`;
      filterParams.push(like, like, like, like);
    }
  } else if (parsed && kind === 'signal') {
    const signals: string[] = [];
    if (parsed.hasEtf) signals.push(qualify("b.fund_name LIKE '%ETF%'", flat));
    if (parsed.hasLof) signals.push(qualify("b.fund_name LIKE '%LOF%'", flat));
    if (parsed.hasLink) {
      signals.push(qualify("(b.fund_name LIKE '%联接%' OR b.fund_name LIKE '%聯接%')", flat));
    }
    if (signals.length) where.push(`(${signals.join(' AND ')})`);
  } else if (parsed && kind === 'share') {
    where.push(`${nameShareLetterSql(qualify('b.fund_name', flat))} = ?`);
    filterParams.push(parsed.shareLetter);
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
    if (query.sort === 'recovery_days_1y') {
      where.push(
        `${qualify("IFNULL(s.recovery_status_1y, 'insufficient')", flat)} IN ('recovered', 'open')`,
      );
    } else if (query.sort === 'all_in_fee_pct') {
      where.push(
        opts.fees
          ? qualify(
              '(s.all_in_fee_pct IS NOT NULL OR (f.mgmt_fee_pct IS NOT NULL AND f.custodian_fee_pct IS NOT NULL))',
              flat,
            )
          : `${qualify('s.all_in_fee_pct', flat)} IS NOT NULL`,
      );
    } else {
      where.push(`${qualify(SORT_COLUMNS[query.sort], flat)} IS NOT NULL`);
    }
  }
  const sampleCol = query.minSamples != null ? samplesColumn(query.sort, query.lens) : null;
  if (query.minSamples != null && sampleCol) {
    where.push(`${qualify(sampleCol, flat)} >= ?`);
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
  const codeOrd = qualify('b.fund_code', flat);
  let orderSql: string;
  if (query.sort === 'recovery_days_1y') {
    orderSql = `ORDER BY CASE ${qualify("IFNULL(s.recovery_status_1y, 'insufficient')", flat)} WHEN 'recovered' THEN 0 WHEN 'open' THEN 1 ELSE 2 END, ${qualify('s.recovery_days_1y', flat)} ASC, ${codeOrd} ASC`;
  } else if (query.sort === 'all_in_fee_pct') {
    orderSql = `ORDER BY CASE WHEN ${qualify('s.all_in_fee_pct', flat)} IS NULL THEN 1 ELSE 0 END, ${qualify('fee_shown_pct', true)} ASC, ${codeOrd} ASC`;
  } else if (query.sort === 'fund_code') {
    orderSql = `ORDER BY ${codeOrd} ${dirSql}`;
  } else {
    orderSql = `ORDER BY ${qualify(SORT_COLUMNS[query.sort], flat)} ${dirSql}, ${codeOrd} ASC`;
  }
  if (parsed && kind && kind !== 'empty') {
    const scored = searchScoreSql(parsed, Boolean(opts.select), flat, opts.selectCols);
    scoreParams.push(...scored.params);
    orderSql = `ORDER BY ${scored.expr} ASC, ${orderSql.replace(/^ORDER BY /, '')}`;
  }
  const offset = (query.page - 1) * query.pageSize;
  return {
    whereSql,
    orderSql,
    limitSql: 'LIMIT ? OFFSET ?',
    filterParams,
    limitParams: [query.pageSize, offset],
    scoreParams,
  };
}

function peerRankSql(query: FundListQuery): string {
  const parts: string[] = [];
  if (query.feePeer != null) {
    parts.push(`CASE WHEN s.all_in_fee_pct IS NULL THEN NULL
    ELSE 100.0 * RANK() OVER (PARTITION BY b.fund_type, s.all_in_fee_pct IS NOT NULL ORDER BY s.all_in_fee_pct ASC)
      / COUNT(s.all_in_fee_pct) OVER (PARTITION BY b.fund_type, s.all_in_fee_pct IS NOT NULL)
    END AS fee_pct`);
  }
  if (query.ddPeer != null) {
    parts.push(`CASE WHEN r.max_drawdown_1y IS NULL THEN NULL
    ELSE 100.0 * RANK() OVER (PARTITION BY b.fund_type, r.max_drawdown_1y IS NOT NULL ORDER BY r.max_drawdown_1y ASC)
      / COUNT(r.max_drawdown_1y) OVER (PARTITION BY b.fund_type, r.max_drawdown_1y IS NOT NULL)
    END AS dd_pct`);
  }
  if (query.scalePeer != null) {
    parts.push(`CASE WHEN s.scale_yi IS NULL THEN NULL
    ELSE 100.0 * RANK() OVER (PARTITION BY b.fund_type, s.scale_yi IS NOT NULL ORDER BY s.scale_yi ASC)
      / COUNT(s.scale_yi) OVER (PARTITION BY b.fund_type, s.scale_yi IS NOT NULL)
    END AS scale_pct`);
  }
  return parts.join(',\n    ');
}

const RISK_RESULT_COLS = [
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
  'nav_samples_1y',
  'nav_samples_3y',
  'nav_samples_5y',
] as const;

const SELECT_RESULT_COLS = [
  'ulcer_1y',
  'underwater_ratio_1y',
  'max_underwater_days_1y',
  'max_consec_down_1y',
  'down_day_ratio_1y',
  'worst_month_1y',
  'recovery_days_1y',
  'recovery_status_1y',
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
  'sales_fee_known',
  'share_class',
] as const;

export type FundListSqlOpts = {
  risk?: boolean;
  select?: boolean;
  money?: boolean;
  fees?: boolean;
  riskCols?: ReadonlySet<string>;
  selectCols?: ReadonlySet<string>;
};

function projectedCols(
  prefix: string,
  names: readonly string[],
  enabled: boolean,
  present?: ReadonlySet<string>,
): string {
  return names
    .map((col) =>
      enabled && (!present || present.has(col)) ? `${prefix}.${col}` : `NULL AS ${col}`,
    )
    .join(', ');
}

export function fundListFromSql(opts: FundListSqlOpts = {}): string {
  const riskJoin = opts.risk ? ' LEFT JOIN fund_risk_metrics r ON r.fund_code = b.fund_code' : '';
  const selectJoin = opts.select
    ? ' LEFT JOIN fund_select_metrics s ON s.fund_code = b.fund_code'
    : '';
  const moneyJoin = opts.money ? ` ${MONEY_YIELD_JOIN}` : '';
  const feeJoin = opts.fees ? ' LEFT JOIN fund_fees f ON f.fund_code = b.fund_code' : '';
  return `FROM fund_basic_info b
    LEFT JOIN fund_performance p ON p.fund_code = b.fund_code${riskJoin}${selectJoin}${moneyJoin}${feeJoin}`;
}

export function fundListSelectSql(opts: FundListSqlOpts = {}): string {
  const riskCols = projectedCols('r', RISK_RESULT_COLS, Boolean(opts.risk), opts.riskCols);
  const selectCols = projectedCols('s', SELECT_RESULT_COLS, Boolean(opts.select), opts.selectCols);
  const moneyCols = opts.money ? 'y.seven_day_yield' : 'NULL AS seven_day_yield';
  const feeShown = opts.fees
    ? `CASE WHEN s.all_in_fee_pct IS NOT NULL THEN s.all_in_fee_pct
           WHEN f.mgmt_fee_pct IS NOT NULL AND f.custodian_fee_pct IS NOT NULL
             THEN f.mgmt_fee_pct + f.custodian_fee_pct
           ELSE NULL END AS fee_shown_pct`
    : 'NULL AS fee_shown_pct';
  return `SELECT b.fund_code, b.fund_name, b.fund_type, b.pinyin_abbr, b.pinyin_full, b.in_mvp_pool,
      p.return_1m, p.return_3m, p.return_6m, p.return_1y, p.data_date,
      p.rank_pct_1m, p.rank_pct_3m, p.rank_pct_6m, p.rank_pct_1y, p.pass_4433,
      ${riskCols}, ${selectCols}, ${moneyCols}, ${feeShown}
    ${fundListFromSql(opts)}`;
}

export const FUND_LIST_SELECT = fundListSelectSql({ risk: false });

export function fundListSql(
  query: FundListQuery,
  opts: FundListSqlOpts = {},
): {
  listSql: string;
  countSql: string;
  listParams: SqlBinding[];
  countParams: SqlBinding[];
} {
  const needSelect =
    (isSelectSortKey(query.sort) && query.sort !== 'seven_day_yield') ||
    query.lens === 'picks' ||
    query.feePeer != null ||
    query.scalePeer != null ||
    query.top10Max != null;
  const sampleCol = query.minSamples != null ? samplesColumn(query.sort, query.lens) : null;
  const needRisk =
    isRiskSortKey(query.sort) || query.ddPeer != null || Boolean(sampleCol?.startsWith('r.'));
  const needMoney = query.sort === 'seven_day_yield';
  const missingSortCol =
    (isRiskSortKey(query.sort) && Boolean(opts.riskCols) && !opts.riskCols?.has(query.sort)) ||
    (isSelectSortKey(query.sort) &&
      query.sort !== 'seven_day_yield' &&
      Boolean(opts.selectCols) &&
      !opts.selectCols?.has(query.sort)) ||
    Boolean(
      sampleCol?.startsWith('r.') &&
        opts.riskCols &&
        !opts.riskCols.has(sampleCol.replace(/^r\./, '')),
    ) ||
    Boolean(query.feePeer != null && opts.selectCols && !opts.selectCols.has('all_in_fee_pct')) ||
    Boolean(query.ddPeer != null && opts.riskCols && !opts.riskCols.has('max_drawdown_1y')) ||
    Boolean(query.scalePeer != null && opts.selectCols && !opts.selectCols.has('scale_yi')) ||
    Boolean(query.top10Max != null && opts.selectCols && !opts.selectCols.has('top10_weight_pct'));
  if (
    (needSelect && !opts.select) ||
    (needRisk && !opts.risk) ||
    (needMoney && !opts.money) ||
    missingSortCol
  ) {
    return {
      listSql: `${fundListSelectSql({})} WHERE 0=1 ORDER BY b.fund_code ASC LIMIT ? OFFSET ?`,
      countSql: 'SELECT 0 AS n',
      listParams: [query.pageSize, (query.page - 1) * query.pageSize],
      countParams: [],
    };
  }
  const parsedQ = query.q ? parseSearchQuery(query.q) : null;
  const joinRisk = Boolean(opts.risk && needRisk);
  const joinSelect = Boolean(opts.select && (needSelect || Boolean(parsedQ?.shareLetter)));
  const joinMoney = Boolean(opts.money && needMoney);
  const joinFees = Boolean(opts.fees && (joinSelect || query.sort === 'all_in_fee_pct'));
  const sqlOpts: FundListSqlOpts = {
    risk: joinRisk,
    select: joinSelect,
    money: joinMoney,
    fees: joinFees,
    riskCols: opts.riskCols,
    selectCols: opts.selectCols,
  };
  const c = buildFundListClauses(query, sqlOpts);
  const from = fundListFromSql(sqlOpts);
  const needPeer = query.feePeer != null || query.ddPeer != null || query.scalePeer != null;
  if (needPeer) {
    const inner = `${fundListSelectSql(sqlOpts).replace('SELECT ', `SELECT ${peerRankSql(query)}, `)} `;
    const outer = buildFundListClauses(query, { ...sqlOpts, flat: true });
    return {
      listSql: `SELECT * FROM (${inner}) ranked ${outer.whereSql} ${outer.orderSql} ${outer.limitSql}`,
      countSql: `SELECT COUNT(*) AS n FROM (${inner}) ranked ${outer.whereSql}`,
      listParams: [...outer.filterParams, ...outer.scoreParams, ...outer.limitParams],
      countParams: [...outer.filterParams],
    };
  }
  return {
    listSql: `${fundListSelectSql(sqlOpts)} ${c.whereSql} ${c.orderSql} ${c.limitSql}`,
    countSql: `SELECT COUNT(*) AS n ${from} ${c.whereSql}`,
    listParams: [...c.filterParams, ...c.scoreParams, ...c.limitParams],
    countParams: [...c.filterParams],
  };
}
