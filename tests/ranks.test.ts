import { describe, expect, test } from 'bun:test';
import { unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { refreshRanks } from '../src/db/ranks.ts';
import {
  initSchema,
  openDb,
  upsertFundList,
  upsertNavPoints,
  upsertPerformance,
} from '../src/db/repo.ts';
import type { FundPerformance, NavPoint } from '../src/utils/types.ts';

function tmpDbPath(): string {
  return join(tmpdir(), `fundly-rank-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

function emptyPerf(fundCode: string, return1y: number | null): FundPerformance {
  return {
    fundCode,
    return1m: 4,
    return3m: 8,
    return6m: 10,
    return1y,
    return2y: null,
    return3y: null,
    return5y: null,
    returnYtd: null,
    returnSinceStart: null,
    rankPct1m: 99,
    rankPct3m: 99,
    rankPct6m: 99,
    rankPct1y: 99,
    rankPct2y: 99,
    rankPct3y: 99,
    rankPct5y: 99,
    dataDate: '2026-08-18',
  };
}

function nav(date: string, acc: number): NavPoint {
  return { navDate: date, unitNav: acc, accNav: acc, dailyReturn: null };
}

describe('refreshRanks', () => {
  test('ranks peers by type and writes 4433', () => {
    const path = tmpDbPath();
    const db = openDb(path);
    initSchema(db);
    upsertFundList(db, [
      { fundCode: 'a', pinyinAbbr: 'A', fundName: 'a', fundType: '混合型-灵活', pinyinFull: 'A' },
      { fundCode: 'b', pinyinAbbr: 'B', fundName: 'b', fundType: '混合型-灵活', pinyinFull: 'B' },
      {
        fundCode: 'c',
        pinyinAbbr: 'C',
        fundName: 'c',
        fundType: '债券型-混合一级',
        pinyinFull: 'C',
      },
    ]);
    upsertPerformance(db, { ...emptyPerf('a', 10), return2y: 0 });
    upsertPerformance(db, emptyPerf('b', 30));
    upsertPerformance(db, emptyPerf('c', 50));
    upsertNavPoints(db, 'a', [nav('2024-08-18', 1), nav('2026-08-18', 2)]);
    upsertNavPoints(db, 'b', [nav('2024-08-18', 1), nav('2026-08-18', 1.5)]);
    upsertNavPoints(db, 'c', [nav('2024-08-18', 1), nav('2026-08-18', 1.1)]);

    const result = refreshRanks(db);
    expect(result.funds).toBe(3);
    expect(result.types).toBe(2);

    const a = db
      .query('SELECT rank_pct_1y, rank_pct_2y, pass_4433 FROM fund_performance WHERE fund_code = ?')
      .get('a') as {
      rank_pct_1y: number;
      rank_pct_2y: number;
      pass_4433: number;
    };
    const b = db.query('SELECT rank_pct_1y FROM fund_performance WHERE fund_code = ?').get('b') as {
      rank_pct_1y: number;
    };
    expect(b.rank_pct_1y).toBeCloseTo(50, 5);
    expect(a.rank_pct_1y).toBeCloseTo(100, 5);
    expect(a.rank_pct_2y).toBeCloseTo(50, 5);
    expect(a.pass_4433).toBe(0);

    db.close();
    unlinkSync(path);
  });
});
