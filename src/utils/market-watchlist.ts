import type { MarketInstrument, MarketInstrumentRelation } from './market-types.ts';

export const MAJOR_INDICES = [
  ['000001.SH', '上证指数'],
  ['399001.SZ', '深证成指'],
  ['000300.SH', '沪深300'],
  ['399006.SZ', '创业板指'],
  ['000905.SH', '中证500'],
  ['000852.SH', '中证1000'],
  ['000688.SH', '科创50'],
] as const;

/** Representative observation pools; these are not asserted to be peer-level industries. */
export const INDUSTRY_WATCHLIST = [
  { symbol: '881121.TI', name: '半导体', evidence: 'semiconductor' },
  { symbol: '881155.TI', name: '银行', evidence: 'banks' },
  { symbol: '881169.TI', name: '贵金属', evidence: 'gold' },
  { symbol: '881272.TI', name: '软件开发', evidence: 'software' },
  { symbol: '881125.TI', name: '汽车整车', evidence: 'autos' },
  { symbol: '881145.TI', name: '电力', evidence: 'power' },
  { symbol: '881273.TI', name: '白酒', evidence: 'baijiu' },
] as const;

export const ETF_WATCHLIST = [
  ['510300.SH', '沪深300ETF华泰柏瑞'],
  ['588000.SH', '科创50ETF华夏'],
  ['512480.SH', '半导体ETF国联安'],
  ['512800.SH', '银行ETF华宝'],
  ['513100.SH', '纳指ETF国泰'],
  ['518880.SH', '黄金ETF华安'],
  ['511010.SH', '国债ETF国泰'],
  ['159915.SZ', '创业板ETF易方达'],
] as const;

export function chinaInstrument(
  assetClass: 'index' | 'industry' | 'etf' | 'stock',
  symbol: string,
  name: string,
): MarketInstrument {
  return {
    instrumentId: `${assetClass}:${symbol}`,
    assetClass,
    symbol,
    name,
    exchange: symbol.split('.').at(-1) ?? '',
    currency: 'CNY',
    unit: assetClass === 'etf' || assetClass === 'stock' ? '元' : '点',
    tradingCalendar: 'CN_STOCK',
  };
}

export const CN_WATCHLIST: MarketInstrument[] = [
  ...MAJOR_INDICES.map(([symbol, name]) => chinaInstrument('index', symbol, name)),
  ...INDUSTRY_WATCHLIST.map(({ symbol, name }) => chinaInstrument('industry', symbol, name)),
  ...ETF_WATCHLIST.map(([symbol, name]) => chinaInstrument('etf', symbol, name)),
];

export const MARKET_RELATIONS: MarketInstrumentRelation[] = [
  {
    sourceId: 'industry:881121.TI',
    targetId: 'etf:512480.SH',
    relationType: 'theme_associated',
    confidence: 'verified',
    description: '半导体主题关联；并非跟踪该同花顺行业指数',
  },
  {
    sourceId: 'industry:881155.TI',
    targetId: 'etf:512800.SH',
    relationType: 'theme_associated',
    confidence: 'verified',
    description: '银行主题关联；并非跟踪该同花顺行业指数',
  },
  {
    sourceId: 'industry:881169.TI',
    targetId: 'etf:518880.SH',
    relationType: 'theme_associated',
    confidence: 'verified',
    description: '黄金主题关联；黄金ETF持有黄金敞口，贵金属行业指数代表上市公司股票',
  },
];

export const FRED_SERIES = [
  { series: 'DGS10', id: 'rate:US.DGS10', name: '美债10年', assetClass: 'rate', unit: '%' },
  { series: 'DGS2', id: 'rate:US.DGS2', name: '美债2年', assetClass: 'rate', unit: '%' },
  {
    series: 'DCOILWTICO',
    id: 'comm:FRED.WTI',
    name: 'WTI原油现货',
    assetClass: 'commodity',
    unit: '美元/桶',
  },
  {
    series: 'DCOILBRENTEU',
    id: 'comm:FRED.BRENT',
    name: '布伦特原油现货',
    assetClass: 'commodity',
    unit: '美元/桶',
  },
  {
    series: 'DTWEXBGS',
    id: 'fx:FRED.DTWEXBGS',
    name: '广义贸易加权美元指数',
    assetClass: 'fx',
    unit: '点',
  },
  {
    series: 'SP500',
    id: 'global:US.SP500',
    name: '标普500',
    assetClass: 'global_index',
    unit: '点',
  },
  {
    series: 'NASDAQCOM',
    id: 'global:US.NASDAQCOM',
    name: '纳斯达克综合',
    assetClass: 'global_index',
    unit: '点',
  },
] as const;
