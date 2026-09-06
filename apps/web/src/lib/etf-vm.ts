import { readStoredJson, writeStoredJson } from './stored-json';

export const ETF_LENSES = ['browse', 'allocation', 'liquidity', 'cost', 'risk', 'picks'] as const;
export type EtfLens = (typeof ETF_LENSES)[number];

export const ETF_LENS_LABEL: Record<EtfLens, string> = {
  browse: 'ETF浏览',
  allocation: '资产配置',
  liquidity: '交易质量',
  cost: '成本规模',
  risk: '收益风险',
  picks: '条件精选',
};

export const ETF_LENS_DESCRIPTIONS: Record<EtfLens, string> = {
  browse: '全市场 ETF 目录、行情快照与披露规模，带行内走势曲线。',
  allocation: '按资产类别与分类方向分组，比较资产规模与净值收益回撤。',
  liquidity: '关注成交额、20日均成交额与同日收盘真实折溢价，评估场内流动性。',
  cost: '管理费、托管费与合计持续费率，结合最新披露资产规模评估持有成本。',
  risk: '1年/3年/5年几何年化收益 CAGR、最大回撤与年化波动率（基于真实总回报）。',
  picks: '硬条件交集精选：费率上限、规模下限、最大回撤与成交额门槛，不设黑箱推荐分。',
};

export interface EtfSearchState {
  q: string;
  category: string; // '境内权益' | '境外权益' | '固收' | '货币' | '其他' | '待核验' | 'all'
  theme: string; // '宽基' | '红利低波' | '行业主题' | '固收货币' | '跨境海外' | '其他' | 'all'
  years: '1' | '3' | '5';
  hasBars: boolean;
  // 精选数值条件：支持显式关闭 (false)
  maxFeeEnabled: boolean;
  maxFee: number;
  minScaleEnabled: boolean;
  minScale: number;
  maxDrawdownEnabled: boolean;
  maxDrawdown: number;
  minTurnoverEnabled: boolean;
  minTurnover: number;
  sort: string;
  order: 'asc' | 'desc';
  page: number;
}

export const DEFAULT_ETF_STATE: EtfSearchState = {
  q: '',
  category: '境内权益', // 选 ETF 视角默认境内权益，浏览默认全部
  theme: 'all',
  years: '1',
  hasBars: false,
  maxFeeEnabled: true,
  maxFee: 0.6,
  minScaleEnabled: true,
  minScale: 2.0,
  maxDrawdownEnabled: true,
  maxDrawdown: 35.0,
  minTurnoverEnabled: true,
  minTurnover: 10000000,
  sort: '',
  order: 'asc',
  page: 1,
};

export function parseEtfSearch(search: string, lens: EtfLens = 'browse'): EtfSearchState {
  const p = new URLSearchParams(search);
  const q = p.get('q') ?? '';
  const defaultCategory = lens === 'browse' ? 'all' : '境内权益';
  const category = p.get('category') ?? defaultCategory;
  const theme = p.get('theme') ?? 'all';
  const rawYears = p.get('years');
  const years = rawYears === '3' ? '3' : rawYears === '5' ? '5' : '1';
  const hasBars = p.get('hasBars') === 'true';

  // 精选门槛开闭与数值解析
  const maxFeeEnabled = p.get('feeOn') !== null ? p.get('feeOn') === '1' : true;
  const rawMaxFee = Number(p.get('maxFee'));
  const maxFee = Number.isFinite(rawMaxFee) && rawMaxFee > 0 ? rawMaxFee : 0.6;

  const minScaleEnabled = p.get('scaleOn') !== null ? p.get('scaleOn') === '1' : true;
  const rawMinScale = Number(p.get('minScale'));
  const minScale = Number.isFinite(rawMinScale) && rawMinScale > 0 ? rawMinScale : 2.0;

  const maxDrawdownEnabled = p.get('ddOn') !== null ? p.get('ddOn') === '1' : true;
  const rawMaxDrawdown = Number(p.get('maxDrawdown'));
  const maxDrawdown = Number.isFinite(rawMaxDrawdown) && rawMaxDrawdown > 0 ? rawMaxDrawdown : 35.0;

  const minTurnoverEnabled = p.get('toOn') !== null ? p.get('toOn') === '1' : true;
  const rawMinTurnover = Number(p.get('minTurnover'));
  const minTurnover =
    Number.isFinite(rawMinTurnover) && rawMinTurnover > 0 ? rawMinTurnover : 10000000;

  let defaultSort = 'ticker';
  let defaultOrder: 'asc' | 'desc' = 'asc';
  if (lens === 'allocation') {
    defaultSort = 'scale';
    defaultOrder = 'desc';
  } else if (lens === 'liquidity') {
    defaultSort = 'avgTurnover20d';
    defaultOrder = 'desc';
  } else if (lens === 'cost') {
    defaultSort = 'fee';
    defaultOrder = 'asc';
  } else if (lens === 'risk') {
    defaultSort = 'maxDrawdown';
    defaultOrder = 'asc';
  } else if (lens === 'picks') {
    defaultSort = 'scale';
    defaultOrder = 'desc';
  }

  const sort = p.get('sort') ?? defaultSort;
  const order = (p.get('order') as 'asc' | 'desc') ?? defaultOrder;
  const page = Math.max(1, Number(p.get('page')) || 1);

  return {
    q,
    category,
    theme,
    years,
    hasBars,
    maxFeeEnabled,
    maxFee,
    minScaleEnabled,
    minScale,
    maxDrawdownEnabled,
    maxDrawdown,
    minTurnoverEnabled,
    minTurnover,
    sort,
    order,
    page,
  };
}

export function etfUrlSearch(state: EtfSearchState, lens: EtfLens = 'browse'): string {
  const p = new URLSearchParams();
  if (state.q.trim()) p.set('q', state.q.trim());
  const defaultCategory = lens === 'browse' ? 'all' : '境内权益';
  if (state.category !== defaultCategory) p.set('category', state.category);
  if (state.theme !== 'all') p.set('theme', state.theme);
  if (state.years !== '1') p.set('years', state.years);
  if (state.hasBars) p.set('hasBars', 'true');

  if (lens === 'picks') {
    if (!state.maxFeeEnabled) p.set('feeOn', '0');
    else if (state.maxFee !== 0.6) p.set('maxFee', String(state.maxFee));

    if (!state.minScaleEnabled) p.set('scaleOn', '0');
    else if (state.minScale !== 2.0) p.set('minScale', String(state.minScale));

    if (!state.maxDrawdownEnabled) p.set('ddOn', '0');
    else if (state.maxDrawdown !== 35.0) p.set('maxDrawdown', String(state.maxDrawdown));

    if (!state.minTurnoverEnabled) p.set('toOn', '0');
    else if (state.minTurnover !== 10000000) p.set('minTurnover', String(state.minTurnover));
  }

  if (state.sort && state.sort !== 'ticker') p.set('sort', state.sort);
  if (state.order) p.set('order', state.order);
  if (state.page > 1) p.set('page', String(state.page));

  const s = p.toString();
  return s ? `?${s}` : '';
}

export function storeEtfFilters(lens: EtfLens, state: EtfSearchState): void {
  writeStoredJson(`fundly_etf_filters_${lens}`, state);
}

export function readStoredEtfFilters(lens: EtfLens): EtfSearchState | null {
  const data = readStoredJson(`fundly_etf_filters_${lens}`);
  if (!data || typeof data !== 'object') return null;
  return data as EtfSearchState;
}
