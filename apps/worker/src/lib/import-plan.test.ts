import { describe, expect, it } from 'bun:test';
import {
  flattenRows,
  planIncrementalInsert,
  rowKey,
  sqlInsertOrIgnore,
  sqlUpsert,
} from './import-plan';

describe('planIncrementalInsert', () => {
  it('inserts missing keys and skips ones already present', () => {
    const existing = new Set(['000001', '000002']);
    const incoming = [
      { code: '000001' },
      { code: '000003' },
      { code: '000002' },
      { code: '000003' },
    ];
    const plan = planIncrementalInsert(existing, incoming, (r) => r.code);
    expect(plan.toInsert.map((r) => r.code)).toEqual(['000003']);
    expect(plan.skipped).toBe(3);
  });

  it('second pass over the same keys inserts nothing', () => {
    const first = planIncrementalInsert(new Set(), [{ k: 'a' }, { k: 'b' }], (r) => r.k);
    expect(first.toInsert).toHaveLength(2);
    const existing = new Set(first.toInsert.map((r) => r.k));
    existing.add('c');
    const incoming = [{ k: 'a' }, { k: 'b' }, { k: 'c' }, { k: 'd' }];
    const second = planIncrementalInsert(existing, incoming, (r) => r.k);
    expect(second.toInsert.map((r) => r.k)).toEqual(['d']);
    expect(second.skipped).toBe(3);
  });
});

describe('rowKey / sqlInsertOrIgnore / flattenRows', () => {
  it('joins composite keys', () => {
    expect(rowKey(['000001', '2026-08-18'])).toBe('000001\t2026-08-18');
  });

  it('builds a multi-row INSERT OR IGNORE', () => {
    expect(sqlInsertOrIgnore('fund_nav', ['fund_code', 'nav_date'], 2)).toBe(
      'INSERT OR IGNORE INTO fund_nav (fund_code, nav_date) VALUES (?, ?), (?, ?)',
    );
  });

  it('flattens row tuples for bind params', () => {
    expect(
      flattenRows([
        [1, 2],
        [3, 4],
      ]),
    ).toEqual([1, 2, 3, 4]);
  });

  it('builds ON CONFLICT DO UPDATE for non-key columns', () => {
    expect(sqlUpsert('fund_basic_info', ['fund_code', 'fund_name'], ['fund_code'], 1)).toBe(
      'INSERT INTO fund_basic_info (fund_code, fund_name) VALUES (?, ?) ON CONFLICT(fund_code) DO UPDATE SET fund_name = excluded.fund_name',
    );
  });
});
