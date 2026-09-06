import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, test } from 'bun:test';
import { type MarketCollection, publishMarketCollection } from '../src/db/market-publish.ts';
import { initMarketSchema, updateMarketSourceStatus } from '../src/db/market-repo.ts';
import { initSchema } from '../src/db/repo.ts';
import { chinaInstrument } from '../src/utils/market-watchlist.ts';

const databases: Database[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});
function database(): Database {
  const db = new Database(':memory:');
  databases.push(db);
  initSchema(db);
  initMarketSchema(db);
  return db;
}
function collection(batchId: string, price = 10): MarketCollection {
  return {
    sourceKey: 'fuyao',
    batchId,
    mode: 'live',
    startedAt: 100,
    collectedAt: 200,
    tradeDate: '2026-09-04',
    expectedItems: 1,
    actualItems: 1,
    instruments: [chinaInstrument('index', '000300.SH', '沪深300')],
    quotes: [
      {
        instrumentId: 'index:000300.SH',
        source: 'fuyao',
        tradeDate: '2026-09-04',
        price,
        collectedAt: 200,
      },
    ],
    bars: [],
    observations: [],
    breadth: {
      tradeDate: '2026-09-04',
      scope: 'SH_SZ_A',
      upCount: 1,
      downCount: 0,
      flatCount: 0,
      totalValidCount: 1,
      totalCatalogCount: 1,
      collectedAt: 200,
    },
  };
}

describe('atomic market publication', () => {
  test('rolls back metadata, quotes, breadth and status when a late publication step fails', () => {
    const db = database();
    publishMarketCollection(db, collection('good'));
    const next = collection('broken', 20);
    next.instruments = next.instruments.map((i) => ({ ...i, name: 'changed name' }));
    if (!next.breadth) throw new Error('Missing fixture breadth');
    next.breadth.upCount = 0;
    next.breadth.downCount = 1;
    // Failure after the writes to metadata, quotes and breadth exercises the outer transaction.
    db.exec(
      "CREATE TRIGGER reject_bad_batch BEFORE INSERT ON market_collection_batch WHEN NEW.batch_id = 'broken' BEGIN SELECT RAISE(ABORT, 'injected publication failure'); END",
    );
    expect(() => publishMarketCollection(db, next)).toThrow('injected publication failure');
    expect(db.query('SELECT name FROM market_instrument').get()).toEqual({ name: '沪深300' });
    expect(db.query('SELECT price, batch_id FROM market_quote_latest').get()).toEqual({
      price: 10,
      batch_id: 'good',
    });
    expect(db.query('SELECT up_count, batch_id FROM market_breadth').get()).toEqual({
      up_count: 1,
      batch_id: 'good',
    });
    expect(db.query('SELECT batch_id, last_status_code FROM market_source_status').get()).toEqual({
      batch_id: 'good',
      last_status_code: 200,
    });
    expect(db.query('SELECT COUNT(*) AS n FROM market_collection_batch').get()).toEqual({ n: 1 });
  });

  test('rejects incomplete counts, duplicate quotes, invalid OHLC and invalid observation dates', () => {
    const db = database();
    publishMarketCollection(db, collection('good'));
    const incomplete = collection('incomplete');
    incomplete.actualItems = 0;
    expect(() => publishMarketCollection(db, incomplete)).toThrow('Incomplete');
    const duplicate = collection('duplicate');
    duplicate.quotes = [...duplicate.quotes, ...duplicate.quotes];
    expect(() => publishMarketCollection(db, duplicate)).toThrow('Duplicate');
    const badBar = collection('bad-bar');
    badBar.bars = [
      {
        instrumentId: 'index:000300.SH',
        source: 'fuyao',
        tradeDate: '2026-09-04',
        open: 10,
        high: 9,
        low: 8,
        close: 10,
      },
    ];
    expect(() => publishMarketCollection(db, badBar)).toThrow('Invalid market daily bar');
    const badDate = collection('bad-date');
    badDate.observations = [
      {
        instrumentId: 'index:000300.SH',
        source: 'fuyao',
        observationDate: '2026-02-30',
        value: 5,
        collectedAt: 200,
      },
    ];
    expect(() => publishMarketCollection(db, badDate)).toThrow('Invalid market observation');
    expect(db.query('SELECT batch_id FROM market_quote_latest').get()).toEqual({
      batch_id: 'good',
    });
  });

  test('a failed attempt retains the last good batch and its success date', () => {
    const db = database();
    publishMarketCollection(db, collection('good'));
    updateMarketSourceStatus(db, {
      sourceKey: 'fuyao',
      lastStatusCode: 503,
      lastErrorMessage: 'upstream unavailable',
      startedAt: 300,
    });
    expect(
      db
        .query(
          'SELECT batch_id, last_success_at, last_trade_date, last_status_code FROM market_source_status',
        )
        .get(),
    ).toEqual({
      batch_id: 'good',
      last_success_at: 200,
      last_trade_date: '2026-09-04',
      last_status_code: 503,
    });
    expect(db.query('SELECT price FROM market_quote_latest').get()).toEqual({ price: 10 });
  });
});
