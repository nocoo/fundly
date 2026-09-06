import type { Database } from 'bun:sqlite';
import type {
  MarketBreadth,
  MarketDailyBar,
  MarketEtfHolding,
  MarketEtfProfile,
  MarketIndexMember,
  MarketInstrument,
  MarketInstrumentRelation,
  MarketQuote,
  MarketSeriesObservation,
} from '../utils/market-types.ts';
import { isMarketDate } from '../utils/market-validation.ts';
import {
  publishMarketQuotesBatch,
  replaceMarketIndexMembers,
  updateMarketSourceStatus,
  upsertMarketBreadth,
  upsertMarketDailyBars,
  upsertMarketInstrumentRelation,
  upsertMarketInstruments,
  upsertMarketSeriesObservations,
  upsertMarketSymbolAlias,
} from './market-repo.ts';

export interface MarketCollection {
  sourceKey: string;
  batchId: string;
  mode: 'live' | 'evidence';
  startedAt: number;
  collectedAt: number;
  tradeDate: string;
  expectedItems: number;
  actualItems: number;
  instruments: MarketInstrument[];
  quotes: MarketQuote[];
  bars: MarketDailyBar[];
  observations: MarketSeriesObservation[];
  members?: Array<{ indexId: string; items: MarketIndexMember[] }>;
  aliases?: Array<{ instrumentId: string; symbol: string; fundCode: string | null; notes: string }>;
  relations?: MarketInstrumentRelation[];
  profiles?: MarketEtfProfile[];
  holdings?: MarketEtfHolding[];
  breadth?: MarketBreadth;
  replaceWatchlist?: boolean;
  replaceShfeContracts?: boolean;
  warnings?: string[];
}

/** One source publication includes prices, breadth, disclosure data and its success status. */
export function publishMarketCollection(db: Database, batch: MarketCollection): void {
  if (
    !Number.isInteger(batch.actualItems) ||
    !Number.isInteger(batch.expectedItems) ||
    batch.actualItems < 1 ||
    batch.actualItems !== batch.expectedItems
  )
    throw new Error('Incomplete market collection');
  if (!isMarketDate(batch.tradeDate)) throw new Error('Invalid collection trade date');
  if (new Set(batch.quotes.map((q) => q.instrumentId)).size !== batch.quotes.length)
    throw new Error('Duplicate quotes in collection');
  for (const q of batch.quotes) {
    if (!isMarketDate(q.tradeDate)) throw new Error('Invalid quote date');
    for (const value of [
      q.price,
      q.open,
      q.high,
      q.low,
      q.close,
      q.prevClose,
      q.changePct,
      q.volume,
      q.turnover,
      q.settlementPrice,
      q.prevSettlement,
      q.openInterest,
    ]) {
      if (value != null && !Number.isFinite(value)) throw new Error('Non-finite quote value');
    }
  }
  db.transaction(() => {
    if (batch.replaceWatchlist) {
      db.exec(
        "UPDATE market_instrument SET is_active = 0 WHERE asset_class IN ('index', 'industry', 'etf', 'stock')",
      );
      db.exec("DELETE FROM market_instrument_relation WHERE source_id LIKE 'industry:%'");
    }
    if (batch.replaceShfeContracts)
      db.exec("UPDATE market_instrument SET is_active = 0 WHERE exchange = 'SHFE'");
    upsertMarketInstruments(db, batch.instruments);
    for (const a of batch.aliases ?? [])
      upsertMarketSymbolAlias(db, a.instrumentId, batch.sourceKey, a.symbol, a.fundCode, a.notes);
    for (const r of batch.relations ?? []) upsertMarketInstrumentRelation(db, r);
    publishMarketQuotesBatch(db, batch.quotes, batch.batchId);
    upsertMarketDailyBars(db, batch.bars);
    upsertMarketSeriesObservations(db, batch.observations);
    for (const member of batch.members ?? [])
      replaceMarketIndexMembers(db, member.indexId, member.items);
    if (batch.breadth) upsertMarketBreadth(db, { ...batch.breadth, batchId: batch.batchId });
    for (const p of batch.profiles ?? []) {
      db.query(`INSERT INTO market_etf_profile VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(instrument_id) DO UPDATE SET established_date=excluded.established_date, fund_scale=excluded.fund_scale,
        fund_manager=excluded.fund_manager, management_company=excluded.management_company, source=excluded.source,
        collected_at=excluded.collected_at, raw_json=excluded.raw_json`).run(
        p.instrumentId,
        p.establishedDate,
        p.fundScale,
        p.fundManager,
        p.managementCompany,
        p.source,
        p.collectedAt,
        p.rawJson,
      );
    }
    const periods = new Map<string, [string, string]>();
    for (const h of batch.holdings ?? [])
      periods.set(`${h.instrumentId}|${h.reportDate}`, [h.instrumentId, h.reportDate]);
    for (const [id, date] of periods.values())
      db.query('DELETE FROM market_etf_holding WHERE instrument_id = ? AND report_date = ?').run(
        id,
        date,
      );
    for (const h of batch.holdings ?? []) {
      db.query('INSERT INTO market_etf_holding VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        h.instrumentId,
        h.reportDate,
        h.stockCode,
        h.stockName,
        h.assetType,
        h.holdPct,
        h.holdShares,
        h.holdValueWan,
        h.publishedAt,
        h.source,
        h.collectedAt,
      );
    }
    db.query('INSERT INTO market_collection_batch VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      batch.batchId,
      batch.sourceKey,
      batch.mode,
      batch.startedAt,
      batch.collectedAt,
      batch.expectedItems,
      batch.actualItems,
      batch.quotes.length,
      batch.bars.length,
      batch.observations.length,
    );
    updateMarketSourceStatus(db, {
      sourceKey: batch.sourceKey,
      lastSuccessAt: batch.collectedAt,
      lastTradeDate: batch.tradeDate,
      lastStatusCode: batch.warnings?.length ? 206 : 200,
      lastErrorMessage: batch.warnings?.length ? batch.warnings.join('; ') : null,
      expectedItems: batch.expectedItems,
      actualItems: batch.actualItems,
      batchId: batch.batchId,
      collectionMode: batch.mode,
      startedAt: batch.startedAt,
    });
  })();
}
