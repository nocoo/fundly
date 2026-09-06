/**
 * 选 ETF 与选股独立数据访问层 Repository
 */

import type { Database } from 'bun:sqlite';
import type {
  SelectionCollectionStatus,
  SelectionDailyBar,
  SelectionEtfCatalogItem,
  SelectionEtfFinancialIndicator,
  SelectionEtfHolding,
  SelectionEtfMaterialized,
  SelectionEtfNavPoint,
  SelectionEtfProfile,
  SelectionStockCatalogItem,
  SelectionStockFinancialIndicators,
  SelectionStockFinancialStatement,
  SelectionStockMaterialized,
  SelectionStockSnapshotQuote,
  SelectionStockValuation,
} from '../utils/selection-types.ts';
import { SELECTION_SCHEMA_DDL } from './selection-schema.ts';

/**
 * 初始化选基/选股独立 schema（幂等）
 */
export function initSelectionSchema(db: Database): void {
  db.transaction(() => {
    for (const ddl of SELECTION_SCHEMA_DDL) {
      db.exec(ddl);
    }
  })();
}

/**
 * 写入或更新 ETF 目录
 */
export function upsertSelectionEtfCatalog(
  db: Database,
  items: readonly SelectionEtfCatalogItem[],
): void {
  const stmt = db.prepare(`
    INSERT INTO selection_etf_catalog (
      symbol, ticker, name, exchange, asset_class, direction_tag,
      linked_fund_code, link_method, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol) DO UPDATE SET
      name = excluded.name,
      exchange = excluded.exchange,
      asset_class = excluded.asset_class,
      direction_tag = excluded.direction_tag,
      linked_fund_code = excluded.linked_fund_code,
      link_method = excluded.link_method,
      updated_at = excluded.updated_at
  `);

  db.transaction(() => {
    for (const item of items) {
      stmt.run(
        item.symbol,
        item.ticker,
        item.name,
        item.exchange,
        item.assetClass,
        item.directionTag ?? null,
        item.linkedFundCode ?? null,
        item.linkMethod ?? null,
        item.createdAt,
        item.updatedAt,
      );
    }
  })();
}

/**
 * 写入或更新股票目录
 */
export function upsertSelectionStockCatalog(
  db: Database,
  items: readonly SelectionStockCatalogItem[],
): void {
  const stmt = db.prepare(`
    INSERT INTO selection_stock_catalog (
      symbol, ticker, name, exchange, industry_thscode, industry_name,
      is_financial, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol) DO UPDATE SET
      name = excluded.name,
      exchange = excluded.exchange,
      industry_thscode = excluded.industry_thscode,
      industry_name = excluded.industry_name,
      is_financial = excluded.is_financial,
      updated_at = excluded.updated_at
  `);

  db.transaction(() => {
    for (const item of items) {
      stmt.run(
        item.symbol,
        item.ticker,
        item.name,
        item.exchange,
        item.industryThscode ?? null,
        item.industryName ?? null,
        item.isFinancial ? 1 : 0,
        item.createdAt,
        item.updatedAt,
      );
    }
  })();
}

/**
 * 写入日 K 线 (原子替换某标的的五年数据或增量插入)
 */
export function replaceSelectionDailyBars(
  db: Database,
  assetType: 'etf' | 'stock',
  symbol: string,
  adjust: 'none' | 'forward',
  bars: readonly SelectionDailyBar[],
): void {
  const delStmt = db.prepare(`
    DELETE FROM selection_daily_bar
    WHERE asset_type = ? AND symbol = ? AND adjust = ?
  `);
  const insStmt = db.prepare(`
    INSERT INTO selection_daily_bar (
      asset_type, symbol, adjust, trade_date, open, high, low, close, volume, turnover, collected_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    delStmt.run(assetType, symbol, adjust);
    for (const b of bars) {
      insStmt.run(
        b.assetType,
        b.symbol,
        b.adjust,
        b.tradeDate,
        b.open,
        b.high,
        b.low,
        b.close,
        b.volume,
        b.turnover,
        b.collectedAt,
      );
    }
  })();
}

/**
 * 写入 ETF NAV 净值
 */
export function replaceSelectionEtfNav(
  db: Database,
  symbol: string,
  points: readonly SelectionEtfNavPoint[],
): void {
  const delStmt = db.prepare('DELETE FROM selection_etf_nav WHERE symbol = ?');
  const insStmt = db.prepare(`
    INSERT INTO selection_etf_nav (symbol, nav_date, unit_nav, adj_nav, collected_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    delStmt.run(symbol);
    for (const p of points) {
      insStmt.run(p.symbol, p.navDate, p.unitNav, p.adjNav, p.collectedAt);
    }
  })();
}

/**
 * 写入 ETF Profile
 */
export function upsertSelectionEtfProfile(db: Database, profile: SelectionEtfProfile): void {
  db.query(`
    INSERT INTO selection_etf_profile (
      symbol, estab_date, mgmt_name, manager_name, fund_scale, mgmt_fee_pct, custody_fee_pct, collected_at, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol) DO UPDATE SET
      estab_date = excluded.estab_date,
      mgmt_name = excluded.mgmt_name,
      manager_name = excluded.manager_name,
      fund_scale = excluded.fund_scale,
      mgmt_fee_pct = excluded.mgmt_fee_pct,
      custody_fee_pct = excluded.custody_fee_pct,
      collected_at = excluded.collected_at,
      raw_json = excluded.raw_json
  `).run(
    profile.symbol,
    profile.estabDate ?? null,
    profile.mgmtName ?? null,
    profile.managerName ?? null,
    profile.fundScale ?? null,
    profile.managementFeePct ?? null,
    profile.custodyFeePct ?? null,
    profile.collectedAt,
    profile.rawJson ?? null,
  );
}

/**
 * 写入 ETF 财务指标 (披露规模)
 */
export function replaceSelectionEtfFinancials(
  db: Database,
  symbol: string,
  indicators: readonly SelectionEtfFinancialIndicator[],
): void {
  const delStmt = db.prepare('DELETE FROM selection_etf_financials WHERE symbol = ?');
  const insStmt = db.prepare(`
    INSERT INTO selection_etf_financials (symbol, start_date, end_date, publish_date, asset_nav, collected_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    delStmt.run(symbol);
    for (const ind of indicators) {
      insStmt.run(
        ind.symbol,
        ind.startDate,
        ind.endDate,
        ind.publishDate,
        ind.assetNav,
        ind.collectedAt,
      );
    }
  })();
}

/**
 * 写入 ETF 持仓
 */
export function replaceSelectionEtfHoldings(
  db: Database,
  symbol: string,
  holdings: readonly SelectionEtfHolding[],
): void {
  const delStmt = db.prepare('DELETE FROM selection_etf_holding WHERE symbol = ?');
  const insStmt = db.prepare(`
    INSERT INTO selection_etf_holding (
      symbol, report_date, stock_code, stock_name, asset_type, hold_ratio,
      position_capital, position_count, published_at, collected_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    delStmt.run(symbol);
    for (const h of holdings) {
      insStmt.run(
        h.symbol,
        h.reportDate,
        h.stockCode,
        h.stockName,
        h.assetType,
        h.holdRatio,
        h.positionCapital,
        h.positionCount,
        h.publishedAt ?? null,
        h.collectedAt,
      );
    }
  })();
}

/**
 * 批量写入股票快照行情
 */
export function upsertSelectionStockSnapshots(
  db: Database,
  snapshots: readonly SelectionStockSnapshotQuote[],
): void {
  upsertSelectionSnapshots(db, snapshots, 'stock');
}

export function upsertSelectionEtfSnapshots(
  db: Database,
  snapshots: readonly SelectionStockSnapshotQuote[],
): void {
  upsertSelectionSnapshots(db, snapshots, 'etf');
}

function upsertSelectionSnapshots(
  db: Database,
  snapshots: readonly SelectionStockSnapshotQuote[],
  asset: 'stock' | 'etf',
): void {
  const stmt = db.prepare(`
    INSERT INTO selection_${asset}_snapshot (
      symbol, trade_date, price, prev_close, change_pct, open, high, low, volume, turnover, is_inferred_date, collected_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol) DO UPDATE SET
      trade_date = excluded.trade_date,
      price = excluded.price,
      prev_close = excluded.prev_close,
      change_pct = excluded.change_pct,
      open = excluded.open,
      high = excluded.high,
      low = excluded.low,
      volume = excluded.volume,
      turnover = excluded.turnover,
      is_inferred_date = excluded.is_inferred_date,
      collected_at = excluded.collected_at
  `);

  db.transaction(() => {
    for (const s of snapshots) {
      stmt.run(
        s.symbol,
        s.tradeDate,
        s.price,
        s.prevClose,
        s.changePct,
        s.open,
        s.high,
        s.low,
        s.volume,
        s.turnover,
        s.isInferredDate ? 1 : 0,
        s.collectedAt,
      );
    }
  })();
}

/**
 * 批量更新股票估值快照
 */
export function upsertSelectionStockValuations(
  db: Database,
  valuations: readonly SelectionStockValuation[],
): void {
  const stmt = db.prepare(`
    INSERT INTO selection_stock_valuation (
      symbol, trade_date, timestamp, pe_ttm, pe_mrq, pb_mrq, ps_ttm, pcf_ttm, collected_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol) DO UPDATE SET
      trade_date = excluded.trade_date,
      timestamp = excluded.timestamp,
      pe_ttm = excluded.pe_ttm,
      pe_mrq = excluded.pe_mrq,
      pb_mrq = excluded.pb_mrq,
      ps_ttm = excluded.ps_ttm,
      pcf_ttm = excluded.pcf_ttm,
      collected_at = excluded.collected_at
  `);

  db.transaction(() => {
    for (const v of valuations) {
      stmt.run(
        v.symbol,
        v.tradeDate ?? null,
        v.timestamp ?? null,
        v.peTtm,
        v.peMrq,
        v.pbMrq,
        v.psTtm,
        v.pcfTtm,
        v.collectedAt,
      );
    }
  })();
}

/**
 * 写入股票财报原始三张表 (按类型与年期替换)
 */
export function upsertSelectionStockStatements(
  db: Database,
  statements: readonly SelectionStockFinancialStatement[],
): void {
  const stmt = db.prepare(`
    INSERT INTO selection_stock_financial_statement (
      symbol, statement_type, fiscal_year, fiscal_period, period_end, report_date, currency, data_json, collected_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol, statement_type, fiscal_year) DO UPDATE SET
      fiscal_period = excluded.fiscal_period,
      period_end = excluded.period_end,
      report_date = excluded.report_date,
      currency = excluded.currency,
      data_json = excluded.data_json,
      collected_at = excluded.collected_at
  `);

  db.transaction(() => {
    for (const s of statements) {
      stmt.run(
        s.symbol,
        s.statementType,
        s.fiscalYear,
        s.fiscalPeriod,
        s.periodEnd,
        s.reportDate,
        s.currency,
        JSON.stringify(s.data),
        s.collectedAt,
      );
    }
  })();
}

/**
 * 写入股票能力评估指标
 */
export function upsertSelectionStockIndicators(
  db: Database,
  indicators: SelectionStockFinancialIndicators,
): void {
  db.query(`
    INSERT INTO selection_stock_financial_indicators (symbol, report, abilities_json, collected_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(symbol, report) DO UPDATE SET
      abilities_json = excluded.abilities_json,
      collected_at = excluded.collected_at
  `).run(
    indicators.symbol,
    indicators.report,
    JSON.stringify(indicators.abilities),
    indicators.collectedAt,
  );
}

/**
 * 更新采集状态
 */
export function updateSelectionCollectionStatus(
  db: Database,
  status: SelectionCollectionStatus,
): void {
  db.query(`
    INSERT INTO selection_collection_status (
      scope, last_success_at, last_attempt_at, success, catalog_count, valid_count, error_message, details_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(scope) DO UPDATE SET
      last_success_at = CASE WHEN excluded.success = 1 THEN excluded.last_success_at ELSE selection_collection_status.last_success_at END,
      last_attempt_at = excluded.last_attempt_at,
      success = excluded.success,
      catalog_count = excluded.catalog_count,
      valid_count = excluded.valid_count,
      error_message = excluded.error_message,
      details_json = excluded.details_json,
      updated_at = excluded.updated_at
  `).run(
    status.scope,
    status.lastSuccessAt ?? null,
    status.lastAttemptAt,
    status.success ? 1 : 0,
    status.catalogCount,
    status.validCount,
    status.errorMessage ?? null,
    status.detailsJson ?? null,
    status.updatedAt,
  );
}

/**
 * 全量替换物化 ETF 宽表
 */
export function replaceSelectionEtfMaterialized(
  db: Database,
  rows: readonly SelectionEtfMaterialized[],
): void {
  const delStmt = db.prepare('DELETE FROM selection_etf_materialized');
  const insStmt = db.prepare(`
    INSERT INTO selection_etf_materialized (
      symbol, ticker, name, exchange, asset_class, direction_tag, linked_fund_code,
      market_trade_date, market_price, change_pct, turnover, volume, avg_turnover_20d,
      nav_date, unit_nav, adj_nav, premium_discount_pct,
      mgmt_fee_pct, custody_fee_pct, total_expense_pct,
      scale_yi, scale_period, scale_disclosure_date, scale_source,
      history_asof, nav_risk_basis, nav_risk_asof,
      return_1y, return_3y, return_5y, cagr_1y, cagr_3y, cagr_5y,
      max_drawdown_1y, max_drawdown_3y, max_drawdown_5y,
      volatility_1y, volatility_3y, volatility_5y,
      points_1y, points_3y, points_5y,
      sparkline_json, sparkline_type,
      has_market_bars, has_nav_history, has_deep_research, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?, ?, ?
    )
  `);

  db.transaction(() => {
    delStmt.run();
    for (const r of rows) {
      insStmt.run(
        r.symbol,
        r.ticker,
        r.name,
        r.exchange,
        r.assetClass,
        r.directionTag ?? null,
        r.linkedFundCode ?? null,
        r.marketTradeDate ?? null,
        r.marketPrice ?? null,
        r.changePct ?? null,
        r.turnover ?? null,
        r.volume ?? null,
        r.avgTurnover20d ?? null,
        r.navDate ?? null,
        r.unitNav ?? null,
        r.adjNav ?? null,
        r.premiumDiscountPct ?? null,
        r.mgmtFeePct ?? null,
        r.custodyFeePct ?? null,
        r.totalExpensePct ?? null,
        r.scaleYi ?? null,
        r.scalePeriod ?? null,
        r.scaleDisclosureDate ?? null,
        r.scaleSource ?? null,
        r.historyAsof ?? null,
        r.navRiskBasis ?? null,
        r.navRiskAsof ?? null,
        r.return1y ?? null,
        r.return3y ?? null,
        r.return5y ?? null,
        r.cagr1y ?? null,
        r.cagr3y ?? null,
        r.cagr5y ?? null,
        r.maxDrawdown1y ?? null,
        r.maxDrawdown3y ?? null,
        r.maxDrawdown5y ?? null,
        r.volatility1y ?? null,
        r.volatility3y ?? null,
        r.volatility5y ?? null,
        r.points1y ?? null,
        r.points3y ?? null,
        r.points5y ?? null,
        r.sparklineJson ?? null,
        r.sparklineType,
        r.hasMarketBars ? 1 : 0,
        r.hasNavHistory ? 1 : 0,
        r.hasDeepResearch ? 1 : 0,
        r.updatedAt,
      );
    }
  })();
}

/**
 * 全量替换物化股票宽表
 */
export function replaceSelectionStockMaterialized(
  db: Database,
  rows: readonly SelectionStockMaterialized[],
): void {
  const delStmt = db.prepare('DELETE FROM selection_stock_materialized');
  const insStmt = db.prepare(`
    INSERT INTO selection_stock_materialized (
      symbol, ticker, name, exchange, industry_thscode, industry_name, is_financial,
      trade_date, price, change_pct, turnover, volume, avg_turnover_20d,
      pe_ttm, pe_mrq, pb_mrq, ps_ttm, pcf_ttm, valuation_timestamp, history_asof,
      return_1y, return_3y, return_5y, cagr_1y, cagr_3y, cagr_5y,
      max_drawdown_1y, max_drawdown_3y, max_drawdown_5y,
      volatility_1y, volatility_3y, volatility_5y,
      return_20d, return_60d, ma60_bias, sparkline_json,
      fiscal_year, period_end, report_date, currency,
      roe_weighted, roe_deducted_weighted, gross_margin, net_margin, debt_ratio,
      operating_income, revenue_yoy, net_profit, parent_net_profit, profit_yoy,
      revenue_cagr_3y, profit_cagr_3y, operating_cash_flow, cash_profit_ratio,
      capex, cash_minus_capex,
      has_deep_research, has_price_history, has_financials, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?,
      ?, ?, ?, ?
    )
  `);

  db.transaction(() => {
    delStmt.run();
    for (const r of rows) {
      insStmt.run(
        r.symbol,
        r.ticker,
        r.name,
        r.exchange,
        r.industryThscode ?? null,
        r.industryName ?? null,
        r.isFinancial ? 1 : 0,
        r.tradeDate ?? null,
        r.price ?? null,
        r.changePct ?? null,
        r.turnover ?? null,
        r.volume ?? null,
        r.avgTurnover20d ?? null,
        r.peTtm ?? null,
        r.peMrq ?? null,
        r.pbMrq ?? null,
        r.psTtm ?? null,
        r.pcfTtm ?? null,
        r.valuationTimestamp ?? null,
        r.historyAsof ?? null,
        r.return1y ?? null,
        r.return3y ?? null,
        r.return5y ?? null,
        r.cagr1y ?? null,
        r.cagr3y ?? null,
        r.cagr5y ?? null,
        r.maxDrawdown1y ?? null,
        r.maxDrawdown3y ?? null,
        r.maxDrawdown5y ?? null,
        r.volatility1y ?? null,
        r.volatility3y ?? null,
        r.volatility5y ?? null,
        r.return20d ?? null,
        r.return60d ?? null,
        r.ma60Bias ?? null,
        r.sparklineJson ?? null,
        r.fiscalYear ?? null,
        r.periodEnd ?? null,
        r.reportDate ?? null,
        r.currency ?? null,
        r.roeWeighted ?? null,
        r.roeDeductedWeighted ?? null,
        r.grossMargin ?? null,
        r.netMargin ?? null,
        r.debtRatio ?? null,
        r.operatingIncome ?? null,
        r.revenueYoy ?? null,
        r.netProfit ?? null,
        r.parentNetProfit ?? null,
        r.profitYoy ?? null,
        r.revenueCagr3y ?? null,
        r.profitCagr3y ?? null,
        r.operatingCashFlow ?? null,
        r.cashProfitRatio ?? null,
        r.capex ?? null,
        r.cashMinusCapex ?? null,
        r.hasDeepResearch ? 1 : 0,
        r.hasPriceHistory ? 1 : 0,
        r.hasFinancials ? 1 : 0,
        r.updatedAt,
      );
    }
  })();
}
