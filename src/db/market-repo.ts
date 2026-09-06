import type { Database } from 'bun:sqlite';
import { logger } from '../utils/logger.ts';
import type {
  MarketBreadth,
  MarketDailyBar,
  MarketIndexMember,
  MarketInstrument,
  MarketInstrumentRelation,
  MarketQuote,
  MarketSeriesObservation,
  MarketSourceStatus,
} from '../utils/market-types.ts';
import { isMarketDate, validOhlc } from '../utils/market-validation.ts';
import { MARKET_SCHEMA_DDL } from './market-schema.ts';

export function initMarketSchema(db: Database): void {
  db.transaction(() => {
    for (const ddl of MARKET_SCHEMA_DDL) {
      db.exec(ddl);
    }
    const additions: Record<string, Record<string, string>> = {
      market_quote_latest: { open_interest: 'REAL' },
      market_series_observation: { change_bp: 'REAL' },
      market_source_status: {
        batch_id: 'TEXT',
        collection_mode: "TEXT NOT NULL DEFAULT 'live'",
        started_at: 'INTEGER',
      },
    };
    for (const [table, columns] of Object.entries(additions)) {
      const present = new Set(
        (db.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
          (c) => c.name,
        ),
      );
      for (const [name, ddl] of Object.entries(columns)) {
        if (!present.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${ddl}`);
      }
    }
  })();
  logger.info('market schema initialized');
}

export function isMarketSchemaReady(db: Database): boolean {
  try {
    const row = db
      .query(
        "SELECT COUNT(*) as n FROM sqlite_master WHERE type='table' AND name='market_instrument'",
      )
      .get() as { n: number } | null;
    return (row?.n ?? 0) > 0;
  } catch {
    return false;
  }
}

export function upsertMarketInstruments(db: Database, items: readonly MarketInstrument[]): void {
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO market_instrument (
      instrument_id, asset_class, symbol, name, exchange, currency, unit, trading_calendar, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(instrument_id) DO UPDATE SET
      asset_class = excluded.asset_class,
      symbol = excluded.symbol,
      name = excluded.name,
      exchange = excluded.exchange,
      currency = excluded.currency,
      unit = excluded.unit,
      trading_calendar = excluded.trading_calendar,
      is_active = excluded.is_active,
      updated_at = excluded.updated_at
  `);

  db.transaction((rows: readonly MarketInstrument[]) => {
    for (const r of rows) {
      stmt.run(
        r.instrumentId,
        r.assetClass,
        r.symbol,
        r.name,
        r.exchange ?? null,
        r.currency ?? 'CNY',
        r.unit ?? null,
        r.tradingCalendar ?? 'CN_STOCK',
        r.isActive === false ? 0 : 1,
        now,
        now,
      );
    }
  })(items);
}

export function upsertMarketSymbolAlias(
  db: Database,
  instrumentId: string,
  source: string,
  sourceSymbol: string,
  linkedFundCode?: string | null,
  notes?: string | null,
): void {
  const now = Date.now();
  db.prepare(`
    INSERT INTO market_symbol_alias (instrument_id, source, source_symbol, linked_fund_code, notes, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(source, source_symbol) DO UPDATE SET
      instrument_id = excluded.instrument_id,
      linked_fund_code = excluded.linked_fund_code,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `).run(instrumentId, source, sourceSymbol, linkedFundCode ?? null, notes ?? null, now);
}

export function upsertMarketQuote(db: Database, quote: MarketQuote): void {
  db.prepare(`
    INSERT INTO market_quote_latest (
      instrument_id, source, trade_date, quote_at, is_inferred_date, price, open, high, low, close,
      prev_close, change_pct, volume, turnover, settlement_price, prev_settlement, source_timestamp, collected_at, batch_id, raw_json, open_interest
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(instrument_id) DO UPDATE SET
      source = excluded.source,
      trade_date = excluded.trade_date,
      quote_at = excluded.quote_at,
      is_inferred_date = excluded.is_inferred_date,
      price = excluded.price,
      open = excluded.open,
      high = excluded.high,
      low = excluded.low,
      close = excluded.close,
      prev_close = excluded.prev_close,
      change_pct = excluded.change_pct,
      volume = excluded.volume,
      turnover = excluded.turnover,
      settlement_price = excluded.settlement_price,
      prev_settlement = excluded.prev_settlement,
      source_timestamp = excluded.source_timestamp,
      collected_at = excluded.collected_at,
      batch_id = excluded.batch_id,
      raw_json = excluded.raw_json,
      open_interest = excluded.open_interest
  `).run(
    quote.instrumentId,
    quote.source,
    quote.tradeDate,
    quote.quoteAt ?? null,
    quote.isInferredDate ? 1 : 0,
    quote.price ?? quote.close ?? null,
    quote.open ?? null,
    quote.high ?? null,
    quote.low ?? null,
    quote.close ?? null,
    quote.prevClose ?? null,
    quote.changePct ?? null,
    quote.volume ?? null,
    quote.turnover ?? null,
    quote.settlementPrice ?? null,
    quote.prevSettlement ?? null,
    quote.sourceTimestamp ?? null,
    quote.collectedAt,
    quote.batchId ?? null,
    quote.rawJson ?? null,
    quote.openInterest ?? null,
  );
}

export function publishMarketQuotesBatch(
  db: Database,
  quotes: readonly MarketQuote[],
  batchId?: string,
): void {
  db.transaction(() => {
    for (const q of quotes) {
      upsertMarketQuote(db, batchId ? { ...q, batchId } : q);
    }
  })();
}

export function upsertMarketDailyBars(db: Database, bars: readonly MarketDailyBar[]): void {
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO market_daily_bar (
      instrument_id, trade_date, source, open, high, low, close, volume, turnover, collected_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(instrument_id, trade_date) DO UPDATE SET
      source = excluded.source,
      open = excluded.open,
      high = excluded.high,
      low = excluded.low,
      close = excluded.close,
      volume = excluded.volume,
      turnover = excluded.turnover,
      collected_at = excluded.collected_at
  `);

  db.transaction((rows: readonly MarketDailyBar[]) => {
    for (const b of rows) {
      if (
        !isMarketDate(b.tradeDate) ||
        !validOhlc(b) ||
        [b.volume, b.turnover].some((v) => v != null && (!Number.isFinite(v) || v < 0))
      ) {
        throw new Error('Invalid market daily bar');
      }
      stmt.run(
        b.instrumentId,
        b.tradeDate,
        b.source,
        b.open,
        b.high,
        b.low,
        b.close,
        b.volume ?? null,
        b.turnover ?? null,
        b.collectedAt ?? now,
      );
    }
  })(bars);
}

export function upsertMarketSeriesObservations(
  db: Database,
  obs: readonly MarketSeriesObservation[],
): void {
  const stmt = db.prepare(`
    INSERT INTO market_series_observation (
      instrument_id, observation_date, source, value, unit, period_end, published_at, collected_at, change_bp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(instrument_id, observation_date) DO UPDATE SET
      source = excluded.source,
      value = excluded.value,
      unit = excluded.unit,
      period_end = excluded.period_end,
      published_at = excluded.published_at,
      collected_at = excluded.collected_at,
      change_bp = excluded.change_bp
  `);

  db.transaction((rows: readonly MarketSeriesObservation[]) => {
    for (const r of rows) {
      if (
        !isMarketDate(r.observationDate) ||
        !Number.isFinite(r.value) ||
        (r.changeBp != null && !Number.isFinite(r.changeBp))
      )
        throw new Error('Invalid market observation');
      stmt.run(
        r.instrumentId,
        r.observationDate,
        r.source,
        r.value,
        r.unit ?? null,
        r.periodEnd ?? null,
        r.publishedAt ?? null,
        r.collectedAt,
        r.changeBp ?? null,
      );
    }
  })(obs);
}

export function replaceMarketIndexMembers(
  db: Database,
  indexId: string,
  members: readonly MarketIndexMember[],
): void {
  const now = Date.now();
  db.transaction(() => {
    db.prepare('DELETE FROM market_index_member WHERE index_id = ?').run(indexId);
    const stmt = db.prepare(`
      INSERT INTO market_index_member (index_id, stock_code, stock_name, weight, rank_order, collected_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const [i, m] of members.entries()) {
      stmt.run(indexId, m.stockCode, m.stockName, m.weight ?? null, m.rankOrder ?? i + 1, now);
    }
  })();
}

export function upsertMarketInstrumentRelation(db: Database, rel: MarketInstrumentRelation): void {
  const now = Date.now();
  db.prepare(`
    INSERT INTO market_instrument_relation (
      source_id, target_id, relation_type, confidence, description, verified_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_id, target_id, relation_type) DO UPDATE SET
      confidence = excluded.confidence,
      description = excluded.description,
      verified_at = excluded.verified_at
  `).run(
    rel.sourceId,
    rel.targetId,
    rel.relationType,
    rel.confidence,
    rel.description ?? null,
    now,
  );
}

export function upsertMarketBreadth(db: Database, breadth: MarketBreadth): void {
  db.prepare(`
    INSERT INTO market_breadth (
      trade_date, scope, up_count, down_count, flat_count, total_valid_count, total_catalog_count,
      median_change_pct, valid_turnover_sum, limit_up_count, limit_down_count, limit_break_count, collected_at, batch_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(trade_date) DO UPDATE SET
      scope = excluded.scope,
      up_count = excluded.up_count,
      down_count = excluded.down_count,
      flat_count = excluded.flat_count,
      total_valid_count = excluded.total_valid_count,
      total_catalog_count = excluded.total_catalog_count,
      median_change_pct = excluded.median_change_pct,
      valid_turnover_sum = excluded.valid_turnover_sum,
      limit_up_count = excluded.limit_up_count,
      limit_down_count = excluded.limit_down_count,
      limit_break_count = excluded.limit_break_count,
      collected_at = excluded.collected_at,
      batch_id = excluded.batch_id
  `).run(
    breadth.tradeDate,
    breadth.scope,
    breadth.upCount,
    breadth.downCount,
    breadth.flatCount,
    breadth.totalValidCount,
    breadth.totalCatalogCount,
    breadth.medianChangePct ?? null,
    breadth.validTurnoverSum ?? null,
    breadth.limitUpCount ?? null,
    breadth.limitDownCount ?? null,
    breadth.limitBreakCount ?? null,
    breadth.collectedAt,
    breadth.batchId ?? null,
  );
}

export function updateMarketSourceStatus(db: Database, status: MarketSourceStatus): void {
  const now = Date.now();
  db.prepare(`
    INSERT INTO market_source_status (
      source_key, last_success_at, last_trade_date, last_status_code, last_error_message, expected_items, actual_items, updated_at, batch_id, collection_mode, started_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_key) DO UPDATE SET
      last_success_at = COALESCE(excluded.last_success_at, market_source_status.last_success_at),
      last_trade_date = COALESCE(excluded.last_trade_date, market_source_status.last_trade_date),
      last_status_code = excluded.last_status_code,
      last_error_message = excluded.last_error_message,
      expected_items = excluded.expected_items,
      actual_items = excluded.actual_items,
      updated_at = excluded.updated_at,
      batch_id = COALESCE(excluded.batch_id, market_source_status.batch_id),
      collection_mode = excluded.collection_mode,
      started_at = excluded.started_at
  `).run(
    status.sourceKey,
    status.lastSuccessAt ?? null,
    status.lastTradeDate ?? null,
    status.lastStatusCode ?? 200,
    status.lastErrorMessage ?? null,
    status.expectedItems ?? null,
    status.actualItems ?? null,
    now,
    status.batchId ?? null,
    status.collectionMode ?? 'live',
    status.startedAt ?? null,
  );
}
