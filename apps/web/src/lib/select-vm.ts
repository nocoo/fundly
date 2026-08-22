import type { NumberKind } from './format-number';
import { listTypeL1, listTypeL2 } from './fund-type';
import { DEFAULT_TYPE_L1, RANKING_FILTERS_KEY, TYPE_L1_ALL } from './ranking-vm';
import { readStoredJson, writeStoredJson } from './stored-json';

export const SELECT_PAGE_SIZE = 50;
export const RISK_MIN_SAMPLES = 200;

export type SelectLens = 'return' | 'risk' | 'hold' | 'dca' | 'cost' | 'picks';

export type SelectDim = {
  key: string;
  label: string;
  kind: NumberKind;
  dir: 'asc' | 'desc';
  signed: boolean;
};

const DIMS: Record<SelectLens, readonly SelectDim[]> = {
  return: [
    { key: 'return_1y', label: '近1年', kind: 'percent', dir: 'desc', signed: true },
    { key: 'return_6m', label: '近6月', kind: 'percent', dir: 'desc', signed: true },
    { key: 'return_3m', label: '近3月', kind: 'percent', dir: 'desc', signed: true },
    { key: 'return_1m', label: '近1月', kind: 'percent', dir: 'desc', signed: true },
    { key: 'excess_hs300_1y', label: '超额沪深300', kind: 'percent', dir: 'desc', signed: true },
  ],
  risk: [
    { key: 'max_drawdown_1y', label: '回撤1年', kind: 'percent', dir: 'asc', signed: false },
    { key: 'volatility_1y', label: '波动1年', kind: 'percent', dir: 'asc', signed: false },
    { key: 'sharpe_1y', label: '夏普1年', kind: 'ratio', dir: 'desc', signed: false },
    { key: 'calmar_1y', label: '卡玛1年', kind: 'ratio', dir: 'desc', signed: false },
  ],
  hold: [
    { key: 'ulcer_1y', label: '溃疡1年', kind: 'percent', dir: 'asc', signed: false },
    { key: 'underwater_ratio_1y', label: '水下占比', kind: 'percent', dir: 'asc', signed: false },
    { key: 'worst_month_1y', label: '最差月', kind: 'percent', dir: 'desc', signed: true },
    { key: 'recovery_days_1y', label: '收复天数', kind: 'count', dir: 'asc', signed: false },
  ],
  dca: [
    { key: 'dca_cagr_3y', label: '定投年化', kind: 'percent', dir: 'desc', signed: true },
    { key: 'dca_vs_lump_3y', label: '相对一次', kind: 'percent', dir: 'desc', signed: true },
    { key: 'dca_month_win_3y', label: '月胜率', kind: 'percent', dir: 'desc', signed: false },
    { key: 'dca_month_vol_3y', label: '月波动', kind: 'percent', dir: 'asc', signed: false },
  ],
  cost: [{ key: 'all_in_fee_pct', label: '综合费', kind: 'percent', dir: 'asc', signed: false }],
  picks: [
    { key: 'select_score', label: '综合分', kind: 'ratio', dir: 'desc', signed: false },
    { key: 'return_1y', label: '近1年', kind: 'percent', dir: 'desc', signed: true },
    { key: 'scale_yi', label: '规模', kind: 'scale', dir: 'asc', signed: false },
  ],
};

export const LENS_LABEL: Record<SelectLens, string> = {
  return: '收益',
  risk: '风险',
  hold: '持有体验',
  dca: '定投',
  cost: '成本',
  picks: '精选',
};

export function isSelectLens(value: string): value is SelectLens {
  return Object.hasOwn(DIMS, value);
}

export function dimsFor(lens: SelectLens): readonly SelectDim[] {
  return DIMS[lens];
}

export function defaultDim(lens: SelectLens): SelectDim {
  return DIMS[lens][0] as SelectDim;
}

export type SelectState = {
  typeL1: string;
  typeL2: string;
  dim: SelectDim;
  pass4433: boolean;
  page: number;
};

export function parseSelectSearch(params: URLSearchParams, lens: SelectLens): SelectState {
  const dims = dimsFor(lens);
  const dimKey = params.get('dim');
  const dim = dims.find((item) => item.key === dimKey) ?? defaultDim(lens);
  return {
    typeL1: params.get('typeL1')?.trim() || DEFAULT_TYPE_L1,
    typeL2: params.get('typeL2')?.trim() ?? '',
    dim,
    pass4433: params.get('pass4433') === '1',
    page: Math.max(1, Number(params.get('page')) || 1),
  };
}

export function normalizeSelectState(
  state: SelectState,
  types: Array<{ fund_type: string; n: number }>,
): SelectState {
  const l1s = listTypeL1(types);
  let typeL1 = state.typeL1;
  if (typeL1 !== TYPE_L1_ALL && l1s.length > 0 && !l1s.some((item) => item.value === typeL1)) {
    typeL1 = DEFAULT_TYPE_L1;
  }
  let typeL2 = state.typeL2;
  if (typeL1 === TYPE_L1_ALL || !typeL2) typeL2 = '';
  else if (types.length > 0 && !listTypeL2(types, typeL1).some((item) => item.value === typeL2)) {
    typeL2 = '';
  }
  return { ...state, typeL1, typeL2 };
}

export function selectApiPath(lens: SelectLens, state: SelectState): string {
  const params = new URLSearchParams();
  if (state.typeL1 && state.typeL1 !== TYPE_L1_ALL) params.set('typeL1', state.typeL1);
  if (state.typeL1 === TYPE_L1_ALL) params.set('typeL1', 'all');
  if (state.typeL2) params.set('typeL2', state.typeL2);
  params.set('sort', state.dim.key);
  params.set('dir', state.dim.dir);
  params.set('page', String(state.page));
  params.set('pageSize', String(SELECT_PAGE_SIZE));
  params.set('metricNotNull', '1');
  params.set('includeCaps', '1');
  if (state.pass4433) params.set('pass4433', '1');
  if (lens === 'risk' || lens === 'hold' || lens === 'picks') {
    params.set('minSamples', String(RISK_MIN_SAMPLES));
  }
  if (lens === 'picks') {
    params.set('lens', 'picks');
    if (state.pass4433 !== false) params.set('pass4433', '1');
    params.set('feePeer', '50');
    params.set('ddPeer', '50');
  }
  return `/api/funds?${params}`;
}

export function selectUrlState(state: SelectState, lens: SelectLens): URLSearchParams {
  const params = new URLSearchParams();
  if (state.typeL1 !== DEFAULT_TYPE_L1) params.set('typeL1', state.typeL1);
  if (state.typeL2) params.set('typeL2', state.typeL2);
  if (state.dim.key !== defaultDim(lens).key) params.set('dim', state.dim.key);
  if (state.pass4433) params.set('pass4433', '1');
  if (state.page > 1) params.set('page', String(state.page));
  return params;
}

export function storageKey(lens: SelectLens): string {
  return `fundly_select_${lens}`;
}

export function readStoredSelect(lens: SelectLens): Partial<SelectState> {
  migrateLegacyRanking(lens);
  return readStoredJson(storageKey(lens)) ?? {};
}

export function writeStoredSelect(lens: SelectLens, state: SelectState): void {
  writeStoredJson(storageKey(lens), {
    typeL1: state.typeL1,
    typeL2: state.typeL2,
    dim: state.dim.key,
    pass4433: state.pass4433,
    page: state.page,
  });
}

function migrateLegacyRanking(lens: SelectLens): void {
  const legacy = readStoredJson(RANKING_FILTERS_KEY) as { dim?: string } | null;
  if (!legacy) return;
  const target: SelectLens =
    typeof legacy.dim === 'string' && /sharpe|drawdown|volatility|calmar/.test(legacy.dim)
      ? 'risk'
      : 'return';
  if (lens === target) writeStoredJson(storageKey(lens), legacy);
  if (typeof localStorage !== 'undefined') localStorage.removeItem(RANKING_FILTERS_KEY);
}

export function rankingRedirectPath(search: string): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const dim = params.get('dim') ?? '';
  const lens = /sharpe|drawdown|volatility|calmar/.test(dim) ? 'risk' : 'return';
  if (dim && !/return_|sharpe|drawdown|volatility|calmar/.test(dim)) params.delete('dim');
  const q = params.toString();
  return q ? `/select/${lens}?${q}` : `/select/${lens}`;
}
