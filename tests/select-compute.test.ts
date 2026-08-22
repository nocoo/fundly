import { describe, expect, test } from 'bun:test';
import { unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initSchema, openDb, upsertFundList, upsertNavPoints } from '../src/db/repo.ts';
import { replaceSelectMetrics } from '../src/db/select-compute.ts';

describe('replaceSelectMetrics', () => {
  test('replaces the table in one transaction', () => {
    const path = join(tmpdir(), `fundly-select-${Date.now()}.db`);
    const db = openDb(path);
    initSchema(db);
    upsertFundList(db, [
      {
        fundCode: '000001',
        pinyinAbbr: 'X',
        fundName: '测试混合A',
        fundType: '混合型-偏股',
        pinyinFull: 'X',
      },
      {
        fundCode: '000002',
        pinyinAbbr: 'Y',
        fundName: '测试混合C',
        fundType: '混合型-偏股',
        pinyinFull: 'Y',
      },
    ]);
    upsertNavPoints(db, '000001', [
      { navDate: '2024-01-01', unitNav: 1, accNav: 1, dailyReturn: null },
      { navDate: '2026-08-01', unitNav: 1.2, accNav: 1.2, dailyReturn: 0.1 },
    ]);
    const first = replaceSelectMetrics(db, path);
    expect(first.funds).toBe(2);
    const n = db.query('SELECT COUNT(*) AS n FROM fund_select_metrics').get() as { n: number };
    expect(n.n).toBe(2);
    replaceSelectMetrics(db, path);
    const again = db.query('SELECT COUNT(*) AS n FROM fund_select_metrics').get() as { n: number };
    expect(again.n).toBe(2);
    db.close();
    unlinkSync(path);
  });
});
