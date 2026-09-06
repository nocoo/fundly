/**
 * 宏观与跨资产市场服务层（提供给 Hono API 与 Web 前端）
 */

import {
  aggregateMarketBars,
  type HistoryBar,
  type MarketBarInterval,
  type MarketYears,
  yearsBefore,
} from '../../../../src/metrics/market-bars';
import {
  computeEtfPremiumDiscount,
  computeRelativeStrength,
  computeRollingReturn,
} from '../../../../src/metrics/market-calc';
import { MAJOR_INDICES } from '../../../../src/utils/market-watchlist';
import type { QueryExec } from './executor.ts';

async function hasTable(executor: QueryExec, name: string): Promise<boolean> {
  return Boolean(
    await executor.first("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [
      name,
    ]),
  );
}

/** NAV remains visible with its own date; a stale NAV must never produce a premium. */
async function latestEtfNav(executor: QueryExec, id: string, fundCode: string | null) {
  const market = await executor.first<{
    value: number;
    observation_date: string;
    source: string;
    collected_at: number;
  }>(
    'SELECT value, observation_date, source, collected_at FROM market_series_observation WHERE instrument_id = ? AND value > 0 ORDER BY observation_date DESC LIMIT 1',
    [id],
  );
  const local =
    fundCode && (await hasTable(executor, 'fund_nav'))
      ? await executor.first<{ unit_nav: number; nav_date: string }>(
          'SELECT unit_nav, nav_date FROM fund_nav WHERE fund_code = ? AND unit_nav > 0 ORDER BY nav_date DESC LIMIT 1',
          [fundCode],
        )
      : null;
  if (market && (!local || market.observation_date >= local.nav_date)) {
    return {
      unitNav: market.value,
      navDate: market.observation_date,
      navSource: market.source,
      navCollectedAt: market.collected_at,
    };
  }
  return {
    unitNav: local?.unit_nav ?? null,
    navDate: local?.nav_date ?? null,
    navSource: local ? 'eastmoney' : null,
    navCollectedAt: null,
  };
}

export interface MarketOverviewData {
  ready: boolean;
  tradeDate: string;
  sourceStatus: Array<{
    sourceKey: string;
    lastSuccessAt: number | null;
    lastTradeDate: string | null;
    lastStatusCode: number | null;
    lastErrorMessage: string | null;
    collectionMode: string | null;
    batchId: string | null;
    startedAt: number | null;
    expectedItems: number | null;
    actualItems: number | null;
  }>;
  indices: Array<{
    id: string;
    symbol: string;
    name: string;
    price: number | null;
    changePct: number | null;
    prevClose: number | null;
    volume: number | null;
    turnover: number | null;
    tradeDate: string | null;
    source: string | null;
    collectedAt: number | null;
    isInferredDate: boolean;
  }>;
  breadth: {
    tradeDate: string;
    scope: string;
    upCount: number;
    downCount: number;
    flatCount: number;
    totalValidCount: number;
    totalCatalogCount: number;
    medianChangePct: number | null;
    validTurnoverSum: number | null;
    limitUpCount: number | null;
    limitDownCount: number | null;
    limitBreakCount: number | null;
    collectedAt: number;
    batchId: string | null;
  } | null;
  industries: Array<{
    id: string;
    symbol: string;
    name: string;
    price: number | null;
    changePct: number | null;
    turnover: number | null;
    tradeDate: string | null;
    source: string | null;
    collectedAt: number | null;
    isInferredDate: boolean;
    miniBars: Array<{ date: string; open: number; high: number; low: number; close: number }>;
    return20d: number | null;
    return60d: number | null;
    rs20d: number | null; // 相对沪深300超额 pp
    rs60d: number | null;
    return20StartDate: string | null;
    return60StartDate: string | null;
    returnEndDate: string | null;
    topConstituents: Array<{
      stockCode: string;
      stockName: string;
      weight: number | null;
      lastPrice: number | null;
      changePct: number | null;
      turnover: number | null;
    }>;
    relatedEtfs: Array<{
      id: string;
      symbol: string;
      name: string;
      price: number | null;
      changePct: number | null;
      linkedFundCode?: string | null;
      relationType: string;
      description?: string | null;
    }>;
  }>;
  etfs: Array<{
    id: string;
    symbol: string;
    name: string;
    price: number | null;
    changePct: number | null;
    turnover: number | null;
    volume: number | null;
    tradeDate: string | null;
    source: string | null;
    collectedAt: number | null;
    isInferredDate: boolean;
    linkedFundCode?: string | null;
    unitNav?: number | null;
    navDate?: string | null;
    navSource?: string | null;
    navCollectedAt?: number | null;
    premiumDiscountPct?: number | null;
  }>;
  macroCards: Array<{
    id: string;
    symbol: string;
    name: string;
    assetClass: string;
    value: number | null;
    unit: string | null;
    changePct: number | null;
    observationDate: string | null;
    source: string;
    displayType: 'kline' | 'single_value';
    prevClose?: number | null;
    settlementPrice?: number | null;
    prevSettlement?: number | null;
    openInterest?: number | null;
    changeBp?: number | null;
    changeBasis?: 'previous_close' | 'previous_settlement' | 'previous_observation';
    comparisonDate?: string | null;
    publishedAt?: string | null;
    frequency?: 'daily' | 'monthly';
    collectedAt?: number | null;
  }>;
}

export async function getMarketOverview(executor: QueryExec): Promise<MarketOverviewData> {
  const emptyResponse: MarketOverviewData = {
    ready: false,
    tradeDate: '',
    sourceStatus: [],
    indices: [],
    breadth: null,
    industries: [],
    etfs: [],
    macroCards: [],
  };

  const tableCheck = await executor.first<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='market_instrument'",
  );
  if (!tableCheck) return emptyResponse;

  // 1. 获取源状态
  const statusRows = await executor.all<{
    source_key: string;
    last_success_at: number | null;
    last_trade_date: string | null;
    last_status_code: number | null;
    last_error_message: string | null;
    collection_mode: string | null;
    batch_id: string | null;
    started_at: number | null;
    expected_items: number | null;
    actual_items: number | null;
  }>(`SELECT s.source_key, s.last_success_at, s.last_trade_date, s.last_status_code,
    s.last_error_message, s.batch_id, s.started_at,
    COALESCE(b.collection_mode, s.collection_mode) AS collection_mode,
    COALESCE(b.expected_items, s.expected_items) AS expected_items,
    COALESCE(b.actual_items, s.actual_items) AS actual_items
    FROM market_source_status s LEFT JOIN market_collection_batch b ON s.batch_id = b.batch_id`);

  // 2. 获取大盘主要指数（逐行保留 tradeDate, source, collectedAt, isInferredDate）
  const indexRows = await executor.all<{
    instrument_id: string;
    symbol: string;
    name: string;
    price: number | null;
    change_pct: number | null;
    prev_close: number | null;
    volume: number | null;
    turnover: number | null;
    trade_date: string | null;
    source: string | null;
    collected_at: number | null;
    is_inferred_date: number | null;
  }>(`
    SELECT i.instrument_id, i.symbol, i.name, q.price, q.change_pct, q.prev_close, q.volume, q.turnover, q.trade_date, q.source, q.collected_at, q.is_inferred_date
    FROM market_instrument i
    LEFT JOIN market_quote_latest q ON i.instrument_id = q.instrument_id
    WHERE i.asset_class = 'index' AND i.is_active = 1
    ORDER BY i.instrument_id
  `);

  const indexOrder = new Map<string, number>(MAJOR_INDICES.map(([symbol], i) => [symbol, i]));
  indexRows.sort((a, b) => (indexOrder.get(a.symbol) ?? 99) - (indexOrder.get(b.symbol) ?? 99));
  const latestTradeDate =
    indexRows
      .map((r) => r.trade_date)
      .filter((d): d is string => d !== null)
      .sort()
      .at(-1) ?? '';

  // 3. 市场广度
  const breadthRow = await executor.first<{
    trade_date: string;
    scope: string;
    up_count: number;
    down_count: number;
    flat_count: number;
    total_valid_count: number;
    total_catalog_count: number;
    median_change_pct: number | null;
    valid_turnover_sum: number | null;
    limit_up_count: number | null;
    limit_down_count: number | null;
    limit_break_count: number | null;
    collected_at: number;
    batch_id: string | null;
  }>('SELECT * FROM market_breadth ORDER BY trade_date DESC LIMIT 1');

  // 4. 行业观察池（明确为 7 个观察池）
  const industryRows = await executor.all<{
    instrument_id: string;
    symbol: string;
    name: string;
    price: number | null;
    change_pct: number | null;
    turnover: number | null;
    trade_date: string | null;
    source: string | null;
    collected_at: number | null;
    is_inferred_date: number | null;
  }>(`
    SELECT i.instrument_id, i.symbol, i.name, q.price, q.change_pct, q.turnover, q.trade_date, q.source, q.collected_at, q.is_inferred_date
    FROM market_instrument i
    LEFT JOIN market_quote_latest q ON i.instrument_id = q.instrument_id
    WHERE i.asset_class = 'industry' AND i.is_active = 1
    ORDER BY q.change_pct DESC
  `);

  // 获取沪深300基准日K计算行业超额
  const csi300Bars = await executor.all<{
    trade_date: string;
    close: number;
  }>(`
    SELECT trade_date, close FROM market_daily_bar
    WHERE instrument_id = 'index:000300.SH'
    ORDER BY trade_date DESC LIMIT 61
  `);

  const benchmark = csi300Bars.reverse().map((b) => ({ tradeDate: b.trade_date, close: b.close }));

  const industriesData = await Promise.all(
    industryRows.map(async (ind) => {
      const bars = await executor.all<{
        trade_date: string;
        open: number;
        high: number;
        low: number;
        close: number;
      }>(
        'SELECT trade_date, open, high, low, close FROM market_daily_bar WHERE instrument_id = ? ORDER BY trade_date DESC LIMIT 61',
        [ind.instrument_id],
      );

      const points = bars.reverse().map((b) => ({ tradeDate: b.trade_date, close: b.close }));
      const ret20 = computeRollingReturn(points, 20);
      const ret60 = computeRollingReturn(points, 60);
      const rs20 = computeRelativeStrength(points, benchmark, 20);
      const rs60 = computeRelativeStrength(points, benchmark, 60);

      // 读取成分股并关联最新快照（优先按成交额排序展示活跃成分）
      const constituents = await executor.all<{
        stock_code: string;
        stock_name: string;
        weight: number | null;
        last_price: number | null;
        change_pct: number | null;
        turnover: number | null;
      }>(
        `
        SELECT m.stock_code, m.stock_name, m.weight, q.price as last_price, q.change_pct, q.turnover
        FROM market_index_member m
        LEFT JOIN market_quote_latest q ON q.instrument_id = ('stock:' || m.stock_code)
        WHERE m.index_id = ?
        ORDER BY COALESCE(q.turnover, 0) DESC, m.rank_order ASC
        LIMIT 5
      `,
        [ind.instrument_id],
      );

      // 读取关联 ETF（含主题关联说明）
      const relatedEtfs = await executor.all<{
        instrument_id: string;
        symbol: string;
        name: string;
        price: number | null;
        change_pct: number | null;
        linked_fund_code: string | null;
        relation_type: string;
        description: string | null;
      }>(
        `
        SELECT target.instrument_id, target.symbol, target.name, q.price, q.change_pct, a.linked_fund_code, r.relation_type, r.description
        FROM market_instrument_relation r
        JOIN market_instrument target ON r.target_id = target.instrument_id
        LEFT JOIN market_quote_latest q ON target.instrument_id = q.instrument_id
        LEFT JOIN market_symbol_alias a ON target.instrument_id = a.instrument_id AND a.linked_fund_code IS NOT NULL AND a.source = 'fuyao'
        WHERE r.source_id = ?
      `,
        [ind.instrument_id],
      );

      return {
        id: ind.instrument_id,
        symbol: ind.symbol,
        name: ind.name,
        price: ind.price,
        changePct: ind.change_pct,
        turnover: ind.turnover,
        tradeDate: ind.trade_date,
        source: ind.source,
        collectedAt: ind.collected_at,
        isInferredDate: ind.is_inferred_date === 1,
        miniBars: bars.slice(-24).map((b) => ({
          date: b.trade_date,
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
        })),
        return20d: ret20,
        return60d: ret60,
        rs20d: rs20,
        rs60d: rs60,
        return20StartDate: ret20 === null ? null : (points.at(-21)?.tradeDate ?? null),
        return60StartDate: ret60 === null ? null : (points.at(-61)?.tradeDate ?? null),
        returnEndDate: points.at(-1)?.tradeDate ?? null,
        topConstituents: constituents.map((c) => ({
          stockCode: c.stock_code,
          stockName: c.stock_name,
          weight: c.weight,
          lastPrice: c.last_price,
          changePct: c.change_pct,
          turnover: c.turnover,
        })),
        relatedEtfs: relatedEtfs.map((e) => ({
          id: e.instrument_id,
          symbol: e.symbol,
          name: e.name,
          price: e.price,
          changePct: e.change_pct,
          linkedFundCode: e.linked_fund_code,
          relationType: e.relation_type,
          description: e.description,
        })),
      };
    }),
  );

  // 5. ETF 观察池（逐行保留 tradeDate, source, collectedAt）
  const etfRows = await executor.all<{
    instrument_id: string;
    symbol: string;
    name: string;
    price: number | null;
    change_pct: number | null;
    turnover: number | null;
    volume: number | null;
    trade_date: string | null;
    source: string | null;
    collected_at: number | null;
    is_inferred_date: number | null;
    linked_fund_code: string | null;
  }>(`
    SELECT i.instrument_id, i.symbol, i.name, q.price, q.change_pct, q.turnover, q.volume, q.trade_date, q.source, q.collected_at, q.is_inferred_date, a.linked_fund_code
    FROM market_instrument i
    LEFT JOIN market_quote_latest q ON i.instrument_id = q.instrument_id
    LEFT JOIN market_symbol_alias a ON i.instrument_id = a.instrument_id AND a.linked_fund_code IS NOT NULL AND a.source = 'fuyao'
    WHERE i.asset_class = 'etf' AND i.is_active = 1
    ORDER BY i.instrument_id ASC
  `);

  const etfsData = await Promise.all(
    etfRows.map(async (etf) => {
      const nav = await latestEtfNav(executor, etf.instrument_id, etf.linked_fund_code);
      const premiumDiscountPct = computeEtfPremiumDiscount(
        etf.price,
        etf.trade_date,
        nav.unitNav,
        nav.navDate,
      );

      return {
        id: etf.instrument_id,
        symbol: etf.symbol,
        name: etf.name,
        price: etf.price,
        changePct: etf.change_pct,
        turnover: etf.turnover,
        volume: etf.volume,
        tradeDate: etf.trade_date,
        source: etf.source,
        collectedAt: etf.collected_at,
        isInferredDate: etf.is_inferred_date === 1,
        linkedFundCode: etf.linked_fund_code,
        ...nav,
        premiumDiscountPct,
      };
    }),
  );

  // Each reference series keeps its own observation date and change basis.
  const macroRows = await executor.all<{
    instrument_id: string;
    symbol: string;
    name: string;
    asset_class: string;
    unit: string | null;
    trading_calendar: string;
    q_price: number | null;
    q_change_pct: number | null;
    q_prev_close: number | null;
    q_settlement: number | null;
    q_prev_settlement: number | null;
    q_open_interest: number | null;
    q_trade_date: string | null;
    q_source: string | null;
    q_collected_at: number | null;
    obs_val: number | null;
    obs_date: string | null;
    obs_source: string | null;
    obs_collected_at: number | null;
    obs_change_bp: number | null;
    published_at: string | null;
    previous_value: number | null;
    previous_date: string | null;
  }>(`
    WITH observations AS (
      SELECT *,
        LAG(value) OVER (PARTITION BY instrument_id ORDER BY observation_date) AS previous_value,
        LAG(observation_date) OVER (PARTITION BY instrument_id ORDER BY observation_date) AS previous_date,
        ROW_NUMBER() OVER (PARTITION BY instrument_id ORDER BY observation_date DESC) AS latest_rank
      FROM market_series_observation
    )
    SELECT i.instrument_id, i.symbol, i.name, i.asset_class, i.unit, i.trading_calendar,
      q.price AS q_price, q.change_pct AS q_change_pct, q.prev_close AS q_prev_close,
      q.settlement_price AS q_settlement, q.prev_settlement AS q_prev_settlement,
      q.open_interest AS q_open_interest, q.trade_date AS q_trade_date,
      q.source AS q_source, q.collected_at AS q_collected_at,
      o.value AS obs_val, o.observation_date AS obs_date, o.source AS obs_source,
      o.collected_at AS obs_collected_at, o.change_bp AS obs_change_bp,
      o.published_at, o.previous_value, o.previous_date
    FROM market_instrument i
    LEFT JOIN market_quote_latest q ON i.instrument_id = q.instrument_id
    LEFT JOIN observations o ON i.instrument_id = o.instrument_id AND o.latest_rank = 1
    WHERE i.asset_class IN ('commodity', 'fx', 'rate', 'risk', 'global_index') AND i.is_active = 1
    ORDER BY i.asset_class, i.symbol
  `);

  const macroCards: MarketOverviewData['macroCards'] = macroRows.map((m) => {
    const isQuote = m.q_price !== null;
    const isKline =
      m.instrument_id.startsWith('risk:CBOE') || m.instrument_id.startsWith('comm:SHFE');
    const difference =
      m.obs_val !== null && m.previous_value !== null ? m.obs_val - m.previous_value : null;
    const referenceChange =
      difference !== null && m.previous_value !== null && m.previous_value !== 0
        ? (difference / m.previous_value) * 100
        : null;
    return {
      id: m.instrument_id,
      symbol: m.symbol,
      name: m.name,
      assetClass: m.asset_class,
      value: isQuote ? m.q_price : m.obs_val,
      unit: m.unit,
      changePct: isQuote ? m.q_change_pct : m.asset_class === 'rate' ? null : referenceChange,
      changeBp:
        m.asset_class === 'rate'
          ? (m.obs_change_bp ??
            (difference === null ? null : difference * (m.unit === '%' ? 100 : 1)))
          : null,
      observationDate: isQuote ? m.q_trade_date : m.obs_date,
      source: isQuote ? (m.q_source ?? '') : (m.obs_source ?? ''),
      displayType: isKline ? 'kline' : 'single_value',
      prevClose: m.q_prev_close,
      settlementPrice: m.q_settlement,
      prevSettlement: m.q_prev_settlement,
      openInterest: m.q_open_interest,
      changeBasis: isQuote
        ? m.q_prev_settlement !== null
          ? 'previous_settlement'
          : 'previous_close'
        : 'previous_observation',
      comparisonDate: isQuote ? null : m.previous_date,
      publishedAt: isQuote ? null : m.published_at,
      frequency: m.trading_calendar === 'MONTHLY_REFERENCE' ? 'monthly' : 'daily',
      collectedAt: isQuote ? m.q_collected_at : m.obs_collected_at,
    };
  });

  return {
    ready: indexRows.some((r) => r.price !== null) || macroCards.some((m) => m.value !== null),
    tradeDate: breadthRow?.trade_date ?? latestTradeDate,
    sourceStatus: statusRows.map((s) => ({
      sourceKey: s.source_key,
      lastSuccessAt: s.last_success_at,
      lastTradeDate: s.last_trade_date,
      lastStatusCode: s.last_status_code,
      lastErrorMessage: s.last_error_message,
      collectionMode: s.collection_mode,
      batchId: s.batch_id,
      startedAt: s.started_at,
      expectedItems: s.expected_items,
      actualItems: s.actual_items,
    })),
    indices: indexRows.map((idx) => ({
      id: idx.instrument_id,
      symbol: idx.symbol,
      name: idx.name,
      price: idx.price,
      changePct: idx.change_pct,
      prevClose: idx.prev_close,
      volume: idx.volume,
      turnover: idx.turnover,
      tradeDate: idx.trade_date,
      source: idx.source,
      collectedAt: idx.collected_at,
      isInferredDate: idx.is_inferred_date === 1,
    })),
    breadth: breadthRow
      ? {
          tradeDate: breadthRow.trade_date,
          scope: breadthRow.scope,
          upCount: breadthRow.up_count,
          downCount: breadthRow.down_count,
          flatCount: breadthRow.flat_count,
          totalValidCount: breadthRow.total_valid_count,
          totalCatalogCount: breadthRow.total_catalog_count,
          medianChangePct: breadthRow.median_change_pct,
          validTurnoverSum: breadthRow.valid_turnover_sum,
          limitUpCount: breadthRow.limit_up_count,
          limitDownCount: breadthRow.limit_down_count,
          limitBreakCount: breadthRow.limit_break_count,
          collectedAt: breadthRow.collected_at,
          batchId: breadthRow.batch_id,
        }
      : null,
    industries: industriesData,
    etfs: etfsData,
    macroCards,
  };
}

export interface MarketBarsOptions {
  years: MarketYears;
  interval: MarketBarInterval;
}

export interface MarketBarsRange {
  years: MarketYears;
  interval: MarketBarInterval;
  requestedFrom: string | null;
  requestedTo: string | null;
  availableFrom: string | null;
  availableTo: string | null;
  displayedFrom: string | null;
  displayedTo: string | null;
  dailyCount: number;
  isPartial: boolean;
  changePct: number | null;
}

export async function getMarketBars(
  executor: QueryExec,
  instrumentId: string,
  options: number | MarketBarsOptions = 60,
): Promise<{
  instrument: {
    id: string;
    symbol: string;
    name: string;
    assetClass: string;
    unit: string;
    volumeUnit: string | null;
  } | null;
  bars: HistoryBar[];
  range: MarketBarsRange | null;
}> {
  const rawLimit = typeof options === 'number' ? options : 60;
  const limit = Math.max(1, Math.min(Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 60, 1000));
  const window = typeof options === 'object' ? options : null;

  const tableCheck = await executor.first<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='market_instrument'",
  );
  if (!tableCheck) return { instrument: null, bars: [], range: null };

  const inst = await executor.first<{
    instrument_id: string;
    symbol: string;
    name: string;
    asset_class: string;
    unit: string;
  }>(
    'SELECT instrument_id, symbol, name, asset_class, unit FROM market_instrument WHERE instrument_id = ?',
    [instrumentId],
  );
  if (!inst) return { instrument: null, bars: [], range: null };

  const coverage = window
    ? await executor.first<{ earliest: string | null; latest: string | null }>(
        'SELECT MIN(trade_date) AS earliest, MAX(trade_date) AS latest FROM market_daily_bar WHERE instrument_id = ?',
        [instrumentId],
      )
    : null;
  const from = window && coverage?.latest ? yearsBefore(coverage.latest, window.years) : null;
  const rows = await executor.all<{
    trade_date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number | null;
    turnover: number | null;
    source: string;
    collected_at: number | null;
  }>(
    `SELECT trade_date, open, high, low, close, volume, turnover, source, collected_at
    FROM market_daily_bar WHERE instrument_id = ?
    ${window ? 'AND trade_date >= ? ORDER BY trade_date ASC' : 'ORDER BY trade_date DESC LIMIT ?'}`,
    window ? [instrumentId, from ?? '9999-12-31'] : [instrumentId, limit],
  );
  const dailyBars: HistoryBar[] = (window ? rows : rows.reverse()).map((r) => ({
    date: r.trade_date,
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: r.volume,
    turnover: r.turnover,
    source: r.source,
    collectedAt: r.collected_at,
  }));
  return {
    instrument: {
      id: inst.instrument_id,
      symbol: inst.symbol,
      name: inst.name,
      assetClass: inst.asset_class,
      unit: inst.unit,
      volumeUnit:
        inst.asset_class === 'etf'
          ? '份'
          : inst.instrument_id.startsWith('comm:SHFE')
            ? '手'
            : ['index', 'industry', 'stock'].includes(inst.asset_class)
              ? '股'
              : null,
    },
    bars: window ? aggregateMarketBars(dailyBars, window.interval) : dailyBars,
    range: window
      ? {
          years: window.years,
          interval: window.interval,
          requestedFrom: from,
          requestedTo: coverage?.latest ?? null,
          availableFrom: coverage?.earliest ?? null,
          availableTo: coverage?.latest ?? null,
          displayedFrom: dailyBars[0]?.date ?? null,
          displayedTo: dailyBars.at(-1)?.date ?? null,
          dailyCount: dailyBars.length,
          changePct:
            dailyBars[0]?.close && dailyBars.at(-1)
              ? ((dailyBars.at(-1)?.close ?? 0) / dailyBars[0].close - 1) * 100
              : null,
          // Holiday tolerance only describes the beginning of the available history.
          isPartial:
            !from ||
            !coverage?.earliest ||
            Date.parse(coverage.earliest) - Date.parse(from) > 10 * 86400000,
        }
      : null,
  };
}

export async function getMarketObservations(
  executor: QueryExec,
  instrumentId: string,
  rawLimit = 60,
): Promise<{
  instrument: {
    id: string;
    symbol: string;
    name: string;
    assetClass: string;
    unit: string;
    volumeUnit: string | null;
  } | null;
  observations: Array<{
    date: string;
    value: number;
    unit: string | null;
    publishedAt: string | null;
    source: string;
    collectedAt: number;
    changeBp: number | null;
  }>;
}> {
  const limit = Math.max(1, Math.min(Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 60, 1000));

  const tableCheck = await executor.first<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='market_instrument'",
  );
  if (!tableCheck) return { instrument: null, observations: [] };

  const inst = await executor.first<{
    instrument_id: string;
    symbol: string;
    name: string;
    asset_class: string;
    unit: string;
  }>(
    'SELECT instrument_id, symbol, name, asset_class, unit FROM market_instrument WHERE instrument_id = ?',
    [instrumentId],
  );

  if (!inst) return { instrument: null, observations: [] };

  const rows = await executor.all<{
    observation_date: string;
    value: number;
    unit: string | null;
    published_at: string | null;
    source: string;
    collected_at: number;
    change_bp: number | null;
  }>(
    `
    SELECT observation_date, value, unit, published_at, source, collected_at, change_bp
    FROM market_series_observation
    WHERE instrument_id = ?
    ORDER BY observation_date DESC
    LIMIT ?
  `,
    [instrumentId, limit],
  );

  return {
    instrument: {
      id: inst.instrument_id,
      symbol: inst.symbol,
      name: inst.name,
      assetClass: inst.asset_class,
      unit: inst.unit,
      volumeUnit:
        inst.asset_class === 'etf'
          ? '份'
          : inst.instrument_id.startsWith('comm:SHFE')
            ? '手'
            : ['index', 'industry', 'stock'].includes(inst.asset_class)
              ? '股'
              : null,
    },
    observations: rows.reverse().map((r) => ({
      date: r.observation_date,
      value: r.value,
      unit: r.unit,
      publishedAt: r.published_at,
      source: r.source,
      collectedAt: r.collected_at,
      changeBp: r.change_bp,
    })),
  };
}

export async function getIndustryConstituents(
  executor: QueryExec,
  industryId: string,
): Promise<{
  industry: { id: string; name: string; symbol: string } | null;
  members: Array<{
    stockCode: string;
    stockName: string;
    weight: number | null;
    rankOrder: number;
    lastPrice: number | null;
    changePct: number | null;
    turnover: number | null;
  }>;
}> {
  if (!(await hasTable(executor, 'market_instrument'))) return { industry: null, members: [] };
  const ind = await executor.first<{ instrument_id: string; symbol: string; name: string }>(
    "SELECT instrument_id, symbol, name FROM market_instrument WHERE instrument_id = ? AND asset_class = 'industry'",
    [industryId],
  );

  if (!ind) return { industry: null, members: [] };

  const rows = await executor.all<{
    stock_code: string;
    stock_name: string;
    weight: number | null;
    rank_order: number;
    last_price: number | null;
    change_pct: number | null;
    turnover: number | null;
  }>(
    `
    SELECT m.stock_code, m.stock_name, m.weight, m.rank_order, q.price as last_price, q.change_pct, q.turnover
    FROM market_index_member m
    LEFT JOIN market_quote_latest q ON q.instrument_id = ('stock:' || m.stock_code)
    WHERE m.index_id = ?
    ORDER BY m.rank_order ASC
  `,
    [industryId],
  );

  return {
    industry: { id: ind.instrument_id, name: ind.name, symbol: ind.symbol },
    members: rows.map((r) => ({
      stockCode: r.stock_code,
      stockName: r.stock_name,
      weight: r.weight,
      rankOrder: r.rank_order,
      lastPrice: r.last_price,
      changePct: r.change_pct,
      turnover: r.turnover,
    })),
  };
}

export interface MarketEtfDetail {
  instrument: { id: string; symbol: string; name: string; linkedFundCode: string | null } | null;
  quote: {
    price: number | null;
    changePct: number | null;
    turnover: number | null;
    volume: number | null;
    tradeDate: string | null;
    source: string | null;
    collectedAt: number | null;
    unitNav: number | null;
    navDate: string | null;
    navSource: string | null;
    navCollectedAt: number | null;
    premiumDiscountPct: number | null;
  } | null;
  profile: {
    establishedDate: string | null;
    fundScale: number | null;
    fundScaleUnit: string;
    trackingIndex: string | null;
    fundManager: string | null;
    managementCompany: string | null;
    publishedAt: string | null;
    source: string;
    collectedAt: number;
  } | null;
  holdings: Array<{
    stockCode: string;
    stockName: string;
    assetType: string;
    holdPct: number | null;
    holdShares: number | null;
    holdValueWan: number | null;
    reportDate: string | null;
    publishedAt: string | null;
    source: string;
    collectedAt: number;
  }>;
}

export async function getEtfDetail(executor: QueryExec, etfId: string): Promise<MarketEtfDetail> {
  const empty: MarketEtfDetail = { instrument: null, quote: null, profile: null, holdings: [] };
  if (!(await hasTable(executor, 'market_instrument'))) return empty;
  const inst = await executor.first<{
    instrument_id: string;
    symbol: string;
    name: string;
    linked_fund_code: string | null;
  }>(
    `
    SELECT i.instrument_id, i.symbol, i.name, a.linked_fund_code
    FROM market_instrument i
    LEFT JOIN market_symbol_alias a ON i.instrument_id = a.instrument_id
      AND a.linked_fund_code IS NOT NULL AND a.source = 'fuyao'
    WHERE i.instrument_id = ? AND i.asset_class = 'etf'
  `,
    [etfId],
  );
  if (!inst) return empty;

  const q = await executor.first<{
    price: number | null;
    change_pct: number | null;
    turnover: number | null;
    volume: number | null;
    trade_date: string | null;
    source: string | null;
    collected_at: number | null;
  }>(
    'SELECT price, change_pct, turnover, volume, trade_date, source, collected_at FROM market_quote_latest WHERE instrument_id = ?',
    [etfId],
  );
  const nav = await latestEtfNav(executor, etfId, inst.linked_fund_code);
  const profile = await executor.first<{
    established_date: string | null;
    fund_scale: number | null;
    fund_manager: string | null;
    management_company: string | null;
    source: string;
    collected_at: number;
  }>(
    'SELECT established_date, fund_scale, fund_manager, management_company, source, collected_at FROM market_etf_profile WHERE instrument_id = ?',
    [etfId],
  );

  type HoldingRow = {
    stock_code: string;
    stock_name: string;
    asset_type: string;
    hold_pct: number | null;
    hold_shares: number | null;
    hold_value_wan: number | null;
    report_date: string;
    published_at: string | null;
    source: string;
    collected_at: number;
  };
  let holdings = await executor.all<HoldingRow>(
    `
    SELECT stock_code, stock_name, asset_type, hold_pct, hold_shares, hold_value_wan,
      report_date, published_at, source, collected_at
    FROM market_etf_holding
    WHERE instrument_id = ? AND report_date = (SELECT MAX(report_date) FROM market_etf_holding WHERE instrument_id = ?)
    ORDER BY hold_pct DESC, stock_code
  `,
    [etfId, etfId],
  );
  if (!holdings.length && inst.linked_fund_code && (await hasTable(executor, 'fund_portfolio'))) {
    holdings = await executor.all<HoldingRow>(
      `
      SELECT stock_code, stock_name, 'stock' AS asset_type, hold_pct, hold_shares, hold_value_wan,
        report_date, NULL AS published_at, 'eastmoney' AS source, updated_at AS collected_at
      FROM fund_portfolio
      WHERE fund_code = ? AND report_date = (SELECT MAX(report_date) FROM fund_portfolio WHERE fund_code = ?)
      ORDER BY hold_pct DESC LIMIT 10
    `,
      [inst.linked_fund_code, inst.linked_fund_code],
    );
  }
  return {
    instrument: {
      id: inst.instrument_id,
      symbol: inst.symbol,
      name: inst.name,
      linkedFundCode: inst.linked_fund_code,
    },
    quote: q
      ? {
          price: q.price,
          changePct: q.change_pct,
          turnover: q.turnover,
          volume: q.volume,
          tradeDate: q.trade_date,
          source: q.source,
          collectedAt: q.collected_at,
          ...nav,
          premiumDiscountPct: computeEtfPremiumDiscount(
            q.price,
            q.trade_date,
            nav.unitNav,
            nav.navDate,
          ),
        }
      : null,
    profile: profile
      ? {
          establishedDate: profile.established_date,
          fundScale: profile.fund_scale,
          fundScaleUnit: '元',
          fundManager: profile.fund_manager,
          managementCompany: profile.management_company,
          trackingIndex: null,
          publishedAt: null,
          source: profile.source,
          collectedAt: profile.collected_at,
        }
      : null,
    holdings: holdings.map((h) => ({
      stockCode: h.stock_code,
      stockName: h.stock_name,
      assetType: h.asset_type,
      holdPct: h.hold_pct,
      holdShares: h.hold_shares,
      holdValueWan: h.hold_value_wan,
      reportDate: h.report_date,
      publishedAt: h.published_at,
      source: h.source,
      collectedAt: h.collected_at,
    })),
  };
}
