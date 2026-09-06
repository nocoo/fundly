/**
 * 选 ETF 与选股纯数学与金融指标计算函数（无 I/O，无视图）
 * 遵循 docs/15-ETF-SCREENING.md 与 docs/16-STOCK-SCREENING.md
 */

import { chinaMarketDate, isMarketDate } from '../utils/market-validation.ts';
import { yearsBefore } from './market-bars.ts';

/** A same-day history row collected before the close is still a forming candle. */
export function canUseDailyClose(tradeDate: string, collectedAt: number): boolean {
  if (!isMarketDate(tradeDate) || !Number.isFinite(collectedAt)) return false;
  const day = chinaMarketDate(collectedAt);
  const local = new Date(collectedAt + 8 * 3600000);
  return (
    tradeDate < day ||
    (tradeDate === day && local.getUTCHours() * 60 + local.getUTCMinutes() >= 15 * 60)
  );
}

export interface ReturnWindowMetric {
  windowYears: 1 | 3 | 5;
  periodReturn: number | null; // 窗口总收益率 (%)
  cagr: number | null; // 几何年化收益率 (%)
  maxDrawdown: number | null; // 最大回撤 (正数, %)
  annualVolatility: number | null; // 年化波动率 (%)
  pointCount: number;
}

export interface DatedValue {
  date: string; // YYYY-MM-DD
  value: number;
}

/**
 * 计算几何年化收益率 CAGR (%)
 * 公式: (last / first) ^ (365.25 / actualDays) - 1
 * 严格日历天数: 边界实际天数
 * 若首尾任意非正、天数 <= 0，返回 null
 */
export function computeCagr(firstValue: number, lastValue: number, days: number): number | null {
  if (
    !Number.isFinite(firstValue) ||
    !Number.isFinite(lastValue) ||
    firstValue <= 0 ||
    lastValue <= 0 ||
    !Number.isFinite(days) ||
    days <= 0
  ) {
    return null;
  }
  const factor = lastValue / firstValue;
  const exponent = 365.25 / days;
  const cagr = (factor ** exponent - 1) * 100;
  return Number.isFinite(cagr) ? Number(cagr.toFixed(4)) : null;
}

/**
 * 计算正数最大回撤 (%)
 * max(1 - val / peak) * 100
 */
export function computeMaxDrawdown(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  if (values.some((v) => !Number.isFinite(v) || v <= 0)) return null;
  let peak = -Number.POSITIVE_INFINITY;
  let maxDd = 0;
  for (const v of values) {
    if (!Number.isFinite(v) || v <= 0) continue;
    if (v > peak) {
      peak = v;
    } else if (peak > 0) {
      const dd = (1 - v / peak) * 100;
      if (dd > maxDd) maxDd = dd;
    }
  }
  return Number(maxDd.toFixed(4));
}

/**
 * 计算年化波动率 (%)
 * 相邻日收益的样本标准差 * sqrt(252)
 * 样本数需达到要求的门槛
 */
export function computeAnnualVolatility(
  values: readonly number[],
  minSamples: number,
): number | null {
  if (
    values.length < minSamples ||
    minSamples < 2 ||
    values.some((v) => !Number.isFinite(v) || v <= 0)
  )
    return null;
  const dailyReturns: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1];
    const cur = values[i];
    if (prev != null && cur != null && prev > 0 && cur > 0) {
      dailyReturns.push(cur / prev - 1);
    }
  }
  if (dailyReturns.length < minSamples - 1) return null;

  const n = dailyReturns.length;
  let sum = 0;
  for (const r of dailyReturns) sum += r;
  const mean = sum / n;

  let varianceSum = 0;
  for (const r of dailyReturns) {
    const diff = r - mean;
    varianceSum += diff * diff;
  }
  // 样本方差，自由度 n - 1
  const variance = varianceSum / (n - 1);
  const std = Math.sqrt(variance);
  const annualVol = std * Math.sqrt(252) * 100;
  return Number.isFinite(annualVol) ? Number(annualVol.toFixed(4)) : null;
}

/**
 * 在日历窗口内切片序列，并计算 1/3/5 年周期收益、CAGR、最大回撤、年化波动率
 * 规则：
 * - 窗口起点为 end_date 向前自然年 1/3/5 年（yearsBefore）
 * - 序列在自然年起点前后允许最近交易日（不超过 10 个自然日容差）
 * - 样本点数阈值：1y >= 200, 3y >= 600, 5y >= 1000。不足则回撤/波动/CAGR 等写 null
 */
export function evaluateReturnWindow(
  series: readonly DatedValue[],
  years: 1 | 3 | 5,
  minPointsOverride?: number,
): ReturnWindowMetric {
  const minPoints = minPointsOverride ?? (years === 1 ? 200 : years === 3 ? 600 : 1000);
  const empty: ReturnWindowMetric = {
    windowYears: years,
    periodReturn: null,
    cagr: null,
    maxDrawdown: null,
    annualVolatility: null,
    pointCount: 0,
  };

  if (series.length < 2) return empty;
  const lastPoint = series.at(-1);
  if (!lastPoint) return empty;

  const targetStartDate = yearsBefore(lastPoint.date, years);
  const targetTime = new Date(`${targetStartDate}T00:00:00Z`).getTime();
  const lastTime = new Date(`${lastPoint.date}T00:00:00Z`).getTime();

  // 找到最靠近且在 targetStartDate 附近（<= 10 天差异）的起点
  let baseIndex = -1;
  let minDiff = Number.POSITIVE_INFINITY;
  for (let i = 0; i < series.length; i++) {
    const p = series[i];
    if (!p) continue;
    const pTime = new Date(`${p.date}T00:00:00Z`).getTime();
    if (pTime > lastTime) break;
    const diffDays = Math.abs(pTime - targetTime) / (86400 * 1000);
    // 允许 10 天以内边界
    if (diffDays <= 10 && diffDays < minDiff) {
      minDiff = diffDays;
      baseIndex = i;
    }
  }

  if (baseIndex < 0 || baseIndex >= series.length - 1) {
    return empty;
  }

  const basePoint = series[baseIndex];
  if (!basePoint) return empty;
  const windowSlice = series.slice(baseIndex);
  const count = windowSlice.length;
  if (windowSlice.some((p) => !Number.isFinite(p.value) || p.value <= 0))
    return { ...empty, pointCount: count };

  if (count < minPoints) {
    // 样本不足
    return {
      windowYears: years,
      periodReturn: null,
      cagr: null,
      maxDrawdown: null,
      annualVolatility: null,
      pointCount: count,
    };
  }

  const baseVal = basePoint.value;
  const lastVal = lastPoint.value;
  if (baseVal <= 0 || lastVal <= 0) return empty;

  const periodReturn = Number((((lastVal - baseVal) / baseVal) * 100).toFixed(4));
  const baseDateMs = new Date(`${basePoint.date}T00:00:00Z`).getTime();
  const lastDateMs = new Date(`${lastPoint.date}T00:00:00Z`).getTime();
  const actualDays = Math.max(1, (lastDateMs - baseDateMs) / (86400 * 1000));

  const cagr = computeCagr(baseVal, lastVal, actualDays);
  const values = windowSlice.map((s) => s.value);
  const maxDrawdown = computeMaxDrawdown(values);
  const annualVolatility = computeAnnualVolatility(values, minPoints);

  return {
    windowYears: years,
    periodReturn,
    cagr,
    maxDrawdown,
    annualVolatility,
    pointCount: count,
  };
}

/**
 * 20 日均成交额：最近 20 个交易日均已知且有效（非 null），否则返回 null
 */
export function compute20DayAvgTurnover(
  turnovers: readonly (number | null | undefined)[],
): number | null {
  if (turnovers.length < 20) return null;
  const last20 = turnovers.slice(-20);
  let sum = 0;
  for (const t of last20) {
    if (t === null || t === undefined || !Number.isFinite(t) || t < 0) {
      return null; // 必须 20 个值均已知
    }
    sum += t;
  }
  return Number((sum / 20).toFixed(2));
}

/**
 * 60 日均线偏离度 (BIAS): (最新价 / 60日均线价 - 1) * 100
 * 要求 60 个价格均有效且大于 0
 */
export function computeMa60Bias(prices: readonly (number | null | undefined)[]): number | null {
  if (prices.length < 60) return null;
  const last60 = prices.slice(-60);
  let sum = 0;
  for (const p of last60) {
    if (p === null || p === undefined || !Number.isFinite(p) || p <= 0) return null;
    sum += p;
  }
  const ma60 = sum / 60;
  const current = prices.at(-1);
  if (!current || current <= 0) return null;
  return Number((((current - ma60) / ma60) * 100).toFixed(4));
}

/**
 * 营收 / 归母净利润同比
 * operating_income / 上年值 - 1
 * 严格要求：上一年值必须存在且 > 0，年份连续
 */
export function computeYoyGrowth(
  currentVal: number | null | undefined,
  previousVal: number | null | undefined,
): number | null {
  if (
    currentVal === null ||
    currentVal === undefined ||
    previousVal === null ||
    previousVal === undefined ||
    !Number.isFinite(currentVal) ||
    !Number.isFinite(previousVal) ||
    previousVal <= 0
  ) {
    return null;
  }
  return Number((((currentVal - previousVal) / previousVal) * 100).toFixed(4));
}

/**
 * 三年复合增长率 CAGR: (最新年值 / 三年前值)^(1/3) - 1
 * 必须 4 个连续财年均存在且均严格大于 0 且有限；若存在非正数、非有限数或年份不连续则返回 null
 */
export function computeFinancial3YearCagr(
  annualValuesByYear: ReadonlyMap<number, number>,
  latestYear: number,
): number | null {
  const y0 = annualValuesByYear.get(latestYear - 3);
  const y1 = annualValuesByYear.get(latestYear - 2);
  const y2 = annualValuesByYear.get(latestYear - 1);
  const y3 = annualValuesByYear.get(latestYear);

  if (
    y0 === undefined ||
    y1 === undefined ||
    y2 === undefined ||
    y3 === undefined ||
    !Number.isFinite(y0) ||
    !Number.isFinite(y1) ||
    !Number.isFinite(y2) ||
    !Number.isFinite(y3) ||
    y0 <= 0 ||
    y1 <= 0 ||
    y2 <= 0 ||
    y3 <= 0
  ) {
    return null;
  }
  // 几何年化 3 年
  const cagr = ((y3 / y0) ** (1 / 3) - 1) * 100;
  return Number.isFinite(cagr) ? Number(cagr.toFixed(4)) : null;
}

/**
 * 现金利润比: act_cash_flow_net / net_profit
 * 严格使用合并报表 net_profit，且 net_profit 必须 > 0，否则返回 null
 */
export function computeCashProfitRatio(
  operatingCashFlow: number | null | undefined,
  netProfit: number | null | undefined,
): number | null {
  if (
    operatingCashFlow === null ||
    operatingCashFlow === undefined ||
    netProfit === null ||
    netProfit === undefined ||
    !Number.isFinite(operatingCashFlow) ||
    !Number.isFinite(netProfit) ||
    netProfit <= 0
  ) {
    return null;
  }
  return operatingCashFlow / netProfit;
}

/**
 * 经营现金流减资本开支: act_cash_flow_net - pay_fixed_assets_etc_cash
 * 两项均已知才计算
 */
export function computeCashMinusCapex(
  operatingCashFlow: number | null | undefined,
  capex: number | null | undefined,
): number | null {
  if (
    operatingCashFlow === null ||
    operatingCashFlow === undefined ||
    capex === null ||
    capex === undefined ||
    !Number.isFinite(operatingCashFlow) ||
    !Number.isFinite(capex)
  ) {
    return null;
  }
  return operatingCashFlow - capex;
}

/**
 * 资产负债率 (%): total_debt / assets_total * 100
 * 注意 total_debt 是负债合计，不是仅有息负债
 */
export function computeDebtRatio(
  totalDebt: number | null | undefined,
  assetsTotal: number | null | undefined,
): number | null {
  if (
    totalDebt === null ||
    totalDebt === undefined ||
    assetsTotal === null ||
    assetsTotal === undefined ||
    !Number.isFinite(totalDebt) ||
    !Number.isFinite(assetsTotal) ||
    assetsTotal <= 0
  ) {
    return null;
  }
  return Number(((totalDebt / assetsTotal) * 100).toFixed(4));
}

/**
 * ETF 持续费用: management_pct + custody_pct
 * 两项都已知才相加，零费有效
 */
export function computeEtfTotalExpensePct(
  mgmtFee: number | null | undefined,
  custodyFee: number | null | undefined,
): number | null {
  if (
    mgmtFee === null ||
    mgmtFee === undefined ||
    custodyFee === null ||
    custodyFee === undefined ||
    !Number.isFinite(mgmtFee) ||
    !Number.isFinite(custodyFee)
  ) {
    return null;
  }
  return Number((mgmtFee + custodyFee).toFixed(4));
}

/**
 * 名称规则派生 ETF 方向标签（提示：仅为名称规则分类，非官方跟踪关系）
 * 规则优先级：
 * 1. 固收 / 货币
 * 2. 境外权益 -> 跨境海外
 * 3. 红利 / 低波 / 股息
 * 4. 优先识别明确行业主题关键词（防止芯片50、证券ETF被数字50/ETF误判为宽基）
 * 5. 精确宽基模式
 * 6. 其他
 */
export function deriveEtfDirectionTag(
  name: string,
  assetClass: string,
): '宽基' | '红利低波' | '行业主题' | '固收货币' | '跨境海外' | '其他' {
  if (assetClass === '固收' || assetClass === '货币') return '固收货币';
  if (assetClass === '境外权益') return '跨境海外';

  const n = name.toUpperCase();
  if (n.includes('红利') || n.includes('低波') || n.includes('股息')) return '红利低波';

  const themePatterns = [
    '半导体',
    '芯片',
    '集成电路',
    '军工',
    '国防',
    '医药',
    '医疗',
    '生物',
    '光伏',
    '新能源',
    '电池',
    '储能',
    '券商',
    '证券',
    '银行',
    '保险',
    '非银',
    '白酒',
    '酒',
    '消费',
    '科技',
    '软件',
    '计算机',
    '通信',
    '5G',
    'AI',
    '人工智能',
    '大数据',
    '云计算',
    '机器人',
    '工业母机',
    '高端制造',
    '稀土',
    '有色',
    '煤炭',
    '钢铁',
    '机械',
    '工程机械',
    '电力',
    '公用事业',
    '环保',
    '传媒',
    '游戏',
    '动漫',
    '影视',
    '农业',
    '养殖',
    '畜牧',
    '交运',
    '运输',
    '航运',
    '航空',
    '地产',
    '房地产',
    '基建',
    '建筑',
    '化工',
    '新材料',
  ];
  for (const t of themePatterns) {
    if (n.includes(t)) return '行业主题';
  }

  const broadPatterns = [
    '沪深300',
    '中证300',
    '300ETF',
    '中证500',
    '500ETF',
    '中证1000',
    '1000ETF',
    '中证2000',
    '2000ETF',
    '上证50',
    '50ETF',
    '中证800',
    '800ETF',
    '中证100',
    '深证100',
    '创业板50',
    '创业板',
    '科创50',
    '科创100',
    '科创板',
    '中证A50',
    '中证A500',
    'A50ETF',
    'A500ETF',
    '央企现代能源',
    'MSCI',
  ];
  for (const b of broadPatterns) {
    if (n.includes(b)) return '宽基';
  }

  return '其他';
}
