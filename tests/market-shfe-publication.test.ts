import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';
import { publishMarketCollection } from '../src/db/market-publish.ts';
import { initMarketSchema } from '../src/db/market-repo.ts';
import { collectShfe, isPublishedShfeReport } from '../src/fetchers/market-public-collection.ts';
import { MarketReadError, MarketReader } from '../src/fetchers/market-reader.ts';
import { chinaMarketDate, shiftMarketDate } from '../src/utils/market-validation.ts';

function report(date: string, patch: Record<string, unknown> = {}) {
  return JSON.stringify({
    report_date: date.replaceAll('-', ''),
    o_curinstrument: ['au', 'cu'].map((product) => ({
      PRODUCTID: `${product}_f`,
      DELIVERYMONTH: '2611',
      OPENINTEREST: 100,
      OPENPRICE: 10,
      HIGHESTPRICE: 12,
      LOWESTPRICE: 9,
      CLOSEPRICE: 11,
      SETTLEMENTPRICE: 10.5,
      ...patch,
    })),
  });
}

test('only explicit intraday empty fields allow fallback; damaged prices and structure reject', () => {
  const date = '2026-10-16';
  expect(isPublishedShfeReport(report(date), date, date)).toBe(true);
  for (const patch of [{ CLOSEPRICE: '', SETTLEMENTPRICE: '' }, { SETTLEMENTPRICE: '' }]) {
    expect(isPublishedShfeReport(report(date, patch), date, date)).toBe(false);
    expect(() => isPublishedShfeReport(report(date, patch), date, '2026-10-17')).toThrow(
      'Incomplete',
    );
  }
  for (const patch of [
    { SETTLEMENTPRICE: null },
    { SETTLEMENTPRICE: 'bad' },
    { CLOSEPRICE: 50 },
    { CLOSEPRICE: '', LOWESTPRICE: 20 },
    { OPENPRICE: null },
    { PRODUCTID: 'bad' },
  ]) {
    expect(() => isPublishedShfeReport(report(date, patch), date, date)).toThrow();
  }
});

test('collect then publish fallback cannot replace an already published newer SHFE date', async () => {
  const db = new Database(':memory:');
  initMarketSchema(db);
  const today = chinaMarketDate(Date.now());
  const yesterday = shiftMarketDate(today, -1);
  let intraday = false;
  const reader = new MarketReader({ mode: 'live' });
  reader.text = async (url) => {
    const date = /kx(\d{8})\.dat/.exec(url)?.[1];
    if (date === today.replaceAll('-', ''))
      return {
        text: report(today, intraday ? { SETTLEMENTPRICE: '' } : {}),
        collectedAt: Date.now(),
      };
    if (date === yesterday.replaceAll('-', ''))
      return { text: report(yesterday), collectedAt: Date.now() };
    throw new MarketReadError('not published', 404);
  };
  try {
    const first = await collectShfe(db, reader, 0);
    publishMarketCollection(db, first);
    const before = db
      .query(
        'SELECT instrument_id, trade_date, price, batch_id FROM market_quote_latest ORDER BY instrument_id',
      )
      .all();
    const status = db.query('SELECT * FROM market_source_status').all();
    intraday = true;
    await expect(
      (async () => publishMarketCollection(db, await collectShfe(db, reader, 0)))(),
    ).rejects.toThrow('older than published');
    expect(
      db
        .query(
          'SELECT instrument_id, trade_date, price, batch_id FROM market_quote_latest ORDER BY instrument_id',
        )
        .all(),
    ).toEqual(before);
    expect(db.query('SELECT * FROM market_source_status').all()).toEqual(status);
    db.exec('DELETE FROM market_quote_latest');
    const fallback = await collectShfe(db, reader, 0);
    publishMarketCollection(db, fallback);
    expect(db.query('SELECT DISTINCT trade_date FROM market_quote_latest').all()).toEqual([
      { trade_date: yesterday },
    ]);
  } finally {
    db.close();
  }
});
