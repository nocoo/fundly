import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, test } from 'bun:test';
import {
  initMarketSchema,
  replaceMarketIndexMembers,
  upsertMarketDailyBars,
  upsertMarketInstrumentRelation,
  upsertMarketInstruments,
  upsertMarketQuote,
  upsertMarketSeriesObservations,
  upsertMarketSymbolAlias,
} from '../../../../src/db/market-repo.ts';
import { initSchema } from '../../../../src/db/repo.ts';
import type { QueryExec, SqlBinding } from './executor.ts';
import {
  getEtfDetail,
  getIndustryConstituents,
  getMarketBars,
  getMarketObservations,
  getMarketOverview,
} from './market-service.ts';

const databases: Database[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

function createMemExec(withMarketSchema = true): { db: Database; exec: QueryExec } {
  const db = new Database(':memory:');
  databases.push(db);
  initSchema(db);
  if (withMarketSchema) initMarketSchema(db);
  const exec: QueryExec = {
    async all<T>(sql: string, params: SqlBinding[] = []) {
      return db.prepare(sql).all(...params) as T[];
    },
    async first<T>(sql: string, params: SqlBinding[] = []) {
      return (db.prepare(sql).get(...params) as T | null) ?? null;
    },
  };
  return { db, exec };
}

describe('market service readonly queries', () => {
  test('returns overview structure with indices, breadth, industries, etfs and macroCards with per-item dates', async () => {
    const { db, exec } = createMemExec();

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
      {
        instrumentId: 'industry:881121.TI',
        assetClass: 'industry',
        symbol: '881121.TI',
        name: '半导体',
        exchange: 'SH',
        currency: 'CNY',
        unit: '点',
      },
      {
        instrumentId: 'etf:512480.SH',
        assetClass: 'etf',
        symbol: '512480.SH',
        name: '半导体ETF',
        exchange: 'SH',
        currency: 'CNY',
        unit: '元',
      },
    ]);

    upsertMarketInstrumentRelation(db, {
      sourceId: 'industry:881121.TI',
      targetId: 'etf:512480.SH',
      relationType: 'theme_associated',
      confidence: 'verified',
      description: '半导体主题关联ETF',
    });

    upsertMarketSymbolAlias(db, 'etf:512480.SH', 'fuyao', '512480.SH', '512480');

    replaceMarketIndexMembers(db, 'industry:881121.TI', [
      {
        indexId: 'industry:881121.TI',
        stockCode: '688981.SH',
        stockName: '中芯国际',
        weight: 12.5,
        rankOrder: 1,
      },
    ]);

    upsertMarketQuote(db, {
      instrumentId: 'index:000300.SH',
      source: 'fuyao',
      tradeDate: '2026-09-04',
      close: 4801.81,
      prevClose: 4713.64,
      changePct: 1.87,
      turnover: 713287000000,
      collectedAt: 1788652277000,
    });

    upsertMarketQuote(db, {
      instrumentId: 'industry:881121.TI',
      source: 'fuyao',
      tradeDate: '2026-09-04',
      close: 15884.055,
      prevClose: 16345.694,
      changePct: -2.82,
      turnover: 215610800000,
      collectedAt: 1788652277000,
    });

    upsertMarketQuote(db, {
      instrumentId: 'etf:512480.SH',
      source: 'fuyao',
      tradeDate: '2026-09-04',
      close: 0.985,
      prevClose: 1.012,
      changePct: -2.67,
      turnover: 1200000000,
      collectedAt: 1788652277000,
    });

    const overview = await getMarketOverview(exec);
    expect(overview.ready).toBe(true);
    expect(overview.indices[0]?.tradeDate).toBe('2026-09-04');
    expect(overview.indices[0]?.source).toBe('fuyao');
    expect(overview.industries[0]?.relatedEtfs[0]?.description).toBe('半导体主题关联ETF');

    const indDetail = await getIndustryConstituents(exec, 'industry:881121.TI');
    expect(indDetail.industry?.name).toBe('半导体');
    expect(indDetail.members.length).toBe(1);
    expect(indDetail.members[0]?.stockCode).toBe('688981.SH');

    const etfDetail = await getEtfDetail(exec, 'etf:512480.SH');
    expect(etfDetail.instrument?.name).toBe('半导体ETF');
    expect(etfDetail.quote?.price).toBe(0.985);
  });

  test('getMarketBars safely validates limit bounds', async () => {
    const { db, exec } = createMemExec();
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
    upsertMarketDailyBars(db, [
      {
        instrumentId: 'index:000300.SH',
        tradeDate: '2026-09-03',
        source: 'fuyao',
        open: 4700,
        high: 4720,
        low: 4680,
        close: 4713.64,
      },
      {
        instrumentId: 'index:000300.SH',
        tradeDate: '2026-09-04',
        source: 'fuyao',
        open: 4743.45,
        high: 4802.5,
        low: 4715.39,
        close: 4801.81,
      },
    ]);

    const res = await getMarketBars(exec, 'index:000300.SH', NaN);
    expect(res.bars.length).toBe(2);
    expect(res.bars[0]?.source).toBe('fuyao');
  });
});

describe('market API financial data contracts', () => {
  test('old Fundly databases return empty data without creating market tables', async () => {
    const { db, exec } = createMemExec(false);
    expect((await getMarketOverview(exec)).ready).toBe(false);
    expect((await getMarketBars(exec, 'missing')).instrument).toBeNull();
    expect((await getMarketObservations(exec, 'missing')).instrument).toBeNull();
    expect((await getIndustryConstituents(exec, 'missing')).industry).toBeNull();
    expect((await getEtfDetail(exec, 'missing')).instrument).toBeNull();
    expect(db.query("SELECT name FROM sqlite_master WHERE name LIKE 'market_%'").all()).toEqual([]);
  });

  test('NAV without a local fund alias remains visible, with same-date-only premium and real disclosures', async () => {
    const { db, exec } = createMemExec();
    const id = 'etf:511010.SH';
    upsertMarketInstruments(db, [
      {
        instrumentId: id,
        assetClass: 'etf',
        symbol: '511010.SH',
        name: '国债ETF',
        exchange: 'SH',
        currency: 'CNY',
        unit: '元',
      },
    ]);
    upsertMarketQuote(db, {
      instrumentId: id,
      source: 'fuyao',
      price: 101,
      tradeDate: '2026-09-04',
      collectedAt: 200,
    });
    upsertMarketSeriesObservations(db, [
      {
        instrumentId: id,
        source: 'fuyao',
        observationDate: '2026-09-03',
        value: 100,
        collectedAt: 150,
      },
    ]);
    let detail = await getEtfDetail(exec, id);
    expect(detail.quote?.unitNav).toBe(100);
    expect(detail.quote?.navDate).toBe('2026-09-03');
    expect(detail.quote?.premiumDiscountPct).toBeNull();
    expect(detail.instrument?.linkedFundCode).toBeNull();
    expect((await getMarketOverview(exec)).etfs[0]?.navDate).toBe('2026-09-03');
    upsertMarketSeriesObservations(db, [
      {
        instrumentId: id,
        source: 'fuyao',
        observationDate: '2026-09-04',
        value: 100,
        collectedAt: 220,
      },
    ]);
    db.query('INSERT INTO market_etf_profile VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      id,
      '2013-03-05',
      7e9,
      '测试经理',
      '测试公司',
      'fuyao',
      220,
      '{}',
    );
    db.query('INSERT INTO market_etf_holding VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      id,
      '2026-06-30',
      '250020.IB',
      '国债',
      'bond',
      20.75,
      1040,
      106175.65,
      '2026-07-21',
      'fuyao',
      220,
    );
    detail = await getEtfDetail(exec, id);
    expect(detail.quote?.premiumDiscountPct).toBe(1);
    expect(detail.quote?.navSource).toBe('fuyao');
    expect(detail.profile?.managementCompany).toBe('测试公司');
    expect(detail.profile?.publishedAt).toBeNull();
    expect(detail.holdings[0]).toMatchObject({
      assetType: 'bond',
      reportDate: '2026-06-30',
      publishedAt: '2026-07-21',
      source: 'fuyao',
      holdShares: 1040,
    });
    expect((await getMarketBars(exec, id)).instrument?.volumeUnit).toBe('份');
  });

  test('reference rates use basis points and preserve dates, while VIX and global equities are included', async () => {
    const { db, exec } = createMemExec();
    upsertMarketInstruments(db, [
      {
        instrumentId: 'rate:US.DGS10',
        assetClass: 'rate',
        symbol: 'DGS10',
        name: '美债10年',
        exchange: 'FRED',
        currency: 'USD',
        unit: '%',
      },
      {
        instrumentId: 'rate:LPR.1Y',
        assetClass: 'rate',
        symbol: 'LPR.1Y',
        name: 'LPR 1年',
        exchange: 'CFETS',
        currency: 'CNY',
        unit: '%',
        tradingCalendar: 'MONTHLY_REFERENCE',
      },
      {
        instrumentId: 'risk:CBOE.VIX',
        assetClass: 'risk',
        symbol: 'VIX',
        name: 'VIX',
        exchange: 'CBOE',
        currency: 'USD',
        unit: '点',
      },
      {
        instrumentId: 'global:US.SP500',
        assetClass: 'global_index',
        symbol: 'SP500',
        name: '标普500',
        exchange: 'FRED',
        currency: 'USD',
        unit: '点',
      },
      {
        instrumentId: 'comm:SHFE.AU2610',
        assetClass: 'commodity',
        symbol: 'AU2610',
        name: '沪金 AU2610',
        exchange: 'SHFE',
        currency: 'CNY',
        unit: '元/克',
      },
    ]);
    upsertMarketSeriesObservations(db, [
      {
        instrumentId: 'rate:US.DGS10',
        source: 'fred',
        observationDate: '2026-09-02',
        value: 4.79,
        collectedAt: 100,
      },
      {
        instrumentId: 'rate:US.DGS10',
        source: 'fred',
        observationDate: '2026-09-03',
        value: 4.77,
        collectedAt: 200,
      },
      {
        instrumentId: 'global:US.SP500',
        source: 'fred',
        observationDate: '2026-09-04',
        value: 7718.6,
        collectedAt: 200,
      },
      {
        instrumentId: 'rate:LPR.1Y',
        source: 'chinamoney',
        observationDate: '2026-08-20',
        value: 3,
        collectedAt: 200,
        publishedAt: '2026-08-20',
      },
    ]);
    upsertMarketQuote(db, {
      instrumentId: 'risk:CBOE.VIX',
      source: 'cboe',
      tradeDate: '2026-09-04',
      price: 14.53,
      collectedAt: 200,
    });
    upsertMarketQuote(db, {
      instrumentId: 'comm:SHFE.AU2610',
      source: 'shfe',
      tradeDate: '2026-09-04',
      price: 965.96,
      prevClose: null,
      prevSettlement: 952.06,
      settlementPrice: 970.82,
      openInterest: 100,
      collectedAt: 200,
    });
    const { macroCards } = await getMarketOverview(exec);
    expect(macroCards).toHaveLength(5);
    const treasury = macroCards.find((m) => m.id === 'rate:US.DGS10');
    expect(treasury?.changePct).toBeNull();
    expect(treasury?.changeBp).toBeCloseTo(-2);
    expect(treasury?.observationDate).toBe('2026-09-03');
    expect(treasury?.comparisonDate).toBe('2026-09-02');
    expect(macroCards.find((m) => m.id === 'rate:LPR.1Y')).toMatchObject({
      frequency: 'monthly',
      observationDate: '2026-08-20',
    });
    expect(macroCards.find((m) => m.id === 'risk:CBOE.VIX')?.displayType).toBe('kline');
    expect(macroCards.find((m) => m.id === 'global:US.SP500')?.displayType).toBe('single_value');
    expect(macroCards.find((m) => m.id === 'comm:SHFE.AU2610')).toMatchObject({
      prevClose: null,
      prevSettlement: 952.06,
      changeBasis: 'previous_settlement',
      openInterest: 100,
    });
    const observations = await getMarketObservations(exec, 'rate:US.DGS10', 1);
    expect(observations.observations).toHaveLength(1);
    expect(observations.observations[0]).toMatchObject({
      date: '2026-09-03',
      source: 'fred',
      collectedAt: 200,
      publishedAt: null,
    });
  });
});
