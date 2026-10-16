import { expect, test } from 'bun:test';
import { queryDailyReports } from './daily-query';
import type { DailyListItem } from './daily-service';

const reports: DailyListItem[] = ['2026-10-01', '2026-10-02', '2026-10-03'].map((date) => ({
  date,
  title: `Report ${date}`,
  summary: 'Summary',
  path: `/daily/${date}`,
  session: 'am',
  sources: ['source'],
}));
test('daily queries support date ranges, batch codes, projection and stable pagination', () => {
  expect(
    queryDailyReports(reports, {
      from: '2026-10-02',
      to: '2026-10-03',
      sort: 'date',
      order: 'desc',
      limit: '1',
      fields: 'date,title',
    }),
  ).toEqual([{ date: '2026-10-03', title: 'Report 2026-10-03' }]);
  expect(
    queryDailyReports(reports, { codes: '2026-10-01,2026-10-03', offset: '1', session: 'am' }),
  ).toEqual([reports[2]]);
  expect(queryDailyReports(reports, { code: '2026-10-02' })).toEqual([reports[1]]);
  expect(queryDailyReports(reports, { session: 'pm' })).toEqual([]);
  expect(() => queryDailyReports(reports, { fields: 'markdown' })).toThrow();
  expect(() => queryDailyReports(reports, { limit: '5001' })).toThrow();
});
