/**
 * 本地风险指标计算：波动率、最大回撤、夏普、索提诺、卡玛
 *
 * 输入：按日期升序排列的净值序列（NavPoint[]）
 * 输出：多周期 RiskMetrics
 *
 * 约定：
 * - 年化按 252 交易日
 * - 无风险利率默认 rf = 2%
 * - 日收益率优先取 dailyReturn（东财已给），缺失则从 unitNav 相邻差算
 * - "1y" 窗口 = 最新净值往前 365 自然日；样本数 <30 视为不足，指标返 null
 */

const TRADING_DAYS_PER_YEAR = 252;
const DEFAULT_RISK_FREE_RATE = 0.02;

export interface NavSample {
  navDate: string; // YYYY-MM-DD
  unitNav: number;
  dailyReturn: number | null; // 百分比，如 0.55 表示 +0.55%
}

export interface WindowMetrics {
  volatility: number | null;
  maxDrawdown: number | null;
  sharpe: number | null;
  sortino: number | null;
  calmar: number | null;
  annualReturn: number | null;
  samples: number;
}

export interface RiskMetrics {
  dataDate: string | null;
  y1: WindowMetrics;
  y3: WindowMetrics;
  y5: WindowMetrics;
  maxDrawdownAll: number | null;
}

const EMPTY: WindowMetrics = {
  volatility: null,
  maxDrawdown: null,
  sharpe: null,
  sortino: null,
  calmar: null,
  annualReturn: null,
  samples: 0,
};

/** 主入口 */
export function computeRiskMetrics(
  navs: readonly NavSample[],
  options: { riskFreeRate?: number } = {},
): RiskMetrics {
  if (navs.length === 0) {
    return { dataDate: null, y1: EMPTY, y3: EMPTY, y5: EMPTY, maxDrawdownAll: null };
  }
  const rf = options.riskFreeRate ?? DEFAULT_RISK_FREE_RATE;

  const sorted = ensureAscending(navs);
  const latestDate = sorted[sorted.length - 1]?.navDate ?? null;

  return {
    dataDate: latestDate,
    y1: metricsForWindow(sorted, 365, rf),
    y3: metricsForWindow(sorted, 365 * 3, rf),
    y5: metricsForWindow(sorted, 365 * 5, rf),
    maxDrawdownAll: maxDrawdownPct(sorted.map((n) => n.unitNav)),
  };
}

/** 校验升序（如果发现降序则复制反转，不修改入参） */
function ensureAscending(navs: readonly NavSample[]): NavSample[] {
  if (navs.length < 2) return [...navs];
  const first = navs[0]?.navDate ?? '';
  const last = navs[navs.length - 1]?.navDate ?? '';
  if (first <= last) return [...navs];
  return [...navs].reverse();
}

/** 计算某窗口内的指标 */
function metricsForWindow(sorted: readonly NavSample[], days: number, rf: number): WindowMetrics {
  if (sorted.length === 0) return { ...EMPTY };
  const lastDate = sorted[sorted.length - 1]?.navDate;
  if (!lastDate) return { ...EMPTY };

  const cutoff = subtractDays(lastDate, days);
  const window = sorted.filter((n) => n.navDate >= cutoff);
  const samples = window.length;
  if (samples < 30) return { ...EMPTY, samples };

  // 日收益率序列（小数，非百分比）
  const dailyReturns = extractDailyReturns(window);
  if (dailyReturns.length < 20) return { ...EMPTY, samples };

  const meanDaily = mean(dailyReturns);
  const stdDaily = std(dailyReturns, meanDaily);
  const volAnnual = stdDaily * Math.sqrt(TRADING_DAYS_PER_YEAR);

  // 年化收益：优先用日收益率复利（更抗净值单位跳变）；样本 <30 时才回落到首末法
  const firstNav = window[0]?.unitNav ?? 0;
  const lastNav = window[window.length - 1]?.unitNav ?? 0;
  const yearsElapsed = daysBetween(window[0]?.navDate ?? lastDate, lastDate) / 365;
  let annReturn: number;
  if (dailyReturns.length >= 30) {
    annReturn = (1 + meanDaily) ** TRADING_DAYS_PER_YEAR - 1;
  } else if (yearsElapsed > 0 && firstNav > 0 && lastNav / firstNav < 10) {
    const totalReturn = lastNav / firstNav - 1;
    annReturn = (1 + totalReturn) ** (1 / yearsElapsed) - 1;
  } else {
    annReturn = 0;
  }

  // 最大回撤
  const mdd = maxDrawdownPct(window.map((n) => n.unitNav));

  // 夏普：(年化收益 - rf) / 年化波动
  const sharpe = volAnnual > 0 ? (annReturn - rf) / volAnnual : null;

  // 索提诺：只用下行波动
  const downReturns = dailyReturns.filter((r) => r < 0);
  let sortino: number | null = null;
  if (downReturns.length >= 5) {
    const downStd = std(downReturns, 0) * Math.sqrt(TRADING_DAYS_PER_YEAR);
    sortino = downStd > 0 ? (annReturn - rf) / downStd : null;
  }

  // 卡玛：年化收益 / 最大回撤（都以小数形式，最终按百分数返回）
  const calmar = mdd !== null && mdd > 0 ? annReturn / (mdd / 100) : null;

  return {
    volatility: pct(volAnnual),
    maxDrawdown: mdd,
    sharpe: round(sharpe, 4),
    sortino: round(sortino, 4),
    calmar: round(calmar, 4),
    annualReturn: pct(annReturn),
    samples,
  };
}

/** 拿到窗口内每日收益率（小数） */
function extractDailyReturns(window: readonly NavSample[]): number[] {
  const out: number[] = [];
  let prevNav: number | null = null;
  for (const point of window) {
    if (point.dailyReturn !== null && Number.isFinite(point.dailyReturn)) {
      out.push(point.dailyReturn / 100);
      prevNav = point.unitNav;
      continue;
    }
    if (prevNav !== null && prevNav > 0 && Number.isFinite(point.unitNav)) {
      out.push(point.unitNav / prevNav - 1);
    }
    prevNav = point.unitNav;
  }
  return out;
}

/** 最大回撤（正数百分比） */
export function maxDrawdownPct(navs: readonly number[]): number | null {
  if (navs.length < 2) return null;
  let peak = navs[0] ?? 0;
  let mdd = 0;
  for (const nav of navs) {
    if (nav > peak) peak = nav;
    if (peak > 0) {
      const dd = (peak - nav) / peak;
      if (dd > mdd) mdd = dd;
    }
  }
  return round(mdd * 100, 4);
}

function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  let sum = 0;
  for (const x of xs) sum += x;
  return sum / xs.length;
}

function std(xs: readonly number[], m: number): number {
  if (xs.length < 2) return 0;
  let sq = 0;
  for (const x of xs) {
    const d = x - m;
    sq += d * d;
  }
  return Math.sqrt(sq / (xs.length - 1));
}

function pct(v: number | null): number | null {
  if (v === null || !Number.isFinite(v)) return null;
  return round(v * 100, 4);
}

function round(v: number | null, digits: number): number | null {
  if (v === null || !Number.isFinite(v)) return null;
  const p = 10 ** digits;
  return Math.round(v * p) / p;
}

function subtractDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round((db - da) / (24 * 3600 * 1000));
}
