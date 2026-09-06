import { describe, expect, test } from 'bun:test';
import {
  beijingMsToDateString,
  parseFuyaoDailyBars,
  parseFuyaoFundHoldings,
  parseFuyaoFundNav,
  parseFuyaoIndexMembers,
  parseFuyaoQuote,
} from '../src/fetchers/fuyao.ts';
import {
  parseCboeVixCsv,
  parseChinaMoneyLpr,
  parseChinaMoneyShibor,
  parseEcbFxCsv,
  parseFredDailyCsv,
  parseShfeDailyJson,
} from '../src/fetchers/public-market.ts';

describe('fuyao adapter and regression fixes', () => {
  test('beijingMsToDateString correctly converts 1780243200000 to 2026-06-01 without UTC rollback', () => {
    // 关键回归：1780243200000 在 UTC 是 2026-05-31 16:00，在北京时间是 2026-06-01 00:00
    const dateStr = beijingMsToDateString(1780243200000);
    expect(dateStr).toBe('2026-06-01');
  });

  test('beijingMsToDateString safely returns empty string on overflow 1e100 without throwing Invalid Date', () => {
    expect(beijingMsToDateString(1e100)).toBe('');
    expect(beijingMsToDateString(-1)).toBe('');
    expect(beijingMsToDateString(NaN)).toBe('');
  });

  test('parseFuyaoQuote handles real contract snapshot fields (last_price, prev_price, price_change_ratio_pct)', () => {
    // 真实 evidence 样本：510300 快照
    const rawSample = {
      thscode: '510300.SH',
      ticker: '510300',
      last_price: 4.616,
      open_price: 4.637,
      high_price: 4.672,
      low_price: 4.599,
      prev_price: 4.621,
      price_change_ratio_pct: -0.108202,
      volume: 841465540,
      turnover: 3905673000,
    };
    const q = parseFuyaoQuote('etf:510300.SH', rawSample, 1788652277000, '2026-09-04');
    expect(q.price).toBe(4.616);
    expect(q.close).toBe(4.616);
    expect(q.prevClose).toBe(4.621);
    expect(q.changePct).toBe(-0.108202);
    expect(q.open).toBe(4.637);
    expect(q.high).toBe(4.672);
    expect(q.low).toBe(4.599);
    expect(q.tradeDate).toBe('2026-09-04');
    expect(q.isInferredDate).toBe(true);
  });

  test('parseFuyaoDailyBars keeps legal one-price line (O=H=L=C) and rejects inverted geometry', () => {
    const legalOnePrice = {
      date_ms: 1780243200000,
      open_price: 10.0,
      high_price: 10.0,
      low_price: 10.0,
      close_price: 10.0,
    };
    const illegalInverted = {
      date_ms: 1780329600000,
      open_price: 10.0,
      high_price: 9.0, // high < open
      low_price: 8.0,
      close_price: 9.5,
    };
    const bars = parseFuyaoDailyBars('test:stock', [legalOnePrice, illegalInverted]);
    expect(bars.length).toBe(1);
    expect(bars[0]?.tradeDate).toBe('2026-06-01');
    expect(bars[0]?.close).toBe(10.0);
  });

  test('parseFuyaoIndexMembers preserves ranks and weights', () => {
    const raw = [
      { stock_code: '600519.SH', stock_name: '贵州茅台', weight: 4.85 },
      { stock_code: '300750.SZ', stock_name: '宁德时代', weight: 3.12 },
    ];
    const members = parseFuyaoIndexMembers('index:000300.SH', raw);
    expect(members.length).toBe(2);
    expect(members[0]?.stockCode).toBe('600519.SH');
    expect(members[0]?.rankOrder).toBe(1);
    expect(members[1]?.weight).toBe(3.12);
  });
});

describe('public market adapter and regression fixes', () => {
  test('parseCboeVixCsv extracts real OHLC bars and latest quote', () => {
    const csv = `DATE,OPEN,HIGH,LOW,CLOSE\n09/03/2026,15.25,15.44,14.23,14.32\n09/04/2026,14.15,14.58,13.80,14.53`;
    const { latestQuote, bars } = parseCboeVixCsv(csv);
    expect(bars.length).toBe(2);
    expect(bars[1]?.tradeDate).toBe('2026-09-04');
    expect(bars[1]?.open).toBe(14.15);
    expect(bars[1]?.close).toBe(14.53);
    expect(latestQuote?.price).toBe(14.53);
    expect(latestQuote?.prevClose).toBe(14.32);
    expect(latestQuote?.changePct).toBeCloseTo(1.4665, 2);
  });

  test('parseShfeDailyJson parses o_curinstrument, converts turnover to yuan, and filters 4-digit DELIVERYMONTH', () => {
    const raw = JSON.stringify({
      report_date: '20260904',
      o_curinstrument: [
        {
          PRODUCTID: 'cu_f',
          PRODUCTNAME: '铜',
          DELIVERYMONTH: '2610',
          OPENINTEREST: 50785,
          OPENPRICE: 109610,
          HIGHESTPRICE: 109910,
          LOWESTPRICE: 109230,
          CLOSEPRICE: 109260,
          PRESETTLEMENTPRICE: 109070,
          SETTLEMENTPRICE: 109580,
          VOLUME: 16045,
          TURNOVER: 879174.125, // 万元
        },
        {
          PRODUCTID: 'cu_f',
          PRODUCTNAME: '铜',
          DELIVERYMONTH: '小计', // 应被忽略
          OPENINTEREST: 100000,
          TURNOVER: 999999,
        },
      ],
    });

    const { quotes, bars } = parseShfeDailyJson(raw, ['cu']);
    expect(quotes.length).toBe(1);
    expect(quotes[0]?.instrumentId).toBe('comm:SHFE.CU2610');
    expect(quotes[0]?.tradeDate).toBe('2026-09-04');
    expect(quotes[0]?.close).toBe(109260);
    expect(quotes[0]?.prevClose).toBeNull();
    expect(quotes[0]?.prevSettlement).toBe(109070);
    expect(quotes[0]?.openInterest).toBe(50785);
    // 879174.125 万元 * 10000 = 8791741250 元
    expect(quotes[0]?.turnover).toBe(8791741250);

    expect(bars.length).toBe(1);
    expect(bars[0]?.open).toBe(109610);
    expect(bars[0]?.high).toBe(109910);
    expect(bars[0]?.low).toBe(109230);
    expect(bars[0]?.close).toBe(109260);
  });

  test('parseEcbFxCsv computes triangular cross rate USD/CNY and USD/JPY', () => {
    const csv =
      `KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE\n` +
      `EXR.D.CNY.EUR.SP00.A,D,CNY,EUR,SP00,A,2026-09-04,7.7994\n` +
      `EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-09-04,1.1645\n` +
      `EXR.D.JPY.EUR.SP00.A,D,JPY,EUR,SP00,A,2026-09-04,181.59`;
    const { usdCnyObservations, usdJpyObservations } = parseEcbFxCsv(csv);
    expect(usdCnyObservations.length).toBe(1);
    expect(usdCnyObservations[0]?.value).toBeCloseTo(7.7994 / 1.1645, 3); // ~6.6976
    expect(usdJpyObservations[0]?.value).toBeCloseTo(181.59 / 1.1645, 1); // ~155.94
  });

  test('parseChinaMoneyShibor and LPR extract term structure', () => {
    const shiborJson = JSON.stringify({
      data: { showDateCN: '2026-09-04 11:00' },
      records: [
        { termCode: '1W', shibor: '1.3760' },
        { termCode: '3M', shibor: '1.4300' },
      ],
    });
    const shibor = parseChinaMoneyShibor(shiborJson);
    expect(shibor.observations.length).toBe(2);
    expect(shibor.observations[0]?.instrumentId).toBe('rate:SHIBOR.1W');
    expect(shibor.observations[0]?.value).toBe(1.376);

    const lprJson = JSON.stringify({
      data: { showDateCN: '2026-08-20 09:00' },
      records: [
        { termCode: '1Y', shibor: '3.00' },
        { termCode: '5Y', shibor: '3.50' },
      ],
    });
    const lpr = parseChinaMoneyLpr(lprJson);
    expect(lpr.observations.length).toBe(2);
    expect(lpr.observations[0]?.instrumentId).toBe('rate:LPR.1Y');
    expect(lpr.observations[0]?.value).toBe(3.0);
  });

  test('parseFredDailyCsv parses by headers and avoids mixing frequencies', () => {
    const csv = `DATE,DGS10,DGS2,DTWEXBGS,DCOILWTICO,DCOILBRENTEU\n2026-09-01,4.79,4.39,.,91.48,96.02\n2026-09-03,4.77,4.34,.,.,.`;
    const res = parseFredDailyCsv(csv);
    expect(res.dgs10.length).toBe(2);
    expect(res.dgs10[0]?.value).toBe(4.79);
    expect(res.dgs2[1]?.value).toBe(4.34);
    expect(res.oilWti.length).toBe(1);
    expect(res.oilWti[0]?.value).toBe(91.48);
  });
});

describe('market source date and unit regressions', () => {
  test('Shibor unchanged-rate sentinel 1 is not a one-basis-point move', () => {
    const result = parseChinaMoneyShibor(
      JSON.stringify({
        data: { showDateCN: '2026-09-04 11:00' },
        records: [
          { termCode: 'O/N', shibor: '1.3620', shibIdUpDown: '0.00', shibIdUpDownNum: 1 },
          { termCode: '1W', shibor: '1.3760', shibIdUpDown: '0.20', shibIdUpDownNum: 0.2 },
          { termCode: '2W', shibor: '1.3869', shibIdUpDown: '0.21', shibIdUpDownNum: -0.21 },
        ],
      }),
    );
    expect(result.observations.map((o) => o.changeBp)).toEqual([0, 0.2, -0.21]);
  });

  test('SHFE historical selection stays on the requested contract when another becomes more active', () => {
    const row = {
      PRODUCTID: 'au_f',
      OPENPRICE: 950,
      HIGHESTPRICE: 980,
      LOWESTPRICE: 940,
      CLOSEPRICE: 960,
      PRESETTLEMENTPRICE: 955,
      VOLUME: 100,
      TURNOVER: 96,
    };
    const raw = JSON.stringify({
      report_date: '20260904',
      o_curinstrument: [
        { ...row, DELIVERYMONTH: '2610', OPENINTEREST: 10 },
        { ...row, DELIVERYMONTH: '2612', OPENINTEREST: 1000, CLOSEPRICE: 970 },
      ],
    });
    expect(parseShfeDailyJson(raw, ['au']).quotes[0]?.instrumentId).toBe('comm:SHFE.AU2612');
    expect(parseShfeDailyJson(raw, ['au'], { au: 'AU2610' }).quotes[0]?.instrumentId).toBe(
      'comm:SHFE.AU2610',
    );
    expect(parseShfeDailyJson(raw, ['au'], { au: 'AU2702' }).bars).toEqual([]);
  });

  test('ECB currencies from different observation dates cannot be combined', () => {
    const result = parseEcbFxCsv(
      'CURRENCY,CURRENCY_DENOM,TIME_PERIOD,OBS_VALUE\nCNY,EUR,2026-09-04,7.8\nUSD,EUR,2026-09-03,1.16\nJPY,EUR,2026-09-04,181',
    );
    expect(result.usdCnyObservations).toEqual([]);
    expect(result.usdJpyObservations).toEqual([]);
  });

  test('ETF NAV and holdings keep China-local dates and disclosure units', () => {
    const nav = parseFuyaoFundNav(
      'etf:511010.SH',
      [{ nav_date: Date.parse('2026-09-04T00:00:00+08:00'), unit_nav: 141.194 }],
      200,
    );
    expect(nav[0]).toMatchObject({
      observationDate: '2026-09-04',
      source: 'fuyao',
      value: 141.194,
      collectedAt: 200,
    });
    const holdings = parseFuyaoFundHoldings(
      'etf:511010.SH',
      [
        {
          thscode: '250020.IB',
          stock_name: '国债',
          asset_type: 'bond',
          end_date_ms: Date.parse('2026-06-30T00:00:00+08:00'),
          publish_date_ms: Date.parse('2026-07-21T00:00:00+08:00'),
          hold_ratio: 20.75,
          position_count: 10400000,
          position_capital: 1061756515.07,
        },
      ],
      200,
    );
    expect(holdings[0]).toMatchObject({
      reportDate: '2026-06-30',
      publishedAt: '2026-07-21',
      assetType: 'bond',
      holdShares: 1040,
      holdValueWan: 106175.651507,
    });
  });
});
