import type { ReturnField } from './fields';

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
