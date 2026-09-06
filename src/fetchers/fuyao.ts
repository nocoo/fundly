/**
 * 扶摇 API 客户端与解析适配器
 * 规范：HTTP 200 后仍检查 code === 0；null 保持缺失不补 0；
 * 真实快照字段: last_price, prev_price, price_change_ratio_pct, open_price, high_price, low_price, volume, turnover
 * 历史字段: close_price, open_price, high_price, low_price, volume, turnover, date_ms
 * 严禁把顶层 sourceTimestamp 当行情交易日；无 item 交易日时需要交易日历/已验证日线推断并标记，无法确定保留未知。
 * 阻断性日期注意：Fuyao date_ms 是北京时间日界（如 1780243200000 = 2026-06-01 00:00 Asia/Shanghai）。
 * 必须固定在 Asia/Shanghai (+08:00) 偏移下转换，避免 UTC 错移一天到 2026-05-31！
 * 检查 Date.getTime() 有限性，防止极端异常时间戳 (如 1e100) 抛出 Invalid Date 崩掉整个批次。
 */

import type {
  MarketDailyBar,
  MarketEtfHolding,
  MarketEtfProfile,
  MarketIndexMember,
  MarketQuote,
  MarketSeriesObservation,
} from '../utils/market-types.ts';
import { isMarketDate, marketNumber } from '../utils/market-validation.ts';

export const FUYAO_BASE_URL = 'https://fuyao.aicubes.cn';

const CHINA_TIMEZONE_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * 将北京时间毫秒戳安全转换为 YYYY-MM-DD
 * 独立于宿主 Node/Bun 运行时的系统时区，固定北京时间计算
 * 调用 toISOString 前严格检查 Date.getTime() 有限且合法，非法日期返回空串
 */
export function beijingMsToDateString(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const shifted = ms + CHINA_TIMEZONE_OFFSET_MS;
  // JavaScript 时间戳范围在 ±8.64e15 ms 以内
  if (!Number.isFinite(shifted) || Math.abs(shifted) > 8.64e15) return '';
  const beijingDate = new Date(shifted);
  if (Number.isNaN(beijingDate.getTime())) return '';
  try {
    return beijingDate.toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

export interface FuyaoResponse<T> {
  code: number;
  message: string;
  request_id?: string;
  data?: {
    timestamp?: number;
    total?: number;
    item?: T;
  };
}

export function parseFuyaoQuote(
  instrumentId: string,
  rawItem: Record<string, unknown>,
  sourceTimestamp?: number,
  inferredTradeDate?: string,
): MarketQuote {
  const collectedAt = Date.now();

  const parseNum = (val: unknown): number | null => {
    return marketNumber(val);
  };

  // 1. 日期解析：严格区分源内交易日和推断交易日，严禁把顶层 sourceTimestamp 当交易日！
  let tradeDate = '';
  let isInferredDate = false;
  if (isMarketDate(rawItem.trade_date)) {
    tradeDate = rawItem.trade_date.trim();
  } else if (rawItem.date_ms) {
    tradeDate = beijingMsToDateString(Number(rawItem.date_ms));
  } else if (isMarketDate(inferredTradeDate)) {
    tradeDate = inferredTradeDate;
    isInferredDate = true;
  }

  // 2. 价格字段解析：优先读取快照实测字段 (last_price / prev_price / price_change_ratio_pct)，日线回退 (close_price / pre_close_price)
  const lastPrice = parseNum(
    rawItem.last_price ?? rawItem.close_price ?? rawItem.price ?? rawItem.current_price,
  );
  const prevPrice = parseNum(
    rawItem.prev_price ?? rawItem.pre_close_price ?? rawItem.prev_close ?? rawItem.pre_close,
  );
  const open = parseNum(rawItem.open_price);
  const high = parseNum(rawItem.high_price);
  const low = parseNum(rawItem.low_price);
  const volume = parseNum(rawItem.volume);
  const turnover = parseNum(rawItem.turnover);

  let changePct = parseNum(
    rawItem.price_change_ratio_pct ?? rawItem.change_rate ?? rawItem.change_pct,
  );
  if (changePct === null && lastPrice !== null && prevPrice !== null && prevPrice > 0) {
    changePct = Number((((lastPrice - prevPrice) / prevPrice) * 100).toFixed(4));
  }

  return {
    instrumentId,
    source: 'fuyao',
    tradeDate,
    quoteAt: parseNum(rawItem.quote_at),
    isInferredDate,
    price: lastPrice,
    open,
    high,
    low,
    close: lastPrice,
    prevClose: prevPrice,
    changePct,
    volume,
    turnover,
    sourceTimestamp: sourceTimestamp ?? null,
    collectedAt,
  };
}

export function parseFuyaoDailyBars(
  instrumentId: string,
  rawItems: Array<Record<string, unknown>>,
): MarketDailyBar[] {
  const bars: MarketDailyBar[] = [];

  for (const item of rawItems) {
    // 日期转换：优先格式化字符串 trade_date，其次使用北京时间时区安全转换 date_ms
    let tradeDate = '';
    if (typeof item.trade_date === 'string' && item.trade_date.trim()) {
      tradeDate = item.trade_date.trim();
    } else if (item.date_ms) {
      const ms = Number(item.date_ms);
      tradeDate = beijingMsToDateString(ms);
    }
    if (!isMarketDate(tradeDate)) continue;

    // 严禁 Number(null/空串) -> 0 产生虚假伪造数据
    const parseNumStrict = (val: unknown): number | null => {
      return marketNumber(val);
    };

    const open = parseNumStrict(item.open_price);
    const high = parseNumStrict(item.high_price);
    const low = parseNumStrict(item.low_price);
    const close = parseNumStrict(item.close_price);

    if (
      open === null ||
      high === null ||
      low === null ||
      close === null ||
      Math.min(open, high, low, close) <= 0
    ) {
      continue;
    }

    // 严格校验 OHLC 几何合理性：
    // low <= min(open, close), high >= max(open, close), low <= high
    // 合法的 O=H=L=C（如一字涨跌停）正常保留，非法的倒挂数据滤除
    if (low > high || low > Math.min(open, close) || high < Math.max(open, close)) {
      continue;
    }

    const volume = parseNumStrict(item.volume);
    const turnover = parseNumStrict(item.turnover);

    bars.push({
      instrumentId,
      tradeDate,
      source: 'fuyao',
      open,
      high,
      low,
      close,
      volume,
      turnover,
    });
  }

  return bars.sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
}

export function parseFuyaoIndexMembers(
  indexId: string,
  rawItems: Array<Record<string, unknown>>,
): MarketIndexMember[] {
  const members: MarketIndexMember[] = [];
  for (let i = 0; i < rawItems.length; i++) {
    const item = rawItems[i];
    if (!item) continue;
    const stockCode = String(item.stock_code ?? item.code ?? item.thscode ?? '').trim();
    const stockName = String(item.stock_name ?? item.name ?? '').trim();
    if (!stockCode || !stockName) continue;

    const weight = marketNumber(item.weight ?? item.hold_pct);

    members.push({
      indexId,
      stockCode,
      stockName,
      weight,
      rankOrder: i + 1,
    });
  }
  return members;
}

export function parseFuyaoFundNav(
  instrumentId: string,
  rows: Array<Record<string, unknown>>,
  collectedAt = Date.now(),
): MarketSeriesObservation[] {
  const values = new Map<string, MarketSeriesObservation>();
  for (const row of rows) {
    const date = isMarketDate(row.nav_date)
      ? row.nav_date
      : beijingMsToDateString(marketNumber(row.nav_date) ?? 0);
    const value = marketNumber(row.unit_nav);
    if (isMarketDate(date) && value !== null && value > 0)
      values.set(date, {
        instrumentId,
        observationDate: date,
        source: 'fuyao',
        value,
        unit: '元',
        collectedAt,
      });
  }
  return [...values.values()].sort((a, b) => a.observationDate.localeCompare(b.observationDate));
}

export function parseFuyaoFundProfile(
  instrumentId: string,
  row: Record<string, unknown>,
  collectedAt = Date.now(),
): MarketEtfProfile {
  return {
    instrumentId,
    establishedDate: beijingMsToDateString(marketNumber(row.estab_date) ?? 0) || null,
    fundScale: marketNumber(row.fund_scale),
    fundManager: typeof row.manager_name === 'string' ? row.manager_name : null,
    managementCompany: typeof row.mgmt_name === 'string' ? row.mgmt_name : null,
    source: 'fuyao',
    collectedAt,
    rawJson: JSON.stringify(row),
  };
}

export function parseFuyaoFundHoldings(
  instrumentId: string,
  rows: Array<Record<string, unknown>>,
  collectedAt = Date.now(),
): MarketEtfHolding[] {
  const holdings = new Map<string, MarketEtfHolding>();
  for (const row of rows) {
    const reportDate = beijingMsToDateString(marketNumber(row.end_date_ms) ?? 0);
    const stockCode = typeof row.thscode === 'string' ? row.thscode : '';
    const stockName = typeof row.stock_name === 'string' ? row.stock_name : '';
    if (!stockCode || !stockName || !isMarketDate(reportDate)) continue;
    const count = marketNumber(row.position_count);
    const capital = marketNumber(row.position_capital);
    holdings.set(`${reportDate}|${stockCode}`, {
      instrumentId,
      reportDate,
      stockCode,
      stockName,
      assetType: typeof row.asset_type === 'string' ? row.asset_type : 'unknown',
      holdPct: marketNumber(row.hold_ratio),
      holdShares: count === null ? null : count / 10000,
      holdValueWan: capital === null ? null : capital / 10000,
      publishedAt: beijingMsToDateString(marketNumber(row.publish_date_ms) ?? 0) || null,
      source: 'fuyao',
      collectedAt,
    });
  }
  return [...holdings.values()];
}
