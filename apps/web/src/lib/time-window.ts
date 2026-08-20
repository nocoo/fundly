export const RANGE_YEARS = [10, 5, 3, 1] as const;
export type RangeYears = (typeof RANGE_YEARS)[number];

export function parseRangeYears(raw: string | null | undefined): RangeYears {
  const n = Number(raw);
  return n === 10 || n === 3 || n === 1 ? n : 5;
}

export function isoDay(value: Date | number | string): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const ms = typeof value === 'number' ? value : Date.parse(String(value));
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toISOString().slice(0, 10);
}

export function utcTs(day: string): number {
  const ms = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(ms) ? ms : Number.NaN;
}

export function rangeBounds(years: RangeYears, end = new Date()): { from: string; to: string } {
  const to = isoDay(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  const start = new Date(`${to}T00:00:00Z`);
  start.setUTCFullYear(start.getUTCFullYear() - years);
  return { from: isoDay(start.getTime()), to };
}

export function formatAxisDay(value: number | string): string {
  const day = typeof value === 'number' ? isoDay(value) : value;
  return day.length >= 7 ? day.slice(0, 7) : day;
}
