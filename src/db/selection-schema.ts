/**
 * 选 ETF 与选股独立 schema 迁移定义
 * 表名前缀: selection_*
 * 包含：
 * 1. selection_etf_catalog
 * 2. selection_stock_catalog
 * 3. selection_daily_bar (独立存储：ETF adjust=none, 股票 adjust=forward)
 * 4. selection_etf_nav (五年真实 unit_nav 与 adj_nav)
 * 5. selection_etf_profile
 * 6. selection_etf_financials (披露规模资产净值 asset_nav 与披露日期)
 * 7. selection_etf_holding (定期披露重仓明细)
 * 8. selection_stock_valuation (PE/PB/PS/PCF 快照)
 * 9. selection_stock_financial_statement (年报利润表、资产负债表、现金流量表)
 * 10. selection_stock_financial_indicators (能力评估指标)
 * 11. selection_collection_status (任务级发布状态与真实分母)
 * 12. selection_etf_materialized (选 ETF 物化筛选宽表)
 * 13. selection_stock_materialized (选股物化筛选宽表)
 */

export const SELECTION_SCHEMA_DDL = [
  // 1. ETF 独立研究目录
  `CREATE TABLE IF NOT EXISTS selection_etf_catalog (
    symbol           TEXT PRIMARY KEY,       -- e.g. '510300.SH'
    ticker           TEXT NOT NULL,          -- '510300'
    name             TEXT NOT NULL,
    exchange         TEXT NOT NULL,          -- 'SH' | 'SZ'
    asset_class      TEXT NOT NULL,          -- '境内权益' | '境外权益' | '固收' | '货币' | '其他' | '待核验'
    direction_tag    TEXT,                   -- '宽基' | '红利低波' | '行业主题' | '固收货币' | '跨境海外' | '其他'
    linked_fund_code TEXT,                   -- 本地核验关联的 6 位代码
    link_method      TEXT,                   -- 关联依据
    created_at       INTEGER NOT NULL,
    updated_at       INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sel_etf_cat_ticker ON selection_etf_catalog(ticker)`,
  `CREATE INDEX IF NOT EXISTS idx_sel_etf_cat_linked ON selection_etf_catalog(linked_fund_code)`,
  `CREATE INDEX IF NOT EXISTS idx_sel_etf_cat_asset ON selection_etf_catalog(asset_class)`,

  // 2. 股票独立研究目录
  `CREATE TABLE IF NOT EXISTS selection_stock_catalog (
    symbol           TEXT PRIMARY KEY,       -- e.g. '600519.SH'
    ticker           TEXT NOT NULL,          -- '600519'
    name             TEXT NOT NULL,
    exchange         TEXT NOT NULL,          -- 'SH' | 'SZ' | 'BJ'
    industry_thscode TEXT,                   -- '881121.TI'
    industry_name    TEXT,                   -- '白酒'
    is_financial     INTEGER NOT NULL DEFAULT 0, -- 1=金融业 (银行/证券/保险)
    created_at       INTEGER NOT NULL,
    updated_at       INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sel_stk_cat_ticker ON selection_stock_catalog(ticker)`,
  `CREATE INDEX IF NOT EXISTS idx_sel_stk_cat_ind ON selection_stock_catalog(industry_thscode)`,

  // 3. 独立日 K 表：区分 ETF (adjust=none) 与 股票 (adjust=forward)
  `CREATE TABLE IF NOT EXISTS selection_daily_bar (
    asset_type   TEXT NOT NULL,              -- 'etf' | 'stock'
    symbol       TEXT NOT NULL,              -- e.g. '510300.SH' or '600519.SH'
    adjust       TEXT NOT NULL,              -- 'none' | 'forward'
    trade_date   TEXT NOT NULL,              -- YYYY-MM-DD
    open         REAL NOT NULL,
    high         REAL NOT NULL,
    low          REAL NOT NULL,
    close        REAL NOT NULL,
    volume       REAL,
    turnover     REAL,
    collected_at INTEGER NOT NULL,
    PRIMARY KEY (asset_type, symbol, adjust, trade_date)
  ) WITHOUT ROWID`,
  `CREATE INDEX IF NOT EXISTS idx_sel_bar_sym_date ON selection_daily_bar(symbol, trade_date DESC)`,

  // 4. ETF 五年 NAV (单位与复权)
  `CREATE TABLE IF NOT EXISTS selection_etf_nav (
    symbol       TEXT NOT NULL,
    nav_date     TEXT NOT NULL,              -- YYYY-MM-DD
    unit_nav     REAL NOT NULL,
    adj_nav      REAL,
    collected_at INTEGER NOT NULL,
    PRIMARY KEY (symbol, nav_date)
  ) WITHOUT ROWID`,
  `CREATE INDEX IF NOT EXISTS idx_sel_etf_nav_date ON selection_etf_nav(nav_date DESC)`,

  // 5. ETF 基础资料
  `CREATE TABLE IF NOT EXISTS selection_etf_profile (
    symbol         TEXT PRIMARY KEY,
    estab_date     TEXT,                     -- YYYY-MM-DD
    mgmt_name      TEXT,
    manager_name   TEXT,
    fund_scale     REAL,                     -- profile 无日期规模 (元)
    mgmt_fee_pct   REAL,                     -- %/年
    custody_fee_pct REAL,                    -- %/年
    collected_at   INTEGER NOT NULL,
    raw_json       TEXT
  )`,

  // 6. ETF 定期披露财务指标 (披露规模)
  `CREATE TABLE IF NOT EXISTS selection_etf_financials (
    symbol         TEXT NOT NULL,
    start_date     TEXT NOT NULL,            -- YYYY-MM-DD
    end_date       TEXT NOT NULL,            -- 报告期 YYYY-MM-DD
    publish_date   TEXT NOT NULL,            -- 披露日 YYYY-MM-DD
    asset_nav      REAL,                     -- 资产净值 (元)
    collected_at   INTEGER NOT NULL,
    PRIMARY KEY (symbol, end_date, publish_date)
  ) WITHOUT ROWID`,

  // 7. ETF 定期披露重仓持股
  `CREATE TABLE IF NOT EXISTS selection_etf_holding (
    symbol           TEXT NOT NULL,
    report_date      TEXT NOT NULL,          -- YYYY-MM-DD
    stock_code       TEXT NOT NULL,
    stock_name       TEXT NOT NULL,
    asset_type       TEXT NOT NULL,
    hold_ratio       REAL,                   -- 百分数 (8.88 代表 8.88%)
    position_capital REAL,
    position_count   REAL,
    published_at     TEXT,
    collected_at     INTEGER NOT NULL,
    PRIMARY KEY (symbol, report_date, stock_code)
  ) WITHOUT ROWID`,

  // 8. 股票批量估值快照
  `CREATE TABLE IF NOT EXISTS selection_stock_valuation (
    symbol       TEXT PRIMARY KEY,
    trade_date   TEXT,                       -- YYYY-MM-DD
    timestamp    INTEGER,
    pe_ttm       REAL,
    pe_mrq       REAL,
    pb_mrq       REAL,
    ps_ttm       REAL,
    pcf_ttm      REAL,
    collected_at INTEGER NOT NULL
  )`,

  // 8.1 股票全市场快照行情表 (所有沪深北目录行情快照)
  `CREATE TABLE IF NOT EXISTS selection_stock_snapshot (
    symbol           TEXT PRIMARY KEY,
    trade_date       TEXT NOT NULL,          -- YYYY-MM-DD
    price            REAL,
    prev_close       REAL,
    change_pct       REAL,
    open             REAL,
    high             REAL,
    low              REAL,
    volume           REAL,
    turnover         REAL,
    is_inferred_date INTEGER NOT NULL DEFAULT 0,
    collected_at     INTEGER NOT NULL
  )`,

  // 9. 股票财报原始三张表 (按年期保存)
  `CREATE TABLE IF NOT EXISTS selection_stock_financial_statement (
    symbol         TEXT NOT NULL,
    statement_type TEXT NOT NULL,            -- 'income' | 'balance' | 'cash_flow'
    fiscal_year    INTEGER NOT NULL,
    fiscal_period  TEXT NOT NULL,            -- 'FY'
    period_end     TEXT NOT NULL,            -- YYYY-MM-DD
    report_date    TEXT NOT NULL,            -- YYYY-MM-DD
    currency       TEXT NOT NULL DEFAULT 'CNY',
    data_json      TEXT NOT NULL,            -- 完整字段键值
    collected_at   INTEGER NOT NULL,
    PRIMARY KEY (symbol, statement_type, fiscal_year)
  ) WITHOUT ROWID`,

  // 10. 股票财务指标 (abilities 结构)
  `CREATE TABLE IF NOT EXISTS selection_stock_financial_indicators (
    symbol         TEXT NOT NULL,
    report         TEXT NOT NULL,            -- e.g. '2025-4'
    abilities_json TEXT NOT NULL,
    collected_at   INTEGER NOT NULL,
    PRIMARY KEY (symbol, report)
  ) WITHOUT ROWID`,

  // 11. 采集状态表 (严格记录实际分母与失败摘要)
  `CREATE TABLE IF NOT EXISTS selection_collection_status (
    scope          TEXT PRIMARY KEY,         -- 'etf_catalog' | 'stock_catalog' | ...
    last_success_at INTEGER,
    last_attempt_at INTEGER NOT NULL,
    success        INTEGER NOT NULL,         -- 0 | 1
    catalog_count  INTEGER NOT NULL,
    valid_count    INTEGER NOT NULL,
    error_message  TEXT,
    details_json   TEXT,
    updated_at     INTEGER NOT NULL
  )`,

  // 12. 选 ETF 物化筛选表 (只读 API 毫秒级返回)
  `CREATE TABLE IF NOT EXISTS selection_etf_materialized (
    symbol             TEXT PRIMARY KEY,
    ticker             TEXT NOT NULL,
    name               TEXT NOT NULL,
    exchange           TEXT NOT NULL,
    asset_class        TEXT NOT NULL,
    direction_tag      TEXT,
    linked_fund_code   TEXT,
    market_trade_date  TEXT,
    market_price       REAL,
    change_pct         REAL,
    turnover           REAL,
    volume             REAL,
    avg_turnover_20d   REAL,
    nav_date           TEXT,
    unit_nav           REAL,
    adj_nav            REAL,
    premium_discount_pct REAL,
    mgmt_fee_pct       REAL,
    custody_fee_pct    REAL,
    total_expense_pct  REAL,
    scale_yi           REAL,
    scale_period       TEXT,
    scale_disclosure_date TEXT,
    scale_source       TEXT,
    history_asof       TEXT,
    nav_risk_basis     TEXT,
    nav_risk_asof      TEXT,
    return_1y          REAL,
    return_3y          REAL,
    return_5y          REAL,
    cagr_1y            REAL,
    cagr_3y            REAL,
    cagr_5y            REAL,
    max_drawdown_1y    REAL,
    max_drawdown_3y    REAL,
    max_drawdown_5y    REAL,
    volatility_1y      REAL,
    volatility_3y      REAL,
    volatility_5y      REAL,
    points_1y          INTEGER,
    points_3y          INTEGER,
    points_5y          INTEGER,
    sparkline_json     TEXT,
    sparkline_type     TEXT NOT NULL DEFAULT 'none',
    has_market_bars    INTEGER NOT NULL DEFAULT 0,
    has_nav_history    INTEGER NOT NULL DEFAULT 0,
    has_deep_research  INTEGER NOT NULL DEFAULT 0,
    updated_at         INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_mat_etf_asset ON selection_etf_materialized(asset_class)`,
  `CREATE INDEX IF NOT EXISTS idx_mat_etf_scale ON selection_etf_materialized(scale_yi DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_mat_etf_turnover ON selection_etf_materialized(avg_turnover_20d DESC)`,

  // 13. 选股物化筛选表 (只读 API 毫秒级返回)
  `CREATE TABLE IF NOT EXISTS selection_stock_materialized (
    symbol             TEXT PRIMARY KEY,
    ticker             TEXT NOT NULL,
    name               TEXT NOT NULL,
    exchange           TEXT NOT NULL,
    industry_thscode   TEXT,
    industry_name      TEXT,
    is_financial       INTEGER NOT NULL DEFAULT 0,
    trade_date         TEXT,
    price              REAL,
    change_pct         REAL,
    turnover           REAL,
    volume             REAL,
    avg_turnover_20d   REAL,
    pe_ttm             REAL,
    pe_mrq             REAL,
    pb_mrq             REAL,
    ps_ttm             REAL,
    pcf_ttm            REAL,
    valuation_timestamp INTEGER,
    history_asof       TEXT,
    return_1y          REAL,
    return_3y          REAL,
    return_5y          REAL,
    cagr_1y            REAL,
    cagr_3y            REAL,
    cagr_5y            REAL,
    max_drawdown_1y    REAL,
    max_drawdown_3y    REAL,
    max_drawdown_5y    REAL,
    volatility_1y      REAL,
    volatility_3y      REAL,
    volatility_5y      REAL,
    return_20d         REAL,
    return_60d         REAL,
    ma60_bias          REAL,
    sparkline_json     TEXT,
    fiscal_year        INTEGER,
    period_end         TEXT,
    report_date        TEXT,
    currency           TEXT,
    roe_weighted       REAL,
    roe_deducted_weighted REAL,
    gross_margin       REAL,
    net_margin         REAL,
    debt_ratio         REAL,
    operating_income   REAL,
    revenue_yoy        REAL,
    net_profit         REAL,
    parent_net_profit  REAL,
    profit_yoy         REAL,
    revenue_cagr_3y    REAL,
    profit_cagr_3y     REAL,
    operating_cash_flow REAL,
    cash_profit_ratio  REAL,
    capex              REAL,
    cash_minus_capex   REAL,
    has_deep_research  INTEGER NOT NULL DEFAULT 0,
    has_price_history  INTEGER NOT NULL DEFAULT 0,
    has_financials     INTEGER NOT NULL DEFAULT 0,
    updated_at         INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_mat_stk_ind ON selection_stock_materialized(industry_name)`,
  `CREATE INDEX IF NOT EXISTS idx_mat_stk_pe ON selection_stock_materialized(pe_ttm)`,
  `CREATE INDEX IF NOT EXISTS idx_mat_stk_turnover ON selection_stock_materialized(avg_turnover_20d DESC)`,
];
