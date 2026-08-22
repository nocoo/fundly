import { readStoredJson, writeStoredJson } from './stored-json';

export const FUNDS_FILTERS_KEY = 'fundly_funds_filters';

export const FUNDS_SORTS = [
  'fund_code',
  'fund_name',
  'fund_type',
  'return_1y',
  'return_1m',
  'return_3m',
  'return_6m',
] as const;

export type FundsSort = (typeof FUNDS_SORTS)[number];

export type FundsFilters = {
  q: string;
  typeL1: string;
  typeL2: string;
  mvpOnly: boolean;
  hasNav: boolean;
  sort: FundsSort;
  dir: 'asc' | 'desc';
  page: number;
};

export const DEFAULT_FUNDS_FILTERS: FundsFilters = {
  q: '',
  typeL1: '',
  typeL2: '',
  mvpOnly: false,
  hasNav: false,
  sort: 'fund_code',
  dir: 'asc',
  page: 1,
};

function parsePage(raw: string | null): number {
  const page = Number(raw ?? 1);
  return Number.isFinite(page) && page >= 1 ? Math.min(100_000, Math.floor(page)) : 1;
}

function parseSort(raw: string | null): FundsSort {
  return (FUNDS_SORTS as readonly string[]).includes(raw ?? '') ? (raw as FundsSort) : 'fund_code';
}

export function parseFundsSearch(params: URLSearchParams): FundsFilters {
  return {
    q: params.get('q')?.trim() ?? '',
    typeL1: params.get('typeL1')?.trim() ?? '',
    typeL2: params.get('typeL2')?.trim() ?? '',
    mvpOnly: params.get('mvpOnly') === '1',
    hasNav: params.get('hasNav') === '1',
    sort: parseSort(params.get('sort')),
    dir: params.get('dir') === 'desc' ? 'desc' : 'asc',
    page: parsePage(params.get('page')),
  };
}

export function fundsUrlState(filters: FundsFilters): Record<string, string | null> {
  return {
    q: filters.q || null,
    typeL1: filters.typeL1 || null,
    typeL2: filters.typeL2 || null,
    mvpOnly: filters.mvpOnly ? '1' : null,
    hasNav: filters.hasNav ? '1' : null,
    sort: filters.sort === DEFAULT_FUNDS_FILTERS.sort ? null : filters.sort,
    dir: filters.dir === 'asc' ? null : filters.dir,
    page: filters.page <= 1 ? null : String(filters.page),
  };
}

export function fundsSearchEmpty(params: URLSearchParams): boolean {
  return [...params.keys()].length === 0;
}

export function parseStoredFundsFilters(raw: unknown): FundsFilters | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  return {
    q: typeof rec.q === 'string' ? rec.q.trim() : '',
    typeL1: typeof rec.typeL1 === 'string' ? rec.typeL1.trim() : '',
    typeL2: typeof rec.typeL2 === 'string' ? rec.typeL2.trim() : '',
    mvpOnly: rec.mvpOnly === true || rec.mvpOnly === '1',
    hasNav: rec.hasNav === true || rec.hasNav === '1',
    sort: parseSort(typeof rec.sort === 'string' ? rec.sort : null),
    dir: rec.dir === 'desc' ? 'desc' : 'asc',
    page: parsePage(
      typeof rec.page === 'number' || typeof rec.page === 'string' ? String(rec.page) : null,
    ),
  };
}

export function readStoredFundsFilters(): FundsFilters | null {
  return parseStoredFundsFilters(readStoredJson(FUNDS_FILTERS_KEY));
}

export function writeStoredFundsFilters(filters: FundsFilters): void {
  writeStoredJson(FUNDS_FILTERS_KEY, filters);
}

export function fundsFiltersEqual(a: FundsFilters, b: FundsFilters): boolean {
  return (
    a.q === b.q &&
    a.typeL1 === b.typeL1 &&
    a.typeL2 === b.typeL2 &&
    a.mvpOnly === b.mvpOnly &&
    a.hasNav === b.hasNav &&
    a.sort === b.sort &&
    a.dir === b.dir &&
    a.page === b.page
  );
}
