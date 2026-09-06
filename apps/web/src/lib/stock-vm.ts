import { readStoredJson, writeStoredJson } from './stored-json';

export const STOCK_LENSES = [
  'browse',
  'valuation',
  'quality',
  'growth',
  'cashflow',
  'trend',
  'picks',
] as const;
export type StockLens = (typeof STOCK_LENSES)[number];

export const STOCK_LENS_LABEL: Record<StockLens, string> = {
  browse: '股票浏览',
  valuation: '估值比较',
  quality: '盈利质量',
  growth: '成长持续',
  cashflow: '现金质量',
  trend: '趋势风险',
  picks: '条件精选',
};

export const STOCK_LENS_DESCRIPTIONS: Record<StockLens, string> = {
  browse: '全 A 股股票目录与快照行情，带已知行业归属与行内走势。',
  valuation: '市盈率 PE (TTM/MRQ)、市净率 PB、市销率 PS、市现率 PCF，负值与 null 排在最后。',
  quality: '加权净资产收益率 ROE、扣非 ROE、销售净利率、毛利率与资产负债率。',
  growth: '最新完整年报营收同比、归母净利润同比与营收/净利润三年复合增长率 CAGR。',
  cashflow: '经营现金流、现金利润比、资本开支与净现金流（默认排除不可比金融业）。',
  trend: '五年真实前复权价格走势、正数最大回撤、年化波动率与 60 日均线偏离度。',
  picks: '估值、盈利、增长、回撤与成交额硬条件交集精选，默认排除金融与 ST 股。',
};

export interface StockSearchState {
  q: string;
  exchange: string; // 'SH,SZ' | 'all' | 'SH' | 'SZ' | 'BJ'
  industry: string;
  isFinancial?: boolean;
  excludeFinancial: boolean;
  excludeSt: boolean;
  years: '1' | '3' | '5';
  fiscalYear?: number;
  hasHistory: boolean;
  hasFinancials: boolean;
  // 精选数值条件：支持显式关闭 (false)
  maxPeEnabled: boolean;
  maxPe: number;
  minRoeEnabled: boolean;
  minRoe: number;
  minRevenueYoyEnabled: boolean;
  minRevenueYoy: number;
  maxDrawdownEnabled: boolean;
  maxDrawdown: number;
  minTurnoverEnabled: boolean;
  minTurnover: number;
  sort: string;
  order: 'asc' | 'desc';
  page: number;
}

export const DEFAULT_STOCK_STATE: StockSearchState = {
  q: '',
  exchange: 'SH,SZ', // 选股视角默认沪深
  industry: 'all',
  excludeFinancial: false,
  excludeSt: true,
  years: '1',
  hasHistory: false,
  hasFinancials: false,
  maxPeEnabled: true,
  maxPe: 40.0,
  minRoeEnabled: true,
  minRoe: 8.0,
  minRevenueYoyEnabled: true,
  minRevenueYoy: 0.0,
  maxDrawdownEnabled: true,
  maxDrawdown: 50.0,
  minTurnoverEnabled: true,
  minTurnover: 50000000,
  sort: '',
  order: 'asc',
  page: 1,
};

function parsePositiveInt(val: string | null, fallback = 1): number {
  if (val === null || val === '') return fallback;
  const n = Number(val);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(10000, Math.max(1, Math.floor(n)));
}

function parseOrder(val: string | null, fallback: 'asc' | 'desc' = 'asc'): 'asc' | 'desc' {
  if (val === 'desc' || val === 'DESC') return 'desc';
  if (val === 'asc' || val === 'ASC') return 'asc';
  return fallback;
}

export function parseStockSearch(search: string, lens: StockLens = 'browse'): StockSearchState {
  const p = new URLSearchParams(search);
  const q = p.get('q') ?? '';
  const defaultExchange = lens === 'browse' ? 'all' : 'SH,SZ';
  const exchange = p.get('exchange') ?? defaultExchange;
  const industry = p.get('industry') ?? 'all';

  // 金融股排除开关：picks, cashflow, quality, growth 默认排除
  const defaultExcludeFin =
    lens === 'cashflow' || lens === 'quality' || lens === 'growth' || lens === 'picks';
  let excludeFinancial = defaultExcludeFin;
  if (p.get('excludeFin') !== null) {
    excludeFinancial = p.get('excludeFin') === '1';
  } else if (p.get('excludeFinancial') !== null) {
    excludeFinancial = p.get('excludeFinancial') === 'true';
  }

  // 若明确选了金融业专属比较，则不能同时排除金融业
  const isFinancial = p.get('isFinancial')
    ? p.get('isFinancial') === 'true'
    : p.get('finOnly') === '1'
      ? true
      : p.get('finOnly') === '0'
        ? false
        : undefined;
  if (isFinancial) {
    excludeFinancial = false;
  }

  const excludeSt = p.get('stOn') !== null ? p.get('stOn') !== '0' : lens === 'picks';
  const rawYears = p.get('years');
  const years = rawYears === '3' ? '3' : rawYears === '5' ? '5' : '1';
  const fiscalYear = p.get('fiscalYear') ? Number(p.get('fiscalYear')) : undefined;
  const hasHistory = p.get('hasHistory') === 'true';
  const hasFinancials = p.get('hasFinancials') === 'true';

  // 精选门槛
  const maxPeEnabled = p.get('peOn') !== null ? p.get('peOn') === '1' : true;
  const rawMaxPe = p.get('maxPe');
  const maxPe =
    rawMaxPe !== null && rawMaxPe !== '' && Number.isFinite(Number(rawMaxPe))
      ? Number(rawMaxPe)
      : 40.0;

  const minRoeEnabled = p.get('roeOn') !== null ? p.get('roeOn') === '1' : true;
  const rawMinRoe = p.get('minRoe');
  const minRoe =
    rawMinRoe !== null && rawMinRoe !== '' && Number.isFinite(Number(rawMinRoe))
      ? Number(rawMinRoe)
      : 8.0;

  const minRevenueYoyEnabled = p.get('yoyOn') !== null ? p.get('yoyOn') === '1' : true;
  const rawMinYoy = p.get('minRevenueYoy');
  const minRevenueYoy =
    rawMinYoy !== null && rawMinYoy !== '' && Number.isFinite(Number(rawMinYoy))
      ? Number(rawMinYoy)
      : 0.0;

  const maxDrawdownEnabled = p.get('ddOn') !== null ? p.get('ddOn') === '1' : true;
  const rawMaxDd = p.get('maxDrawdown');
  const maxDrawdown =
    rawMaxDd !== null && rawMaxDd !== '' && Number.isFinite(Number(rawMaxDd))
      ? Number(rawMaxDd)
      : 50.0;

  const minTurnoverEnabled = p.get('toOn') !== null ? p.get('toOn') === '1' : true;
  const rawMinTo = p.get('minTurnover');
  const minTurnover =
    rawMinTo !== null && rawMinTo !== '' && Number.isFinite(Number(rawMinTo))
      ? Number(rawMinTo)
      : 50000000;

  let defaultSort = 'ticker';
  let defaultOrder: 'asc' | 'desc' = 'asc';
  if (lens === 'valuation') {
    defaultSort = 'pe';
    defaultOrder = 'asc';
  } else if (lens === 'quality' || lens === 'picks') {
    defaultSort = 'roe';
    defaultOrder = 'desc';
  } else if (lens === 'growth') {
    defaultSort = 'revenueYoy';
    defaultOrder = 'desc';
  } else if (lens === 'cashflow') {
    defaultSort = 'cashProfitRatio';
    defaultOrder = 'desc';
  } else if (lens === 'trend') {
    defaultSort = 'maxDrawdown';
    defaultOrder = 'asc';
  }

  const sort = p.get('sort') ?? defaultSort;
  const order = parseOrder(p.get('order'), defaultOrder);
  const page = parsePositiveInt(p.get('page'), 1);

  return {
    q,
    exchange,
    industry,
    isFinancial,
    excludeFinancial,
    excludeSt,
    years,
    fiscalYear,
    hasHistory,
    hasFinancials,
    maxPeEnabled,
    maxPe,
    minRoeEnabled,
    minRoe,
    minRevenueYoyEnabled,
    minRevenueYoy,
    maxDrawdownEnabled,
    maxDrawdown,
    minTurnoverEnabled,
    minTurnover,
    sort,
    order,
    page,
  };
}

export function stockUrlSearch(state: StockSearchState, lens: StockLens = 'browse'): string {
  const p = new URLSearchParams();
  if (state.q.trim()) p.set('q', state.q.trim());
  const defaultExchange = lens === 'browse' ? 'all' : 'SH,SZ';
  if (state.exchange !== defaultExchange) p.set('exchange', state.exchange);
  if (state.industry !== 'all') p.set('industry', state.industry);

  const defaultExcludeFin =
    lens === 'cashflow' || lens === 'quality' || lens === 'growth' || lens === 'picks';
  if (state.excludeFinancial !== defaultExcludeFin) {
    p.set('excludeFin', state.excludeFinancial ? '1' : '0');
  }
  if (state.isFinancial !== undefined) {
    p.set('finOnly', state.isFinancial ? '1' : '0');
  }

  if (lens === 'picks') {
    if (!state.excludeSt) p.set('stOn', '0');
    if (!state.maxPeEnabled) p.set('peOn', '0');
    if (state.maxPe !== 40.0) p.set('maxPe', String(state.maxPe));

    if (!state.minRoeEnabled) p.set('roeOn', '0');
    if (state.minRoe !== 8.0) p.set('minRoe', String(state.minRoe));

    if (!state.minRevenueYoyEnabled) p.set('yoyOn', '0');
    if (state.minRevenueYoy !== 0.0) p.set('minRevenueYoy', String(state.minRevenueYoy));

    if (!state.maxDrawdownEnabled) p.set('ddOn', '0');
    if (state.maxDrawdown !== 50.0) p.set('maxDrawdown', String(state.maxDrawdown));

    if (!state.minTurnoverEnabled) p.set('toOn', '0');
    if (state.minTurnover !== 50000000) p.set('minTurnover', String(state.minTurnover));
  }

  if (state.years !== '1') p.set('years', state.years);
  if (state.fiscalYear) p.set('fiscalYear', String(state.fiscalYear));
  if (state.hasHistory) p.set('hasHistory', 'true');
  if (state.hasFinancials) p.set('hasFinancials', 'true');

  if (state.sort) p.set('sort', state.sort);
  if (state.order) p.set('order', state.order);
  if (state.page > 1) p.set('page', String(state.page));

  const s = p.toString();
  return s ? `?${s}` : '';
}

export function storeStockFilters(lens: StockLens, state: StockSearchState): void {
  writeStoredJson(`fundly_stock_filters_${lens}`, state);
}

export function readStoredStockFilters(lens: StockLens): StockSearchState | null {
  const data = readStoredJson(`fundly_stock_filters_${lens}`);
  if (!data || typeof data !== 'object') return null;
  return data as StockSearchState;
}
