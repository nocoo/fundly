import type { NumberKind } from './format-number';
import { listTypeL1, listTypeL2 } from './fund-type';

export const RANKING_PAGE_SIZE = 50;
export const DEFAULT_TYPE_L1 = '混合型';
export const TYPE_L1_ALL = 'all';
export const RISK_MIN_SAMPLES = 200;
export const DEFAULT_DIM_KEY = 'return_1y';

export type RankDimKey =
  | 'return_1m'
  | 'return_3m'
  | 'return_6m'
  | 'return_1y'
  | 'sharpe_1y'
  | 'max_drawdown_1y'
  | 'volatility_1y'
  | 'calmar_1y';

export type RankPctKey = 'rank_pct_1m' | 'rank_pct_3m' | 'rank_pct_6m' | 'rank_pct_1y';

export type RankDim = {
  key: RankDimKey;
  label: string;
  kind: NumberKind;
  dir: 'asc' | 'desc';
  signed: boolean;
  group: 'return' | 'risk';
  rankPct: RankPctKey | null;
};

export const RANK_DIMS: readonly RankDim[] = [
  {
    key: 'return_1m',
    label: '近1月',
    kind: 'percent',
    dir: 'desc',
    signed: true,
    group: 'return',
    rankPct: 'rank_pct_1m',
  },
  {
    key: 'return_3m',
    label: '近3月',
    kind: 'percent',
    dir: 'desc',
    signed: true,
    group: 'return',
    rankPct: 'rank_pct_3m',
  },
  {
    key: 'return_6m',
    label: '近6月',
    kind: 'percent',
    dir: 'desc',
    signed: true,
    group: 'return',
    rankPct: 'rank_pct_6m',
  },
  {
    key: 'return_1y',
    label: '近1年',
    kind: 'percent',
    dir: 'desc',
    signed: true,
    group: 'return',
    rankPct: 'rank_pct_1y',
  },
  {
    key: 'sharpe_1y',
    label: '夏普1年',
    kind: 'ratio',
    dir: 'desc',
    signed: false,
    group: 'risk',
    rankPct: null,
  },
  {
    key: 'max_drawdown_1y',
    label: '回撤1年',
    kind: 'percent',
    dir: 'asc',
    signed: false,
    group: 'risk',
    rankPct: null,
  },
  {
    key: 'volatility_1y',
    label: '波动1年',
    kind: 'percent',
    dir: 'asc',
    signed: false,
    group: 'risk',
    rankPct: null,
  },
  {
    key: 'calmar_1y',
    label: '卡玛1年',
    kind: 'ratio',
    dir: 'desc',
    signed: false,
    group: 'risk',
    rankPct: null,
  },
];

const DIM_BY_KEY = new Map<string, RankDim>(RANK_DIMS.map((dim) => [dim.key, dim]));

function requiredDim(key: RankDimKey): RankDim {
  const dim = DIM_BY_KEY.get(key);
  if (!dim) throw new Error(`missing rank dim ${key}`);
  return dim;
}

const FALLBACK_DIM = requiredDim(DEFAULT_DIM_KEY);

export function dimByKey(key: string | null | undefined): RankDim {
  return (key ? DIM_BY_KEY.get(key) : undefined) ?? FALLBACK_DIM;
}

export function visibleDims(riskKeys: Iterable<string> = []): RankDim[] {
  const extra = new Set(riskKeys);
  return RANK_DIMS.filter((dim) => dim.group === 'return' || extra.has(dim.key));
}

export function riskKeysFromCaps(
  caps: { risk?: boolean; riskDims?: Record<string, boolean> } | undefined,
): string[] | 'unknown' {
  if (!caps) return 'unknown';
  if (caps.riskDims) {
    return Object.entries(caps.riskDims)
      .filter(([, on]) => on)
      .map(([key]) => key);
  }
  return caps.risk ? RANK_DIMS.filter((dim) => dim.group === 'risk').map((dim) => dim.key) : [];
}

export type RankingState = {
  typeL1: string;
  typeL2: string;
  dim: RankDim;
  pass4433: boolean;
  page: number;
};

export function parseRankingSearch(params: URLSearchParams): RankingState {
  const typeL1Raw = params.get('typeL1');
  const typeL1 = typeL1Raw === TYPE_L1_ALL ? TYPE_L1_ALL : typeL1Raw?.trim() || DEFAULT_TYPE_L1;
  const rawPage = Number(params.get('page') ?? 1);
  const page =
    Number.isFinite(rawPage) && rawPage >= 1 ? Math.min(100_000, Math.floor(rawPage)) : 1;
  return {
    typeL1,
    typeL2: params.get('typeL2')?.trim() ?? '',
    dim: dimByKey(params.get('dim')),
    pass4433: params.get('pass4433') === '1',
    page,
  };
}

export function normalizeRankingState(
  state: RankingState,
  types: Array<{ fund_type: string; n: number }>,
  riskKeys: Iterable<string> | 'unknown' = 'unknown',
): RankingState {
  const extra = riskKeys === 'unknown' ? null : new Set(riskKeys);
  const dim =
    state.dim.group === 'risk' && extra && !extra.has(state.dim.key)
      ? dimByKey(DEFAULT_DIM_KEY)
      : state.dim;
  let typeL1 = state.typeL1;
  if (typeL1 !== TYPE_L1_ALL && types.length > 0) {
    if (!listTypeL1(types).some((item) => item.value === typeL1)) typeL1 = DEFAULT_TYPE_L1;
  }
  let typeL2 = state.typeL2;
  if (typeL1 === TYPE_L1_ALL || !typeL2) {
    typeL2 = '';
  } else if (types.length > 0 && !listTypeL2(types, typeL1).some((item) => item.value === typeL2)) {
    typeL2 = '';
  }
  return { ...state, typeL1, dim, typeL2 };
}

export function rankingStatesEqual(a: RankingState, b: RankingState): boolean {
  return (
    a.typeL1 === b.typeL1 &&
    a.typeL2 === b.typeL2 &&
    a.dim.key === b.dim.key &&
    a.pass4433 === b.pass4433 &&
    a.page === b.page
  );
}

export function rankingUrlState(state: RankingState): Record<string, string | null> {
  return {
    typeL1: state.typeL1 === DEFAULT_TYPE_L1 ? null : state.typeL1,
    typeL2: state.typeL2 || null,
    dim: state.dim.key === DEFAULT_DIM_KEY ? null : state.dim.key,
    pass4433: state.pass4433 ? '1' : null,
    page: state.page <= 1 ? null : String(state.page),
  };
}

export function rankingSearchDirty(params: URLSearchParams, state: RankingState): boolean {
  const want = rankingUrlState(state);
  for (const [key, expected] of Object.entries(want)) {
    const actual = params.get(key);
    if (expected == null) {
      if (actual != null) return true;
    } else if (actual !== expected) return true;
  }
  return false;
}

export function rankingApiPath(state: RankingState): string {
  const params = new URLSearchParams();
  if (state.typeL1 !== TYPE_L1_ALL) params.set('typeL1', state.typeL1);
  if (state.typeL2) params.set('typeL2', state.typeL2);
  params.set('sort', state.dim.key);
  params.set('dir', state.dim.dir);
  params.set('metricNotNull', '1');
  if (state.pass4433) params.set('pass4433', '1');
  if (state.dim.group === 'risk') params.set('minSamples', String(RISK_MIN_SAMPLES));
  params.set('includeCaps', '1');
  params.set('page', String(state.page));
  params.set('pageSize', String(RANKING_PAGE_SIZE));
  return `/api/funds?${params}`;
}

export function listRank(page: number, pageSize: number, index: number): number {
  return (page - 1) * pageSize + index + 1;
}

export function contextReturnKeys(dim: RankDim): Array<'return_1y' | 'return_1m'> {
  const keys: Array<'return_1y' | 'return_1m'> = [];
  if (dim.key !== 'return_1y') keys.push('return_1y');
  if (dim.key !== 'return_1m') keys.push('return_1m');
  return keys;
}
