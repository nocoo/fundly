import { describe, expect, it } from 'bun:test';
import { chunkByCount, sqlInsertStatement, sqlLiteral } from './seed-sql';

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
});
