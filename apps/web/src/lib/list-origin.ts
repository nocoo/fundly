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
};

export function isListPath(path: string): path is ListPath {
  return (LIST_PATHS as readonly string[]).includes(path);
}

export function isFundDetailPath(pathname: string): boolean {
  return /^\/funds\/[^/]+$/.test(pathname);
}

export function listHref(origin: ListOrigin): string {
  return origin.search ? `${origin.path}${origin.search}` : origin.path;
}

export function listBackLabel(origin: ListOrigin): string {
  return `返回${LIST_LABEL[origin.path]}`;
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

export function resolveListOrigin(state: unknown): ListOrigin {
  return parseListOrigin(state) ?? readListOrigin() ?? { path: '/funds', search: '' };
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
