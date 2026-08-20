export type ReturnField =
  | 'return_1m'
  | 'return_3m'
  | 'return_6m'
  | 'return_1y'
  | 'return_2y'
  | 'return_3y'
  | 'return_5y'
  | 'return_ytd'
  | 'return_since_start';

export const LIVE_RETURN_FIELDS = [
  'return_1m',
  'return_3m',
  'return_6m',
  'return_1y',
  'return_2y',
  'return_3y',
  'return_5y',
  'return_ytd',
  'return_since_start',
] as const satisfies readonly ReturnField[];

export const CRAWLED_RETURN_FIELDS = [
  'return_1m',
  'return_3m',
  'return_6m',
  'return_1y',
] as const satisfies readonly ReturnField[];

export const NAV_ONLY_RETURN_FIELDS = [
  'return_2y',
  'return_3y',
  'return_5y',
] as const satisfies readonly ReturnField[];

export const RANK_RETURN_FIELDS = [
  ...CRAWLED_RETURN_FIELDS,
  ...NAV_ONLY_RETURN_FIELDS,
] as const satisfies readonly ReturnField[];

export type RankReturnField = (typeof RANK_RETURN_FIELDS)[number];

export function isCrawledReturnField(field: ReturnField): boolean {
  return (CRAWLED_RETURN_FIELDS as readonly ReturnField[]).includes(field);
}

export function isNavOnlyReturnField(field: ReturnField): boolean {
  return (NAV_ONLY_RETURN_FIELDS as readonly ReturnField[]).includes(field);
}

export function isLiveReturnField(field: string): field is ReturnField {
  return (LIVE_RETURN_FIELDS as readonly string[]).includes(field);
}
