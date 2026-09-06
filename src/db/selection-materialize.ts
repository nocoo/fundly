/**
 * 选 ETF 与选股物化宽表生成器 (位于 src/db/，负责从本地库中抽取并物化)
 * 遵循口径：
 * 1. ETF 费用：读取 fund_fees.custodian_fee_pct，两项已知才相加
 * 2. ETF 规模：优先 selection_etf_financials 最新披露 asset_nav，其次 fund_select_metrics.scale_yi/scale_asof
 * 3. ETF 收益风险：优先扶摇 adj_nav，其次本地 buildTotalReturn，并标记 navRiskBasis 与 navRiskAsof
 * 4. 股票行情：全市场 5,567 目录从 selection_stock_snapshot 读取最新快照，不仅限 80 只研究池
 * 5. 股票估值：全市场估值记录 valuationTimestamp
 * 6. 股票财报：三张表按 period_end 和 currency 严格对齐，indicators 严格按 symbol + latestYear - 4 取完整年报
 */

import type { Database } from 'bun:sqlite';
import { buildTotalReturn } from '../analytics/total-return.ts';
import { computeEtfPremiumDiscount, computeRollingReturn } from '../metrics/market-calc.ts';
import {
  canUseDailyClose,
  compute20DayAvgTurnover,
  computeCashMinusCapex,
  computeCashProfitRatio,
  computeDebtRatio,
  computeEtfTotalExpensePct,
  computeFinancial3YearCagr,
  computeMa60Bias,
  computeYoyGrowth,
  deriveEtfDirectionTag,
  evaluateReturnWindow,
} from '../metrics/selection-calc.ts';
import { marketNumber } from '../utils/market-validation.ts';
import type {
  SelectionEtfMaterialized,
  SelectionStockMaterialized,
} from '../utils/selection-types.ts';

export function normalizeSecurityName(name: string): string {
  return name.replace(/\s+/g, '').toUpperCase();
}

/**
 * 针对所有 ETF 目录标的，从 SQLite 本地已有表与 selection_* 深采表中提取物化筛选行
 */
export function materializeAllEtfs(db: Database): SelectionEtfMaterialized[] {
  // 1. 读取 ETF 目录
  const catalogRows = db
    .query(
      `SELECT symbol, ticker, name, exchange, asset_class, direction_tag, linked_fund_code
       FROM selection_etf_catalog
       ORDER BY ticker ASC`,
    )
    .all() as Array<{
    symbol: string;
    ticker: string;
    name: string;
    exchange: string;
    asset_class: string;
    direction_tag: string | null;
    linked_fund_code: string | null;
  }>;

  // 2. 预载本地已核验基金数据（费率、规模、净值、分红）
  // 注意：fund_fees 托管费列名为 custodian_fee_pct
  const feesMap = new Map<string, { mgmtFee: number | null; custodyFee: number | null }>();
  const feesRows = db
    .query('SELECT fund_code, mgmt_fee_pct, custodian_fee_pct FROM fund_fees')
    .all() as Array<{
    fund_code: string;
    mgmt_fee_pct: number | null;
    custodian_fee_pct: number | null;
  }>;
  for (const r of feesRows) {
    feesMap.set(r.fund_code, { mgmtFee: r.mgmt_fee_pct, custodyFee: r.custodian_fee_pct });
  }

  // 本地规模：直接读取 fund_select_metrics.scale_yi 和 scale_asof
  const localScaleMap = new Map<string, { scaleYi: number; asof: string }>();
  const selectMetricRows = db
    .query(
      'SELECT fund_code, scale_yi, scale_asof FROM fund_select_metrics WHERE scale_yi IS NOT NULL',
    )
    .all() as Array<{ fund_code: string; scale_yi: number | null; scale_asof: string | null }>;
  for (const r of selectMetricRows) {
    if (r.scale_yi !== null && r.scale_yi > 0) {
      localScaleMap.set(r.fund_code, {
        scaleYi: r.scale_yi,
        asof: r.scale_asof ?? '',
      });
    }
  }

  // 3. 预载深采数据 (selection_etf_profile, financials, nav, bars)
  const profileMap = new Map<
    string,
    { mgmtFee: number | null; custodyFee: number | null; fundScale: number | null }
  >();
  const pRows = db
    .query('SELECT symbol, mgmt_fee_pct, custody_fee_pct, fund_scale FROM selection_etf_profile')
    .all() as Array<{
    symbol: string;
    mgmt_fee_pct: number | null;
    custody_fee_pct: number | null;
    fund_scale: number | null;
  }>;
  for (const r of pRows) {
    profileMap.set(r.symbol, {
      mgmtFee: r.mgmt_fee_pct,
      custodyFee: r.custody_fee_pct,
      fundScale: r.fund_scale,
    });
  }

  // 最新已披露财务指标规模
  const finScaleMap = new Map<string, { assetNav: number; endDate: string; publishDate: string }>();
  const finRows = db
    .query(
      `SELECT symbol, end_date, publish_date, asset_nav
       FROM selection_etf_financials
       ORDER BY end_date ASC, publish_date ASC`,
    )
    .all() as Array<{
    symbol: string;
    end_date: string;
    publish_date: string;
    asset_nav: number | null;
  }>;
  for (const r of finRows) {
    if (r.asset_nav !== null && r.asset_nav > 0) {
      finScaleMap.set(r.symbol, {
        assetNav: r.asset_nav,
        endDate: r.end_date,
        publishDate: r.publish_date,
      });
    }
  }

  // 4. 市场快照 (若宏观 market_quote_latest 存在且已安装)
  const hasMacroQuoteTable = Boolean(
    db
      .query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'market_quote_latest'")
      .get(),
  );

  const quoteMap = new Map<
    string,
    {
      tradeDate: string;
      price: number;
      changePct: number | null;
      turnover: number | null;
      volume: number | null;
      isInferredDate: boolean;
    }
  >();

  if (hasMacroQuoteTable) {
    const quoteRows = db
      .query(
        `SELECT instrument_id, trade_date, price, change_pct, turnover, volume, is_inferred_date
         FROM market_quote_latest
         WHERE instrument_id LIKE 'etf:%'`,
      )
      .all() as Array<{
      instrument_id: string;
      trade_date: string;
      price: number | null;
      change_pct: number | null;
      turnover: number | null;
      volume: number | null;
      is_inferred_date: number | null;
    }>;
    for (const q of quoteRows) {
      const sym = q.instrument_id.slice(4);
      if (q.price !== null && q.price > 0) {
        quoteMap.set(sym, {
          tradeDate: q.trade_date,
          price: q.price,
          changePct: q.change_pct,
          turnover: q.turnover,
          volume: q.volume,
          isInferredDate: q.is_inferred_date === 1,
        });
      }
    }
  }

  const selectionQuotes = db.query('SELECT * FROM selection_etf_snapshot').all() as Array<{
    symbol: string;
    trade_date: string;
    price: number | null;
    change_pct: number | null;
    turnover: number | null;
    volume: number | null;
    is_inferred_date: number;
  }>;
  for (const q of selectionQuotes) {
    const old = quoteMap.get(q.symbol);
    if (q.price !== null && q.price > 0 && (!old || q.trade_date >= old.tradeDate)) {
      quoteMap.set(q.symbol, {
        tradeDate: q.trade_date,
        price: q.price,
        changePct: q.change_pct,
        turnover: q.turnover,
        volume: q.volume,
        isInferredDate: q.is_inferred_date === 1,
      });
    }
  }

  // 准备查询单只 ETF 的 日 K 与 NAV
  const barStmt = db.prepare(
    `SELECT trade_date, open, high, low, close, volume, turnover, collected_at
     FROM selection_daily_bar
     WHERE asset_type = 'etf' AND symbol = ? AND adjust = 'none'
     ORDER BY trade_date ASC`,
  );

  const navStmt = db.prepare(
    `SELECT nav_date, unit_nav, adj_nav
     FROM selection_etf_nav
     WHERE symbol = ?
     ORDER BY nav_date ASC`,
  );

  const localNavStmt = db.prepare(
    `SELECT nav_date, unit_nav, daily_return
     FROM fund_nav
     WHERE fund_code = ?
     ORDER BY nav_date ASC`,
  );

  const localDivStmt = db.prepare(
    `SELECT event_date, event_type, dividend_per_share, split_ratio
     FROM fund_dividend
     WHERE fund_code = ?
     ORDER BY event_date ASC`,
  );

  const now = Date.now();
  const materializedList: SelectionEtfMaterialized[] = [];

  for (const cat of catalogRows) {
    const symbol = cat.symbol;
    const linkedCode = cat.linked_fund_code;

    // A. 费用：保留已知单项，两项都已知才算合计
    let mgmtFee: number | null = null;
    let custodyFee: number | null = null;
    const prof = profileMap.get(symbol);
    if (prof && (prof.mgmtFee !== null || prof.custodyFee !== null)) {
      mgmtFee = prof.mgmtFee;
      custodyFee = prof.custodyFee;
    } else if (linkedCode) {
      const localFees = feesMap.get(linkedCode);
      if (localFees && (localFees.mgmtFee !== null || localFees.custodyFee !== null)) {
        mgmtFee = localFees.mgmtFee;
        custodyFee = localFees.custodyFee;
      }
    }
    const totalExpensePct = computeEtfTotalExpensePct(mgmtFee, custodyFee);

    // B. 规模：优先最新披露 asset_nav / 1e8，其次本地 scale_yi
    let scaleYi: number | null = null;
    let scalePeriod: string | null = null;
    let scaleDisclosureDate: string | null = null;
    let scaleSource: string | null = null;

    const fin = finScaleMap.get(symbol);
    if (fin) {
      scaleYi = Number((fin.assetNav / 1e8).toFixed(4));
      scalePeriod = fin.endDate;
      scaleDisclosureDate = fin.publishDate;
      scaleSource = 'disclosure';
    } else if (linkedCode && localScaleMap.has(linkedCode)) {
      const ls = localScaleMap.get(linkedCode);
      if (ls) {
        scaleYi = ls.scaleYi;
        scalePeriod = ls.asof;
        scaleSource = 'local_verified';
      }
    }

    // C. 市场行情与 20 日均成交额
    const q = quoteMap.get(symbol);
    const bars = barStmt.all(symbol) as Array<{
      collected_at: number;
      trade_date: string;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number | null;
      turnover: number | null;
    }>;
    const hasMarketBars = bars.length > 0;
    const historyAsof = hasMarketBars ? (bars.at(-1)?.trade_date ?? null) : null;
    const avgTurnover20d = hasMarketBars
      ? compute20DayAvgTurnover(bars.map((b) => b.turnover))
      : null;

    // 最新市价 (从 bars 末尾或 quote)
    let marketPrice = q?.price ?? null;
    let marketTradeDate = q?.tradeDate ?? null;
    let changePct = q?.changePct ?? null;
    let turnover = q?.turnover ?? null;
    let volume = q?.volume ?? null;

    if (bars.length > 0) {
      const lastBar = bars.at(-1);
      if (lastBar) {
        if (!marketTradeDate || lastBar.trade_date >= marketTradeDate) {
          marketTradeDate = lastBar.trade_date;
          marketPrice = lastBar.close;
          turnover = lastBar.turnover;
          volume = lastBar.volume;
          if (bars.length >= 2) {
            const prevBar = bars.at(-2);
            if (prevBar) {
              changePct = Number(
                (((lastBar.close - prevBar.close) / prevBar.close) * 100).toFixed(4),
              );
            }
          }
        }
      }
    }

    // D. NAV 净值与折溢价
    const navPoints = navStmt.all(symbol) as Array<{
      nav_date: string;
      unit_nav: number;
      adj_nav: number | null;
    }>;
    let hasNavHistory = navPoints.length > 0;

    let navDate: string | null = null;
    let unitNav: number | null = null;
    let adjNav: number | null = null;

    if (hasNavHistory) {
      const lastNav = navPoints.at(-1);
      if (lastNav) {
        navDate = lastNav.nav_date;
        unitNav = lastNav.unit_nav;
        adjNav = lastNav.adj_nav;
      }
    } else if (linkedCode) {
      // 读本地 fund_nav
      const localLast = db
        .query(
          'SELECT nav_date, unit_nav FROM fund_nav WHERE fund_code = ? ORDER BY nav_date DESC LIMIT 1',
        )
        .get(linkedCode) as { nav_date: string; unit_nav: number } | null;
      if (localLast) {
        hasNavHistory = true;
        navDate = localLast.nav_date;
        unitNav = localLast.unit_nav;
      }
    }

    // 折溢价：必须只有明确同日市场日 K 收盘才算；推断日期的盘中快照算 null
    let closingTradeDate: string | null = null;
    let closingPrice: number | null = null;
    if (bars.length > 0) {
      const lastBar = bars.at(-1);
      if (lastBar && canUseDailyClose(lastBar.trade_date, lastBar.collected_at)) {
        closingTradeDate = lastBar.trade_date;
        closingPrice = lastBar.close;
      }
    }

    const premiumDiscountPct = computeEtfPremiumDiscount(
      closingPrice,
      closingTradeDate,
      unitNav,
      navDate,
    );

    // E. 收益风险指标与曲线构建 (优先扶摇 adj_nav，其次本地 buildTotalReturn)
    let totalReturnSeries: Array<{ date: string; value: number }> = [];
    let navRiskBasis: 'adj_nav' | 'local_total_return' | 'none' = 'none';
    let navRiskAsof: string | null = null;

    if (hasNavHistory && navPoints.some((p) => p.adj_nav !== null && p.adj_nav > 0)) {
      totalReturnSeries = navPoints
        .filter((p) => p.adj_nav !== null && p.adj_nav > 0)
        .map((p) => ({ date: p.nav_date, value: p.adj_nav as number }));
      navRiskBasis = 'adj_nav';
      navRiskAsof = totalReturnSeries.at(-1)?.date ?? null;
    } else if (linkedCode) {
      const lNavs = localNavStmt.all(linkedCode) as Array<{
        nav_date: string;
        unit_nav: number;
        daily_return: number | null;
      }>;
      const lDivs = localDivStmt.all(linkedCode) as Array<{
        event_date: string;
        event_type: 'dividend' | 'split';
        dividend_per_share: number | null;
        split_ratio: number | null;
      }>;
      const trPoints = buildTotalReturn(
        lNavs.map((n) => ({
          navDate: n.nav_date,
          unitNav: n.unit_nav,
          dailyReturn: n.daily_return,
        })),
        lDivs.map((d) => ({
          eventDate: d.event_date,
          eventType: d.event_type,
          dividendPerShare: d.dividend_per_share,
          splitRatio: d.split_ratio,
        })),
      );
      if (trPoints && trPoints.length > 0) {
        totalReturnSeries = trPoints.map((p) => ({ date: p.navDate, value: p.trNav }));
        navRiskBasis = 'local_total_return';
        navRiskAsof = totalReturnSeries.at(-1)?.date ?? null;
      }
    }

    // 1y / 3y / 5y 指标
    const w1y = evaluateReturnWindow(totalReturnSeries, 1);
    const w3y = evaluateReturnWindow(totalReturnSeries, 3);
    const w5y = evaluateReturnWindow(totalReturnSeries, 5);

    // F. Sparkline 行内小曲线 (优先最近 60 个市场收盘，其次最近 60 个净值)
    let sparklineJson: string | null = null;
    let sparklineType: 'price' | 'nav' | 'none' = 'none';

    if (bars.length > 0) {
      const last60 = bars.slice(-60).map((b) => b.close);
      sparklineJson = JSON.stringify(last60);
      sparklineType = 'price';
    } else if (totalReturnSeries.length > 0) {
      const last60 = totalReturnSeries.slice(-60).map((p) => Number(p.value.toFixed(4)));
      sparklineJson = JSON.stringify(last60);
      sparklineType = 'nav';
    }

    const hasDeepResearch = hasMarketBars && hasNavHistory;

    materializedList.push({
      symbol,
      ticker: cat.ticker,
      name: cat.name,
      exchange: cat.exchange,
      assetClass: cat.asset_class,
      directionTag: cat.direction_tag ?? deriveEtfDirectionTag(cat.name, cat.asset_class),
      linkedFundCode: linkedCode,
      marketTradeDate,
      marketPrice,
      changePct,
      turnover,
      volume,
      avgTurnover20d,
      navDate,
      unitNav,
      adjNav,
      premiumDiscountPct,
      mgmtFeePct: mgmtFee,
      custodyFeePct: custodyFee,
      totalExpensePct,
      scaleYi,
      scalePeriod,
      scaleDisclosureDate,
      scaleSource,
      historyAsof,
      navRiskBasis,
      navRiskAsof,
      return1y: w1y.periodReturn,
      return3y: w3y.periodReturn,
      return5y: w5y.periodReturn,
      cagr1y: w1y.cagr,
      cagr3y: w3y.cagr,
      cagr5y: w5y.cagr,
      maxDrawdown1y: w1y.maxDrawdown,
      maxDrawdown3y: w3y.maxDrawdown,
      maxDrawdown5y: w5y.maxDrawdown,
      volatility1y: w1y.annualVolatility,
      volatility3y: w3y.annualVolatility,
      volatility5y: w5y.annualVolatility,
      points1y: w1y.pointCount > 0 ? w1y.pointCount : null,
      points3y: w3y.pointCount > 0 ? w3y.pointCount : null,
      points5y: w5y.pointCount > 0 ? w5y.pointCount : null,
      sparklineJson,
      sparklineType,
      hasMarketBars,
      hasNavHistory,
      hasDeepResearch,
      updatedAt: now,
    });
  }

  return materializedList;
}

/**
 * 针对所有股票目录标的，从 SQLite 本地与 selection_* 快照与深采表中提取物化筛选行
 */
export function materializeAllStocks(db: Database): SelectionStockMaterialized[] {
  // 1. 读取股票目录 (全市场 5,567 只)
  const catalogRows = db
    .query(
      `SELECT symbol, ticker, name, exchange, industry_thscode, industry_name, is_financial
       FROM selection_stock_catalog
       ORDER BY ticker ASC`,
    )
    .all() as Array<{
    symbol: string;
    ticker: string;
    name: string;
    exchange: string;
    industry_thscode: string | null;
    industry_name: string | null;
    is_financial: number;
  }>;

  // 2. 预载全市场最新快照 (包含 price, trade_date, change_pct, turnover, volume)
  const snapMap = new Map<
    string,
    {
      tradeDate: string;
      price: number | null;
      changePct: number | null;
      turnover: number | null;
      volume: number | null;
    }
  >();
  const snapRows = db
    .query(
      'SELECT symbol, trade_date, price, change_pct, turnover, volume FROM selection_stock_snapshot',
    )
    .all() as Array<{
    symbol: string;
    trade_date: string;
    price: number | null;
    change_pct: number | null;
    turnover: number | null;
    volume: number | null;
  }>;
  for (const s of snapRows) {
    snapMap.set(s.symbol, {
      tradeDate: s.trade_date,
      price: s.price,
      changePct: s.change_pct,
      turnover: s.turnover,
      volume: s.volume,
    });
  }

  // 3. 预载估值快照
  const valMap = new Map<
    string,
    {
      peTtm: number | null;
      peMrq: number | null;
      pbMrq: number | null;
      psTtm: number | null;
      pcfTtm: number | null;
      timestamp: number | null;
    }
  >();
  const valRows = db
    .query(
      'SELECT symbol, pe_ttm, pe_mrq, pb_mrq, ps_ttm, pcf_ttm, timestamp FROM selection_stock_valuation',
    )
    .all() as Array<{
    symbol: string;
    pe_ttm: number | null;
    pe_mrq: number | null;
    pb_mrq: number | null;
    ps_ttm: number | null;
    pcf_ttm: number | null;
    timestamp: number | null;
  }>;
  for (const v of valRows) {
    valMap.set(v.symbol, {
      peTtm: v.pe_ttm,
      peMrq: v.pe_mrq,
      pbMrq: v.pb_mrq,
      psTtm: v.ps_ttm,
      pcfTtm: v.pcf_ttm,
      timestamp: v.timestamp,
    });
  }

  // 准备查询单只股票的日 K 与财报三张表
  const barStmt = db.prepare(
    `SELECT trade_date, open, high, low, close, volume, turnover
     FROM selection_daily_bar
     WHERE asset_type = 'stock' AND symbol = ? AND adjust = 'forward'
     ORDER BY trade_date ASC`,
  );

  const stmtQuery = db.prepare(
    `SELECT statement_type, fiscal_year, period_end, report_date, currency, data_json
     FROM selection_stock_financial_statement
     WHERE symbol = ?
     ORDER BY fiscal_year ASC`,
  );

  const indStmt = db.prepare(
    `SELECT report, abilities_json
     FROM selection_stock_financial_indicators
     WHERE symbol = ? AND report = ?`,
  );

  const now = Date.now();
  const materializedList: SelectionStockMaterialized[] = [];

  for (const cat of catalogRows) {
    const symbol = cat.symbol;
    const isFinancial = cat.is_financial === 1;

    // A. 基础快照行情 (全市场覆盖)
    const snap = snapMap.get(symbol);
    let tradeDate = snap?.tradeDate ?? null;
    let price = snap?.price ?? null;
    let changePct = snap?.changePct ?? null;
    let turnover = snap?.turnover ?? null;
    let volume = snap?.volume ?? null;

    // B. 估值快照
    const val = valMap.get(symbol);

    // C. 前复权 K 线与趋势指标 (有界深采池)
    const bars = barStmt.all(symbol) as Array<{
      trade_date: string;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number | null;
      turnover: number | null;
    }>;
    const hasPriceHistory = bars.length > 0;
    const historyAsof = hasPriceHistory ? (bars.at(-1)?.trade_date ?? null) : null;

    // 若快照无数据但历史 K 线有最新点，用历史更新
    if (hasPriceHistory && price === null) {
      const lastBar = bars.at(-1);
      if (lastBar) {
        tradeDate = lastBar.trade_date;
        price = lastBar.close;
        turnover = lastBar.turnover;
        volume = lastBar.volume;
        if (bars.length >= 2) {
          const prev = bars.at(-2);
          if (prev) {
            changePct = Number((((lastBar.close - prev.close) / prev.close) * 100).toFixed(4));
          }
        }
      }
    }

    const avgTurnover20d = hasPriceHistory
      ? compute20DayAvgTurnover(bars.map((b) => b.turnover))
      : null;
    const pricePoints = bars.map((b) => ({ tradeDate: b.trade_date, close: b.close }));
    const return20d = hasPriceHistory ? computeRollingReturn(pricePoints, 20) : null;
    const return60d = hasPriceHistory ? computeRollingReturn(pricePoints, 60) : null;
    const ma60Bias = hasPriceHistory ? computeMa60Bias(bars.map((b) => b.close)) : null;

    const priceSeries = bars.map((b) => ({ date: b.trade_date, value: b.close }));
    const w1y = evaluateReturnWindow(priceSeries, 1);
    const w3y = evaluateReturnWindow(priceSeries, 3);
    const w5y = evaluateReturnWindow(priceSeries, 5);

    const sparklineJson =
      bars.length > 0 ? JSON.stringify(bars.slice(-60).map((b) => b.close)) : null;

    // D. 财报数据对齐
    const stmts = stmtQuery.all(symbol) as Array<{
      statement_type: 'income' | 'balance' | 'cash_flow';
      fiscal_year: number;
      period_end: string;
      report_date: string;
      currency: string;
      data_json: string;
    }>;
    const hasFinancials = stmts.length > 0;

    // 按 (fiscal_year, period_end, currency) 严格对齐三张表
    const incomeByYear = new Map<
      number,
      { data: Record<string, unknown>; periodEnd: string; reportDate: string; currency: string }
    >();
    const balanceByYear = new Map<
      number,
      { data: Record<string, unknown>; periodEnd: string; reportDate: string; currency: string }
    >();
    const cashByYear = new Map<
      number,
      { data: Record<string, unknown>; periodEnd: string; reportDate: string; currency: string }
    >();

    for (const s of stmts) {
      try {
        const d = JSON.parse(s.data_json);
        const item = {
          data: d,
          periodEnd: s.period_end,
          reportDate: s.report_date,
          currency: s.currency,
        };
        if (s.statement_type === 'income') incomeByYear.set(s.fiscal_year, item);
        if (s.statement_type === 'balance') balanceByYear.set(s.fiscal_year, item);
        if (s.statement_type === 'cash_flow') cashByYear.set(s.fiscal_year, item);
      } catch {
        // ignore
      }
    }

    // 找到最新完整财年 (需至少利润表存在)
    const sortedYears = [...incomeByYear.keys()].sort((a, b) => a - b);
    const latestYear = sortedYears.at(-1) ?? null;

    let periodEnd: string | null = null;
    let reportDate: string | null = null;
    let currency: string | null = null;
    let operatingIncome: number | null = null;
    let revenueYoy: number | null = null;
    let netProfit: number | null = null;
    let parentNetProfit: number | null = null;
    let profitYoy: number | null = null;
    let revenueCagr3y: number | null = null;
    let profitCagr3y: number | null = null;
    let operatingCashFlow: number | null = null;
    let cashProfitRatio: number | null = null;
    let capex: number | null = null;
    let cashMinusCapex: number | null = null;
    let debtRatio: number | null = null;

    if (latestYear !== null) {
      const incItem = incomeByYear.get(latestYear);
      if (!incItem) continue;
      periodEnd = incItem.periodEnd;
      reportDate = incItem.reportDate;
      currency = incItem.currency;

      const inc = incItem.data as Record<string, number | null>;
      const incPrevItem = incomeByYear.get(latestYear - 1);
      // 检查上一年币种是否一致
      const incPrev =
        incPrevItem && incPrevItem.currency === currency
          ? (incPrevItem.data as Record<string, number | null>)
          : undefined;

      // 资产负债表与现金流量表对齐期末与币种
      const balItem = balanceByYear.get(latestYear);
      const bal =
        balItem && balItem.periodEnd === periodEnd && balItem.currency === currency
          ? (balItem.data as Record<string, number | null>)
          : undefined;

      const cfItem = cashByYear.get(latestYear);
      const cf =
        cfItem && cfItem.periodEnd === periodEnd && cfItem.currency === currency
          ? (cfItem.data as Record<string, number | null>)
          : undefined;

      operatingIncome = inc.operating_income ?? null;
      netProfit = inc.net_profit ?? null;
      parentNetProfit = inc.parent_holder_net_profit ?? null;

      if (inc && incPrev) {
        revenueYoy = computeYoyGrowth(inc.operating_income, incPrev.operating_income);
        profitYoy = computeYoyGrowth(
          inc.parent_holder_net_profit,
          incPrev.parent_holder_net_profit,
        );
      }

      // 3 年 CAGR：必须 4 个连续年份且同币种
      const revMap = new Map<number, number>();
      const profitMap = new Map<number, number>();
      for (const [y, item] of incomeByYear) {
        if (item.currency === currency) {
          const incData = item.data as Record<string, number | null>;
          if (incData.operating_income != null) revMap.set(y, incData.operating_income);
          if (incData.parent_holder_net_profit != null)
            profitMap.set(y, incData.parent_holder_net_profit);
        }
      }
      revenueCagr3y = computeFinancial3YearCagr(revMap, latestYear);
      profitCagr3y = computeFinancial3YearCagr(profitMap, latestYear);

      // 现金流指标
      if (cf) {
        operatingCashFlow = cf.act_cash_flow_net ?? null;
        capex = cf.pay_fixed_assets_etc_cash ?? null;
      }
      cashProfitRatio = computeCashProfitRatio(operatingCashFlow, netProfit);
      cashMinusCapex = computeCashMinusCapex(operatingCashFlow, capex);

      // 负债率 (total_debt / assets_total)
      if (bal && bal.total_debt != null && bal.assets_total != null) {
        debtRatio = computeDebtRatio(bal.total_debt, bal.assets_total);
      }
    }

    // 从指标结构中查询最新完整年报 (report = `${latestYear}-4`) 的 abilities
    let roeWeighted: number | null = null;
    let roeDeductedWeighted: number | null = null;
    let grossMargin: number | null = null;
    let netMargin: number | null = null;

    if (latestYear !== null) {
      const targetReport = `${latestYear}-4`;
      const indRow = indStmt.get(symbol, targetReport) as {
        report: string;
        abilities_json: string;
      } | null;
      if (indRow) {
        try {
          const abilities = JSON.parse(indRow.abilities_json) as Array<{
            ability: string;
            indicators: Array<{ index_id: string; value: string | number | null }>;
          }>;
          for (const a of abilities) {
            for (const ind of a.indicators) {
              const num = marketNumber(ind.value);
              if (num !== null && Number.isFinite(num)) {
                if (ind.index_id === 'index_weighted_avg_roe') roeWeighted = num;
                if (ind.index_id === 'index_deduct_weighted_avg_roe') roeDeductedWeighted = num;
                if (ind.index_id === 'sale_gross_margin') grossMargin = num;
                if (ind.index_id === 'sale_net_interest_ratio') netMargin = num;
                if (debtRatio === null && ind.index_id === 'assets_debt_ratio') debtRatio = num;
              }
            }
          }
        } catch {
          // ignore
        }
      }
    }

    const hasDeepResearch = hasPriceHistory && hasFinancials;

    materializedList.push({
      symbol,
      ticker: cat.ticker,
      name: cat.name,
      exchange: cat.exchange,
      industryThscode: cat.industry_thscode,
      industryName: cat.industry_name,
      isFinancial,
      tradeDate,
      price,
      changePct,
      turnover,
      volume,
      avgTurnover20d,
      peTtm: val?.peTtm ?? null,
      peMrq: val?.peMrq ?? null,
      pbMrq: val?.pbMrq ?? null,
      psTtm: val?.psTtm ?? null,
      pcfTtm: val?.pcfTtm ?? null,
      valuationTimestamp: val?.timestamp ?? null,
      historyAsof,
      return1y: w1y.periodReturn,
      return3y: w3y.periodReturn,
      return5y: w5y.periodReturn,
      cagr1y: w1y.cagr,
      cagr3y: w3y.cagr,
      cagr5y: w5y.cagr,
      maxDrawdown1y: w1y.maxDrawdown,
      maxDrawdown3y: w3y.maxDrawdown,
      maxDrawdown5y: w5y.maxDrawdown,
      volatility1y: w1y.annualVolatility,
      volatility3y: w3y.annualVolatility,
      volatility5y: w5y.annualVolatility,
      return20d,
      return60d,
      ma60Bias,
      sparklineJson,
      fiscalYear: latestYear,
      periodEnd,
      reportDate,
      currency,
      roeWeighted,
      roeDeductedWeighted,
      grossMargin,
      netMargin,
      debtRatio,
      operatingIncome,
      revenueYoy,
      netProfit,
      parentNetProfit,
      profitYoy,
      revenueCagr3y,
      profitCagr3y,
      operatingCashFlow,
      cashProfitRatio,
      capex,
      cashMinusCapex,
      hasDeepResearch,
      hasPriceHistory,
      hasFinancials,
      updatedAt: now,
    });
  }

  return materializedList;
}
