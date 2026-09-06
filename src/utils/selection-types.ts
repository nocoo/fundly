/**
 * 选 ETF 与选股数据层核心类型定义
 */

export interface SelectionEtfCatalogItem {
  symbol: string; // e.g. '510300.SH'
  ticker: string; // '510300'
  name: string; // '华泰柏瑞沪深300ETF'
  exchange: string; // 'SH' | 'SZ'
  assetClass: string; // '境内权益' | '境外权益' | '固收' | '货币' | '其他' | '待核验'
  directionTag?: string | null; // 名称规则派生：'宽基' | '红利低波' | '行业主题' | '固收货币' | '跨境海外' | '其他'
  linkedFundCode?: string | null; // 已核验关联的 6 位 fund_code
  linkMethod?: string | null; // 关联依据，如 'exact_code_and_clean_name'
  createdAt: number;
  updatedAt: number;
}

export interface SelectionStockCatalogItem {
  symbol: string; // e.g. '600519.SH'
  ticker: string; // '600519'
  name: string; // '贵州茅台'
  exchange: string; // 'SH' | 'SZ' | 'BJ'
  industryThscode?: string | null; // 如 '881121.TI' 或 null
  industryName?: string | null; // 如 '白酒' 或 null
  isFinancial?: boolean; // 银行/证券/保险标记
  createdAt: number;
  updatedAt: number;
}

export interface SelectionDailyBar {
  assetType: 'etf' | 'stock';
  symbol: string;
  adjust: 'none' | 'forward';
  tradeDate: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  turnover: number | null;
  collectedAt: number;
}

export interface SelectionEtfNavPoint {
  symbol: string;
  navDate: string; // YYYY-MM-DD
  unitNav: number;
  adjNav: number | null;
  collectedAt: number;
}

export interface SelectionEtfFinancialIndicator {
  symbol: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  publishDate: string; // YYYY-MM-DD
  assetNav: number | null; // 原始元
  collectedAt: number;
}

export interface SelectionEtfHolding {
  symbol: string;
  reportDate: string; // YYYY-MM-DD
  stockCode: string;
  stockName: string;
  assetType: string;
  holdRatio: number | null; // 百分数，如 8.88 代表 8.88%
  positionCapital: number | null;
  positionCount: number | null;
  publishedAt?: string | null;
  collectedAt: number;
}

export interface SelectionEtfProfile {
  symbol: string;
  estabDate?: string | null; // YYYY-MM-DD
  mgmtName?: string | null;
  managerName?: string | null;
  fundScale?: number | null; // profile 中的无日期规模（元）
  managementFeePct?: number | null; // %/年
  custodyFeePct?: number | null; // %/年
  collectedAt: number;
  rawJson?: string | null;
}

export interface SelectionStockValuation {
  symbol: string;
  tradeDate?: string | null;
  timestamp?: number | null;
  peTtm: number | null;
  peMrq: number | null;
  pbMrq: number | null;
  psTtm: number | null;
  pcfTtm: number | null;
  collectedAt: number;
}

export interface SelectionStockFinancialStatement {
  symbol: string;
  statementType: 'income' | 'balance' | 'cash_flow';
  fiscalYear: number;
  fiscalPeriod: string; // 'FY'
  periodEnd: string; // YYYY-MM-DD
  reportDate: string; // YYYY-MM-DD
  currency: string;
  data: Record<string, number | string | null>;
  collectedAt: number;
}

export interface SelectionStockIndicatorAbility {
  ability: string;
  indicators: Array<{
    index_id: string;
    value: string | number | null;
  }>;
}

export interface SelectionStockFinancialIndicators {
  symbol: string;
  report: string; // e.g. '2025-4'
  abilities: SelectionStockIndicatorAbility[];
  collectedAt: number;
}

export interface SelectionStockSnapshotQuote {
  symbol: string;
  tradeDate: string;
  price: number | null;
  prevClose: number | null;
  changePct: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  turnover: number | null;
  isInferredDate: boolean;
  collectedAt: number;
}

export interface SelectionCollectionStatus {
  scope: string; // 'etf_catalog' | 'stock_catalog' | 'stock_valuation' | 'stock_snapshot' | 'etf_deep' | 'stock_deep'
  lastSuccessAt: number | null;
  lastAttemptAt: number;
  success: boolean;
  catalogCount: number;
  validCount: number;
  errorMessage: string | null;
  detailsJson?: string | null;
  updatedAt: number;
}

export interface SelectionEtfMaterialized {
  symbol: string;
  ticker: string;
  name: string;
  exchange: string;
  assetClass: string;
  directionTag: string | null;
  linkedFundCode: string | null;
  // 市场快照
  marketTradeDate: string | null;
  marketPrice: number | null;
  changePct: number | null;
  turnover: number | null;
  volume: number | null;
  avgTurnover20d: number | null;
  // 净值与折溢价
  navDate: string | null;
  unitNav: number | null;
  adjNav: number | null;
  premiumDiscountPct: number | null;
  // 费用与规模
  mgmtFeePct: number | null;
  custodyFeePct: number | null;
  totalExpensePct: number | null;
  scaleYi: number | null;
  scalePeriod: string | null;
  scaleDisclosureDate: string | null;
  scaleSource: string | null; // 'disclosure' | 'local_verified' | 'profile'
  // 真实来源与时效基准
  historyAsof: string | null; // 真实历史最后交易日
  navRiskBasis: string | null; // 'adj_nav' | 'local_total_return' | 'none'
  navRiskAsof: string | null; // 收益风险计算所用净值最后日期
  // 净值周期收益与风险指标
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
  sparklineJson: string | null; // 最近 ~60 个点 [close/nav]
  sparklineType: 'price' | 'nav' | 'none';
  // 覆盖标志
  hasMarketBars: boolean;
  hasNavHistory: boolean;
  hasDeepResearch: boolean;
  updatedAt: number;
}

export interface SelectionStockMaterialized {
  symbol: string;
  ticker: string;
  name: string;
  exchange: string;
  industryThscode: string | null;
  industryName: string | null;
  isFinancial: boolean;
  // 市场快照与估值
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
  valuationTimestamp: number | null; // 估值源时间戳
  // 趋势与风险 (前复权)
  historyAsof: string | null; // 前复权价格历史最后交易日
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
  ma60Bias: number | null; // (price / ma60 - 1) * 100
  sparklineJson: string | null;
  // 财务指标 (最新完整年报)
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
  // 覆盖标志
  hasDeepResearch: boolean;
  hasPriceHistory: boolean;
  hasFinancials: boolean;
  updatedAt: number;
}
