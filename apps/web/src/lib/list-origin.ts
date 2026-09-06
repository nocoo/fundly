import { rankingRedirectPath } from './select-vm';
import { readStoredJson, writeStoredJson } from './stored-json';

export const LIST_ORIGIN_KEY = 'fundly_list_origin';

export const LIST_PATHS = [
  '/funds',
  '/ranking',
  '/select/return',
  '/select/risk',
  '/select/hold',
  '/select/dca',
  '/select/cost',
  '/select/picks',
  '/market',
  // 选 ETF 系列
  '/etfs',
  '/select-etf/allocation',
  '/select-etf/liquidity',
  '/select-etf/cost',
  '/select-etf/risk',
  '/select-etf/picks',
  // 选股系列
  '/stocks',
  '/select-stock/valuation',
  '/select-stock/quality',
  '/select-stock/growth',
  '/select-stock/cashflow',
  '/select-stock/trend',
  '/select-stock/picks',
] as const;

export type ListPath = (typeof LIST_PATHS)[number];

export type ListOrigin = {
  path: ListPath;
  search: string;
};

export const LIST_LABEL: Record<ListPath, string> = {
  '/funds': '基金浏览',
  '/ranking': '基金排名',
  '/select/return': '收益',
  '/select/risk': '风险',
  '/select/hold': '持有体验',
  '/select/dca': '定投',
  '/select/cost': '成本',
  '/select/picks': '精选',
  '/market': '宏观大屏',
  // ETF
  '/etfs': 'ETF浏览',
  '/select-etf/allocation': '资产配置',
  '/select-etf/liquidity': '交易质量',
  '/select-etf/cost': '成本规模',
  '/select-etf/risk': '收益风险',
  '/select-etf/picks': '条件精选',
  // 股票
  '/stocks': '股票浏览',
  '/select-stock/valuation': '估值比较',
  '/select-stock/quality': '盈利质量',
  '/select-stock/growth': '成长持续性',
  '/select-stock/cashflow': '现金质量',
  '/select-stock/trend': '趋势风险',
  '/select-stock/picks': '条件精选',
};

export function isListPath(path: string): path is ListPath {
  return (LIST_PATHS as readonly string[]).includes(path);
}

export function isFundDetailPath(pathname: string): boolean {
  return /^\/funds\/[^/]+$/.test(pathname);
}

export function isEtfDetailPath(pathname: string): boolean {
  return /^\/etfs\/[^/]+$/.test(pathname);
}

export function isStockDetailPath(pathname: string): boolean {
  return /^\/stocks\/[^/]+$/.test(pathname);
}

export function listHref(origin: ListOrigin): string {
  return origin.search ? `${origin.path}${origin.search}` : origin.path;
}

export function listBackLabel(origin: ListOrigin): string {
  return `返回${LIST_LABEL[origin.path] ?? '列表'}`;
}

export function parseListOrigin(raw: unknown): ListOrigin | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as { path?: unknown; search?: unknown; list?: unknown };
  if (typeof rec.list === 'string') return parseListHref(rec.list);
  if (!isListPath(String(rec.path ?? ''))) return null;
  const search = typeof rec.search === 'string' && rec.search.startsWith('?') ? rec.search : '';
  return { path: rec.path as ListPath, search };
}

export function parseListHref(href: string): ListOrigin | null {
  const [path, query] = href.split('?');
  if (!path || !isListPath(path)) return null;
  const origin: ListOrigin = { path, search: query ? `?${query}` : '' };
  if (origin.path !== '/ranking') return origin;
  return (
    parseListHref(rankingRedirectPath(origin.search)) ?? {
      path: '/select/return',
      search: '',
    }
  );
}

export function originFromList(pathname: string, search: string): ListOrigin | null {
  if (!isListPath(pathname)) return null;
  const origin: ListOrigin = {
    path: pathname,
    search: search.startsWith('?') || search === '' ? search : `?${search}`,
  };
  if (origin.path !== '/ranking') return origin;
  return parseListHref(rankingRedirectPath(origin.search));
}

export function readListOrigin(): ListOrigin | null {
  return parseListOrigin(readStoredJson(LIST_ORIGIN_KEY));
}

export function writeListOrigin(origin: ListOrigin): void {
  writeStoredJson(LIST_ORIGIN_KEY, origin);
}

export function resolveListOrigin(state: unknown, fallbackPath: ListPath = '/funds'): ListOrigin {
  const parsed = parseListOrigin(state);
  if (parsed) return parsed;
  // New research detail links carry explicit router state. Direct opens start in their own group.
  if (fallbackPath !== '/funds') return { path: fallbackPath, search: '' };
  const stored = readListOrigin();
  if (
    stored &&
    !stored.path.startsWith('/etf') &&
    !stored.path.startsWith('/stock') &&
    !stored.path.startsWith('/select-etf') &&
    !stored.path.startsWith('/select-stock')
  )
    return stored;
  return { path: fallbackPath, search: '' };
}

export function resolveNavigationOrigin(pathname: string, state: unknown): ListOrigin | null {
  if (isEtfDetailPath(pathname)) return resolveListOrigin(state, '/etfs');
  if (isStockDetailPath(pathname)) return resolveListOrigin(state, '/stocks');
  if (isFundDetailPath(pathname)) return resolveListOrigin(state, '/funds');
  return null;
}

export function readReturnEtf(state: unknown): string | null {
  if (!state || typeof state !== 'object') return null;
  const symbol = (state as { returnEtf?: unknown }).returnEtf;
  return typeof symbol === 'string' && /^\d{6}\.(SH|SZ)$/.test(symbol) ? symbol : null;
}

export function isDomesticStockHolding(symbol: string, assetType: string): boolean {
  return assetType === 'stock' && /^\d{6}\.(SH|SZ|BJ)$/.test(symbol);
}

export function fundDetailLink(
  code: string,
  origin: ListOrigin,
): { to: string; state: { list: string } } {
  return { to: `/funds/${encodeURIComponent(code)}`, state: { list: listHref(origin) } };
}

export function fundDetailTo(
  code: string,
  origin: ListOrigin,
): { to: string; state: { list: string } } {
  writeListOrigin(origin);
  return fundDetailLink(code, origin);
}

export function etfDetailLink(
  symbol: string,
  origin: ListOrigin,
): { to: string; state: { list: string } } {
  return { to: `/etfs/${encodeURIComponent(symbol)}`, state: { list: listHref(origin) } };
}

export function etfDetailTo(
  symbol: string,
  origin: ListOrigin,
): { to: string; state: { list: string } } {
  writeListOrigin(origin);
  return etfDetailLink(symbol, origin);
}

export function stockDetailLink(
  symbol: string,
  origin: ListOrigin,
): { to: string; state: { list: string } } {
  return { to: `/stocks/${encodeURIComponent(symbol)}`, state: { list: listHref(origin) } };
}

export function stockDetailTo(
  symbol: string,
  origin: ListOrigin,
): { to: string; state: { list: string } } {
  writeListOrigin(origin);
  return stockDetailLink(symbol, origin);
}
