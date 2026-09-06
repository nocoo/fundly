import type { Database } from 'bun:sqlite';
import {
  materializeAllEtfs,
  materializeAllStocks,
  normalizeSecurityName,
} from '../db/selection-materialize.ts';
import {
  replaceSelectionDailyBars,
  replaceSelectionEtfFinancials,
  replaceSelectionEtfHoldings,
  replaceSelectionEtfMaterialized,
  replaceSelectionEtfNav,
  replaceSelectionStockMaterialized,
  updateSelectionCollectionStatus,
  upsertSelectionEtfCatalog,
  upsertSelectionEtfProfile,
  upsertSelectionEtfSnapshots,
  upsertSelectionStockCatalog,
  upsertSelectionStockIndicators,
  upsertSelectionStockSnapshots,
  upsertSelectionStockStatements,
  upsertSelectionStockValuations,
} from '../db/selection-repo.ts';
import { deriveEtfDirectionTag } from '../metrics/selection-calc.ts';
import { chinaMarketDate, isMarketDate, shiftMarketDate } from '../utils/market-validation.ts';
import { ETF_WATCHLIST, INDUSTRY_WATCHLIST } from '../utils/market-watchlist.ts';
import { type SelectionOptions, selectResearchPool } from '../utils/selection-options.ts';
import type {
  SelectionDailyBar,
  SelectionEtfCatalogItem,
  SelectionStockCatalogItem,
  SelectionStockSnapshotQuote,
} from '../utils/selection-types.ts';
import { parseFuyaoQuote } from './fuyao.ts';
import { assertSymbolSet, calendarDates, fuyaoHistoryWindows } from './market-fuyao-collection.ts';
import type { FuyaoData, MarketReader } from './market-reader.ts';
import {
  fetchEtfDailyBars,
  fetchEtfFinancials,
  fetchEtfHoldings,
  fetchEtfNavPoints,
  fetchEtfProfile,
  fetchStockForwardBars,
  fetchStockIndicators,
  fetchStockStatements,
  fetchStockValuationsBatch,
} from './selection-fuyao.ts';

type Scope = 'etf' | 'stock';
type CatalogEntry = { symbol: string; ticker: string; name: string; exchange: string };
type ResourceState = {
  success: number;
  unavailable: string[];
  failed: Array<{ symbol: string; reason: string }>;
};
type DeepResult = {
  targetCount: number;
  validCount: number;
  success: boolean;
  resources: Record<string, ResourceState>;
  symbols: string[];
};
export interface SelectionCollectionResult {
  etfCount: number;
  stockCount: number;
  tradeDate: string;
  deep: Partial<Record<Scope, DeepResult>>;
}

export function safeSelectionError(error: unknown): string {
  return (error instanceof Error ? error.message : 'Selection collection failed')
    .replace(/sk-[\w-]+/g, '[redacted]')
    .slice(0, 300);
}

export function validateSelectionCatalog(
  data: FuyaoData,
  assetType: 'fund-etf' | 'a-share',
  previousCount = 0,
): CatalogEntry[] {
  if (
    !data.item.length ||
    data.item.length >= 10000 ||
    (data.total !== undefined && data.total !== data.item.length) ||
    data.item.length < previousCount * 0.9
  )
    throw new Error('Incomplete security catalog');
  const rows = data.item.map((row) => {
    if (
      typeof row.thscode !== 'string' ||
      !/^\d{6}\.(SH|SZ|BJ)$/.test(row.thscode) ||
      row.ticker !== row.thscode.slice(0, 6) ||
      row.exchange !== row.thscode.slice(7) ||
      typeof row.name !== 'string' ||
      !row.name.trim() ||
      row.asset_type !== assetType
    )
      throw new Error('Invalid security catalog identity');
    return {
      symbol: row.thscode,
      ticker: row.ticker as string,
      name: row.name,
      exchange: row.exchange as string,
    };
  });
  if (new Set(rows.map((r) => r.symbol)).size !== rows.length)
    throw new Error('Duplicate security catalog identity');
  return rows;
}

export function inferSelectionTradeDate(calendar: FuyaoData, now: number): string {
  const today = chinaMarketDate(now);
  const local = new Date(now + 8 * 3600000);
  const beforeOpen = local.getUTCHours() * 60 + local.getUTCMinutes() < 9 * 60 + 15;
  const date = calendarDates(calendar)
    .filter((d) => d < today || (d === today && !beforeOpen))
    .at(-1);
  if (!date || Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`) > 31 * 86400000)
    throw new Error('No current applicable trading date');
  return date;
}

export function classifyEtfAsset(fundType: string | null): string {
  if (fundType === null) return '待核验';
  if (/海外|QDII/.test(fundType)) return '境外权益';
  if (/股票/.test(fundType)) return '境内权益';
  if (/债券|固收/.test(fundType)) return '固收';
  if (/货币/.test(fundType)) return '货币';
  return '其他';
}

function snapshot(
  row: Record<string, unknown>,
  data: FuyaoData,
  tradeDate: string,
): SelectionStockSnapshotQuote {
  const q = parseFuyaoQuote(`stock:${row.thscode}`, row, data.timestamp, tradeDate);
  if (!isMarketDate(q.tradeDate) || q.tradeDate > tradeDate)
    throw new Error('Invalid snapshot trading date');
  const positive = (v: number | null | undefined) => (v != null && v > 0 ? v : null);
  const nonnegative = (v: number | null | undefined) => (v != null && v >= 0 ? v : null);
  return {
    symbol: String(row.thscode),
    tradeDate: q.tradeDate,
    price: positive(q.price),
    prevClose: positive(q.prevClose),
    changePct: positive(q.price) === null ? null : (q.changePct ?? null),
    open: positive(q.open),
    high: positive(q.high),
    low: positive(q.low),
    volume: nonnegative(q.volume),
    turnover: nonnegative(q.turnover),
    isInferredDate: q.isInferredDate ?? false,
    collectedAt: data.collectedAt,
  };
}

function count(db: Database, scope: Scope): number {
  return (db.query(`SELECT COUNT(*) AS n FROM selection_${scope}_catalog`).get() as { n: number })
    .n;
}

/** Network reads complete before each short publication transaction. */
export async function collectSelection(
  db: Database,
  reader: MarketReader,
  options: SelectionOptions,
  progress: (message: string, detail?: unknown) => void = () => {},
): Promise<SelectionCollectionResult> {
  const attempted = Date.now();
  const scopes: Scope[] = options.scope === 'all' ? ['etf', 'stock'] : [options.scope];
  const catalogs: Partial<Record<Scope, CatalogEntry[]>> = {};
  const setStatus = (
    scope: string,
    success: boolean,
    catalogCount: number,
    validCount: number,
    details: unknown,
    error: string | null = null,
  ) => {
    updateSelectionCollectionStatus(db, {
      scope,
      success,
      catalogCount,
      validCount,
      lastAttemptAt: attempted,
      lastSuccessAt: success ? Date.now() : null,
      updatedAt: Date.now(),
      errorMessage: error,
      detailsJson: JSON.stringify(details),
    });
  };
  for (const scope of scopes) {
    progress(`读取 ${scope} 全目录`);
    try {
      const type = scope === 'etf' ? 'fund-etf' : 'a-share';
      catalogs[scope] = validateSelectionCatalog(
        await reader.fuyao('/api/meta/tickers/list', { asset_type: type, limit: 10000 }),
        type,
        count(db, scope),
      );
    } catch (error) {
      setStatus(`${scope}_catalog`, false, count(db, scope), 0, {}, safeSelectionError(error));
      throw error;
    }
  }
  const allSymbols = new Set(Object.values(catalogs).flatMap((rows) => rows.map((r) => r.symbol)));
  if (options.symbols.some((symbol) => !allSymbols.has(symbol)))
    throw new Error('Requested symbol is not in the selected asset catalog');
  for (const scope of scopes) {
    const n = options.symbols.filter((s) => catalogs[scope]?.some((r) => r.symbol === s)).length;
    if (n > (scope === 'etf' ? options.etfLimit : options.stockLimit))
      throw new Error('Requested symbols exceed the bounded research limit');
  }
  const calendar = await reader.fuyao('/api/a-share/calendar/trading-days');
  const tradeDate = inferSelectionTradeDate(calendar, Date.now());
  const result: SelectionCollectionResult = { etfCount: 0, stockCount: 0, tradeDate, deep: {} };
  const rematerialize = (scope: Scope) => {
    if (scope === 'etf') replaceSelectionEtfMaterialized(db, materializeAllEtfs(db));
    else replaceSelectionStockMaterialized(db, materializeAllStocks(db));
  };

  if (catalogs.etf) {
    try {
      const local = new Map(
        (
          db.query('SELECT fund_code, fund_name, fund_type FROM fund_basic_info').all() as Array<{
            fund_code: string;
            fund_name: string;
            fund_type: string;
          }>
        ).map((r) => [r.fund_code, r]),
      );
      const rows: SelectionEtfCatalogItem[] = catalogs.etf.map((row) => {
        const candidate = local.get(row.ticker);
        const linked =
          candidate &&
          normalizeSecurityName(candidate.fund_name) === normalizeSecurityName(row.name);
        const assetClass = classifyEtfAsset(linked ? candidate.fund_type : null);
        return {
          ...row,
          assetClass,
          directionTag: deriveEtfDirectionTag(row.name, assetClass),
          linkedFundCode: linked ? row.ticker : null,
          linkMethod: linked ? 'exact_code_and_clean_name' : null,
          createdAt: attempted,
          updatedAt: attempted,
        };
      });
      db.transaction(() => {
        db.exec('DELETE FROM selection_etf_catalog');
        upsertSelectionEtfCatalog(db, rows);
        rematerialize('etf');
        setStatus('etf_catalog', true, rows.length, rows.filter((r) => r.linkedFundCode).length, {
          rule: 'exact_code_and_clean_name',
        });
      })();
      result.etfCount = rows.length;
      progress('ETF 目录与已核验本地资料已发布', { count: rows.length });
    } catch (error) {
      setStatus('etf_catalog', false, count(db, 'etf'), 0, {}, safeSelectionError(error));
      throw error;
    }
  }

  if (catalogs.stock) {
    try {
      const symbols = new Set(catalogs.stock.map((r) => r.symbol));
      const industries = new Map<string, { code: string; name: string; financial: boolean }>();
      const financialCodes = new Set(['881155.TI', '881156.TI', '881157.TI']);
      const groups = [
        ...INDUSTRY_WATCHLIST,
        { symbol: '881156.TI', name: '保险' },
        { symbol: '881157.TI', name: '证券' },
      ];
      for (const group of groups) {
        const data = await reader.fuyao('/api/a-share-index/constituents/ths-stock-list', {
          thscode: group.symbol,
        });
        if (!data.item.length || (data.thscode && data.thscode !== group.symbol))
          throw new Error(`Invalid industry members for ${group.symbol}`);
        const seen = new Set<string>();
        for (const row of data.item) {
          const symbol = String(row.thscode);
          if (!/^\d{6}\.(SH|SZ|BJ)$/.test(symbol) || seen.has(symbol))
            throw new Error('Invalid industry member identity');
          seen.add(symbol);
          if (symbols.has(symbol))
            industries.set(symbol, {
              code: group.symbol,
              name: group.name,
              financial: financialCodes.has(group.symbol),
            });
        }
      }
      const rows: SelectionStockCatalogItem[] = catalogs.stock.map((r) => {
        const industry = industries.get(r.symbol);
        return {
          ...r,
          industryThscode: industry?.code ?? null,
          industryName: industry?.name ?? null,
          isFinancial: industry?.financial ?? false,
          createdAt: attempted,
          updatedAt: attempted,
        };
      });
      const quotes: SelectionStockSnapshotQuote[] = [];
      const rawQuotes: Array<Record<string, unknown>> = [];
      for (let offset = 0; offset < symbols.size; offset += 1000) {
        const data = await reader.fuyao('/api/a-share/prices/snapshot', { offset, limit: 1000 });
        if (
          data.total !== symbols.size ||
          data.item.length !== Math.min(1000, symbols.size - offset)
        )
          throw new Error('Stock snapshot pagination changed or is incomplete');
        rawQuotes.push(...data.item);
        quotes.push(...data.item.map((r) => snapshot(r, data, tradeDate)));
      }
      assertSymbolSet(rawQuotes, symbols);
      const valuations: Awaited<ReturnType<typeof fetchStockValuationsBatch>> = [];
      const ordered = [...symbols].sort();
      for (let i = 0; i < ordered.length; i += 100)
        valuations.push(...(await fetchStockValuationsBatch(reader, ordered.slice(i, i + 100))));
      db.transaction(() => {
        db.exec('DELETE FROM selection_stock_catalog');
        db.exec('DELETE FROM selection_stock_snapshot');
        db.exec('DELETE FROM selection_stock_valuation');
        upsertSelectionStockCatalog(db, rows);
        upsertSelectionStockSnapshots(db, quotes);
        upsertSelectionStockValuations(db, valuations);
        rematerialize('stock');
        setStatus('stock_catalog', true, rows.length, industries.size, {
          industries: groups.map((g) => g.name),
        });
        setStatus(
          'stock_snapshot',
          true,
          rows.length,
          quotes.filter((q) => q.price !== null).length,
          { tradeDate, inferredCount: quotes.filter((q) => q.isInferredDate).length },
        );
        setStatus(
          'stock_valuation',
          true,
          rows.length,
          valuations.filter((v) => v.peTtm !== null).length,
          { received: valuations.length },
        );
      })();
      result.stockCount = rows.length;
      progress('股票目录、行情与估值完整批次已发布', { count: rows.length, tradeDate });
    } catch (error) {
      for (const name of ['stock_catalog', 'stock_snapshot', 'stock_valuation'])
        setStatus(name, false, count(db, 'stock'), 0, {}, safeSelectionError(error));
      throw error;
    }
  }
  if (options.skipDeep) return result;

  for (const scope of scopes) {
    const rows =
      scope === 'etf'
        ? db
            .query(
              'SELECT symbol, asset_class AS "group", scale_yi AS size FROM selection_etf_materialized',
            )
            .all()
        : db
            .query(
              'SELECT symbol, industry_name AS "group", turnover AS size FROM selection_stock_materialized',
            )
            .all();
    const poolRows = rows as Array<{ symbol: string; group: string | null; size: number | null }>;
    const symbols = options.symbols.length
      ? options.symbols.filter((s) => catalogs[scope]?.some((r) => r.symbol === s))
      : selectResearchPool(
          poolRows,
          scope === 'etf'
            ? [...ETF_WATCHLIST.map(([s]) => s), '510310.SH', '159919.SZ']
            : ['600519.SH', '000001.SZ', '300750.SZ', '688981.SH', '601398.SH'],
          scope === 'etf' ? options.etfLimit : options.stockLimit,
        );
    if (!symbols.length) continue;
    const resources: Record<string, ResourceState> = {};
    const writes: Array<() => void> = [];
    let validCount = 0;
    async function resource<T>(
      symbol: string,
      key: string,
      read: () => Promise<T | null>,
      write: (value: T) => void,
    ): Promise<T | null> {
      resources[key] ??= { success: 0, unavailable: [], failed: [] };
      const state = resources[key];
      try {
        const value = await read();
        if (value === null || (Array.isArray(value) && !value.length)) {
          state.unavailable.push(symbol);
          return null;
        }
        writes.push(() => write(value));
        state.success++;
        return value;
      } catch (error) {
        const reason = safeSelectionError(error);
        if (/business error 3002/.test(reason)) state.unavailable.push(symbol);
        else state.failed.push({ symbol, reason });
        progress('部分资源不可用，保留旧数据并继续', { symbol, resource: key, reason });
        return null;
      }
    }
    for (const [index, symbol] of symbols.entries()) {
      progress(`深采 ${scope} ${index + 1}/${symbols.length}`, { symbol });
      const bars = await resource(
        symbol,
        'bars',
        async () => {
          const all: SelectionDailyBar[] = [];
          for (const window of fuyaoHistoryWindows(
            shiftMarketDate(tradeDate, -1826),
            tradeDate,
            scope === 'etf',
          )) {
            const read = scope === 'etf' ? fetchEtfDailyBars : fetchStockForwardBars;
            const points = await read(
              reader,
              symbol,
              Date.parse(`${window.from}T00:00:00+08:00`),
              Date.parse(`${window.to}T00:00:00+08:00`),
            );
            if (points.some((b) => b.tradeDate < window.from || b.tradeDate > window.to))
              throw new Error('History window is out of range');
            // Fuyao includes the end date; keep our joined windows half-open.
            all.push(...points.filter((b) => b.tradeDate < window.to));
          }
          if (new Set(all.map((b) => b.tradeDate)).size !== all.length)
            throw new Error('Duplicate history window boundary');
          return all;
        },
        (value) =>
          replaceSelectionDailyBars(db, scope, symbol, scope === 'etf' ? 'none' : 'forward', value),
      );
      if (scope === 'etf') {
        await resource(
          symbol,
          'snapshot',
          async () => {
            const data = await reader.fuyao('/api/fund/market/snapshot', { thscode: symbol });
            assertSymbolSet(data.item, new Set([symbol]));
            return data.item.map((r) => snapshot(r, data, tradeDate));
          },
          (value) => upsertSelectionEtfSnapshots(db, value),
        );
        const profile = await resource(
          symbol,
          'profile',
          () => fetchEtfProfile(reader, symbol),
          (value) => upsertSelectionEtfProfile(db, value),
        );
        const financials = await resource(
          symbol,
          'scale',
          () => fetchEtfFinancials(reader, symbol),
          (value) => replaceSelectionEtfFinancials(db, symbol, value),
        );
        const nav = await resource(
          symbol,
          'nav',
          () => fetchEtfNavPoints(reader, symbol),
          (value) => replaceSelectionEtfNav(db, symbol, value),
        );
        await resource(
          symbol,
          'holdings',
          () => fetchEtfHoldings(reader, symbol),
          (value) => replaceSelectionEtfHoldings(db, symbol, value),
        );
        if (bars && profile && financials && nav) validCount++;
      } else {
        const income = await resource(
          symbol,
          'income',
          () => fetchStockStatements(reader, symbol, 'income'),
          (value) => upsertSelectionStockStatements(db, value),
        );
        const balance = await resource(
          symbol,
          'balance',
          () => fetchStockStatements(reader, symbol, 'balance'),
          (value) => upsertSelectionStockStatements(db, value),
        );
        const cashflow = await resource(
          symbol,
          'cashflow',
          () => fetchStockStatements(reader, symbol, 'cash_flow'),
          (value) => upsertSelectionStockStatements(db, value),
        );
        const year = income?.reduce((y, s) => Math.max(y, s.fiscalYear), 0);
        const indicators = year
          ? await resource(
              symbol,
              'indicators',
              () => fetchStockIndicators(reader, symbol, `${year}-4`),
              (value) => upsertSelectionStockIndicators(db, value),
            )
          : null;
        if (bars && income && balance && cashflow && indicators) validCount++;
      }
    }
    const failedCount = Object.values(resources).reduce((n, s) => n + s.failed.length, 0);
    const deep: DeepResult = {
      targetCount: symbols.length,
      validCount,
      success: validCount === symbols.length && failedCount === 0,
      resources,
      symbols,
    };
    try {
      db.transaction(() => {
        for (const write of writes) write();
        rematerialize(scope);
        setStatus(
          `${scope}_deep`,
          deep.success,
          symbols.length,
          validCount,
          deep,
          deep.success
            ? null
            : `${failedCount} failed resources; ${symbols.length - validCount} incomplete securities`,
        );
      })();
    } catch (error) {
      setStatus(`${scope}_deep`, false, symbols.length, 0, deep, safeSelectionError(error));
      throw error;
    }
    result.deep[scope] = deep;
    progress(`${scope} 深采与筛选指标已发布`, {
      validCount,
      targetCount: symbols.length,
      resources,
    });
  }
  return result;
}
