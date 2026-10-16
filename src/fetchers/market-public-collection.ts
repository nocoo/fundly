import type { Database } from 'bun:sqlite';
import type { MarketCollection } from '../db/market-publish.ts';
import type {
  AssetClass,
  MarketInstrument,
  MarketSeriesObservation,
} from '../utils/market-types.ts';
import { chinaMarketDate, marketNumber, shiftMarketDate } from '../utils/market-validation.ts';
import { FRED_SERIES } from '../utils/market-watchlist.ts';
import { MarketReadError, type MarketReader } from './market-reader.ts';
import {
  parseCboeVixCsv,
  parseChinaMoneyLpr,
  parseChinaMoneyShibor,
  parseEcbFxCsv,
  parseFredSeriesCsv,
  parseShfeDailyJson,
} from './public-market.ts';

function instrument(
  id: string,
  name: string,
  assetClass: AssetClass,
  source: string,
  unit: string,
  currency = 'USD',
  calendar = 'DAILY_REFERENCE',
): MarketInstrument {
  return {
    instrumentId: id,
    name,
    assetClass,
    symbol: id.split(':').slice(1).join(':'),
    exchange: source.toUpperCase(),
    unit,
    currency,
    tradingCalendar: calendar,
  };
}

function empty(reader: MarketReader, source: string): MarketCollection & { warnings: string[] } {
  return {
    sourceKey: source,
    batchId: crypto.randomUUID(),
    mode: reader.mode,
    startedAt: reader.startedAt,
    collectedAt: 0,
    tradeDate: '',
    expectedItems: 0,
    actualItems: 0,
    instruments: [],
    quotes: [],
    bars: [],
    observations: [],
    warnings: [],
  };
}

function finish(reader: MarketReader, batch: MarketCollection): MarketCollection {
  batch.collectedAt = reader.collectedAt;
  batch.startedAt = reader.mode === 'evidence' ? reader.firstCollectedAt : reader.startedAt;
  batch.tradeDate =
    [...batch.quotes.map((q) => q.tradeDate), ...batch.observations.map((o) => o.observationDate)]
      .sort()
      .at(-1) ?? '';
  return batch;
}

export async function collectCboe(
  reader: MarketReader,
  historyDays = 1826,
): Promise<MarketCollection> {
  const response = await reader.text(
    'https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv',
    'public/cboe_vix.txt',
  );
  const parsed = parseCboeVixCsv(response.text);
  if (!parsed.latestQuote) throw new Error('Cboe returned no valid OHLC');
  const batch = empty(reader, 'cboe');
  batch.instruments = [
    instrument('risk:CBOE.VIX', 'VIX波动率指数', 'risk', 'CBOE', '点', 'USD', 'US_EQUITY'),
  ];
  batch.quotes = [{ ...parsed.latestQuote, collectedAt: response.collectedAt }];
  const from = shiftMarketDate(parsed.latestQuote.tradeDate, -historyDays);
  batch.bars = parsed.bars
    .filter((b) => b.tradeDate >= from)
    .map((b) => ({ ...b, collectedAt: response.collectedAt }));
  batch.expectedItems = 1;
  batch.actualItems = batch.quotes.length;
  return finish(reader, batch);
}

export async function collectEcb(
  reader: MarketReader,
  historyDays = 120,
): Promise<MarketCollection> {
  const from = shiftMarketDate(chinaMarketDate(Date.now()), -historyDays);
  const response = await reader.text(
    'https://data-api.ecb.europa.eu/service/data/EXR/D.USD+CNY+JPY.EUR.SP00.A?startPeriod=' +
      from +
      '&format=csvdata',
    'public/ecb_fx.txt',
  );
  const parsed = parseEcbFxCsv(response.text);
  if (!parsed.usdCnyObservations.length || !parsed.usdJpyObservations.length)
    throw new Error('Incomplete ECB currency set');
  const batch = empty(reader, 'ecb');
  batch.instruments = [
    instrument('fx:USDCNY', '美元/人民币', 'fx', 'ECB', '人民币/美元', 'CNY'),
    instrument('fx:USDJPY', '美元/日元', 'fx', 'ECB', '日元/美元', 'JPY'),
  ];
  batch.observations = [...parsed.usdCnyObservations, ...parsed.usdJpyObservations].map((o) => ({
    ...o,
    collectedAt: response.collectedAt,
  }));
  batch.expectedItems = 2;
  batch.actualItems = new Set(batch.observations.map((o) => o.instrumentId)).size;
  return finish(reader, batch);
}

export async function collectChinaMoney(
  reader: MarketReader,
  kind: 'shibor' | 'lpr',
): Promise<MarketCollection> {
  const response = await reader.text(
    kind === 'shibor'
      ? 'https://www.chinamoney.com.cn/r/cms/www/chinamoney/data/shibor/shibor.json'
      : 'https://www.chinamoney.com.cn/r/cms/www/chinamoney/data/currency/bk-lpr.json',
    kind === 'shibor' ? 'public/chinamoney_shibor_correct.txt' : 'public/chinamoney_lpr.txt',
  );
  const parsed =
    kind === 'shibor' ? parseChinaMoneyShibor(response.text) : parseChinaMoneyLpr(response.text);
  const batch = empty(reader, `chinamoney_${kind}`);
  batch.observations = parsed.observations.map((o) => ({
    ...o,
    collectedAt: response.collectedAt,
  }));
  batch.instruments = batch.observations.map((o) =>
    instrument(
      o.instrumentId,
      o.instrumentId.startsWith('rate:LPR.')
        ? o.instrumentId.endsWith('1Y')
          ? 'LPR 1年'
          : 'LPR 5年以上'
        : o.instrumentId.slice(5).replace('.', ' '),
      'rate',
      'CFETS',
      '%',
      'CNY',
      kind === 'lpr' ? 'MONTHLY_REFERENCE' : 'CN_DAILY_REFERENCE',
    ),
  );
  batch.expectedItems = kind === 'shibor' ? 8 : 2;
  batch.actualItems = new Set(batch.observations.map((o) => o.instrumentId)).size;
  return finish(reader, batch);
}

export function alignedTreasurySpread(
  observations: MarketSeriesObservation[],
): MarketSeriesObservation[] {
  const two = new Map(
    observations
      .filter((o) => o.instrumentId === 'rate:US.DGS2')
      .map((o) => [o.observationDate, o]),
  );
  return observations.flatMap((ten) => {
    const previous = two.get(ten.observationDate);
    if (ten.instrumentId !== 'rate:US.DGS10' || !previous) return [];
    return [
      {
        instrumentId: 'rate:US.10Y2Y',
        observationDate: ten.observationDate,
        source: 'fred',
        value: (ten.value - previous.value) * 100,
        unit: 'bp',
        collectedAt: Math.max(ten.collectedAt, previous.collectedAt),
      },
    ];
  });
}

export async function collectFred(
  reader: MarketReader,
  historyDays = 120,
): Promise<MarketCollection> {
  const batch = empty(reader, 'fred');
  const from = shiftMarketDate(chinaMarketDate(Date.now()), -historyDays);
  for (const series of FRED_SERIES) {
    const archive =
      series.series === 'SP500' || series.series === 'NASDAQCOM'
        ? 'public/fred_global_equities.txt'
        : 'public/fred_daily.csv';
    const response = await reader.text(
      `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${series.series}&cosd=${from}`,
      archive,
    );
    const parsed = parseFredSeriesCsv(response.text, series.series, series.id, series.unit);
    const lastObservation = parsed.at(-1);
    const start =
      reader.mode === 'evidence' && lastObservation
        ? shiftMarketDate(lastObservation.observationDate, -historyDays)
        : from;
    const observations = parsed.filter((o) => o.observationDate >= start);
    if (!observations.length) throw new Error(`No usable FRED observations for ${series.series}`);
    batch.instruments.push(
      instrument(series.id, series.name, series.assetClass, 'FRED', series.unit),
    );
    batch.observations.push(
      ...observations.map((o) => ({ ...o, collectedAt: response.collectedAt })),
    );
  }
  const spread = alignedTreasurySpread(batch.observations);
  if (spread.length) {
    batch.instruments.push(instrument('rate:US.10Y2Y', '美债10Y−2Y利差', 'rate', 'FRED', 'bp'));
    batch.observations.push(...spread);
  }
  batch.expectedItems = FRED_SERIES.length;
  batch.actualItems = batch.instruments.filter((i) => i.instrumentId !== 'rate:US.10Y2Y').length;
  return finish(reader, batch);
}

export function isPublishedShfeReport(raw: string, date: string, today: string): boolean {
  const report = JSON.parse(raw);
  if (report.report_date !== date.replaceAll('-', '') || !Array.isArray(report.o_curinstrument))
    throw new Error('Invalid SHFE daily report');
  let pending = false;
  for (const product of ['au', 'cu']) {
    const row = (report.o_curinstrument as Array<Record<string, unknown>>)
      .filter(
        (r) =>
          r &&
          String(r.PRODUCTID).trim().toLowerCase() === `${product}_f` &&
          /^\d{2}(0[1-9]|1[0-2])$/.test(String(r.DELIVERYMONTH).trim()),
      )
      .sort(
        (a, b) => (marketNumber(b.OPENINTEREST) ?? -1) - (marketNumber(a.OPENINTEREST) ?? -1),
      )[0];
    if (!row) throw new Error('Incomplete SHFE daily report');
    const open = marketNumber(row.OPENPRICE);
    const high = marketNumber(row.HIGHESTPRICE);
    const low = marketNumber(row.LOWESTPRICE);
    const close = marketNumber(row.CLOSEPRICE);
    const settlement = marketNumber(row.SETTLEMENTPRICE);
    if (
      open === null ||
      high === null ||
      low === null ||
      low <= 0 ||
      open < low ||
      open > high ||
      (row.CLOSEPRICE !== '' && (close === null || close < low || close > high)) ||
      (row.SETTLEMENTPRICE !== '' && (settlement === null || settlement <= 0))
    )
      throw new Error('Invalid SHFE contract prices');
    if (row.CLOSEPRICE === '' || row.SETTLEMENTPRICE === '') pending = true;
  }
  if (pending) {
    if (date === today) return false;
    throw new Error('Incomplete SHFE daily report');
  }
  const parsed = parseShfeDailyJson(raw);
  if (parsed.quotes.length !== 2 || parsed.bars.length !== 2)
    throw new Error('Incomplete SHFE daily report');
  return true;
}

export async function collectShfe(
  db: Database,
  reader: MarketReader,
  historyDays = 120,
  progress: (message: string) => void = () => {},
): Promise<MarketCollection> {
  const batch = empty(reader, 'shfe');
  const today = chinaMarketDate(Date.now());
  let latest: Awaited<ReturnType<MarketReader['text']>> | null = null;
  if (reader.mode === 'evidence') latest = await reader.text('', 'public/shfe_daily_0904.txt');
  else {
    for (let offset = 0; offset < 16; offset++) {
      const date = shiftMarketDate(today, -offset);
      try {
        const response = await reader.text(
          'https://www.shfe.com.cn/data/tradedata/future/dailydata/kx' +
            date.replaceAll('-', '') +
            '.dat',
        );
        if (!isPublishedShfeReport(response.text, date, today)) continue;
        latest = response;
        break;
      } catch (error) {
        if (!(error instanceof MarketReadError) || error.status !== 404) throw error;
      }
    }
  }
  if (!latest) throw new Error('No published SHFE daily report');
  const parsed = parseShfeDailyJson(latest.text);
  if (
    parsed.quotes.length !== 2 ||
    parsed.bars.length !== 2 ||
    parsed.quotes.some((quote) => quote.settlementPrice == null)
  )
    throw new Error('Incomplete SHFE contracts, OHLC or settlement');
  const published = db
    .query("SELECT MAX(trade_date) AS date FROM market_quote_latest WHERE source = 'shfe'")
    .get() as { date: string | null };
  const publishedDate = published.date;
  if (publishedDate && parsed.quotes.some((quote) => quote.tradeDate < publishedDate))
    throw new Error('SHFE report is older than published quotes');
  const collectedAt = latest.collectedAt;
  batch.quotes = parsed.quotes.map((q) => ({ ...q, collectedAt }));
  batch.bars = parsed.bars.map((b) => ({ ...b, collectedAt }));
  batch.instruments = batch.quotes.map((q) => {
    const symbol = q.instrumentId.split('.').at(-1);
    if (!symbol) throw new Error('Missing SHFE contract code');
    return instrument(
      q.instrumentId,
      (symbol.startsWith('AU') ? '沪金 ' : '沪铜 ') + symbol,
      'commodity',
      'SHFE',
      symbol.startsWith('AU') ? '元/克' : '元/吨',
      'CNY',
      'CN_FUTURES',
    );
  });
  const fixed: Record<string, string> = {};
  for (const item of batch.instruments) {
    const contract = item.symbol.split('.').at(-1);
    if (!contract) throw new Error('Missing SHFE contract code');
    fixed[contract.slice(0, 2).toLowerCase()] = contract;
  }
  const end = parsed.quotes[0]?.tradeDate;
  const [firstContract, secondContract] = batch.instruments;
  if (!end || !firstContract || !secondContract)
    throw new Error('Incomplete SHFE contract selection');
  let completeDates = 1;
  if (reader.mode === 'live') {
    for (let offset = 1; offset <= historyDays && completeDates < 61; offset++) {
      const date = shiftMarketDate(end, -offset);
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      if (weekday === 0 || weekday === 6) continue;
      const existing = db
        .query(
          'SELECT COUNT(*) AS n FROM market_daily_bar WHERE instrument_id IN (?, ?) AND trade_date = ?',
        )
        .get(firstContract.instrumentId, secondContract.instrumentId, date) as {
        n: number;
      };
      if (existing.n === 2) {
        completeDates++;
        continue;
      }
      try {
        const response = await reader.text(
          'https://www.shfe.com.cn/data/tradedata/future/dailydata/kx' +
            date.replaceAll('-', '') +
            '.dat',
        );
        const historical = parseShfeDailyJson(response.text, ['au', 'cu'], fixed);
        if (historical.bars.some((b) => b.tradeDate !== date))
          throw new Error('SHFE historical date mismatch');
        batch.bars.push(
          ...historical.bars.map((b) => ({ ...b, collectedAt: response.collectedAt })),
        );
        if (historical.bars.length === 2) completeDates++;
        if (completeDates % 20 === 0) progress(`固定商品合约已覆盖 ${completeDates} 个交易日`);
      } catch (error) {
        if (error instanceof MarketReadError && error.status === 404) continue;
        batch.warnings.push('部分 SHFE 历史暂不可用，保留已验证日线');
        break;
      }
    }
  }
  batch.expectedItems = 2;
  batch.actualItems = batch.quotes.length;
  batch.replaceShfeContracts = true;
  return finish(reader, batch);
}
