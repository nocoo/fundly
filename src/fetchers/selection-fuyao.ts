/**
 * 扶摇 API 增强适配器 (通用 envelope, 股票财务, 估值, ETF NAV)
 * 校验约束：
 * 1. 严格核验响应中的 thscode、report、adjust、interval，杜绝把错误代码或复权口径混入
 * 2. ETF Profile 费用字段：rate_type 枚举支持 management/custody 与中文，standard_rate 支持 "0.15%" 百分数字符串与数字
 * 3. K 线几何严格校验：low <= min(open, close) <= max(open, close) <= high，且 OHLC 严格正且有限，按日期严格升序去重
 * 4. 持仓持股代码优先保留带交易所后缀的完整 thscode（如 600519.SH），防止降级成无后缀 ticker
 */

import { marketNumber } from '../utils/market-validation.ts';
import type {
  SelectionDailyBar,
  SelectionEtfFinancialIndicator,
  SelectionEtfHolding,
  SelectionEtfNavPoint,
  SelectionEtfProfile,
  SelectionStockFinancialIndicators,
  SelectionStockFinancialStatement,
  SelectionStockValuation,
} from '../utils/selection-types.ts';
import { beijingMsToDateString } from './fuyao.ts';
import type { MarketReader } from './market-reader.ts';
import { MarketReadError } from './market-reader.ts';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 将可能带 % 的费率字符串或数值安全转换为数字百分比（如 "0.15%" -> 0.15）
 */
export function parseFeePercent(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : null;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return null;
    if (trimmed.endsWith('%')) {
      const num = Number(trimmed.slice(0, -1).trim());
      return Number.isFinite(num) ? num : null;
    }
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

/**
 * 股票能力评估指标通用 envelope 适配器
 * 接口返回结构：{ code: 0, message: "success", data: { thscode, report, abilities: [ { ability, indicators: [ { index_id, value } ] } ] } }
 * 严格校验：响应中的 thscode 与 report 必须与请求完全一致！
 */
export async function fetchStockIndicators(
  reader: MarketReader,
  symbol: string,
  report: string,
): Promise<SelectionStockFinancialIndicators | null> {
  const url = new URL('/api/a-share/financials/indicators', 'https://fuyao.aicubes.cn');
  url.searchParams.set('thscode', symbol);
  url.searchParams.set('report', report);

  const res = await reader.text(url.href, undefined, true);
  let payload: unknown;
  try {
    payload = JSON.parse(res.text);
  } catch {
    throw new MarketReadError(`Invalid JSON in indicators for ${symbol}`);
  }

  if (!record(payload)) throw new MarketReadError(`Invalid response for ${symbol}`);
  if (payload.code === 3002) return null; // 扶摇无数据约定
  if (payload.code !== 0) {
    throw new MarketReadError(
      `Fuyao indicators error ${String(payload.code)}: ${String(payload.message)}`,
    );
  }

  const data = payload.data;
  if (!record(data) || !Array.isArray(data.abilities)) {
    throw new MarketReadError(`Invalid abilities schema for ${symbol}`);
  }

  // 严格核验响应中的 thscode 与 report
  if (typeof data.thscode === 'string' && data.thscode !== symbol) {
    throw new MarketReadError(
      `Mismatched thscode in indicators: expected ${symbol}, got ${data.thscode}`,
    );
  }
  if (typeof data.report === 'string' && data.report !== report) {
    throw new MarketReadError(
      `Mismatched report in indicators: expected ${report}, got ${data.report}`,
    );
  }

  const abilities: SelectionStockFinancialIndicators['abilities'] = [];
  for (const ab of data.abilities) {
    if (!record(ab) || typeof ab.ability !== 'string' || !Array.isArray(ab.indicators)) continue;
    const inds: Array<{ index_id: string; value: string | number | null }> = [];
    for (const ind of ab.indicators) {
      if (!record(ind) || typeof ind.index_id !== 'string') continue;
      inds.push({
        index_id: ind.index_id,
        value: ind.value !== undefined ? (ind.value as string | number | null) : null,
      });
    }
    abilities.push({
      ability: ab.ability,
      indicators: inds,
    });
  }

  return {
    symbol,
    report,
    abilities,
    collectedAt: res.collectedAt,
  };
}

/**
 * 股票批量估值快照解析
 */
export async function fetchStockValuationsBatch(
  reader: MarketReader,
  symbols: string[],
): Promise<SelectionStockValuation[]> {
  if (symbols.length === 0) return [];
  if (symbols.length > 100) {
    throw new Error('Maximum batch size for valuations is 100');
  }

  const res = await reader.fuyao('/api/a-share/valuations/snapshot', {
    thscodes: symbols.join(','),
  });

  const list: SelectionStockValuation[] = [];
  for (const item of res.item) {
    const symbol = typeof item.thscode === 'string' ? item.thscode : '';
    if (!symbol) continue;
    list.push({
      symbol,
      tradeDate: typeof item.trade_date === 'string' ? item.trade_date : null,
      timestamp: res.timestamp ?? null,
      peTtm: marketNumber(item.pe_ttm),
      peMrq: marketNumber(item.pe_mrq),
      pbMrq: marketNumber(item.pb_mrq),
      psTtm: marketNumber(item.ps_ttm),
      pcfTtm: marketNumber(item.pcf_ttm),
      collectedAt: res.collectedAt,
    });
  }
  return list;
}

/**
 * 股票财报原始三张表解析 (单只股票，单张表，period=annual, limit=5)
 * 严格核验 item 中的 thscode 与请求 symbol 必须一致
 */
export async function fetchStockStatements(
  reader: MarketReader,
  symbol: string,
  statementType: 'income' | 'balance' | 'cash_flow',
  limit = 5,
): Promise<SelectionStockFinancialStatement[]> {
  const path =
    statementType === 'income'
      ? '/api/a-share/financials/income-statements'
      : statementType === 'balance'
        ? '/api/a-share/financials/balance-sheets'
        : '/api/a-share/financials/cash-flow-statements';

  const res = await reader.fuyao(path, {
    thscode: symbol,
    period: 'annual',
    limit,
  });

  if (res.thscode && res.thscode !== symbol) {
    throw new MarketReadError(
      `Mismatched top-level thscode: expected ${symbol}, got ${res.thscode}`,
    );
  }

  const statements: SelectionStockFinancialStatement[] = [];
  for (const item of res.item) {
    if (typeof item.thscode === 'string' && item.thscode !== symbol) {
      throw new MarketReadError(
        `Mismatched thscode in item: expected ${symbol}, got ${item.thscode}`,
      );
    }

    const fiscalYear = Number(item.fiscal_year);
    if (!Number.isInteger(fiscalYear)) continue;

    const periodEndMs = marketNumber(item.period_end_ms);
    const reportDateMs = marketNumber(item.report_date_ms);
    const periodEnd = periodEndMs ? beijingMsToDateString(periodEndMs) : '';
    const reportDate = reportDateMs ? beijingMsToDateString(reportDateMs) : '';

    const cleanData: Record<string, number | string | null> = {};
    for (const [k, v] of Object.entries(item)) {
      if (typeof v === 'number' || typeof v === 'string' || v === null) {
        cleanData[k] = v;
      }
    }

    statements.push({
      symbol,
      statementType,
      fiscalYear,
      fiscalPeriod: typeof item.fiscal_period === 'string' ? item.fiscal_period : 'FY',
      periodEnd,
      reportDate,
      currency: typeof item.currency === 'string' ? item.currency : 'CNY',
      data: cleanData,
      collectedAt: res.collectedAt,
    });
  }

  return statements;
}

/**
 * 校验并规范化 K 线几何：
 * 1. open > 0, high > 0, low > 0, close > 0 且有限
 * 2. low <= min(open, close) 且 max(open, close) <= high
 * 3. volume 与 turnover 非负且有限 (若提供)
 */
export function validateAndCleanDailyBars(bars: readonly SelectionDailyBar[]): SelectionDailyBar[] {
  const byDate = new Map<string, SelectionDailyBar>();
  for (const b of bars) {
    if (!b.tradeDate) continue;
    if (
      !Number.isFinite(b.open) ||
      !Number.isFinite(b.high) ||
      !Number.isFinite(b.low) ||
      !Number.isFinite(b.close) ||
      b.open <= 0 ||
      b.high <= 0 ||
      b.low <= 0 ||
      b.close <= 0
    ) {
      continue;
    }
    const minOc = Math.min(b.open, b.close);
    const maxOc = Math.max(b.open, b.close);
    // 允许浮点 1e-6 极微公差
    if (b.low > minOc + 1e-6 || b.high < maxOc - 1e-6) {
      continue;
    }
    byDate.set(b.tradeDate, b);
  }
  return [...byDate.values()].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
}

/**
 * 股票五年日 K 线 (前复权 adjust=forward)
 * 严格核验：响应中的 thscode (若有)、adjust 必须是 forward，不允许将 none 错存！
 */
export async function fetchStockForwardBars(
  reader: MarketReader,
  symbol: string,
  startDateMs: number,
  endDateMs: number,
): Promise<SelectionDailyBar[]> {
  const res = await reader.fuyao('/api/a-share/prices/historical', {
    thscode: symbol,
    interval: '1d',
    adjust: 'forward',
    start: startDateMs,
    end: endDateMs,
  });

  if (res.thscode && res.thscode !== symbol) {
    throw new MarketReadError(`Mismatched thscode in bars: expected ${symbol}, got ${res.thscode}`);
  }
  if (res.adjust && res.adjust !== 'forward') {
    throw new MarketReadError(`Mismatched adjust in bars: expected forward, got ${res.adjust}`);
  }

  const rawBars: SelectionDailyBar[] = [];
  for (const item of res.item) {
    if (typeof item.thscode === 'string' && item.thscode !== symbol) {
      throw new MarketReadError(
        `Mismatched thscode in bar item: expected ${symbol}, got ${item.thscode}`,
      );
    }
    const dateMs = marketNumber(item.date_ms);
    if (!dateMs) continue;
    const tradeDate = beijingMsToDateString(dateMs);
    if (!tradeDate) continue;

    const open = marketNumber(item.open_price);
    const high = marketNumber(item.high_price);
    const low = marketNumber(item.low_price);
    const close = marketNumber(item.close_price);

    if (open === null || high === null || low === null || close === null) continue;

    rawBars.push({
      assetType: 'stock',
      symbol,
      adjust: 'forward',
      tradeDate,
      open,
      high,
      low,
      close,
      volume: marketNumber(item.volume),
      turnover: marketNumber(item.turnover),
      collectedAt: res.collectedAt,
    });
  }

  return validateAndCleanDailyBars(rawBars);
}

/**
 * ETF 五年日 K 线 (真实不复权 adjust=none)
 */
export async function fetchEtfDailyBars(
  reader: MarketReader,
  symbol: string,
  startDateMs: number,
  endDateMs: number,
): Promise<SelectionDailyBar[]> {
  const res = await reader.fuyao('/api/fund/market/historical', {
    thscode: symbol,
    interval: '1d',
    start: startDateMs,
    end: endDateMs,
  });

  if (res.thscode && res.thscode !== symbol) {
    throw new MarketReadError(`Mismatched thscode in bars: expected ${symbol}, got ${res.thscode}`);
  }

  const rawBars: SelectionDailyBar[] = [];
  for (const item of res.item) {
    if (typeof item.thscode === 'string' && item.thscode !== symbol) {
      throw new MarketReadError(
        `Mismatched thscode in bar item: expected ${symbol}, got ${item.thscode}`,
      );
    }
    const dateMs = marketNumber(item.date_ms);
    if (!dateMs) continue;
    const tradeDate = beijingMsToDateString(dateMs);
    if (!tradeDate) continue;

    const open = marketNumber(item.open_price);
    const high = marketNumber(item.high_price);
    const low = marketNumber(item.low_price);
    const close = marketNumber(item.close_price);

    if (open === null || high === null || low === null || close === null) continue;

    rawBars.push({
      assetType: 'etf',
      symbol,
      adjust: 'none',
      tradeDate,
      open,
      high,
      low,
      close,
      volume: marketNumber(item.volume),
      turnover: marketNumber(item.turnover),
      collectedAt: res.collectedAt,
    });
  }

  return validateAndCleanDailyBars(rawBars);
}

/**
 * ETF 五年净值 (单位净值 unit_nav 与 复权净值 adj_nav)
 */
export async function fetchEtfNavPoints(
  reader: MarketReader,
  symbol: string,
): Promise<SelectionEtfNavPoint[]> {
  const res = await reader.fuyao('/api/fund/performance/nav', {
    fund_type: 'exchange',
    thscode: symbol,
    range: 'fyear',
    nav_type: 'unit,adj',
  });

  if (res.thscode && res.thscode !== symbol) {
    throw new MarketReadError(`Mismatched thscode in nav: expected ${symbol}, got ${res.thscode}`);
  }

  const byDate = new Map<string, SelectionEtfNavPoint>();
  for (const item of res.item) {
    const rawDate = item.nav_date;
    let navDate = '';
    if (typeof rawDate === 'number') {
      navDate = beijingMsToDateString(rawDate);
    } else if (typeof rawDate === 'string') {
      navDate = rawDate;
    }
    if (!navDate) continue;

    const unitNav = marketNumber(item.unit_nav);
    if (unitNav === null || unitNav <= 0) continue;

    byDate.set(navDate, {
      symbol,
      navDate,
      unitNav,
      adjNav: marketNumber(item.adj_nav),
      collectedAt: res.collectedAt,
    });
  }

  return [...byDate.values()].sort((a, b) => a.navDate.localeCompare(b.navDate));
}

/**
 * ETF 资料 Profile 与费率
 * 适配支持 rate_info 中的 rate_type 枚举:
 * - 'management' 或包含 '管理费'
 * - 'custody' 或包含 '托管费'
 * standard_rate 支持 "0.15%" 格式与数值
 */
export async function fetchEtfProfile(
  reader: MarketReader,
  symbol: string,
): Promise<SelectionEtfProfile | null> {
  const res = await reader.fuyao('/api/fund/profile/detail', {
    fund_type: 'exchange',
    thscode: symbol,
  });

  const first = res.item[0];
  if (!first) return null;

  if (typeof first.thscode === 'string' && first.thscode !== symbol) {
    throw new MarketReadError(
      `Mismatched thscode in profile: expected ${symbol}, got ${first.thscode}`,
    );
  }

  const estabDateMs = marketNumber(first.estab_date);
  const estabDate = estabDateMs ? beijingMsToDateString(estabDateMs) : null;

  let mgmtFeePct: number | null = null;
  let custodyFeePct: number | null = null;

  if (Array.isArray(first.rate_info)) {
    for (const r of first.rate_info) {
      if (!record(r)) continue;
      const t = String(r.rate_type ?? '').toLowerCase();
      const rate = parseFeePercent(r.standard_rate);
      if (rate !== null) {
        if (t === 'management' || t.includes('管理费')) mgmtFeePct = rate;
        if (t === 'custody' || t.includes('托管费')) custodyFeePct = rate;
      }
    }
  }

  return {
    symbol,
    estabDate,
    mgmtName: typeof first.mgmt_name === 'string' ? first.mgmt_name : null,
    managerName: typeof first.manager_name === 'string' ? first.manager_name : null,
    fundScale: marketNumber(first.fund_scale),
    managementFeePct: mgmtFeePct,
    custodyFeePct: custodyFeePct,
    collectedAt: res.collectedAt,
    rawJson: JSON.stringify(first),
  };
}

/**
 * ETF 披露财务指标 (披露规模 asset_nav)
 */
export async function fetchEtfFinancials(
  reader: MarketReader,
  symbol: string,
): Promise<SelectionEtfFinancialIndicator[]> {
  const res = await reader.fuyao('/api/fund/financials/indicators', {
    fund_type: 'exchange',
    thscode: symbol,
  });

  const list: SelectionEtfFinancialIndicator[] = [];
  for (const item of res.item) {
    const startMs = marketNumber(item.start_date_ms);
    const endMs = marketNumber(item.end_date_ms);
    const pubMs = marketNumber(item.publish_date_ms);

    const startDate = startMs ? beijingMsToDateString(startMs) : '';
    const endDate = endMs ? beijingMsToDateString(endMs) : '';
    const publishDate = pubMs ? beijingMsToDateString(pubMs) : '';

    if (!endDate || !publishDate) continue;

    list.push({
      symbol,
      startDate,
      endDate,
      publishDate,
      assetNav: marketNumber(item.asset_nav),
      collectedAt: res.collectedAt,
    });
  }
  return list;
}

/**
 * ETF 披露重仓持股
 * 优先保留带交易所后缀的唯一 thscode（如 '600519.SH'），防止丢失后缀变成纯 '600519'
 */
export async function fetchEtfHoldings(
  reader: MarketReader,
  symbol: string,
): Promise<SelectionEtfHolding[]> {
  const res = await reader.fuyao('/api/fund/portfolio/holdings', {
    fund_type: 'exchange',
    thscode: symbol,
  });

  const holdings: SelectionEtfHolding[] = [];
  for (const item of res.item) {
    const endMs = marketNumber(item.end_date_ms);
    const pubMs = marketNumber(item.publish_date_ms);
    const reportDate = endMs ? beijingMsToDateString(endMs) : '';
    if (!reportDate) continue;

    const thscode = typeof item.thscode === 'string' ? item.thscode : '';
    const ticker = typeof item.ticker === 'string' ? item.ticker : '';
    // 优先保留带后缀的 thscode
    const stockCode = thscode || ticker;
    const stockName = typeof item.stock_name === 'string' ? item.stock_name : '';
    if (!stockCode) continue;

    holdings.push({
      symbol,
      reportDate,
      stockCode,
      stockName,
      assetType: typeof item.asset_type === 'string' ? item.asset_type : 'stock',
      holdRatio: marketNumber(item.hold_ratio),
      positionCapital: marketNumber(item.position_capital),
      positionCount: marketNumber(item.position_count),
      publishedAt: pubMs ? beijingMsToDateString(pubMs) : null,
      collectedAt: res.collectedAt,
    });
  }
  return holdings;
}
