import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertFundlyDb } from '../src/backup/snapshot.ts';
import {
  initMarketSchema,
  isMarketSchemaReady,
  upsertMarketDailyBars,
  upsertMarketInstruments,
  upsertMarketQuote,
} from '../src/db/market-repo.ts';
import { initSchema } from '../src/db/repo.ts';

const leftovers: string[] = [];

function tmp(name: string): string {
  const dir = join(
    tmpdir(),
    `fundly-mkt-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  leftovers.push(dir);
  return join(dir, name);
}

function seedBaseDb(path: string): void {
  const db = new Database(path, { create: true });
  initSchema(db);
  const now = Date.now();
  db.query(
    `INSERT INTO fund_basic_info (fund_code, fund_name, fund_type, in_mvp_pool, created_at, updated_at)
     VALUES ('000001', '测试基金', '股票型', 1, ?, ?)`,
  ).run(now, now);
  db.query(
    `INSERT INTO fund_nav (fund_code, nav_date, unit_nav, acc_nav, daily_return)
     VALUES ('000001', '2026-08-21', 1.0, 1.0, 0)`,
  ).run();
  db.close();
}

afterEach(() => {
  for (const dir of leftovers.splice(0)) {
    try {
      Bun.spawnSync(['rm', '-rf', dir]);
    } catch {
      /* ignore */
    }
  }
});

describe('market schema and backy v3 compatibility', () => {
  test('market schema init is idempotent and maintains assertFundlyDb compatibility', () => {
    const path = tmp('test-compat.db');
    seedBaseDb(path);

    // 验证旧库通过 assertFundlyDb
    assertFundlyDb(path);

    const db = new Database(path);
    expect(isMarketSchemaReady(db)).toBe(false);

    // 初始化市场表
    initMarketSchema(db);
    expect(isMarketSchemaReady(db)).toBe(true);

    // 再次初始化确认幂等
    initMarketSchema(db);

    // 写入标的与日K线
    upsertMarketInstruments(db, [
      {
        instrumentId: 'index:000300.SH',
        assetClass: 'index',
        symbol: '000300.SH',
        name: '沪深300',
        exchange: 'SH',
        currency: 'CNY',
        unit: '点',
      },
    ]);

    upsertMarketQuote(db, {
      instrumentId: 'index:000300.SH',
      source: 'fuyao',
      tradeDate: '2026-09-04',
      close: 4801.81,
      prevClose: 4713.64,
      changePct: 1.87,
      collectedAt: Date.now(),
    });

    upsertMarketDailyBars(db, [
      {
        instrumentId: 'index:000300.SH',
        tradeDate: '2026-09-04',
        source: 'fuyao',
        open: 4743.45,
        high: 4802.5,
        low: 4715.39,
        close: 4801.81,
        volume: 25839160000,
        turnover: 713287000000,
      },
    ]);

    db.close();

    // 重点：检查加了市场表后，原有基金库仍然完全满足 assertFundlyDb 校验规则，毫无破坏
    assertFundlyDb(path);
  });
});
