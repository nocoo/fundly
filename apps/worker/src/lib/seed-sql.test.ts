import { describe, expect, it } from 'bun:test';
import {
  assertSeedSnapshot,
  chunkByCount,
  defaultSnapshotAction,
  packInsertStatements,
  parseSkipFiles,
  resolveSeedSqlitePath,
  selectSeedTables,
  sqlByteLength,
  sqlInsertStatement,
  sqliteSnapshot,
  sqlLiteral,
} from './seed-sql';

describe('seed-sql', () => {
  it('quotes text and leaves nulls unquoted', () => {
    expect(sqlLiteral("O'Brien")).toBe("'O''Brien'");
    expect(sqlLiteral(null)).toBe('NULL');
    expect(sqlLiteral(1.5)).toBe('1.5');
  });

  it('builds a multi-row INSERT OR IGNORE', () => {
    expect(
      sqlInsertStatement(
        'fund_nav',
        ['fund_code', 'nav_date', 'unit_nav'],
        [
          ['000001', '2026-08-18', 1.4],
          ['000002', '2026-08-18', 2],
        ],
      ),
    ).toBe(
      "INSERT OR IGNORE INTO fund_nav (fund_code, nav_date, unit_nav) VALUES ('000001', '2026-08-18', 1.4), ('000002', '2026-08-18', 2);",
    );
  });

  it('chunks rows for file-sized batches', () => {
    expect(chunkByCount([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('refuses to silently reuse an implicit snapshot', () => {
    expect(defaultSnapshotAction(false, false)).toBe('create');
    expect(defaultSnapshotAction(true, false)).toBe('reject');
    expect(defaultSnapshotAction(true, true)).toBe('reuse');
  });

  it('resumes only from an explicit sqlite file', () => {
    expect(resolveSeedSqlitePath({ livePath: 'live.db', skipFiles: 0 })).toBe('live.db');
    expect(
      resolveSeedSqlitePath({ livePath: 'live.db', resumeSqlite: 'snap.db', skipFiles: 0 }),
    ).toBe('snap.db');
    expect(() => resolveSeedSqlitePath({ livePath: 'live.db', skipFiles: 2 })).toThrow(
      'FUNDLY_SEED_SQLITE',
    );
    expect(
      resolveSeedSqlitePath({ livePath: 'live.db', resumeSqlite: 'snap.db', skipFiles: 2 }),
    ).toBe('snap.db');
  });

  it('requires a matching sqlite snapshot when skipping files', () => {
    expect(sqliteSnapshot(10, 20)).toBe('10:20');
    expect(() => assertSeedSnapshot('10:20', undefined, 1)).toThrow('FUNDLY_SEED_SNAPSHOT');
    expect(() => assertSeedSnapshot('10:20', '9:20', 1)).toThrow('sqlite snapshot');
    assertSeedSnapshot('10:20', '10:20', 1);
    assertSeedSnapshot('10:20', undefined, 0);
  });

  it('parses skip-file counts as integers', () => {
    expect(parseSkipFiles(undefined)).toBe(0);
    expect(parseSkipFiles('46')).toBe(46);
    expect(() => parseSkipFiles('1.5')).toThrow('integer');
    expect(() => parseSkipFiles('Infinity')).toThrow('integer');
  });

  it('filters seed tables from a comma list', () => {
    const all = [{ table: 'fund_nav' }, { table: 'fetch_log' }] as const;
    expect(selectSeedTables(all).map((t) => t.table)).toEqual(['fund_nav', 'fetch_log']);
    expect(selectSeedTables(all, 'fund_nav').map((t) => t.table)).toEqual(['fund_nav']);
    expect(() => selectSeedTables(all, 'nope')).toThrow('unknown seed tables');
    expect(() => selectSeedTables(all, 'fund_nav,nope')).toThrow('unknown seed tables');
  });

  it('packs by byte budget and isolates oversized rows', () => {
    const packed = packInsertStatements('t', ['j'], [['ok'], ['x'.repeat(200)], ['also']], 80);
    expect(packed.oversized).toEqual([['x'.repeat(200)]]);
    expect(packed.statements.every((s) => sqlByteLength(s) <= 80)).toBe(true);
    expect(packed.statements.join('\n')).toContain("'ok'");
  });
});
