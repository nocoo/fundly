import type { DailyListItem } from './daily-service';
import { buildReadQuery } from './read-query';
import type { ReadResource } from './read-resources';

const DAILY_RESOURCE = {
  path: '/api/daily',
  table: 'daily_reports',
  scope: 'daily:read',
  columns: {
    date: 'text',
    title: 'text',
    summary: 'text',
    path: 'text',
    weekday: 'text',
    session: 'text',
    methodology: 'text',
  },
  keys: ['date'],
  code: 'date',
  date: 'date',
} as const satisfies ReadResource;
type DailyField = keyof typeof DAILY_RESOURCE.columns;
export function queryDailyReports(
  items: DailyListItem[],
  query: Record<string, string>,
): Partial<DailyListItem>[] {
  const parsed = buildReadQuery(DAILY_RESOURCE, query);
  const filters = Object.entries(query).filter(([key]) =>
    Object.hasOwn(DAILY_RESOURCE.columns, key),
  );
  const codes = query.codes?.split(',');
  const dateField = (query.date_field ?? 'date') as DailyField;
  const sort = parsed.sort as DailyField;
  return items
    .filter((item) => {
      const date = item[dateField] ?? '';
      return (
        (!query.code || item.date === query.code) &&
        (!codes || codes.includes(item.date)) &&
        (query.from === undefined || date >= query.from) &&
        (query.to === undefined || date <= query.to) &&
        filters.every(([key, value]) => item[key as DailyField] === value)
      );
    })
    .sort((a, b) => {
      const comparison =
        String(a[sort] ?? '').localeCompare(String(b[sort] ?? '')) || a.date.localeCompare(b.date);
      return parsed.order === 'desc' ? -comparison : comparison;
    })
    .slice(parsed.offset, parsed.offset + parsed.limit)
    .map((item) =>
      query.fields === undefined
        ? item
        : Object.fromEntries(
            parsed.selected.map((field) => [field, item[field as DailyField] ?? null]),
          ),
    );
}
