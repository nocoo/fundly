import { describe, expect, it } from 'bun:test';
import {
  chunkByCount,
  packInsertStatements,
  parseSkipFiles,
  selectSeedTables,
  sqlByteLength,
  sqlInsertStatement,
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
