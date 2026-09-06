import type { Database } from 'bun:sqlite';
import type { MarketCollection } from '../db/market-publish.ts';
import { computeMarketBreadth } from '../metrics/market-calc.ts';
import type { MarketQuote } from '../utils/market-types.ts';
import {
  chinaMarketDate,
  isMarketDate,
  marketNumber,
  shiftMarketDate,
} from '../utils/market-validation.ts';
import {
  CN_WATCHLIST,
  chinaInstrument,
  ETF_WATCHLIST,
  INDUSTRY_WATCHLIST,
  MAJOR_INDICES,
  MARKET_RELATIONS,
} from '../utils/market-watchlist.ts';
import {
  parseFuyaoDailyBars,
  parseFuyaoFundHoldings,
  parseFuyaoFundNav,
  parseFuyaoFundProfile,
  parseFuyaoIndexMembers,
  parseFuyaoQuote,
} from './fuyao.ts';
import type { FuyaoData, MarketReader } from './market-reader.ts';

export function assertSymbolSet(
  rows: Array<Record<string, unknown>>,
  expected: ReadonlySet<string>,
): void {
  const received = new Set(rows.map((row) => row.thscode));
  if (
    received.size !== rows.length ||
    received.size !== expected.size ||
    [...received].some((code) => typeof code !== 'string' || !expected.has(code))
  ) {
    throw new Error('Incomplete or mismatched security universe');
  }
}

export function calendarDates(data: FuyaoData): string[] {
  const dates = data.item
    .map((row) => {
      const date = String(row.date ?? '');
      return /^\d{8}$/.test(date)
        ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
        : date;
    })
    .filter(isMarketDate);
  if (dates.length !== data.item.length || dates.length === 0)
    throw new Error('Invalid trading calendar');
  return [...new Set(dates)].sort();
}

export function recentHistoryStart(
  db: Database,
  id: string,
  from: string,
  date: string,
  mode: string,
): string {
  if (mode === 'evidence') return from;
  const row = db
    .query(
      'SELECT MIN(trade_date) AS earliest, MAX(trade_date) AS latest FROM market_daily_bar WHERE instrument_id = ?',
    )
    .get(id) as { earliest: string | null; latest: string | null };
  // A wider requested range must backfill even when recent daily bars already exist.
  // Allow a holiday at the lower boundary; keep an overlap for recent corrections.
  if (row.earliest && row.earliest <= shiftMarketDate(from, 10) && row.latest)
    return shiftMarketDate(row.latest > date ? date : row.latest, -5);
  return from;
}

/** Half-open windows; ETFs permit at most five years per upstream request. */
export function fuyaoHistoryWindows(from: string, to: string, isEtf: boolean) {
  const windows: Array<{ from: string; to: string }> = [];
  const end = shiftMarketDate(to, 1);
  for (let start = from; start < end; ) {
    const next = shiftMarketDate(start, isEtf ? 1460 : 3650);
    const stop = next < end ? next : end;
    windows.push({ from: start, to: stop });
    start = stop;
  }
  return windows;
}

export async function collectFuyao(
  db: Database,
  reader: MarketReader,
  historyDays = 1826,
  progress: (message: string) => void = () => {},
): Promise<MarketCollection> {
  const warnings: string[] = [];
  const optional = async <T>(label: string, read: () => Promise<T>): Promise<T | null> => {
    try {
      return await read();
    } catch (error) {
      warnings.push(`${label}: ${error instanceof Error ? error.message : 'unavailable'}`);
      return null;
    }
  };
  const calendar = await reader.fuyao('/api/a-share/calendar/trading-days', {}, 'calendar.json');
  const days = calendarDates(calendar);
  const referenceTime = reader.mode === 'evidence' ? calendar.collectedAt : Date.now();
  const today = chinaMarketDate(referenceTime);
  const local = new Date(referenceTime + 8 * 3600000);
  const beforeOpen = local.getUTCHours() * 60 + local.getUTCMinutes() < 9 * 60 + 15;
  const candidateDate = days.filter((d) => d < today || (d === today && !beforeOpen)).at(-1);
  if (!candidateDate) throw new Error('No applicable trading date');
  const tradeDate: string = candidateDate;
  const from = shiftMarketDate(tradeDate, -historyDays);

  const stocks = await reader.fuyao(
    '/api/meta/tickers/list',
    { asset_type: 'a-share', limit: 10000 },
    'a_share_catalog.json',
  );
  if (
    !stocks.item.length ||
    stocks.item.length >= 10000 ||
    stocks.item.some(
      (r) =>
        r.asset_type !== 'a-share' || typeof r.thscode !== 'string' || typeof r.name !== 'string',
    )
  )
    throw new Error('Invalid or truncated A-share catalog');
  const stockSet = new Set(stocks.item.map((r) => String(r.thscode)));
  if (stockSet.size !== stocks.item.length) throw new Error('Duplicate A-share catalog entries');
  const shSzSet = new Set(
    stocks.item
      .filter((r) => r.exchange === 'SH' || r.exchange === 'SZ')
      .map((r) => String(r.thscode)),
  );
  const industryCatalog = await reader.fuyao(
    '/api/a-share-index/catalog/ths-index-list',
    { tag: 'industry' },
    'industry_catalog.json',
  );
  const etfCatalog = await reader.fuyao(
    '/api/meta/tickers/list',
    { asset_type: 'fund-etf', limit: 10000 },
    'etf_catalog.json',
  );
  const industryNames = new Map(
    industryCatalog.item.map((r) => [String(r.thscode), String(r.name)]),
  );
  const etfNames = new Map(
    etfCatalog.item
      .filter((r) => r.asset_type === 'fund-etf')
      .map((r) => [String(r.thscode), String(r.name)]),
  );
  for (const ind of INDUSTRY_WATCHLIST)
    if (industryNames.get(ind.symbol) !== ind.name)
      throw new Error(`Industry identity mismatch: ${ind.symbol}`);
  for (const [symbol] of ETF_WATCHLIST)
    if (!etfNames.has(symbol)) throw new Error(`Missing ETF identity: ${symbol}`);

  const batch: MarketCollection &
    Required<Pick<MarketCollection, 'members' | 'profiles' | 'holdings' | 'aliases'>> = {
    sourceKey: 'fuyao',
    batchId: crypto.randomUUID(),
    mode: reader.mode,
    startedAt: reader.startedAt,
    collectedAt: 0,
    tradeDate,
    expectedItems: stockSet.size + CN_WATCHLIST.length,
    actualItems: 0,
    instruments: [
      ...CN_WATCHLIST.map((i) => ({
        ...i,
        name: i.assetClass === 'etf' ? (etfNames.get(i.symbol) ?? i.name) : i.name,
      })),
      ...stocks.item.map((r) => chinaInstrument('stock', String(r.thscode), String(r.name))),
    ],
    quotes: [],
    bars: [],
    observations: [],
    members: [],
    aliases: [],
    profiles: [],
    holdings: [],
    relations: [...MARKET_RELATIONS],
    replaceWatchlist: true,
    warnings,
  };
  progress('目录身份已校验，开始采集指数和 ETF 快照');
  function snapshot(
    data: FuyaoData,
    kind: 'index' | 'industry' | 'etf',
    symbols: readonly string[],
  ): void {
    assertSymbolSet(data.item, new Set(symbols));
    for (const row of data.item) {
      const q = parseFuyaoQuote(`${kind}:${row.thscode}`, row, data.timestamp, tradeDate);
      if (q.price == null || q.price <= 0)
        throw new Error(`Missing watchlist price: ${row.thscode}`);
      batch.quotes.push({ ...q, collectedAt: data.collectedAt });
    }
  }
  const indexSymbols = MAJOR_INDICES.map(([code]) => code);
  snapshot(
    await reader.fuyao(
      '/api/a-share-index/prices/snapshot',
      { thscodes: indexSymbols.join(',') },
      'major_indices.json',
    ),
    'index',
    indexSymbols,
  );
  const industrySymbols = INDUSTRY_WATCHLIST.map((i) => i.symbol);
  snapshot(
    await reader.fuyao(
      '/api/a-share-index/prices/snapshot',
      { thscodes: industrySymbols.join(',') },
      'industry_snapshot_selected.json',
    ),
    'industry',
    industrySymbols,
  );
  for (const [symbol] of ETF_WATCHLIST)
    snapshot(
      await reader.fuyao(
        '/api/fund/market/snapshot',
        { thscode: symbol },
        `etf_snapshot_${symbol.slice(0, 6)}.json`,
      ),
      'etf',
      [symbol],
    );

  const stockRows: Array<Record<string, unknown>> = [];
  const stockQuotes: MarketQuote[] = [];
  for (let offset = 0; offset < stockSet.size; offset += 1000) {
    const page = await reader.fuyao(
      '/api/a-share/prices/snapshot',
      { offset, limit: 1000 },
      `a_share_page_${offset}.json`,
    );
    if (page.total !== stockSet.size || page.item.length !== Math.min(1000, stockSet.size - offset))
      throw new Error('A-share page coverage changed during collection');
    stockRows.push(...page.item);
    stockQuotes.push(
      ...page.item.map((r) => ({
        ...parseFuyaoQuote(`stock:${r.thscode}`, r, page.timestamp, tradeDate),
        collectedAt: page.collectedAt,
      })),
    );
  }
  assertSymbolSet(stockRows, stockSet);
  batch.quotes.push(...stockQuotes);
  batch.actualItems = batch.quotes.length;
  progress('股票分页集合一致，开始采集日 K 与披露资料');

  async function limitPool(kind: 'up' | 'down' | 'break'): Promise<number | null> {
    return optional(`limit-${kind}`, async () => {
      const rows: Array<Record<string, unknown>> = [];
      let total = 0;
      for (let page = 1; page === 1 || rows.length < total; page++) {
        const data = await reader.fuyao(
          `/api/a-share/special-data/limit-${kind}-pool`,
          { date_ms: Date.parse(`${tradeDate}T00:00:00+08:00`), page, size: 200 },
          `limit_${kind}_${tradeDate.slice(5).replace('-', '')}.json`,
        );
        const n = marketNumber(data.pagination?.total);
        if (
          n === null ||
          !Number.isInteger(n) ||
          n < 0 ||
          n > stockSet.size ||
          (page > 1 && n !== total)
        )
          throw new Error('Invalid limit pool coverage');
        total = n;
        rows.push(...data.item);
        if (rows.length < total && data.item.length === 0) throw new Error('Incomplete limit pool');
        if (reader.mode === 'evidence' && rows.length < total)
          throw new Error('Incomplete archived limit pool');
      }
      if (rows.length !== total || new Set(rows.map((r) => r.thscode)).size !== rows.length)
        throw new Error('Duplicate or incomplete limit pool');
      return rows.filter((r) => shSzSet.has(String(r.thscode))).length;
    });
  }
  const up = await limitPool('up');
  const down = await limitPool('down');
  const broken = await limitPool('break');
  batch.breadth = computeMarketBreadth(
    stockRows.map((r) => ({
      code: String(r.thscode),
      price: marketNumber(r.last_price),
      prevClose: marketNumber(r.prev_price),
      volume: marketNumber(r.volume),
      turnover: marketNumber(r.turnover),
      changePct: marketNumber(r.price_change_ratio_pct) ?? Number.NaN,
    })),
    tradeDate,
    shSzSet.size,
    {
      limitUpCount: up ?? undefined,
      limitDownCount: down ?? undefined,
      limitBreakCount: broken ?? undefined,
    },
    shSzSet,
  );
  batch.breadth.collectedAt = Math.max(...stockQuotes.map((q) => q.collectedAt));

  for (const instrument of CN_WATCHLIST) {
    const isEtf = instrument.assetClass === 'etf';
    const archive = isEtf
      ? `etf_history_${instrument.symbol.slice(0, 6)}.json`
      : instrument.instrumentId === 'index:000300.SH'
        ? 'index_csi300_history.json'
        : INDUSTRY_WATCHLIST.find((i) => i.symbol === instrument.symbol)?.evidence +
          '_history.json';
    const start = recentHistoryStart(db, instrument.instrumentId, from, tradeDate, reader.mode);
    const bars = await optional(`${instrument.symbol} 日K`, async () => {
      const result: MarketCollection['bars'] = [];
      for (const window of fuyaoHistoryWindows(start, tradeDate, isEtf)) {
        const data = await reader.fuyao(
          isEtf ? '/api/fund/market/historical' : '/api/a-share-index/prices/historical',
          {
            thscode: instrument.symbol,
            interval: '1d',
            start: Date.parse(`${window.from}T00:00:00+08:00`),
            end: Date.parse(`${window.to}T00:00:00+08:00`),
          },
          archive,
        );
        if (data.thscode && data.thscode !== instrument.symbol)
          throw new Error('History identity mismatch');
        const parsed = parseFuyaoDailyBars(instrument.instrumentId, data.item).filter(
          (b) => b.tradeDate >= window.from && b.tradeDate < window.to,
        );
        result.push(...parsed.map((bar) => ({ ...bar, collectedAt: data.collectedAt })));
      }
      if (!result.length) throw new Error('No usable OHLC bars');
      progress(`${instrument.symbol} 日K ${result.length} 条 · ${result[0]?.tradeDate} 起`);
      return result;
    });
    if (bars) batch.bars.push(...bars);
  }
  for (const ind of [
    ...INDUSTRY_WATCHLIST.map((i) => ({
      id: `industry:${i.symbol}`,
      symbol: i.symbol,
      evidence: i.evidence,
    })),
    { id: 'index:000300.SH', symbol: '000300.SH', evidence: 'csi300' },
  ]) {
    const data = await optional(`${ind.symbol} 成分`, () =>
      reader.fuyao(
        '/api/a-share-index/constituents/ths-stock-list',
        { thscode: ind.symbol },
        `${ind.evidence}_constituents.json`,
      ),
    );
    if (!data) continue;
    const members = parseFuyaoIndexMembers(ind.id, data.item);
    if (
      !members.length ||
      members.length !== data.item.length ||
      new Set(members.map((m) => m.stockCode)).size !== members.length
    )
      throw new Error(`Invalid constituent set: ${ind.symbol}`);
    batch.members.push({ indexId: ind.id, items: members });
  }
  for (const [symbol] of ETF_WATCHLIST) {
    const id = `etf:${symbol}`;
    const code = symbol.slice(0, 6);
    const profile = await optional(`${symbol} 资料`, () =>
      reader.fuyao(
        '/api/fund/profile/detail',
        { fund_type: 'exchange', thscode: symbol },
        `etf_profile_${code}.json`,
      ),
    );
    if (profile?.item[0]) {
      if (profile.item[0].thscode !== symbol) throw new Error('ETF profile identity mismatch');
      batch.profiles.push(parseFuyaoFundProfile(id, profile.item[0], profile.collectedAt));
    }
    const nav = await optional(`${symbol} 净值`, () =>
      reader.fuyao(
        '/api/fund/performance/nav',
        { fund_type: 'exchange', thscode: symbol, range: 'month', nav_type: 'unit' },
        `etf_nav_${code}.json`,
      ),
    );
    if (nav) batch.observations.push(...parseFuyaoFundNav(id, nav.item, nav.collectedAt));
    const holdings = await optional(`${symbol} 披露持仓`, () =>
      reader.fuyao(
        '/api/fund/portfolio/holdings',
        { fund_type: 'exchange', thscode: symbol },
        `etf_holdings_${code}.json`,
      ),
    );
    if (holdings)
      batch.holdings.push(...parseFuyaoFundHoldings(id, holdings.item, holdings.collectedAt));
    const local = db
      .query('SELECT fund_name FROM fund_basic_info WHERE fund_code = ?')
      .get(code) as { fund_name: string } | null;
    const names = [etfNames.get(symbol), profile?.item[0]?.fund_name].filter(
      (v): v is string => typeof v === 'string',
    );
    const normalize = (s: string) => s.replace(/\s+/g, '').toUpperCase();
    const verified = local && names.some((name) => normalize(name) === normalize(local.fund_name));
    batch.aliases.push({
      instrumentId: id,
      symbol,
      fundCode: verified ? code : null,
      notes: verified
        ? 'ETF catalog / profile identity and local fund name verified'
        : 'No verified local fund identity',
    });
  }
  batch.collectedAt = reader.collectedAt;
  batch.startedAt = reader.mode === 'evidence' ? reader.firstCollectedAt : reader.startedAt;
  return batch;
}
