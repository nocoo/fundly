import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';
import { copyTableIncremental, type SqlExec } from './import-copy';

function bunExec(db: Database): SqlExec {
  return {
    all<T>(sql: string, params: unknown[] = []) {
      return db.prepare(sql).all(...params) as T[];
    },
    run(sql: string, params: unknown[] = []) {
      db.prepare(sql).run(...params);
    },
  };
}

const BASIC_DDL = `
CREATE TABLE fund_basic_info (
  fund_code TEXT PRIMARY KEY,
  fund_name TEXT NOT NULL,
  fund_type TEXT NOT NULL,
  pinyin_abbr TEXT,
  pinyin_full TEXT,
  in_mvp_pool INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);`;

function seedBasic(db: Database, rows: { code: string; name: string }[]) {
  const stmt = db.prepare(
    `INSERT INTO fund_basic_info (fund_code, fund_name, fund_type, in_mvp_pool, created_at, updated_at)
     VALUES (?, ?, '股票型', 1, 1, 1)`,
  );
  for (const r of rows) stmt.run(r.code, r.name);
}

describe('copyTableIncremental', () => {
  it('first run inserts N keys; second run inserts 0 of those and still inserts a new key', async () => {
    const src = new Database(':memory:');
    const dest = new Database(':memory:');
    src.exec(BASIC_DDL);
    dest.exec(BASIC_DDL);
    seedBasic(src, [
      { code: '000001', name: 'A' },
      { code: '000002', name: 'B' },
    ]);

    const table = {
      mode: 'append' as const,
      table: 'fund_basic_info',
      columns: [
        'fund_code',
        'fund_name',
        'fund_type',
        'pinyin_abbr',
        'pinyin_full',
        'in_mvp_pool',
        'created_at',
        'updated_at',
      ],
      keyCols: ['fund_code'],
    } as const;

    const first = await copyTableIncremental(bunExec(src), bunExec(dest), table);
    expect(first).toEqual({ inserted: 2, skipped: 0 });

    const again = await copyTableIncremental(bunExec(src), bunExec(dest), table);
    expect(again).toEqual({ inserted: 0, skipped: 2 });

    src
      .prepare(
        `INSERT INTO fund_basic_info (fund_code, fund_name, fund_type, in_mvp_pool, created_at, updated_at)
         VALUES ('000003', 'C', '股票型', 1, 1, 1)`,
      )
      .run();
    const third = await copyTableIncremental(bunExec(src), bunExec(dest), table);
    expect(third).toEqual({ inserted: 1, skipped: 2 });
    const destCodes = dest.prepare('SELECT fund_code FROM fund_basic_info ORDER BY 1').all() as {
      fund_code: string;
    }[];
    expect(destCodes.map((r) => r.fund_code)).toEqual(['000001', '000002', '000003']);
  });

  it('upserts changed columns on existing keys', async () => {
    const src = new Database(':memory:');
    const dest = new Database(':memory:');
    src.exec(BASIC_DDL);
    dest.exec(BASIC_DDL);
    seedBasic(src, [{ code: '000001', name: 'A2' }]);
    seedBasic(dest, [{ code: '000001', name: 'A' }]);

    const table = {
      mode: 'upsert' as const,
      table: 'fund_basic_info',
      columns: [
        'fund_code',
        'fund_name',
        'fund_type',
        'pinyin_abbr',
        'pinyin_full',
        'in_mvp_pool',
        'created_at',
        'updated_at',
      ],
      keyCols: ['fund_code'],
    } as const;

    const result = await copyTableIncremental(bunExec(src), bunExec(dest), table);
    expect(result).toEqual({ inserted: 1, skipped: 0 });
    const row = dest
      .prepare('SELECT fund_name FROM fund_basic_info WHERE fund_code = ?')
      .get('000001') as { fund_name: string };
    expect(row.fund_name).toBe('A2');
  });
});
