import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, test } from 'bun:test';
import {
  initMarketSchema,
  upsertMarketDailyBars,
  upsertMarketInstruments,
  upsertMarketSymbolAlias,
} from '../../../../src/db/market-repo';
import { initSchema } from '../../../../src/db/repo';
import type { QueryExec, SqlBinding } from './executor';
import { getFundDetail } from './funds-service';

const databases: Database[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

function fixture(withMarket = true) {
  const db = new Database(':memory:');
  databases.push(db);
  initSchema(db);
  if (withMarket) initMarketSchema(db);
  db.run(`INSERT INTO fund_basic_info (fund_code, fund_name, fund_type, created_at, updated_at)
    VALUES ('510300', '沪深300ETF', '指数型-股票', 1, 1), ('000001', '普通基金', '混合型', 1, 1)`);
  const exec: QueryExec = {
    async all<T>(sql: string, params: SqlBinding[] = []) {
      return db.query(sql).all(...params) as T[];
    },
    async first<T>(sql: string, params: SqlBinding[] = []) {
      return db.query(sql).get(...params) as T | null;
    },
  };
  return { db, exec };
}

function addEtf(db: Database, id = 'etf:510300.SH', withBars = true) {
  const symbol = id.replace('etf:', '');
  upsertMarketInstruments(db, [
    { instrumentId: id, symbol, name: '沪深300ETF', assetClass: 'etf', unit: '元' },
  ]);
  if (withBars)
    upsertMarketDailyBars(db, [
      {
        instrumentId: id,
        tradeDate: '2026-09-04',
        source: 'fuyao',
        open: 4.2,
        high: 4.4,
        low: 4.1,
        close: 4.3,
        volume: 100,
        collectedAt: 1,
      },
    ]);
}

describe('fund detail exchange chart eligibility', () => {
  test('old databases and ordinary NAV funds remain readable without market tables', async () => {
    const { exec } = fixture(false);
    const detail = await getFundDetail(exec, '000001');
    expect(detail?.fields.find((field) => field.key === 'fund_name')?.value).toBe('普通基金');
    expect(detail?.marketInstrument).toBeNull();
  });

  test('uses the verified identity, never the six-digit code or a similar name', async () => {
    const { db, exec } = fixture();
    addEtf(db);
    expect((await getFundDetail(exec, '510300'))?.marketInstrument).toBeNull();
    upsertMarketSymbolAlias(db, 'etf:510300.SH', 'fuyao', '510300.SH', '510300');
    expect((await getFundDetail(exec, '510300'))?.marketInstrument).toEqual({
      id: 'etf:510300.SH',
      symbol: '510300.SH',
      name: '沪深300ETF',
    });
    expect((await getFundDetail(exec, '000001'))?.marketInstrument).toBeNull();
  });

  test('a verified fund without OHLC keeps its NAV chart', async () => {
    const { db, exec } = fixture();
    addEtf(db, 'etf:510300.SH', false);
    upsertMarketSymbolAlias(db, 'etf:510300.SH', 'fuyao', '510300.SH', '510300');
    expect((await getFundDetail(exec, '510300'))?.marketInstrument).toBeNull();
  });

  test('ambiguous identities and inactive instruments never pick an arbitrary series', async () => {
    const { db, exec } = fixture();
    addEtf(db);
    addEtf(db, 'etf:510300.SZ');
    upsertMarketSymbolAlias(db, 'etf:510300.SH', 'fuyao', '510300.SH', '510300');
    upsertMarketSymbolAlias(db, 'etf:510300.SZ', 'fuyao', '510300.SZ', '510300');
    expect((await getFundDetail(exec, '510300'))?.marketInstrument).toBeNull();
    db.run('UPDATE market_instrument SET is_active = 0');
    expect((await getFundDetail(exec, '510300'))?.marketInstrument).toBeNull();
  });
});
