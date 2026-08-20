import { windowStartDate } from './dates';
import { isCrawledReturnField, isNavOnlyReturnField, type ReturnField } from './fields';
import { type NavEnds, navReturn } from './nav-return';

export type NavPrint = NavEnds & { date?: string };

export function planReturnLookups(
  fields: readonly ReturnField[],
  lastDate: string | null,
): { needFirst: boolean; windows: Array<{ field: ReturnField; start: string }> } {
  const windows: Array<{ field: ReturnField; start: string }> = [];
  let needFirst = false;
  for (const field of fields) {
    if (field === 'return_since_start') {
      needFirst = true;
      continue;
    }
    if (!lastDate) continue;
    const start = windowStartDate(lastDate, field);
    if (start && start < lastDate) windows.push({ field, start });
  }
  return { needFirst, windows };
}

export function resolveFundReturns(input: {
  fields: readonly ReturnField[];
  crawled?: Partial<Record<ReturnField, number | null>>;
  last: (NavEnds & { date: string }) | null;
  first?: NavEnds | null;
  asOf?: Partial<Record<ReturnField, NavEnds | null>>;
}): Partial<Record<ReturnField, number | null>> {
  const out: Partial<Record<ReturnField, number | null>> = {};
  for (const field of input.fields) {
    if (isCrawledReturnField(field)) {
      const crawled = input.crawled?.[field];
      if (crawled != null && Number.isFinite(crawled)) {
        out[field] = crawled;
        continue;
      }
    }
    if (!input.last) {
      out[field] = null;
      continue;
    }
    if (field === 'return_since_start') {
      out[field] = navReturn(input.first ?? null, input.last);
      continue;
    }
    const start = windowStartDate(input.last.date, field);
    if (!start || start >= input.last.date) {
      out[field] = null;
      continue;
    }
    out[field] = navReturn(input.asOf?.[field] ?? null, input.last, {
      requireAcc: isNavOnlyReturnField(field),
    });
  }
  return out;
}
