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
  rankPct?: string;
};

const DIMS: Record<SelectLens, readonly SelectDim[]> = {
  return: [
    {
      key: 'return_1y',
      label: '近1年',
      kind: 'percent',
      dir: 'desc',
      signed: true,
      rankPct: 'rank_pct_1y',
    },
    {
      key: 'return_6m',
      label: '近6月',
      kind: 'percent',
      dir: 'desc',
      signed: true,
      rankPct: 'rank_pct_6m',
    },
    {
      key: 'return_3m',
      label: '近3月',
      kind: 'percent',
      dir: 'desc',
      signed: true,
      rankPct: 'rank_pct_3m',
    },
    {
      key: 'return_1m',
      label: '近1月',
      kind: 'percent',
      dir: 'desc',
      signed: true,
      rankPct: 'rank_pct_1m',
    },
    { key: 'excess_hs300_1y', label: '超额沪深300', kind: 'percent', dir: 'desc', signed: true },
    { key: 'seven_day_yield', label: '七日年化', kind: 'percent', dir: 'desc', signed: false },
  ],
  risk: [
    { key: 'max_drawdown_1y', label: '回撤1年', kind: 'percent', dir: 'asc', signed: false },
    { key: 'max_drawdown_3y', label: '回撤3年', kind: 'percent', dir: 'asc', signed: false },
    { key: 'max_drawdown_5y', label: '回撤5年', kind: 'percent', dir: 'asc', signed: false },
    { key: 'max_drawdown_all', label: '回撤全期', kind: 'percent', dir: 'asc', signed: false },
    { key: 'volatility_1y', label: '波动1年', kind: 'percent', dir: 'asc', signed: false },
    { key: 'volatility_3y', label: '波动3年', kind: 'percent', dir: 'asc', signed: false },
    { key: 'volatility_5y', label: '波动5年', kind: 'percent', dir: 'asc', signed: false },
    { key: 'sharpe_1y', label: '夏普1年', kind: 'ratio', dir: 'desc', signed: false },
    { key: 'sharpe_3y', label: '夏普3年', kind: 'ratio', dir: 'desc', signed: false },
    { key: 'sharpe_5y', label: '夏普5年', kind: 'ratio', dir: 'desc', signed: false },
    { key: 'sortino_1y', label: '索提诺1年', kind: 'ratio', dir: 'desc', signed: false },
    { key: 'sortino_3y', label: '索提诺3年', kind: 'ratio', dir: 'desc', signed: false },
    { key: 'calmar_1y', label: '卡玛1年', kind: 'ratio', dir: 'desc', signed: false },
    { key: 'calmar_3y', label: '卡玛3年', kind: 'ratio', dir: 'desc', signed: false },
  ],
  hold: [
    { key: 'ulcer_1y', label: '溃疡1年', kind: 'percent', dir: 'asc', signed: false },
    { key: 'underwater_ratio_1y', label: '水下占比', kind: 'percent', dir: 'asc', signed: false },
    { key: 'max_underwater_days_1y', label: '最长水下', kind: 'count', dir: 'asc', signed: false },
    { key: 'max_consec_down_1y', label: '最长连跌', kind: 'count', dir: 'asc', signed: false },
    { key: 'down_day_ratio_1y', label: '下跌日占比', kind: 'percent', dir: 'asc', signed: false },
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
    {
      key: 'return_1y',
      label: '近1年',
      kind: 'percent',
      dir: 'desc',
      signed: true,
      rankPct: 'rank_pct_1y',
    },
    { key: 'scale_yi', label: '规模', kind: 'scale', dir: 'asc', signed: false },
    { key: 'top10_weight_pct', label: '前十大', kind: 'percent', dir: 'asc', signed: false },
    { key: 'equity_ratio_pct', label: '股票仓位', kind: 'percent', dir: 'desc', signed: false },
    { key: 'inst_holder_pct', label: '机构占比', kind: 'percent', dir: 'desc', signed: false },
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

export function isMoneyTypeL1(typeL1: string): boolean {
  return typeL1.startsWith('货币');
}

export function dimsFor(lens: SelectLens, typeL1 = ''): readonly SelectDim[] {
  if (lens === 'return' && isMoneyTypeL1(typeL1)) {
    return DIMS.return.filter((item) => item.key === 'seven_day_yield');
  }
  if (lens === 'return') {
    return DIMS.return.filter((item) => item.key !== 'seven_day_yield');
  }
  return DIMS[lens];
}

export function defaultDim(lens: SelectLens, typeL1 = ''): SelectDim {
  return dimsFor(lens, typeL1)[0] as SelectDim;
}

export type SelectState = {
  typeL1: string;
  typeL2: string;
  dim: SelectDim;
  pass4433: boolean;
  page: number;
  mvpOnly: boolean;
  minSamples: number | null;
  feePeer: number | null;
  ddPeer: number | null;
  scalePeer: number | null;
  top10Max: number | null;
  q: string;
};

function parsePage(raw: string | null): number {
  const page = Number(raw ?? 1);
  return Number.isFinite(page) && page >= 1 ? Math.min(100_000, Math.floor(page)) : 1;
}

function parsePeer(raw: string | null, fallback: number | null): number | null {
  if (raw === 'off') return null;
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > 100) return fallback;
  return Math.floor(n);
}

function parseTop10(raw: string | null): number | null {
  if (raw == null || raw === '' || raw === 'off') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function defaultMinSamples(lens: SelectLens): number | null {
  return lens === 'risk' || lens === 'hold' || lens === 'picks' ? RISK_MIN_SAMPLES : null;
}

export function parseSelectSearch(params: URLSearchParams, lens: SelectLens): SelectState {
  const typeL1 = params.get('typeL1')?.trim() || DEFAULT_TYPE_L1;
  const dims = dimsFor(lens, typeL1);
  const dimKey = params.get('dim');
  const dim = dims.find((item) => item.key === dimKey) ?? defaultDim(lens, typeL1);
  const samplesRaw = params.get('minSamples');
  let minSamples = defaultMinSamples(lens);
  if (samplesRaw === 'off') minSamples = null;
  else if (samplesRaw) {
    const n = Number(samplesRaw);
    if (Number.isFinite(n) && n >= 1) minSamples = Math.min(10_000, Math.floor(n));
  }
  return {
    typeL1,
    typeL2: params.get('typeL2')?.trim() ?? '',
    dim,
    pass4433: lens === 'picks' ? params.get('pass4433') !== 'off' : params.get('pass4433') === '1',
    page: parsePage(params.get('page')),
    mvpOnly: params.get('mvpOnly') === '1',
    q: params.get('q')?.trim() ?? '',
    minSamples,
    feePeer: lens === 'picks' ? parsePeer(params.get('feePeer'), 50) : null,
    ddPeer: lens === 'picks' ? parsePeer(params.get('ddPeer'), 50) : null,
    scalePeer: lens === 'picks' ? parsePeer(params.get('scalePeer'), null) : null,
    top10Max: lens === 'picks' ? parseTop10(params.get('top10Max')) : null,
  };
}

export function normalizeSelectState(
  state: SelectState,
  types: Array<{ fund_type: string; n: number }>,
  lens: SelectLens = 'return',
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
  const dim =
    dimsFor(lens, typeL1).find((item) => item.key === state.dim?.key) ?? defaultDim(lens, typeL1);
  return { ...state, typeL1, typeL2, dim, page: Math.floor(state.page) };
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
  if (state.q) params.set('q', state.q);
  if (state.mvpOnly) params.set('mvpOnly', '1');
  if (state.pass4433) params.set('pass4433', '1');
  if (lens === 'picks' && !state.pass4433) params.set('pass4433', 'off');
  if (state.minSamples != null) params.set('minSamples', String(state.minSamples));
  else if (lens === 'risk' || lens === 'hold' || lens === 'picks') params.set('minSamples', 'off');
  if (lens === 'picks') {
    params.set('lens', 'picks');
    params.set('feePeer', state.feePeer == null ? 'off' : String(state.feePeer));
    params.set('ddPeer', state.ddPeer == null ? 'off' : String(state.ddPeer));
    if (state.scalePeer != null) params.set('scalePeer', String(state.scalePeer));
    if (state.top10Max != null) params.set('top10Max', String(state.top10Max));
  }
  return `/api/funds?${params}`;
}

export function selectUrlState(
  state: SelectState,
  lens: SelectLens,
): Record<string, string | null> {
  return {
    typeL1: state.typeL1 === DEFAULT_TYPE_L1 ? null : state.typeL1,
    typeL2: state.typeL2 || null,
    q: state.q || null,
    dim: state.dim.key === defaultDim(lens, state.typeL1).key ? null : state.dim.key,
    pass4433: lens === 'picks' ? (state.pass4433 ? null : 'off') : state.pass4433 ? '1' : null,
    page: state.page <= 1 ? null : String(state.page),
    mvpOnly: state.mvpOnly ? '1' : null,
    minSamples:
      state.minSamples == null && defaultMinSamples(lens) != null
        ? 'off'
        : state.minSamples != null && state.minSamples !== defaultMinSamples(lens)
          ? String(state.minSamples)
          : null,
    feePeer:
      lens === 'picks'
        ? state.feePeer == null
          ? 'off'
          : state.feePeer === 50
            ? null
            : String(state.feePeer)
        : null,
    ddPeer:
      lens === 'picks'
        ? state.ddPeer == null
          ? 'off'
          : state.ddPeer === 50
            ? null
            : String(state.ddPeer)
        : null,
    scalePeer: lens === 'picks' && state.scalePeer != null ? String(state.scalePeer) : null,
    top10Max: lens === 'picks' && state.top10Max != null ? String(state.top10Max) : null,
  };
}

export function selectSearchEmpty(params: URLSearchParams): boolean {
  return [...params.keys()].length === 0;
}

export function selectSearchDirty(
  params: URLSearchParams,
  state: SelectState,
  lens: SelectLens,
): boolean {
  const want = selectUrlState(state, lens);
  for (const [key, expected] of Object.entries(want)) {
    const actual = params.get(key);
    if (expected == null) {
      if (actual != null) return true;
    } else if (actual !== expected) return true;
  }
  for (const key of params.keys()) {
    if (!(key in want)) return true;
  }
  return false;
}

export function storageKey(lens: SelectLens): string {
  return `fundly_select_${lens}`;
}

export function parseStoredSelect(raw: unknown, lens: SelectLens): Partial<SelectState> {
  if (!raw || typeof raw !== 'object') return {};
  const rec = raw as Record<string, unknown>;
  const typeL1 = typeof rec.typeL1 === 'string' ? rec.typeL1 : undefined;
  const dimKey = typeof rec.dim === 'string' ? rec.dim : undefined;
  const dim = dimKey ? dimsFor(lens, typeL1 ?? '').find((item) => item.key === dimKey) : undefined;
  const page = Number(rec.page ?? 1);
  return {
    typeL1,
    typeL2: typeof rec.typeL2 === 'string' ? rec.typeL2 : undefined,
    dim,
    pass4433: rec.pass4433 === true || rec.pass4433 === '1',
    page: Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1,
    mvpOnly: rec.mvpOnly === true || rec.mvpOnly === '1',
    minSamples:
      typeof rec.minSamples === 'number'
        ? rec.minSamples
        : rec.minSamples === 'off'
          ? null
          : undefined,
    feePeer:
      typeof rec.feePeer === 'number' ? rec.feePeer : rec.feePeer === 'off' ? null : undefined,
    ddPeer: typeof rec.ddPeer === 'number' ? rec.ddPeer : rec.ddPeer === 'off' ? null : undefined,
    scalePeer: typeof rec.scalePeer === 'number' ? rec.scalePeer : undefined,
    top10Max: typeof rec.top10Max === 'number' ? rec.top10Max : undefined,
    q: typeof rec.q === 'string' ? rec.q : undefined,
  };
}

export function readStoredSelect(lens: SelectLens): Partial<SelectState> {
  migrateLegacyRanking();
  return parseStoredSelect(readStoredJson(storageKey(lens)), lens);
}

export function writeStoredSelect(lens: SelectLens, state: SelectState): void {
  writeStoredJson(storageKey(lens), {
    typeL1: state.typeL1,
    typeL2: state.typeL2,
    dim: state.dim.key,
    pass4433: state.pass4433,
    page: state.page,
    mvpOnly: state.mvpOnly,
    minSamples: state.minSamples,
    feePeer: state.feePeer,
    ddPeer: state.ddPeer,
    scalePeer: state.scalePeer,
    top10Max: state.top10Max,
    q: state.q,
  });
}

function migrateLegacyRanking(): void {
  const legacy = readStoredJson(RANKING_FILTERS_KEY) as { dim?: string; pass4433?: unknown } | null;
  if (!legacy) return;
  const target: SelectLens =
    typeof legacy.dim === 'string' && RANKING_RISK_DIMS.has(legacy.dim) ? 'risk' : 'return';
  if (!readStoredJson(storageKey(target))) {
    writeStoredJson(storageKey(target), {
      ...legacy,
      pass4433: legacy.pass4433 === true || legacy.pass4433 === '1',
    });
  }
  if (typeof localStorage !== 'undefined') localStorage.removeItem(RANKING_FILTERS_KEY);
}

const RANKING_RETURN_DIMS = new Set(['return_1m', 'return_3m', 'return_6m', 'return_1y']);
const RANKING_RISK_DIMS = new Set(['sharpe_1y', 'max_drawdown_1y', 'volatility_1y', 'calmar_1y']);

export function rankingRedirectPath(search: string): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const dim = params.get('dim') ?? '';
  const lens = RANKING_RISK_DIMS.has(dim) ? 'risk' : 'return';
  if (dim && !RANKING_RETURN_DIMS.has(dim) && !RANKING_RISK_DIMS.has(dim)) params.delete('dim');
  const q = params.toString();
  return q ? `/select/${lens}?${q}` : `/select/${lens}`;
}
