/**
 * 选 ETF 与选股只读服务层 (apps/worker/src/lib/selection-service.ts)
 * 严格按照 docs/15-ETF-SCREENING.md 与 docs/16-STOCK-SCREENING.md 规范
 * 1. 继承鉴权，在只读连接/快照中执行
 * 2. 旧库无 selection_* 表时优雅返回 ready: false，不抛错，不动态建表
 * 3. 字段白名单、参数安全转换、排序 null 稳定置后
 * 4. 股票负 PE/PB 不计入低估值筛选；金融股支持默认排除或专属切片
 * 5. 真实 OHLC 历史聚合 (日/周/月、1/3/5年)
 * 6. 详情接口返回严格 camelCase 结构，对齐前端类型
 */

import {
  aggregateMarketBars,
  type HistoryBar,
  type MarketBarInterval,
  yearsBefore,
} from '../../../../src/metrics/market-bars';
import type { QueryExec, SqlBinding } from './executor.ts';

async function hasTable(executor: QueryExec, name: string): Promise<boolean> {
  const row = await executor.first<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    [name],
  );
  return Boolean(row);
}

function parseFiniteInt(val: unknown, fallback: number, min = 1, max = 1000): number {
  if (val === undefined || val === null || val === '') return fallback;
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  const int = Math.floor(num);
  return Math.min(max, Math.max(min, int));
}

function parseFiniteNumber(val: unknown): number | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  const num = Number(val);
  return Number.isFinite(num) ? num : undefined;
}

// ==========================================
// 1. 选 ETF 列表与详情接口
// ==========================================

export interface EtfListQuery {
  q?: string;
  category?: string; // '境内权益' | '境外权益' | '固收' | '货币' | '其他' | '待核验' | 'all'
  theme?: string; // '宽基' | '红利低波' | '行业主题' | '固收货币' | '跨境海外' | '其他'
  years?: '1' | '3' | '5';
  lens?: 'browse' | 'allocation' | 'liquidity' | 'cost' | 'risk' | 'picks';
  // 精选门槛
  maxFee?: number; // 持续费用上限 %
  minScale?: number; // 规模下限 (亿元)
  maxDrawdown?: number; // 回撤上限 %
  minTurnover?: number; // 20日均成交额下限 (元)
  hasBars?: boolean; // 仅看有场内 K 线
  sort?: string;
  order?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface EtfRowDto {
  symbol: string;
  ticker: string;
  name: string;
  exchange: string;
  assetClass: string;
  directionTag: string | null;
  linkedFundCode: string | null;
  marketTradeDate: string | null;
  marketPrice: number | null;
  changePct: number | null;
  turnover: number | null;
  volume: number | null;
  avgTurnover20d: number | null;
  navDate: string | null;
  unitNav: number | null;
  adjNav: number | null;
  premiumDiscountPct: number | null;
  mgmtFeePct: number | null;
  custodyFeePct: number | null;
  totalExpensePct: number | null;
  scaleYi: number | null;
  scalePeriod: string | null;
  scaleDisclosureDate: string | null;
  scaleSource: string | null;
  historyAsof: string | null;
  navRiskBasis: string | null;
  navRiskAsof: string | null;
  return1y: number | null;
  return3y: number | null;
  return5y: number | null;
  cagr1y: number | null;
  cagr3y: number | null;
  cagr5y: number | null;
  maxDrawdown1y: number | null;
  maxDrawdown3y: number | null;
  maxDrawdown5y: number | null;
  volatility1y: number | null;
  volatility3y: number | null;
  volatility5y: number | null;
  points1y: number | null;
  points3y: number | null;
  points5y: number | null;
  sparkline: number[];
  sparklineType: 'price' | 'nav' | 'none';
  hasMarketBars: boolean;
  hasNavHistory: boolean;
  hasDeepResearch: boolean;
  updatedAt: number;
}

export interface EtfListResponse {
  ready: boolean;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  coverage: {
    catalogCount: number;
    withNavCount: number;
    withBarsCount: number;
    withScaleCount: number;
    withFeesCount: number;
  };
  categories: Array<{ category: string; count: number }>;
  rows: EtfRowDto[];
  asof: {
    tradeDate: string | null;
    navDate: string | null;
    updatedAt: number | null;
  };
}

export function mapEtfRowToDto(r: Record<string, unknown>): EtfRowDto {
  let sparkline: number[] = [];
  try {
    if (typeof r.sparklineJson === 'string') sparkline = JSON.parse(r.sparklineJson);
    else if (typeof r.sparkline_json === 'string') sparkline = JSON.parse(r.sparkline_json);
  } catch {
    // ignore
  }

  return {
    symbol: String(r.symbol ?? ''),
    ticker: String(r.ticker ?? ''),
    name: String(r.name ?? ''),
    exchange: String(r.exchange ?? ''),
    assetClass: String(r.assetClass ?? r.asset_class ?? ''),
    directionTag: (r.directionTag ?? r.direction_tag ?? null) as string | null,
    linkedFundCode: (r.linkedFundCode ?? r.linked_fund_code ?? null) as string | null,
    marketTradeDate: (r.marketTradeDate ?? r.market_trade_date ?? null) as string | null,
    marketPrice: parseFiniteNumber(r.marketPrice ?? r.market_price) ?? null,
    changePct: parseFiniteNumber(r.changePct ?? r.change_pct) ?? null,
    turnover: parseFiniteNumber(r.turnover) ?? null,
    volume: parseFiniteNumber(r.volume) ?? null,
    avgTurnover20d: parseFiniteNumber(r.avgTurnover20d ?? r.avg_turnover_20d) ?? null,
    navDate: (r.navDate ?? r.nav_date ?? null) as string | null,
    unitNav: parseFiniteNumber(r.unitNav ?? r.unit_nav) ?? null,
    adjNav: parseFiniteNumber(r.adjNav ?? r.adj_nav) ?? null,
    premiumDiscountPct: parseFiniteNumber(r.premiumDiscountPct ?? r.premium_discount_pct) ?? null,
    mgmtFeePct: parseFiniteNumber(r.mgmtFeePct ?? r.mgmt_fee_pct) ?? null,
    custodyFeePct: parseFiniteNumber(r.custodyFeePct ?? r.custody_fee_pct) ?? null,
    totalExpensePct: parseFiniteNumber(r.totalExpensePct ?? r.total_expense_pct) ?? null,
    scaleYi: parseFiniteNumber(r.scaleYi ?? r.scale_yi) ?? null,
    scalePeriod: (r.scalePeriod ?? r.scale_period ?? null) as string | null,
    scaleDisclosureDate: (r.scaleDisclosureDate ?? r.scale_disclosure_date ?? null) as
      | string
      | null,
    scaleSource: (r.scaleSource ?? r.scale_source ?? null) as string | null,
    historyAsof: (r.historyAsof ?? r.history_asof ?? null) as string | null,
    navRiskBasis: (r.navRiskBasis ?? r.nav_risk_basis ?? null) as string | null,
    navRiskAsof: (r.navRiskAsof ?? r.nav_risk_asof ?? null) as string | null,
    return1y: parseFiniteNumber(r.return1y ?? r.return_1y) ?? null,
    return3y: parseFiniteNumber(r.return3y ?? r.return_3y) ?? null,
    return5y: parseFiniteNumber(r.return5y ?? r.return_5y) ?? null,
    cagr1y: parseFiniteNumber(r.cagr1y ?? r.cagr_1y) ?? null,
    cagr3y: parseFiniteNumber(r.cagr3y ?? r.cagr_3y) ?? null,
    cagr5y: parseFiniteNumber(r.cagr5y ?? r.cagr_5y) ?? null,
    maxDrawdown1y: parseFiniteNumber(r.maxDrawdown1y ?? r.max_drawdown_1y) ?? null,
    maxDrawdown3y: parseFiniteNumber(r.maxDrawdown3y ?? r.max_drawdown_3y) ?? null,
    maxDrawdown5y: parseFiniteNumber(r.maxDrawdown5y ?? r.max_drawdown_5y) ?? null,
    volatility1y: parseFiniteNumber(r.volatility1y ?? r.volatility_1y) ?? null,
    volatility3y: parseFiniteNumber(r.volatility3y ?? r.volatility_3y) ?? null,
    volatility5y: parseFiniteNumber(r.volatility5y ?? r.volatility_5y) ?? null,
    points1y: parseFiniteInt(r.points1y ?? r.points_1y, 0, 0, 10000) || null,
    points3y: parseFiniteInt(r.points3y ?? r.points_3y, 0, 0, 10000) || null,
    points5y: parseFiniteInt(r.points5y ?? r.points_5y, 0, 0, 10000) || null,
    sparkline,
    sparklineType: (r.sparklineType ?? r.sparkline_type ?? 'none') as 'price' | 'nav' | 'none',
    hasMarketBars: Boolean(
      r.hasMarketBars === 1 || r.has_market_bars === 1 || r.hasMarketBars === true,
    ),
    hasNavHistory: Boolean(
      r.hasNavHistory === 1 || r.has_nav_history === 1 || r.hasNavHistory === true,
    ),
    hasDeepResearch: Boolean(
      r.hasDeepResearch === 1 || r.has_deep_research === 1 || r.hasDeepResearch === true,
    ),
    updatedAt: Number(r.updatedAt ?? r.updated_at ?? 0),
  };
}

export async function listSelectionEtfs(
  executor: QueryExec,
  query: EtfListQuery,
): Promise<EtfListResponse> {
  if (!(await hasTable(executor, 'selection_etf_materialized'))) {
    return {
      ready: false,
      total: 0,
      page: 1,
      pageSize: query.pageSize ?? 50,
      totalPages: 0,
      coverage: {
        catalogCount: 0,
        withNavCount: 0,
        withBarsCount: 0,
        withScaleCount: 0,
        withFeesCount: 0,
      },
      categories: [],
      rows: [],
      asof: { tradeDate: null, navDate: null, updatedAt: null },
    };
  }

  // 统计全市场总览覆盖
  const covRow = await executor.first<{
    total: number;
    with_nav: number;
    with_bars: number;
    with_scale: number;
    with_fees: number;
    max_trade_date: string | null;
    max_nav_date: string | null;
    max_updated: number | null;
  }>(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN has_nav_history = 1 THEN 1 ELSE 0 END) AS with_nav,
      SUM(CASE WHEN has_market_bars = 1 THEN 1 ELSE 0 END) AS with_bars,
      SUM(CASE WHEN scale_yi IS NOT NULL THEN 1 ELSE 0 END) AS with_scale,
      SUM(CASE WHEN total_expense_pct IS NOT NULL THEN 1 ELSE 0 END) AS with_fees,
      MAX(market_trade_date) AS max_trade_date,
      MAX(nav_date) AS max_nav_date,
      MAX(updated_at) AS max_updated
    FROM selection_etf_materialized
  `);

  const categoryCounts = await executor.all<{ asset_class: string; c: number }>(`
    SELECT asset_class, COUNT(*) AS c
    FROM selection_etf_materialized
    GROUP BY asset_class
    ORDER BY c DESC
  `);

  const page = parseFiniteInt(query.page, 1, 1, 10000);
  const pageSize = parseFiniteInt(query.pageSize, 50, 1, 200);
  const offset = (page - 1) * pageSize;

  const whereParts: string[] = ['1=1'];
  const params: SqlBinding[] = [];

  if (query.q) {
    const term = `%${query.q.trim()}%`;
    whereParts.push('(ticker LIKE ? OR name LIKE ? OR symbol LIKE ?)');
    params.push(term, term, term);
  }

  if (query.category && query.category !== 'all') {
    whereParts.push('asset_class = ?');
    params.push(query.category);
  }

  if (query.theme && query.theme !== 'all') {
    whereParts.push('direction_tag = ?');
    params.push(query.theme);
  }

  if (query.hasBars) {
    whereParts.push('has_market_bars = 1');
  }

  // 精选门槛硬条件
  if (query.maxFee !== undefined && Number.isFinite(query.maxFee)) {
    whereParts.push('total_expense_pct IS NOT NULL AND total_expense_pct <= ?');
    params.push(query.maxFee);
  }

  if (query.minScale !== undefined && Number.isFinite(query.minScale)) {
    whereParts.push('scale_yi IS NOT NULL AND scale_yi >= ?');
    params.push(query.minScale);
  }

  const years = query.years === '3' ? '3' : query.years === '5' ? '5' : '1';
  if (query.maxDrawdown !== undefined && Number.isFinite(query.maxDrawdown)) {
    const ddCol = `max_drawdown_${years}y`;
    whereParts.push(`${ddCol} IS NOT NULL AND ${ddCol} <= ?`);
    params.push(query.maxDrawdown);
  }

  if (query.minTurnover !== undefined && Number.isFinite(query.minTurnover)) {
    whereParts.push('avg_turnover_20d IS NOT NULL AND avg_turnover_20d >= ?');
    params.push(query.minTurnover);
  }

  const whereSql = whereParts.join(' AND ');

  const countRow = await executor.first<{ count: number }>(
    `SELECT COUNT(*) AS count FROM selection_etf_materialized WHERE ${whereSql}`,
    params,
  );
  const total = countRow?.count ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  // 排序白名单
  const sortMap = new Map<string, string>([
    ['symbol', 'symbol'],
    ['ticker', 'ticker'],
    ['price', 'market_price'],
    ['changePct', 'change_pct'],
    ['scale', 'scale_yi'],
    ['avgTurnover20d', 'avg_turnover_20d'],
    ['turnover', 'turnover'],
    ['fee', 'total_expense_pct'],
    ['mgmtFee', 'mgmt_fee_pct'],
    ['custodyFee', 'custody_fee_pct'],
    ['return', `return_${years}y`],
    ['cagr', `cagr_${years}y`],
    ['maxDrawdown', `max_drawdown_${years}y`],
    ['volatility', `volatility_${years}y`],
    ['premiumDiscount', 'premium_discount_pct'],
  ]);

  let sortKey = 'ticker';
  let order: 'ASC' | 'DESC' = 'ASC';

  const mappedEtfSort = query.sort ? sortMap.get(query.sort) : undefined;
  if (mappedEtfSort) {
    sortKey = mappedEtfSort;
    order = query.order === 'desc' ? 'DESC' : 'ASC';
  } else if (!query.sort && query.lens) {
    // 镜头默认排序
    if (query.lens === 'allocation') {
      sortKey = 'scale_yi';
      order = 'DESC';
    } else if (query.lens === 'liquidity') {
      sortKey = 'avg_turnover_20d';
      order = 'DESC';
    } else if (query.lens === 'cost') {
      sortKey = 'total_expense_pct';
      order = 'ASC';
    } else if (query.lens === 'risk') {
      sortKey = `max_drawdown_${years}y`;
      order = 'ASC';
    } else if (query.lens === 'picks') {
      sortKey = 'scale_yi';
      order = 'DESC';
    }
  }

  // 确保 null 永远稳定排在末尾，次要排序为 symbol
  const orderSql =
    sortKey === 'ticker' || sortKey === 'symbol'
      ? `${sortKey} ${order}`
      : `CASE WHEN ${sortKey} IS NULL THEN 1 ELSE 0 END, ${sortKey} ${order}, symbol ASC`;

  const rows = await executor.all<Record<string, unknown>>(
    `SELECT
      symbol, ticker, name, exchange, asset_class AS assetClass, direction_tag AS directionTag,
      linked_fund_code AS linkedFundCode,
      market_trade_date AS marketTradeDate, market_price AS marketPrice,
      change_pct AS changePct, turnover, volume, avg_turnover_20d AS avgTurnover20d,
      nav_date AS navDate, unit_nav AS unitNav, adj_nav AS adjNav,
      premium_discount_pct AS premiumDiscountPct,
      mgmt_fee_pct AS mgmtFeePct, custody_fee_pct AS custodyFeePct, total_expense_pct AS totalExpensePct,
      scale_yi AS scaleYi, scale_period AS scalePeriod, scale_disclosure_date AS scaleDisclosureDate, scale_source AS scaleSource,
      history_asof AS historyAsof, nav_risk_basis AS navRiskBasis, nav_risk_asof AS navRiskAsof,
      return_1y AS return1y, return_3y AS return3y, return_5y AS return5y,
      cagr_1y AS cagr1y, cagr_3y AS cagr3y, cagr_5y AS cagr5y,
      max_drawdown_1y AS maxDrawdown1y, max_drawdown_3y AS maxDrawdown3y, max_drawdown_5y AS maxDrawdown5y,
      volatility_1y AS volatility1y, volatility_3y AS volatility3y, volatility_5y AS volatility5y,
      points_1y AS points1y, points_3y AS points3y, points_5y AS points5y,
      sparkline_json AS sparklineJson, sparkline_type AS sparklineType,
      has_market_bars AS hasMarketBars, has_nav_history AS hasNavHistory, has_deep_research AS hasDeepResearch,
      updated_at AS updatedAt
    FROM selection_etf_materialized
    WHERE ${whereSql}
    ORDER BY ${orderSql}
    LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );

  return {
    ready: true,
    total,
    page,
    pageSize,
    totalPages,
    coverage: {
      catalogCount: covRow?.total ?? 0,
      withNavCount: covRow?.with_nav ?? 0,
      withBarsCount: covRow?.with_bars ?? 0,
      withScaleCount: covRow?.with_scale ?? 0,
      withFeesCount: covRow?.with_fees ?? 0,
    },
    categories: categoryCounts.map((c) => ({ category: c.asset_class, count: c.c })),
    rows: rows.map(mapEtfRowToDto),
    asof: {
      tradeDate: covRow?.max_trade_date ?? null,
      navDate: covRow?.max_nav_date ?? null,
      updatedAt: covRow?.max_updated ?? null,
    },
  };
}

export async function getSelectionEtfDetail(executor: QueryExec, symbol: string) {
  if (!(await hasTable(executor, 'selection_etf_catalog'))) {
    return { ready: false, found: false, detail: null };
  }

  const catalog = await executor.first<{
    symbol: string;
    ticker: string;
    name: string;
    exchange: string;
    asset_class: string;
    direction_tag: string | null;
    linked_fund_code: string | null;
    link_method: string | null;
  }>('SELECT * FROM selection_etf_catalog WHERE symbol = ? OR ticker = ?', [symbol, symbol]);

  if (!catalog) {
    return { ready: true, found: false, detail: null };
  }

  const sym = catalog.symbol;

  // 物化宽表行
  const rawMat =
    (await executor.first<Record<string, unknown>>(
      'SELECT * FROM selection_etf_materialized WHERE symbol = ?',
      [sym],
    )) ?? {};
  const metrics = mapEtfRowToDto({ ...catalog, ...rawMat });

  // Profile
  const profile =
    (await executor.first<Record<string, unknown>>(
      'SELECT * FROM selection_etf_profile WHERE symbol = ?',
      [sym],
    )) ?? {};

  // 披露规模列表
  const rawFinancials = await executor.all<{
    start_date: string;
    end_date: string;
    publish_date: string;
    asset_nav: number | null;
  }>(
    'SELECT start_date, end_date, publish_date, asset_nav FROM selection_etf_financials WHERE symbol = ? ORDER BY end_date DESC, publish_date DESC LIMIT 12',
    [sym],
  );

  // 最新报告期的披露持仓 (先查最大 report_date，再查该期的前 20 大持仓)
  const maxHoldingReport = await executor.first<{ report_date: string }>(
    'SELECT MAX(report_date) AS report_date FROM selection_etf_holding WHERE symbol = ?',
    [sym],
  );

  let holdings: Array<{
    reportDate: string;
    stockCode: string;
    stockName: string;
    assetType: string;
    holdRatio: number | null;
    positionCapital: number | null;
    positionCount: number | null;
    publishedAt: string | null;
  }> = [];

  if (maxHoldingReport?.report_date) {
    const rawHoldings = await executor.all<{
      report_date: string;
      stock_code: string;
      stock_name: string;
      asset_type: string;
      hold_ratio: number | null;
      position_capital: number | null;
      position_count: number | null;
      published_at: string | null;
    }>(
      'SELECT report_date, stock_code, stock_name, asset_type, hold_ratio, position_capital, position_count, published_at FROM selection_etf_holding WHERE symbol = ? AND report_date = ? ORDER BY hold_ratio DESC LIMIT 20',
      [sym, maxHoldingReport.report_date],
    );
    holdings = rawHoldings.map((h) => ({
      reportDate: h.report_date,
      stockCode: h.stock_code,
      stockName: h.stock_name,
      assetType: h.asset_type,
      holdRatio: parseFiniteNumber(h.hold_ratio) ?? null,
      positionCapital: parseFiniteNumber(h.position_capital) ?? null,
      positionCount: parseFiniteNumber(h.position_count) ?? null,
      publishedAt: h.published_at,
    }));
  }

  return {
    ready: true,
    found: true,
    detail: {
      catalog: {
        symbol: catalog.symbol,
        ticker: catalog.ticker,
        name: catalog.name,
        exchange: catalog.exchange,
        assetClass: catalog.asset_class,
        directionTag: catalog.direction_tag,
        linkedFundCode: catalog.linked_fund_code,
        linkMethod: catalog.link_method,
      },
      metrics,
      profile: {
        estabDate: (profile.estab_date as string | null) ?? null,
        mgmtName: (profile.mgmt_name as string | null) ?? null,
        managerName: (profile.manager_name as string | null) ?? null,
        fundScale: parseFiniteNumber(profile.fund_scale) ?? null,
        mgmtFeePct: parseFiniteNumber(profile.mgmt_fee_pct) ?? null,
        custodyFeePct: parseFiniteNumber(profile.custody_fee_pct) ?? null,
      },
      financials: rawFinancials.map((f) => ({
        startDate: f.start_date,
        endDate: f.end_date,
        publishDate: f.publish_date,
        assetNav: parseFiniteNumber(f.asset_nav) ?? null,
      })),
      holdings,
    },
  };
}

export async function getSelectionEtfBars(
  executor: QueryExec,
  symbol: string,
  options: { years?: 1 | 3 | 5; interval?: MarketBarInterval },
) {
  const years = options.years ?? 1;
  const interval = options.interval ?? 'day';

  if (!(await hasTable(executor, 'selection_daily_bar'))) {
    return {
      ready: false,
      found: false,
      adjust: 'none',
      interval,
      years,
      coverage: {
        hasBars: false,
        totalBars: 0,
        startDate: null,
        endDate: null,
        isFullWindow: false,
      },
      bars: [],
    };
  }

  const catalog = await executor.first<{ symbol: string }>(
    'SELECT symbol FROM selection_etf_catalog WHERE symbol = ? OR ticker = ?',
    [symbol, symbol],
  );
  if (!catalog) {
    return {
      ready: true,
      found: false,
      adjust: 'none',
      interval,
      years,
      coverage: {
        hasBars: false,
        totalBars: 0,
        startDate: null,
        endDate: null,
        isFullWindow: false,
      },
      bars: [],
    };
  }

  const sym = catalog.symbol;
  const rawBars = await executor.all<{
    trade_date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number | null;
    turnover: number | null;
    collected_at: number;
  }>(
    "SELECT trade_date, open, high, low, close, volume, turnover, collected_at FROM selection_daily_bar WHERE asset_type = 'etf' AND symbol = ? AND adjust = 'none' ORDER BY trade_date ASC",
    [sym],
  );

  if (rawBars.length === 0) {
    return {
      ready: true,
      found: true,
      adjust: 'none',
      interval,
      years,
      coverage: {
        hasBars: false,
        totalBars: 0,
        startDate: null,
        endDate: null,
        isFullWindow: false,
      },
      bars: [],
    };
  }

  const historyBars: HistoryBar[] = rawBars.map((b) => ({
    date: b.trade_date,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
    turnover: b.turnover,
    source: 'fuyao',
    collectedAt: b.collected_at,
  }));

  const lastDate = historyBars.at(-1)?.date ?? '';
  const firstDate = historyBars[0]?.date ?? '';
  const cutoff = yearsBefore(lastDate, years);

  // 严格按自然日判断是否满足完整窗口跨度 (允许 10 天边界容差)
  const windowFullTime = new Date(`${cutoff}T00:00:00Z`).getTime();
  const firstActualTime = new Date(`${firstDate}T00:00:00Z`).getTime();
  const isFullWindow = firstActualTime <= windowFullTime + 10 * 86400000;

  const filtered = historyBars.filter((b) => b.date >= cutoff);
  const aggregated = interval === 'day' ? filtered : aggregateMarketBars(filtered, interval);

  return {
    ready: true,
    found: true,
    adjust: 'none',
    interval,
    years,
    coverage: {
      hasBars: true,
      totalBars: aggregated.length,
      startDate: aggregated[0]?.date ?? null,
      endDate: aggregated.at(-1)?.date ?? null,
      isFullWindow,
    },
    bars: aggregated,
  };
}

// ==========================================
// 2. 选股列表与详情接口
// ==========================================

export interface StockListQuery {
  q?: string;
  exchange?: string; // 'SH' | 'SZ' | 'BJ' | 'all' | 'SH,SZ'
  industry?: string;
  isFinancial?: boolean; // 过滤金融股
  excludeFinancial?: boolean;
  years?: '1' | '3' | '5';
  fiscalYear?: number;
  lens?: 'browse' | 'valuation' | 'quality' | 'growth' | 'cashflow' | 'trend' | 'picks';
  // 精选门槛
  maxPe?: number;
  minRoe?: number;
  minRevenueYoy?: number;
  maxDrawdown?: number;
  minTurnover?: number;
  hasHistory?: boolean;
  hasFinancials?: boolean;
  excludeSt?: boolean; // 排除 ST / *ST
  sort?: string;
  order?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface StockRowDto {
  symbol: string;
  ticker: string;
  name: string;
  exchange: string;
  industryThscode: string | null;
  industryName: string | null;
  isFinancial: boolean;
  tradeDate: string | null;
  price: number | null;
  changePct: number | null;
  turnover: number | null;
  volume: number | null;
  avgTurnover20d: number | null;
  peTtm: number | null;
  peMrq: number | null;
  pbMrq: number | null;
  psTtm: number | null;
  pcfTtm: number | null;
  valuationTimestamp: number | null;
  historyAsof: string | null;
  return1y: number | null;
  return3y: number | null;
  return5y: number | null;
  cagr1y: number | null;
  cagr3y: number | null;
  cagr5y: number | null;
  maxDrawdown1y: number | null;
  maxDrawdown3y: number | null;
  maxDrawdown5y: number | null;
  volatility1y: number | null;
  volatility3y: number | null;
  volatility5y: number | null;
  return20d: number | null;
  return60d: number | null;
  ma60Bias: number | null;
  sparkline: number[];
  fiscalYear: number | null;
  periodEnd: string | null;
  reportDate: string | null;
  currency: string | null;
  roeWeighted: number | null;
  roeDeductedWeighted: number | null;
  grossMargin: number | null;
  netMargin: number | null;
  debtRatio: number | null;
  operatingIncome: number | null;
  revenueYoy: number | null;
  netProfit: number | null;
  parentNetProfit: number | null;
  profitYoy: number | null;
  revenueCagr3y: number | null;
  profitCagr3y: number | null;
  operatingCashFlow: number | null;
  cashProfitRatio: number | null;
  capex: number | null;
  cashMinusCapex: number | null;
  hasDeepResearch: boolean;
  hasPriceHistory: boolean;
  hasFinancials: boolean;
  updatedAt: number;
}

export interface StockListResponse {
  ready: boolean;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  coverage: {
    catalogCount: number;
    withValuationCount: number;
    withHistoryCount: number;
    withFinancialsCount: number;
  };
  industries: Array<{ industry: string; count: number }>;
  fiscalYears: number[];
  rows: StockRowDto[];
  asof: {
    tradeDate: string | null;
    valuationTimestamp: number | null;
    historyAsof: string | null;
    updatedAt: number | null;
  };
}

export function mapStockRowToDto(r: Record<string, unknown>): StockRowDto {
  let sparkline: number[] = [];
  try {
    if (typeof r.sparklineJson === 'string') sparkline = JSON.parse(r.sparklineJson);
    else if (typeof r.sparkline_json === 'string') sparkline = JSON.parse(r.sparkline_json);
  } catch {
    // ignore
  }

  return {
    symbol: String(r.symbol ?? ''),
    ticker: String(r.ticker ?? ''),
    name: String(r.name ?? ''),
    exchange: String(r.exchange ?? ''),
    industryThscode: (r.industryThscode ?? r.industry_thscode ?? null) as string | null,
    industryName: (r.industryName ?? r.industry_name ?? null) as string | null,
    isFinancial: Boolean(r.isFinancial === 1 || r.is_financial === 1 || r.isFinancial === true),
    tradeDate: (r.tradeDate ?? r.trade_date ?? null) as string | null,
    price: parseFiniteNumber(r.price) ?? null,
    changePct: parseFiniteNumber(r.changePct ?? r.change_pct) ?? null,
    turnover: parseFiniteNumber(r.turnover) ?? null,
    volume: parseFiniteNumber(r.volume) ?? null,
    avgTurnover20d: parseFiniteNumber(r.avgTurnover20d ?? r.avg_turnover_20d) ?? null,
    peTtm: parseFiniteNumber(r.peTtm ?? r.pe_ttm) ?? null,
    peMrq: parseFiniteNumber(r.peMrq ?? r.pe_mrq) ?? null,
    pbMrq: parseFiniteNumber(r.pbMrq ?? r.pb_mrq) ?? null,
    psTtm: parseFiniteNumber(r.psTtm ?? r.ps_ttm) ?? null,
    pcfTtm: parseFiniteNumber(r.pcfTtm ?? r.pcf_ttm) ?? null,
    valuationTimestamp: parseFiniteNumber(r.valuationTimestamp ?? r.valuation_timestamp) ?? null,
    historyAsof: (r.historyAsof ?? r.history_asof ?? null) as string | null,
    return1y: parseFiniteNumber(r.return1y ?? r.return_1y) ?? null,
    return3y: parseFiniteNumber(r.return3y ?? r.return_3y) ?? null,
    return5y: parseFiniteNumber(r.return5y ?? r.return_5y) ?? null,
    cagr1y: parseFiniteNumber(r.cagr1y ?? r.cagr_1y) ?? null,
    cagr3y: parseFiniteNumber(r.cagr3y ?? r.cagr_3y) ?? null,
    cagr5y: parseFiniteNumber(r.cagr5y ?? r.cagr_5y) ?? null,
    maxDrawdown1y: parseFiniteNumber(r.maxDrawdown1y ?? r.max_drawdown_1y) ?? null,
    maxDrawdown3y: parseFiniteNumber(r.maxDrawdown3y ?? r.max_drawdown_3y) ?? null,
    maxDrawdown5y: parseFiniteNumber(r.maxDrawdown5y ?? r.max_drawdown_5y) ?? null,
    volatility1y: parseFiniteNumber(r.volatility1y ?? r.volatility_1y) ?? null,
    volatility3y: parseFiniteNumber(r.volatility3y ?? r.volatility_3y) ?? null,
    volatility5y: parseFiniteNumber(r.volatility5y ?? r.volatility_5y) ?? null,
    return20d: parseFiniteNumber(r.return20d ?? r.return_20d) ?? null,
    return60d: parseFiniteNumber(r.return60d ?? r.return_60d) ?? null,
    ma60Bias: parseFiniteNumber(r.ma60Bias ?? r.ma60_bias) ?? null,
    sparkline,
    fiscalYear: parseFiniteInt(r.fiscalYear ?? r.fiscal_year, 0, 1990, 2100) || null,
    periodEnd: (r.periodEnd ?? r.period_end ?? null) as string | null,
    reportDate: (r.reportDate ?? r.report_date ?? null) as string | null,
    currency: (r.currency as string | null) ?? null,
    roeWeighted: parseFiniteNumber(r.roeWeighted ?? r.roe_weighted) ?? null,
    roeDeductedWeighted:
      parseFiniteNumber(r.roeDeductedWeighted ?? r.roe_deducted_weighted) ?? null,
    grossMargin: parseFiniteNumber(r.grossMargin ?? r.gross_margin) ?? null,
    netMargin: parseFiniteNumber(r.netMargin ?? r.net_margin) ?? null,
    debtRatio: parseFiniteNumber(r.debtRatio ?? r.debt_ratio) ?? null,
    operatingIncome: parseFiniteNumber(r.operatingIncome ?? r.operating_income) ?? null,
    revenueYoy: parseFiniteNumber(r.revenueYoy ?? r.revenue_yoy) ?? null,
    netProfit: parseFiniteNumber(r.netProfit ?? r.net_profit) ?? null,
    parentNetProfit: parseFiniteNumber(r.parentNetProfit ?? r.parent_net_profit) ?? null,
    profitYoy: parseFiniteNumber(r.profitYoy ?? r.profit_yoy) ?? null,
    revenueCagr3y: parseFiniteNumber(r.revenueCagr3y ?? r.revenue_cagr_3y) ?? null,
    profitCagr3y: parseFiniteNumber(r.profitCagr3y ?? r.profit_cagr_3y) ?? null,
    operatingCashFlow: parseFiniteNumber(r.operatingCashFlow ?? r.operating_cash_flow) ?? null,
    cashProfitRatio: parseFiniteNumber(r.cashProfitRatio ?? r.cash_profit_ratio) ?? null,
    capex: parseFiniteNumber(r.capex) ?? null,
    cashMinusCapex: parseFiniteNumber(r.cashMinusCapex ?? r.cash_minus_capex) ?? null,
    hasDeepResearch: Boolean(
      r.hasDeepResearch === 1 || r.has_deep_research === 1 || r.hasDeepResearch === true,
    ),
    hasPriceHistory: Boolean(
      r.hasPriceHistory === 1 || r.has_price_history === 1 || r.hasPriceHistory === true,
    ),
    hasFinancials: Boolean(
      r.hasFinancials === 1 || r.has_financials === 1 || r.hasFinancials === true,
    ),
    updatedAt: Number(r.updatedAt ?? r.updated_at ?? 0),
  };
}

export async function listSelectionStocks(
  executor: QueryExec,
  query: StockListQuery,
): Promise<StockListResponse> {
  if (!(await hasTable(executor, 'selection_stock_materialized'))) {
    return {
      ready: false,
      total: 0,
      page: 1,
      pageSize: query.pageSize ?? 50,
      totalPages: 0,
      coverage: {
        catalogCount: 0,
        withValuationCount: 0,
        withHistoryCount: 0,
        withFinancialsCount: 0,
      },
      industries: [],
      fiscalYears: [],
      rows: [],
      asof: {
        tradeDate: null,
        valuationTimestamp: null,
        historyAsof: null,
        updatedAt: null,
      },
    };
  }

  // 覆盖与统计
  const covRow = await executor.first<{
    total: number;
    with_val: number;
    with_history: number;
    with_fin: number;
    max_trade_date: string | null;
    max_val_time: number | null;
    max_history_asof: string | null;
    max_updated: number | null;
  }>(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN pe_ttm IS NOT NULL THEN 1 ELSE 0 END) AS with_val,
      SUM(CASE WHEN has_price_history = 1 THEN 1 ELSE 0 END) AS with_history,
      SUM(CASE WHEN has_financials = 1 THEN 1 ELSE 0 END) AS with_fin,
      MAX(trade_date) AS max_trade_date,
      MAX(valuation_timestamp) AS max_val_time,
      MAX(history_asof) AS max_history_asof,
      MAX(updated_at) AS max_updated
    FROM selection_stock_materialized
  `);

  const industryCounts = await executor.all<{ industry_name: string; c: number }>(`
    SELECT COALESCE(industry_name, '未分类') AS industry_name, COUNT(*) AS c
    FROM selection_stock_materialized
    GROUP BY industry_name
    ORDER BY c DESC
  `);

  const fyRows = await executor.all<{ fiscal_year: number }>(`
    SELECT DISTINCT fiscal_year
    FROM selection_stock_materialized
    WHERE fiscal_year IS NOT NULL
    ORDER BY fiscal_year DESC
  `);

  const page = parseFiniteInt(query.page, 1, 1, 10000);
  const pageSize = parseFiniteInt(query.pageSize, 50, 1, 200);
  const offset = (page - 1) * pageSize;

  const whereParts: string[] = ['1=1'];
  const params: SqlBinding[] = [];

  // 市场板块过滤支持 SH,SZ / all / 独立交易所
  if (query.exchange === 'all') {
    // 全市场，不限制
  } else if (query.exchange === 'SH,SZ' || (!query.exchange && query.lens !== 'browse')) {
    whereParts.push("exchange IN ('SH', 'SZ')");
  } else if (query.exchange) {
    whereParts.push('exchange = ?');
    params.push(query.exchange);
  }

  if (query.q) {
    const term = `%${query.q.trim()}%`;
    whereParts.push('(ticker LIKE ? OR name LIKE ? OR symbol LIKE ?)');
    params.push(term, term, term);
  }

  if (query.industry && query.industry !== 'all') {
    if (query.industry === '未分类') {
      whereParts.push('industry_name IS NULL');
    } else {
      whereParts.push('industry_name = ?');
      params.push(query.industry);
    }
  }

  // 金融股过滤逻辑
  if (query.excludeFinancial) {
    whereParts.push('is_financial = 0');
  } else if (query.isFinancial !== undefined) {
    whereParts.push('is_financial = ?');
    params.push(query.isFinancial ? 1 : 0);
  } else if (query.lens === 'cashflow' || query.lens === 'quality' || query.lens === 'growth') {
    // 经营现金质量、盈利质量与成长持续默认排除不可比金融股
    whereParts.push('is_financial = 0');
  }

  // 排除 ST / *ST 股票
  if (query.excludeSt) {
    whereParts.push("name NOT LIKE '%ST%'");
  }

  if (query.fiscalYear && Number.isFinite(query.fiscalYear)) {
    whereParts.push('fiscal_year = ?');
    params.push(query.fiscalYear);
  }

  if (query.hasHistory) {
    whereParts.push('has_price_history = 1');
  }

  if (query.hasFinancials) {
    whereParts.push('has_financials = 1');
  }

  // 精选数值条件：负 PE 绝不进入低估值
  if (query.maxPe !== undefined && Number.isFinite(query.maxPe)) {
    whereParts.push('pe_ttm IS NOT NULL AND pe_ttm > 0 AND pe_ttm <= ?');
    params.push(query.maxPe);
  }

  if (query.minRoe !== undefined && Number.isFinite(query.minRoe)) {
    whereParts.push('roe_weighted IS NOT NULL AND roe_weighted >= ?');
    params.push(query.minRoe);
  }

  if (query.minRevenueYoy !== undefined && Number.isFinite(query.minRevenueYoy)) {
    whereParts.push('revenue_yoy IS NOT NULL AND revenue_yoy >= ?');
    params.push(query.minRevenueYoy);
  }

  const years = query.years === '3' ? '3' : query.years === '5' ? '5' : '1';
  if (query.maxDrawdown !== undefined && Number.isFinite(query.maxDrawdown)) {
    const ddCol = `max_drawdown_${years}y`;
    whereParts.push(`${ddCol} IS NOT NULL AND ${ddCol} <= ?`);
    params.push(query.maxDrawdown);
  }

  if (query.minTurnover !== undefined && Number.isFinite(query.minTurnover)) {
    whereParts.push('turnover IS NOT NULL AND turnover >= ?');
    params.push(query.minTurnover);
  }

  const whereSql = whereParts.join(' AND ');

  const countRow = await executor.first<{ count: number }>(
    `SELECT COUNT(*) AS count FROM selection_stock_materialized WHERE ${whereSql}`,
    params,
  );
  const total = countRow?.count ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  // 排序白名单
  const sortMap = new Map<string, string>([
    ['symbol', 'symbol'],
    ['ticker', 'ticker'],
    ['price', 'price'],
    ['changePct', 'change_pct'],
    ['turnover', 'turnover'],
    ['avgTurnover20d', 'avg_turnover_20d'],
    ['pe', 'pe_ttm'],
    ['pb', 'pb_mrq'],
    ['ps', 'ps_ttm'],
    ['pcf', 'pcf_ttm'],
    ['roe', 'roe_weighted'],
    ['roeDeducted', 'roe_deducted_weighted'],
    ['grossMargin', 'gross_margin'],
    ['netMargin', 'net_margin'],
    ['debtRatio', 'debt_ratio'],
    ['revenueYoy', 'revenue_yoy'],
    ['profitYoy', 'profit_yoy'],
    ['revenueCagr3y', 'revenue_cagr_3y'],
    ['profitCagr3y', 'profit_cagr_3y'],
    ['operatingIncome', 'operating_income'],
    ['netProfit', 'net_profit'],
    ['cashFlow', 'operating_cash_flow'],
    ['cashProfitRatio', 'cash_profit_ratio'],
    ['capex', 'capex'],
    ['cashMinusCapex', 'cash_minus_capex'],
    ['return', `return_${years}y`],
    ['cagr', `cagr_${years}y`],
    ['maxDrawdown', `max_drawdown_${years}y`],
    ['volatility', `volatility_${years}y`],
    ['return20d', 'return_20d'],
    ['return60d', 'return_60d'],
    ['ma60Bias', 'ma60_bias'],
  ]);

  let sortKey = 'ticker';
  let order: 'ASC' | 'DESC' = 'ASC';

  const mappedStockSort = query.sort ? sortMap.get(query.sort) : undefined;
  if (mappedStockSort) {
    sortKey = mappedStockSort;
    order = query.order === 'desc' ? 'DESC' : 'ASC';
  } else if (!query.sort && query.lens) {
    if (query.lens === 'valuation') {
      sortKey = 'pe_ttm';
      order = 'ASC';
    } else if (query.lens === 'quality' || query.lens === 'picks') {
      sortKey = 'roe_weighted';
      order = 'DESC';
    } else if (query.lens === 'growth') {
      sortKey = 'revenue_yoy';
      order = 'DESC';
    } else if (query.lens === 'cashflow') {
      sortKey = 'cash_profit_ratio';
      order = 'DESC';
    } else if (query.lens === 'trend') {
      sortKey = `max_drawdown_${years}y`;
      order = 'ASC';
    }
  }

  // PE / PB / PS / PCF 升序排时：正数最便宜排最前，负数次之，null 排在最后
  let orderSql = '';
  if (['pe_ttm', 'pb_mrq', 'ps_ttm', 'pcf_ttm'].includes(sortKey) && order === 'ASC') {
    orderSql = `CASE WHEN ${sortKey} IS NULL THEN 2 WHEN ${sortKey} <= 0 THEN 1 ELSE 0 END, ${sortKey} ASC, symbol ASC`;
  } else if (sortKey === 'ticker' || sortKey === 'symbol') {
    orderSql = `${sortKey} ${order}`;
  } else {
    orderSql = `CASE WHEN ${sortKey} IS NULL THEN 1 ELSE 0 END, ${sortKey} ${order}, symbol ASC`;
  }

  const rows = await executor.all<Record<string, unknown>>(
    `SELECT
      symbol, ticker, name, exchange, industry_thscode AS industryThscode, industry_name AS industryName,
      is_financial AS isFinancial, trade_date AS tradeDate, price, change_pct AS changePct, turnover, volume,
      avg_turnover_20d AS avgTurnover20d,
      pe_ttm AS peTtm, pe_mrq AS peMrq, pb_mrq AS pbMrq, ps_ttm AS psTtm, pcf_ttm AS pcfTtm,
      valuation_timestamp AS valuationTimestamp, history_asof AS historyAsof,
      return_1y AS return1y, return_3y AS return3y, return_5y AS return5y,
      cagr_1y AS cagr1y, cagr_3y AS cagr3y, cagr_5y AS cagr5y,
      max_drawdown_1y AS maxDrawdown1y, max_drawdown_3y AS maxDrawdown3y, max_drawdown_5y AS maxDrawdown5y,
      volatility_1y AS volatility1y, volatility_3y AS volatility3y, volatility_5y AS volatility5y,
      return_20d AS return20d, return_60d AS return60d, ma60_bias AS ma60Bias,
      sparkline_json AS sparklineJson,
      fiscal_year AS fiscalYear, period_end AS periodEnd, report_date AS reportDate, currency,
      roe_weighted AS roeWeighted, roe_deducted_weighted AS roeDeductedWeighted,
      gross_margin AS grossMargin, net_margin AS netMargin, debt_ratio AS debtRatio,
      operating_income AS operatingIncome, revenue_yoy AS revenueYoy,
      net_profit AS netProfit, parent_net_profit AS parentNetProfit, profit_yoy AS profitYoy,
      revenue_cagr_3y AS revenueCagr3y, profit_cagr_3y AS profitCagr3y,
      operating_cash_flow AS operatingCashFlow, cash_profit_ratio AS cashProfitRatio,
      capex, cash_minus_capex AS cashMinusCapex,
      has_deep_research AS hasDeepResearch, has_price_history AS hasPriceHistory, has_financials AS hasFinancials,
      updated_at AS updatedAt
    FROM selection_stock_materialized
    WHERE ${whereSql}
    ORDER BY ${orderSql}
    LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );

  return {
    ready: true,
    total,
    page,
    pageSize,
    totalPages,
    coverage: {
      catalogCount: covRow?.total ?? 0,
      withValuationCount: covRow?.with_val ?? 0,
      withHistoryCount: covRow?.with_history ?? 0,
      withFinancialsCount: covRow?.with_fin ?? 0,
    },
    industries: industryCounts.map((i) => ({ industry: i.industry_name, count: i.c })),
    fiscalYears: fyRows.map((f) => f.fiscal_year),
    rows: rows.map(mapStockRowToDto),
    asof: {
      tradeDate: covRow?.max_trade_date ?? null,
      valuationTimestamp: covRow?.max_val_time ?? null,
      historyAsof: covRow?.max_history_asof ?? null,
      updatedAt: covRow?.max_updated ?? null,
    },
  };
}

export async function getSelectionStockDetail(executor: QueryExec, symbol: string) {
  if (!(await hasTable(executor, 'selection_stock_catalog'))) {
    return { ready: false, found: false, detail: null };
  }

  const catalog = await executor.first<{
    symbol: string;
    ticker: string;
    name: string;
    exchange: string;
    industry_thscode: string | null;
    industry_name: string | null;
    is_financial: number;
  }>('SELECT * FROM selection_stock_catalog WHERE symbol = ? OR ticker = ?', [symbol, symbol]);

  if (!catalog) {
    return { ready: true, found: false, detail: null };
  }

  const sym = catalog.symbol;

  // 物化宽表行
  const rawMat =
    (await executor.first<Record<string, unknown>>(
      'SELECT * FROM selection_stock_materialized WHERE symbol = ?',
      [sym],
    )) ?? {};
  const metrics = mapStockRowToDto({ ...catalog, ...rawMat });

  // 估值
  const val = (await executor.first<{
    symbol: string;
    trade_date: string | null;
    timestamp: number | null;
    pe_ttm: number | null;
    pe_mrq: number | null;
    pb_mrq: number | null;
    ps_ttm: number | null;
    pcf_ttm: number | null;
  }>('SELECT * FROM selection_stock_valuation WHERE symbol = ?', [sym])) ?? {
    symbol: sym,
    trade_date: null,
    timestamp: null,
    pe_ttm: null,
    pe_mrq: null,
    pb_mrq: null,
    ps_ttm: null,
    pcf_ttm: null,
  };

  // 财报原始三张表 (按年期、期末日、币种对齐，最多取 5 完整年)
  const stmts = await executor.all<{
    statement_type: string;
    fiscal_year: number;
    fiscal_period: string;
    period_end: string;
    report_date: string;
    currency: string;
    data_json: string;
  }>(
    'SELECT statement_type, fiscal_year, fiscal_period, period_end, report_date, currency, data_json FROM selection_stock_financial_statement WHERE symbol = ? ORDER BY fiscal_year DESC',
    [sym],
  );

  const byYearMap = new Map<
    number,
    {
      fiscalYear: number;
      periodEnd: string;
      reportDate: string;
      currency: string;
      income: Record<string, unknown> | null;
      balance: Record<string, unknown> | null;
      cashFlow: Record<string, unknown> | null;
    }
  >();

  for (const s of stmts) {
    let yearItem = byYearMap.get(s.fiscal_year);
    if (!yearItem) {
      yearItem = {
        fiscalYear: s.fiscal_year,
        periodEnd: s.period_end,
        reportDate: s.report_date,
        currency: s.currency,
        income: null,
        balance: null,
        cashFlow: null,
      };
      byYearMap.set(s.fiscal_year, yearItem);
    }
    // 必须期末日与币种完全对齐，才合并到该年度
    if (yearItem.periodEnd === s.period_end && yearItem.currency === s.currency) {
      try {
        const d = JSON.parse(s.data_json);
        if (s.statement_type === 'income') yearItem.income = d;
        if (s.statement_type === 'balance') yearItem.balance = d;
        if (s.statement_type === 'cash_flow') yearItem.cashFlow = d;
      } catch {
        // ignore
      }
    }
  }

  const statements = [...byYearMap.values()]
    .sort((a, b) => b.fiscalYear - a.fiscalYear)
    .slice(0, 5);

  // 能力指标
  const indicators = await executor.all<{
    report: string;
    abilities_json: string;
  }>('SELECT report, abilities_json FROM selection_stock_financial_indicators WHERE symbol = ?', [
    sym,
  ]);

  const indicatorsList = indicators.map((ind) => {
    let abilities = [];
    try {
      abilities = JSON.parse(ind.abilities_json);
    } catch {
      // ignore
    }
    return { report: ind.report, abilities };
  });

  return {
    ready: true,
    found: true,
    detail: {
      catalog: {
        symbol: catalog.symbol,
        ticker: catalog.ticker,
        name: catalog.name,
        exchange: catalog.exchange,
        industryThscode: catalog.industry_thscode,
        industryName: catalog.industry_name,
        isFinancial: catalog.is_financial === 1,
      },
      metrics,
      valuation: {
        tradeDate: val.trade_date,
        timestamp: val.timestamp,
        peTtm: parseFiniteNumber(val.pe_ttm) ?? null,
        peMrq: parseFiniteNumber(val.pe_mrq) ?? null,
        pbMrq: parseFiniteNumber(val.pb_mrq) ?? null,
        psTtm: parseFiniteNumber(val.ps_ttm) ?? null,
        pcfTtm: parseFiniteNumber(val.pcf_ttm) ?? null,
      },
      statements,
      indicators: indicatorsList,
    },
  };
}

export async function getSelectionStockBars(
  executor: QueryExec,
  symbol: string,
  options: { years?: 1 | 3 | 5; interval?: MarketBarInterval },
) {
  const years = options.years ?? 1;
  const interval = options.interval ?? 'day';

  if (!(await hasTable(executor, 'selection_daily_bar'))) {
    return {
      ready: false,
      found: false,
      adjust: 'forward',
      interval,
      years,
      coverage: {
        hasBars: false,
        totalBars: 0,
        startDate: null,
        endDate: null,
        isFullWindow: false,
      },
      bars: [],
    };
  }

  const catalog = await executor.first<{ symbol: string }>(
    'SELECT symbol FROM selection_stock_catalog WHERE symbol = ? OR ticker = ?',
    [symbol, symbol],
  );
  if (!catalog) {
    return {
      ready: true,
      found: false,
      adjust: 'forward',
      interval,
      years,
      coverage: {
        hasBars: false,
        totalBars: 0,
        startDate: null,
        endDate: null,
        isFullWindow: false,
      },
      bars: [],
    };
  }

  const sym = catalog.symbol;
  const rawBars = await executor.all<{
    trade_date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number | null;
    turnover: number | null;
    collected_at: number;
  }>(
    "SELECT trade_date, open, high, low, close, volume, turnover, collected_at FROM selection_daily_bar WHERE asset_type = 'stock' AND symbol = ? AND adjust = 'forward' ORDER BY trade_date ASC",
    [sym],
  );

  if (rawBars.length === 0) {
    return {
      ready: true,
      found: true,
      adjust: 'forward',
      interval,
      years,
      coverage: {
        hasBars: false,
        totalBars: 0,
        startDate: null,
        endDate: null,
        isFullWindow: false,
      },
      bars: [],
    };
  }

  const historyBars: HistoryBar[] = rawBars.map((b) => ({
    date: b.trade_date,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
    turnover: b.turnover,
    source: 'fuyao',
    collectedAt: b.collected_at,
  }));

  const lastDate = historyBars.at(-1)?.date ?? '';
  const firstDate = historyBars[0]?.date ?? '';
  const cutoff = yearsBefore(lastDate, years);

  // 严格按自然日判断是否满足完整窗口跨度 (允许 10 天边界容差)
  const windowFullTime = new Date(`${cutoff}T00:00:00Z`).getTime();
  const firstActualTime = new Date(`${firstDate}T00:00:00Z`).getTime();
  const isFullWindow = firstActualTime <= windowFullTime + 10 * 86400000;

  const filtered = historyBars.filter((b) => b.date >= cutoff);
  const aggregated = interval === 'day' ? filtered : aggregateMarketBars(filtered, interval);

  return {
    ready: true,
    found: true,
    adjust: 'forward',
    interval,
    years,
    coverage: {
      hasBars: true,
      totalBars: aggregated.length,
      startDate: aggregated[0]?.date ?? null,
      endDate: aggregated.at(-1)?.date ?? null,
      isFullWindow,
    },
    bars: aggregated,
  };
}
