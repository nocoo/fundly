import type {
  MarketDailyBar,
  MarketQuote,
  MarketSeriesObservation,
} from '../utils/market-types.ts';
import { isMarketDate, marketCsv, marketNumber, validOhlc } from '../utils/market-validation.ts';

export function parseCboeVixCsv(csv: string): {
  latestQuote: MarketQuote | null;
  bars: MarketDailyBar[];
} {
  const bars: MarketDailyBar[] = [];
  for (const row of marketCsv(csv)) {
    const match = row.DATE?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) continue;
    const [, month, day, year] = match;
    if (!month || !day || !year) continue;
    const date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    const open = marketNumber(row.OPEN);
    const high = marketNumber(row.HIGH);
    const low = marketNumber(row.LOW);
    const close = marketNumber(row.CLOSE);
    if (!isMarketDate(date) || open === null || high === null || low === null || close === null)
      continue;
    const bar: MarketDailyBar = {
      instrumentId: 'risk:CBOE.VIX',
      tradeDate: date,
      source: 'cboe',
      open,
      high,
      low,
      close,
      volume: null,
      turnover: null,
    };
    if (validOhlc(bar)) bars.push(bar);
  }
  bars.sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
  const last = bars.at(-1);
  const previous = bars.at(-2);
  return {
    bars,
    latestQuote: last
      ? {
          instrumentId: last.instrumentId,
          source: 'cboe',
          tradeDate: last.tradeDate,
          price: last.close,
          open: last.open,
          high: last.high,
          low: last.low,
          close: last.close,
          prevClose: previous?.close ?? null,
          changePct:
            previous && previous.close > 0 ? (last.close / previous.close - 1) * 100 : null,
          collectedAt: Date.now(),
        }
      : null,
  };
}

/** A contract is chosen on the latest date, then kept fixed throughout its history. */
export function parseShfeDailyJson(
  raw: string,
  products = ['au', 'cu'],
  fixedContracts?: Record<string, string>,
): { quotes: MarketQuote[]; bars: MarketDailyBar[] } {
  let data: { report_date?: string; o_curinstrument?: Array<Record<string, unknown>> };
  try {
    data = JSON.parse(raw);
  } catch {
    return { quotes: [], bars: [] };
  }
  const compact = String(data.report_date ?? '');
  const date = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  if (!isMarketDate(date) || !Array.isArray(data.o_curinstrument)) return { quotes: [], bars: [] };
  const quotes: MarketQuote[] = [];
  const bars: MarketDailyBar[] = [];
  for (const product of products) {
    const contracts = data.o_curinstrument.filter(
      (r) =>
        r &&
        String(r.PRODUCTID).trim().toLowerCase() === `${product}_f` &&
        /^\d{2}(0[1-9]|1[0-2])$/.test(String(r.DELIVERYMONTH).trim()),
    );
    const fixed = fixedContracts?.[product];
    const row = fixed
      ? contracts.find((r) => product.toUpperCase() + String(r.DELIVERYMONTH).trim() === fixed)
      : contracts.sort(
          (a, b) => (marketNumber(b.OPENINTEREST) ?? -1) - (marketNumber(a.OPENINTEREST) ?? -1),
        )[0];
    if (!row) continue;
    const close = marketNumber(row.CLOSEPRICE);
    const open = marketNumber(row.OPENPRICE);
    const high = marketNumber(row.HIGHESTPRICE);
    const low = marketNumber(row.LOWESTPRICE);
    const previousSettlement = marketNumber(row.PRESETTLEMENTPRICE);
    const volume = marketNumber(row.VOLUME);
    const turnoverWan = marketNumber(row.TURNOVER);
    const turnover = turnoverWan === null ? null : Math.round(turnoverWan * 10000 * 100) / 100;
    const id = `comm:SHFE.${product.toUpperCase()}${String(row.DELIVERYMONTH).trim()}`;
    if (close === null) continue;
    quotes.push({
      instrumentId: id,
      source: 'shfe',
      tradeDate: date,
      price: close,
      close,
      open,
      high,
      low,
      prevClose: null,
      prevSettlement: previousSettlement,
      settlementPrice: marketNumber(row.SETTLEMENTPRICE),
      openInterest: marketNumber(row.OPENINTEREST),
      volume,
      turnover,
      collectedAt: Date.now(),
      changePct:
        previousSettlement !== null && previousSettlement > 0
          ? (close / previousSettlement - 1) * 100
          : null,
      rawJson: JSON.stringify({
        openInterest: marketNumber(row.OPENINTEREST),
        changeBasis: 'previous_settlement',
        contract: product.toUpperCase() + String(row.DELIVERYMONTH).trim(),
      }),
    });
    if (open !== null && high !== null && low !== null) {
      const bar = {
        instrumentId: id,
        tradeDate: date,
        source: 'shfe',
        open,
        high,
        low,
        close,
        volume,
        turnover,
      };
      if (validOhlc(bar)) bars.push(bar);
    }
  }
  return { quotes, bars };
}

export function parseEcbFxCsv(csv: string): {
  usdCnyObservations: MarketSeriesObservation[];
  usdJpyObservations: MarketSeriesObservation[];
} {
  const rates = new Map<string, Record<string, number>>();
  for (const row of marketCsv(csv)) {
    const date = row.TIME_PERIOD;
    const value = marketNumber(row.OBS_VALUE);
    const currency = row.CURRENCY;
    if (
      !isMarketDate(date) ||
      value === null ||
      value <= 0 ||
      !currency ||
      row.CURRENCY_DENOM !== 'EUR'
    )
      continue;
    const current = rates.get(date) ?? {};
    current[currency] = value;
    rates.set(date, current);
  }
  const usdCnyObservations: MarketSeriesObservation[] = [];
  const usdJpyObservations: MarketSeriesObservation[] = [];
  const collectedAt = Date.now();
  for (const [date, values] of rates) {
    const usd = values.USD;
    if (!usd) continue;
    if (values.CNY)
      usdCnyObservations.push({
        instrumentId: 'fx:USDCNY',
        observationDate: date,
        source: 'ecb',
        value: values.CNY / usd,
        unit: '人民币/美元',
        collectedAt,
      });
    if (values.JPY)
      usdJpyObservations.push({
        instrumentId: 'fx:USDJPY',
        observationDate: date,
        source: 'ecb',
        value: values.JPY / usd,
        unit: '日元/美元',
        collectedAt,
      });
  }
  usdCnyObservations.sort((a, b) => a.observationDate.localeCompare(b.observationDate));
  usdJpyObservations.sort((a, b) => a.observationDate.localeCompare(b.observationDate));
  return { usdCnyObservations, usdJpyObservations };
}

function parseChinaMoneyRates(
  raw: string,
  prefix: 'SHIBOR' | 'LPR',
): { observations: MarketSeriesObservation[]; tradeDate: string } {
  let payload: { data?: { showDateCN?: string }; records?: Array<Record<string, unknown>> };
  try {
    payload = JSON.parse(raw);
  } catch {
    return { observations: [], tradeDate: '' };
  }
  const publishedAt = String(payload.data?.showDateCN ?? '');
  const tradeDate = publishedAt.slice(0, 10);
  if (!isMarketDate(tradeDate) || !Array.isArray(payload.records))
    return { observations: [], tradeDate: '' };
  const observations: MarketSeriesObservation[] = [];
  for (const row of payload.records) {
    const term = String(row.termCode ?? '').trim();
    const value = marketNumber(row.shibor);
    if (!term || value === null) continue;
    const magnitude = marketNumber(row.shibIdUpDown);
    const signed = marketNumber(row.shibIdUpDownNum);
    // ChinaMoney uses 1 as a sentinel for an unchanged rate; the displayed magnitude takes precedence.
    const changeBp =
      magnitude === null
        ? null
        : Math.abs(magnitude) * (signed !== null && signed < 0 ? -1 : magnitude < 0 ? -1 : 1);
    observations.push({
      instrumentId: `rate:${prefix}.${term}`,
      observationDate: tradeDate,
      source: 'chinamoney',
      value,
      unit: '%',
      publishedAt,
      changeBp,
      collectedAt: Date.now(),
    });
  }
  return { observations, tradeDate };
}

export function parseChinaMoneyShibor(raw: string): {
  observations: MarketSeriesObservation[];
  tradeDate: string;
} {
  return parseChinaMoneyRates(raw, 'SHIBOR');
}
export function parseChinaMoneyLpr(raw: string): {
  observations: MarketSeriesObservation[];
  tradeDate: string;
} {
  return parseChinaMoneyRates(raw, 'LPR');
}

export function parseFredSeriesCsv(
  csv: string,
  series: string,
  instrumentId: string,
  unit: string,
): MarketSeriesObservation[] {
  const observations: MarketSeriesObservation[] = [];
  for (const row of marketCsv(csv)) {
    const date = row.observation_date ?? row.DATE;
    const value = marketNumber(row[series]);
    if (isMarketDate(date) && value !== null)
      observations.push({
        instrumentId,
        observationDate: date,
        source: 'fred',
        value,
        unit,
        collectedAt: Date.now(),
      });
  }
  return observations.sort((a, b) => a.observationDate.localeCompare(b.observationDate));
}

export function parseFredDailyCsv(csv: string): {
  dgs10: MarketSeriesObservation[];
  dgs2: MarketSeriesObservation[];
  oilWti: MarketSeriesObservation[];
  oilBrent: MarketSeriesObservation[];
  dollarIndex: MarketSeriesObservation[];
} {
  return {
    dgs10: parseFredSeriesCsv(csv, 'DGS10', 'rate:US.DGS10', '%'),
    dgs2: parseFredSeriesCsv(csv, 'DGS2', 'rate:US.DGS2', '%'),
    oilWti: parseFredSeriesCsv(csv, 'DCOILWTICO', 'comm:FRED.WTI', '美元/桶'),
    oilBrent: parseFredSeriesCsv(csv, 'DCOILBRENTEU', 'comm:FRED.BRENT', '美元/桶'),
    dollarIndex: parseFredSeriesCsv(csv, 'DTWEXBGS', 'fx:FRED.DTWEXBGS', '点'),
  };
}
