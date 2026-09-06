/**
 * 宏观与跨资产指标纯计算
 * - 20 / 60 交易日价格涨跌：P[t] / P[t-N] - 1（严格需要 N+1 个有效收盘点）
 * - 相对强弱 (pp)：按相同实际日期对齐，严格要求相同起止日期，不满足窗口或起止不同返回 null
 * - ETF 折溢价：显式校验市价与单位净值同日生效
 * - 市场广度统计：以已校验 A 股目录中的 SH/SZ 范围为准，严格校验有限数值，包含九号公司等 CDR (689009.SH)
 */

import type { MarketBreadth, MarketDailyBar } from '../utils/market-types.ts';

type PricePoint = Pick<MarketDailyBar, 'tradeDate' | 'close'>;

export function computeRollingReturn(
  bars: readonly PricePoint[],
  windowDays: number,
): number | null {
  // 严格要求 N+1 个有效点
  if (!Number.isInteger(windowDays) || windowDays < 1 || bars.length < windowDays + 1) return null;
  const current = bars.at(-1);
  const base = bars.at(-1 - windowDays);
  if (!current || !base) return null;
  if (
    !Number.isFinite(base.close) ||
    base.close <= 0 ||
    !Number.isFinite(current.close) ||
    current.close <= 0
  )
    return null;
  return Number((((current.close - base.close) / base.close) * 100).toFixed(4));
}

/**
 * 行业相对沪深300走势（超额百分点 pp）
 * 严格按相同实际交易日对齐：
 * 1. 行业与基准在起止日必须日期完全一致
 * 2. 行业与基准在起止点的价格均合法且大于0
 * 3. 任何起止日期不匹配（停牌/缺日）均返回 null，不进行错配比较
 */
export function computeRelativeStrength(
  industryBars: readonly PricePoint[],
  benchmarkBars: readonly PricePoint[],
  windowDays: number,
): number | null {
  if (!Number.isInteger(windowDays) || windowDays < 1) return null;
  if (industryBars.length < windowDays + 1 || benchmarkBars.length < windowDays + 1) return null;

  // 建立按日期的价格查找表
  const indMap = new Map<string, number>();
  for (const b of industryBars) {
    if (b.tradeDate && Number.isFinite(b.close) && b.close > 0) {
      indMap.set(b.tradeDate, b.close);
    }
  }

  const bmMap = new Map<string, number>();
  for (const b of benchmarkBars) {
    if (b.tradeDate && Number.isFinite(b.close) && b.close > 0) {
      bmMap.set(b.tradeDate, b.close);
    }
  }

  // 获取最新的共同交易日
  const indCurrent = industryBars.at(-1);
  const bmCurrent = benchmarkBars.at(-1);
  if (!indCurrent || !bmCurrent) return null;

  // 必须对齐相同的最新交易日
  if (indCurrent.tradeDate !== bmCurrent.tradeDate) return null;
  const endDate = indCurrent.tradeDate;

  // 获取基准向前倒数第 windowDays 根的交易日作为基准起点
  const bmBase = benchmarkBars.at(-1 - windowDays);
  if (!bmBase) return null;
  const startDate = bmBase.tradeDate;
  if (industryBars.at(-1 - windowDays)?.tradeDate !== startDate) return null;

  // 检查行业在相同的 startDate 和 endDate 是否都有有效价格
  const indP0 = indMap.get(startDate);
  const indP1 = indMap.get(endDate);
  const bmP0 = bmMap.get(startDate);
  const bmP1 = bmMap.get(endDate);

  if (indP0 === undefined || indP1 === undefined || bmP0 === undefined || bmP1 === undefined) {
    return null;
  }

  const indRet = ((indP1 - indP0) / indP0) * 100;
  const bmRet = ((bmP1 - bmP0) / bmP0) * 100;

  return Number((indRet - bmRet).toFixed(4));
}

/**
 * ETF 收盘折溢价率
 * 必须显式传入市场价日期与净值日期，严格校验同日且数值合法有效
 */
export function computeEtfPremiumDiscount(
  marketClosePrice: number | null | undefined,
  marketTradeDate: string | null | undefined,
  unitNav: number | null | undefined,
  navDate: string | null | undefined,
): number | null {
  if (
    marketClosePrice === null ||
    marketClosePrice === undefined ||
    !Number.isFinite(marketClosePrice) ||
    marketClosePrice <= 0 ||
    unitNav === null ||
    unitNav === undefined ||
    !Number.isFinite(unitNav) ||
    unitNav <= 0 ||
    !marketTradeDate ||
    !navDate ||
    marketTradeDate !== navDate
  ) {
    return null;
  }
  return Number((((marketClosePrice - unitNav) / unitNav) * 100).toFixed(4));
}

export interface StockQuoteSnapshotItem {
  code: string;
  name?: string;
  price?: number | null;
  prevClose?: number | null;
  volume?: number | null;
  turnover?: number | null;
  changePct?: number | null;
}

/**
 * 市场广度统计：
 * 1. 代码去重（Set）
 * 2. 严格以已校验 A 股目录（或传入的 validCatalogCodes 范围）中 SH / SZ 交易所代码为准，不依赖死板前缀
 * 3. 严格校验所有数值 Number.isFinite（严禁 NaN, Infinity, -Infinity）
 * 4. 如果源 changePct 存在但不是有效有限数（NaN / Infinity），判定为非有效行排除，不兜底重新计算！
 * 5. 价格、昨收大于0，成交量大于0，成交额非负
 */
export function computeMarketBreadth(
  stockQuotes: readonly StockQuoteSnapshotItem[],
  tradeDate: string,
  totalCatalogCount: number,
  limitPools?: { limitUpCount?: number; limitDownCount?: number; limitBreakCount?: number },
  validCatalogCodes?: ReadonlySet<string>,
): MarketBreadth {
  let up = 0;
  let down = 0;
  let flat = 0;
  let turnoverSum = 0;
  const changes: number[] = [];
  const seenCodes = new Set<string>();

  for (const s of stockQuotes) {
    if (!s || typeof s.code !== 'string') continue;
    const code = s.code.trim();

    // 排除重复代码
    if (seenCodes.has(code)) continue;

    // 若有外部校验的沪深 A 股目录，以目录白名单为准；否则根据 .SH / .SZ 交易所后缀判定
    if (validCatalogCodes) {
      if (!validCatalogCodes.has(code)) continue;
    } else {
      const isShSz =
        code.endsWith('.SH') || code.endsWith('.SZ') || /^(?:60|688|689|00|30)\d{4}/.test(code);
      if (!isShSz) continue;
    }

    const p = s.price;
    const pc = s.prevClose;
    const vol = s.volume;
    const to = s.turnover;
    const chg = s.changePct;

    // 若 source 传入了 changePct 但不是有效有限数（NaN / Infinity），严格排除！
    if (chg !== undefined && chg !== null && !Number.isFinite(chg)) {
      continue;
    }

    // 严苛过滤：所有数值必须为有限实数，不可为 NaN / Infinity
    if (
      p !== undefined &&
      p !== null &&
      Number.isFinite(p) &&
      p > 0 &&
      pc !== undefined &&
      pc !== null &&
      Number.isFinite(pc) &&
      pc > 0 &&
      vol !== undefined &&
      vol !== null &&
      Number.isFinite(vol) &&
      vol > 0 &&
      to !== undefined &&
      to !== null &&
      Number.isFinite(to) &&
      to >= 0
    ) {
      let finalChg: number;
      if (chg !== undefined && chg !== null) {
        finalChg = chg;
      } else {
        finalChg = Number((((p - pc) / pc) * 100).toFixed(4));
      }

      if (!Number.isFinite(finalChg)) continue;

      seenCodes.add(code);
      turnoverSum += to;
      changes.push(finalChg);

      if (finalChg > 0.0001) up++;
      else if (finalChg < -0.0001) down++;
      else flat++;
    }
  }

  changes.sort((a, b) => a - b);
  let medianChangePct: number | null = null;
  if (changes.length > 0) {
    const mid = Math.floor(changes.length / 2);
    const middle = changes[mid];
    const lower = changes[mid - 1];
    if (middle !== undefined) {
      if (changes.length % 2 === 1) medianChangePct = middle;
      else if (lower !== undefined) medianChangePct = Number(((lower + middle) / 2).toFixed(6));
    }
  }

  return {
    tradeDate,
    scope: 'SH_SZ_A',
    upCount: up,
    downCount: down,
    flatCount: flat,
    totalValidCount: changes.length,
    totalCatalogCount,
    medianChangePct,
    validTurnoverSum: turnoverSum,
    limitUpCount: limitPools?.limitUpCount ?? null,
    limitDownCount: limitPools?.limitDownCount ?? null,
    limitBreakCount: limitPools?.limitBreakCount ?? null,
    collectedAt: Date.now(),
  };
}
