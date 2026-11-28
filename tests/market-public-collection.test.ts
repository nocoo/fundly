import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, test } from 'bun:test';
import {
  initMarketSchema,
  upsertMarketDailyBars,
  upsertMarketInstruments,
} from '../src/db/market-repo.ts';
import { initSchema } from '../src/db/repo.ts';
import {
  alignedTreasurySpread,
  collectCboe,
  collectChinaMoney,
  collectEcb,
  collectFred,
  collectShfe,
} from '../src/fetchers/market-public-collection.ts';
import { MarketReader } from '../src/fetchers/market-reader.ts';
import { chinaMarketDate, shiftMarketDate } from '../src/utils/market-validation.ts';

const databases: Database[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

function memoryDb(): Database {
  const db = new Database(':memory:');
  databases.push(db);
  initSchema(db);
  initMarketSchema(db);
  return db;
}

function shfeReport(date: string, auClose = 960, cuClose = 78000): string {
  return JSON.stringify({
    report_date: date.replaceAll('-', ''),
    o_curinstrument: [
      {
        PRODUCTID: 'au_f',
        DELIVERYMONTH: '2612',
        OPENINTEREST: 1000,
        OPENPRICE: 950,
        HIGHESTPRICE: 980,
        LOWESTPRICE: 940,
        CLOSEPRICE: auClose,
        PRESETTLEMENTPRICE: 955,
        SETTLEMENTPRICE: 962,
        VOLUME: 100,
        TURNOVER: 1000,
      },
      {
        PRODUCTID: 'cu_f',
        DELIVERYMONTH: '2612',
        OPENINTEREST: 2000,
        OPENPRICE: 77500,
        HIGHESTPRICE: 78500,
        LOWESTPRICE: 77000,
        CLOSEPRICE: cuClose,
        PRESETTLEMENTPRICE: 77800,
        SETTLEMENTPRICE: 78100,
        VOLUME: 200,
        TURNOVER: 2000,
      },
    ],
  });
}

describe('market public collection', () => {
  test('collectCboe builds VIX quote and filtered bars', async () => {
    const reader = new MarketReader({
      mode: 'live',
      intervalMs: 0,
      fetchImpl: async () =>
        new Response(
          'DATE,OPEN,HIGH,LOW,CLOSE\n09/03/2026,15.2,15.5,14.2,14.3\n09/04/2026,14.1,14.6,13.8,14.5',
          { status: 200 },
        ),
    });
    const batch = await collectCboe(reader, 10);
    expect(batch.sourceKey).toBe('cboe');
    expect(batch.tradeDate).toBe('2026-09-04');
    expect(batch.quotes[0]?.price).toBe(14.5);
    expect(batch.bars).toHaveLength(2);
  });

  test('collectEcb computes USD/CNY and USD/JPY and rejects incomplete sets', async () => {
    const reader = new MarketReader({
      mode: 'live',
      intervalMs: 0,
      fetchImpl: async () =>
        new Response(
          'KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE\n' +
            'EXR.D.CNY.EUR,D,CNY,EUR,SP00,A,2026-09-04,7.8\n' +
            'EXR.D.USD.EUR,D,USD,EUR,SP00,A,2026-09-04,1.16\n' +
            'EXR.D.JPY.EUR,D,JPY,EUR,SP00,A,2026-09-04,181',
          { status: 200 },
        ),
    });
    const batch = await collectEcb(reader, 30);
    expect(batch.actualItems).toBe(2);
    expect(batch.observations).toHaveLength(2);

    const incompleteReader = new MarketReader({
      mode: 'live',
      intervalMs: 0,
      fetchImpl: async () =>
        new Response('CURRENCY,CURRENCY_DENOM,TIME_PERIOD,OBS_VALUE\nCNY,EUR,2026-09-04,7.8', {
          status: 200,
        }),
    });
    await expect(collectEcb(incompleteReader)).rejects.toThrow('Incomplete ECB');
  });

  test('collectChinaMoney builds shibor and lpr collections', async () => {
    const shiborReader = new MarketReader({
      mode: 'live',
      intervalMs: 0,
      fetchImpl: async () =>
        Response.json({
          data: { showDateCN: '2026-09-04 11:00' },
          records: [
            { termCode: 'O/N', shibor: '1.35' },
            { termCode: '1W', shibor: '1.40' },
          ],
        }),
    });
    const shibor = await collectChinaMoney(shiborReader, 'shibor');
    expect(shibor.expectedItems).toBe(8);
    expect(shibor.actualItems).toBe(2);

    const lprReader = new MarketReader({
      mode: 'live',
      intervalMs: 0,
      fetchImpl: async () =>
        Response.json({
          data: { showDateCN: '2026-08-20 09:00' },
          records: [
            { termCode: '1Y', shibor: '3.00' },
            { termCode: '5Y', shibor: '3.50' },
          ],
        }),
    });
    const lpr = await collectChinaMoney(lprReader, 'lpr');
    expect(lpr.expectedItems).toBe(2);
    expect(lpr.instruments.map((i) => i.name)).toEqual(['LPR 1年', 'LPR 5年以上']);
  });

  test('collectFred parses series and derives 10Y-2Y spread in bps', async () => {
    const today = chinaMarketDate(Date.now());
    const recent = shiftMarketDate(today, -1);
    const reader = new MarketReader({
      mode: 'live',
      intervalMs: 0,
      fetchImpl: async (url) => {
        const series = new URL(url).searchParams.get('id') ?? '';
        const val = series === 'DGS10' ? '4.5' : series === 'DGS2' ? '4.0' : '100';
        return new Response(`DATE,${series}\n${recent},${val}`, { status: 200 });
      },
    });
    const batch = await collectFred(reader, 30);
    expect(batch.actualItems).toBe(7);
    const spread = batch.observations.find((o) => o.instrumentId === 'rate:US.10Y2Y');
    expect(spread?.value).toBeCloseTo(50, 6);
    expect(spread?.unit).toBe('bp');

    expect(
      alignedTreasurySpread([
        {
          instrumentId: 'rate:US.DGS10',
          observationDate: '2026-09-01',
          source: 'fred',
          value: 4.5,
          collectedAt: 10,
        },
        {
          instrumentId: 'rate:US.DGS2',
          observationDate: '2026-09-01',
          source: 'fred',
          value: 4.1,
          collectedAt: 20,
        },
      ]),
    ).toHaveLength(1);
  });

  test('collectShfe finds latest report, skips 404 holidays, backfills history, and handles errors', async () => {
    const db = memoryDb();
    const today = chinaMarketDate(Date.now());
    const d1 = shiftMarketDate(today, -1);
    const prevWeekday = (() => {
      for (let i = 2; i < 10; i++) {
        const d = shiftMarketDate(today, -i);
        const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
        if (wd !== 0 && wd !== 6) return d;
      }
      return shiftMarketDate(today, -3);
    })();

    const reader = new MarketReader({
      mode: 'live',
      intervalMs: 0,
      fetchImpl: async (url) => {
        if (url.includes(`kx${d1.replaceAll('-', '')}.dat`)) {
          return new Response(shfeReport(d1), { status: 200 });
        }
        if (url.includes(`kx${prevWeekday.replaceAll('-', '')}.dat`)) {
          return new Response(shfeReport(prevWeekday, 955, 77900), { status: 200 });
        }
        if (url.includes(`kx${today.replaceAll('-', '')}.dat`)) {
          return new Response('missing', { status: 404 });
        }
        return new Response('server error', { status: 500 });
      },
    });
    const batch = await collectShfe(db, reader, 10);
    expect(batch.tradeDate).toBe(d1);
    expect(batch.quotes).toHaveLength(2);
    expect(batch.bars.length).toBeGreaterThanOrEqual(4);
    expect(batch.warnings?.length).toBe(1);

    // Rejects older report than published quotes
    upsertMarketInstruments(db, [
      {
        instrumentId: 'comm:SHFE.AU2612',
        assetClass: 'commodity',
        symbol: 'AU2612',
        name: '沪金 AU2612',
        exchange: 'SHFE',
        currency: 'CNY',
        unit: '元/克',
      },
    ]);
    db.query(
      "INSERT INTO market_quote_latest (instrument_id, source, trade_date, price, collected_at) VALUES ('comm:SHFE.AU2612', 'shfe', ?, 970, 1)",
    ).run(today);
    const staleReader = new MarketReader({
      mode: 'live',
      intervalMs: 0,
      fetchImpl: async (url) =>
        url.includes(`kx${d1.replaceAll('-', '')}.dat`)
          ? new Response(shfeReport(d1), { status: 200 })
          : new Response('not found', { status: 404 }),
    });
    await expect(collectShfe(db, staleReader, 5)).rejects.toThrow('older than published');
    upsertMarketDailyBars(db, []);
  });
});
