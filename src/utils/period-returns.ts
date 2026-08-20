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

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function addCalendarMonths(iso: string, delta: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const dt = new Date(Date.UTC(year, month - 1 + delta, 1));
  const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(Math.min(day, last))}`;
}

export function windowStartDate(endDate: string, field: ReturnField): string | null {
  switch (field) {
    case 'return_1m':
      return addCalendarMonths(endDate, -1);
    case 'return_3m':
      return addCalendarMonths(endDate, -3);
    case 'return_6m':
      return addCalendarMonths(endDate, -6);
    case 'return_1y':
      return addCalendarMonths(endDate, -12);
    case 'return_2y':
      return addCalendarMonths(endDate, -24);
    case 'return_3y':
      return addCalendarMonths(endDate, -36);
    case 'return_5y':
      return addCalendarMonths(endDate, -60);
    case 'return_ytd': {
      const year = Number(endDate.slice(0, 4));
      if (!Number.isFinite(year)) return null;
      return `${year - 1}-12-31`;
    }
    case 'return_since_start':
      return null;
  }
}

export function navReturn(
  start: { acc: number | null; unit: number | null } | null,
  last: { acc: number | null; unit: number | null } | null,
  opts: { requireAcc?: boolean } = {},
): number | null {
  if (!start || !last) return null;
  if (start.acc != null && last.acc != null && start.acc > 0 && Number.isFinite(last.acc)) {
    return (last.acc / start.acc - 1) * 100;
  }
  if (opts.requireAcc) return null;
  if (start.unit != null && last.unit != null && start.unit > 0 && Number.isFinite(last.unit)) {
    return (last.unit / start.unit - 1) * 100;
  }
  return null;
}

export function rankPct(betterCount: number, n: number): number | null {
  if (!(n > 0) || betterCount < 0) return null;
  return (100 * (betterCount + 1)) / n;
}

export function assignRanks(
  values: Array<{ fundCode: string; value: number | null }>,
): Map<string, number | null> {
  const eligible = values.filter(
    (item): item is { fundCode: string; value: number } => item.value != null,
  );
  const n = eligible.length;
  const out = new Map<string, number | null>();
  for (const item of values) out.set(item.fundCode, null);
  for (const item of eligible) {
    let better = 0;
    for (const peer of eligible) {
      if (peer.value > item.value) better += 1;
    }
    out.set(item.fundCode, rankPct(better, n));
  }
  return out;
}

const QUARTER = 25;
const THIRD = 100 / 3;

export function pass4433(ranks: {
  rank_pct_1y: number | null;
  rank_pct_2y: number | null;
  rank_pct_3y: number | null;
  rank_pct_5y: number | null;
  rank_pct_6m: number | null;
  rank_pct_3m: number | null;
}): 0 | 1 {
  const need: Array<[number | null, number]> = [
    [ranks.rank_pct_1y, QUARTER],
    [ranks.rank_pct_2y, QUARTER],
    [ranks.rank_pct_3y, QUARTER],
    [ranks.rank_pct_5y, QUARTER],
    [ranks.rank_pct_6m, THIRD],
    [ranks.rank_pct_3m, THIRD],
  ];
  for (const [value, cap] of need) {
    if (value == null || !(value <= cap)) return 0;
  }
  return 1;
}
