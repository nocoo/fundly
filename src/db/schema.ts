/**
 * SQLite Schema DDL
 * 参考 GoFundBot 的 models.py，做了简化和优化（详见 docs/02-SCHEMA.md）
 */

export const SCHEMA_VERSION = 2;

export const SCHEMA_DDL = [
  // ============================================================
  // fund_basic_info — 基金基本信息
  // ============================================================
  `CREATE TABLE IF NOT EXISTS fund_basic_info (
    fund_code         TEXT PRIMARY KEY,
    fund_name         TEXT NOT NULL,
    fund_type         TEXT NOT NULL,
    pinyin_abbr       TEXT,
    pinyin_full       TEXT,
    established_date  TEXT,
    fund_manager      TEXT,
    fund_company      TEXT,
    fund_scale        REAL,
    scale_date        TEXT,
    fee_rate          REAL,
    in_mvp_pool       INTEGER NOT NULL DEFAULT 0,
    created_at        INTEGER NOT NULL,
    updated_at        INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_fund_type ON fund_basic_info(fund_type)`,
  `CREATE INDEX IF NOT EXISTS idx_mvp_pool ON fund_basic_info(in_mvp_pool) WHERE in_mvp_pool = 1`,
  `CREATE INDEX IF NOT EXISTS idx_fund_name ON fund_basic_info(fund_name)`,

  // ============================================================
  // fund_performance — 阶段业绩 + 同类排名
  // ============================================================
  `CREATE TABLE IF NOT EXISTS fund_performance (
    fund_code           TEXT PRIMARY KEY,
    return_1m           REAL,
    return_3m           REAL,
    return_6m           REAL,
    return_1y           REAL,
    return_2y           REAL,
    return_3y           REAL,
    return_5y           REAL,
    return_ytd          REAL,
    return_since_start  REAL,
    rank_pct_1m         REAL,
    rank_pct_3m         REAL,
    rank_pct_6m         REAL,
    rank_pct_1y         REAL,
    rank_pct_2y         REAL,
    rank_pct_3y         REAL,
    rank_pct_5y         REAL,
    pass_4433           INTEGER NOT NULL DEFAULT 0,
    data_date           TEXT,
    updated_at          INTEGER NOT NULL,
    FOREIGN KEY (fund_code) REFERENCES fund_basic_info(fund_code)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_perf_return_1y ON fund_performance(return_1y DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_perf_pass_4433 ON fund_performance(pass_4433) WHERE pass_4433 = 1`,

  // ============================================================
  // fund_nav — 历史净值明细（长表，WITHOUT ROWID 省空间）
  // ============================================================
  `CREATE TABLE IF NOT EXISTS fund_nav (
    fund_code    TEXT NOT NULL,
    nav_date     TEXT NOT NULL,
    unit_nav     REAL NOT NULL,
    acc_nav      REAL,
    daily_return REAL,
    PRIMARY KEY (fund_code, nav_date)
  ) WITHOUT ROWID`,
  `CREATE INDEX IF NOT EXISTS idx_nav_date ON fund_nav(nav_date DESC)`,

  // ============================================================
  // fund_trend_extra — 非核心走势 JSON
  // ============================================================
  `CREATE TABLE IF NOT EXISTS fund_trend_extra (
    fund_code             TEXT PRIMARY KEY,
    asset_allocation_json TEXT,
    scale_history_json    TEXT,
    holder_structure_json TEXT,
    ranking_trend_json    TEXT,
    performance_5d_json   TEXT,
    updated_at            INTEGER NOT NULL,
    FOREIGN KEY (fund_code) REFERENCES fund_basic_info(fund_code)
  )`,

  // ============================================================
  // fetch_log — 抓取日志
  // ============================================================
  `CREATE TABLE IF NOT EXISTS fetch_log (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    fund_code    TEXT,
    source       TEXT NOT NULL,
    endpoint     TEXT NOT NULL,
    status       TEXT NOT NULL,
    http_code    INTEGER,
    error_msg    TEXT,
    duration_ms  INTEGER,
    created_at   INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_log_created ON fetch_log(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_log_status ON fetch_log(status)`,

  // ============================================================
  // schema_version
  // ============================================================
  `CREATE TABLE IF NOT EXISTS schema_version (
    version     INTEGER PRIMARY KEY,
    applied_at  INTEGER NOT NULL,
    description TEXT
  )`,

  // ============================================================
  // Phase 2 卫星表
  // ============================================================

  // E · fund_risk_metrics — 本地计算的风险指标（多周期）
  `CREATE TABLE IF NOT EXISTS fund_risk_metrics (
    fund_code           TEXT PRIMARY KEY,
    data_date           TEXT,
    -- 波动率（年化，%）
    volatility_1y       REAL,
    volatility_3y       REAL,
    volatility_5y       REAL,
    -- 最大回撤（%，正数表示回撤幅度）
    max_drawdown_1y     REAL,
    max_drawdown_3y     REAL,
    max_drawdown_5y     REAL,
    max_drawdown_all    REAL,
    -- 夏普比率（rf=2%）
    sharpe_1y           REAL,
    sharpe_3y           REAL,
    sharpe_5y           REAL,
    -- 索提诺（rf=2%，只惩罚下行波动）
    sortino_1y          REAL,
    sortino_3y          REAL,
    -- 卡玛（年化收益 / 最大回撤）
    calmar_1y           REAL,
    calmar_3y           REAL,
    -- 年化收益（%）
    annual_return_1y    REAL,
    annual_return_3y    REAL,
    annual_return_5y    REAL,
    -- 样本数
    nav_samples_1y      INTEGER,
    nav_samples_3y      INTEGER,
    nav_samples_5y      INTEGER,
    updated_at          INTEGER NOT NULL,
    FOREIGN KEY (fund_code) REFERENCES fund_basic_info(fund_code)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_risk_sharpe1y ON fund_risk_metrics(sharpe_1y DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_risk_calmar1y ON fund_risk_metrics(calmar_1y DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_risk_vol1y ON fund_risk_metrics(volatility_1y)`,

  // B · fund_dividend — 分红送配
  `CREATE TABLE IF NOT EXISTS fund_dividend (
    fund_code           TEXT NOT NULL,
    event_date          TEXT NOT NULL,      -- 权益登记日 / 除息日
    event_type          TEXT NOT NULL,      -- 'dividend' | 'split'
    dividend_per_share  REAL,               -- 每份分红（元）
    split_ratio         REAL,               -- 拆分比例（新份额/旧份额）
    remark              TEXT,               -- 原始说明
    updated_at          INTEGER NOT NULL,
    PRIMARY KEY (fund_code, event_date, event_type),
    FOREIGN KEY (fund_code) REFERENCES fund_basic_info(fund_code)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_div_date ON fund_dividend(event_date DESC)`,

  // D · fund_fees — 费率结构
  `CREATE TABLE IF NOT EXISTS fund_fees (
    fund_code            TEXT PRIMARY KEY,
    mgmt_fee_pct         REAL,             -- 管理费率（年 %）
    custodian_fee_pct    REAL,             -- 托管费率（年 %）
    sales_service_fee_pct REAL,            -- 销售服务费率（年 %）
    subscription_fee_max REAL,             -- 申购费上限（%）
    redemption_fee_max   REAL,             -- 赎回费上限（%）
    min_subscribe_amount REAL,             -- 最低申购金额（元）
    raw_json             TEXT,             -- 原始字段（含费率梯度）
    updated_at           INTEGER NOT NULL,
    FOREIGN KEY (fund_code) REFERENCES fund_basic_info(fund_code)
  )`,

  // C · fund_manager — 经理档案
  `CREATE TABLE IF NOT EXISTS fund_manager (
    manager_id   TEXT PRIMARY KEY,     -- name + '@' + company（简易稳定键）
    name         TEXT NOT NULL,
    company      TEXT,
    updated_at   INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_mgr_name ON fund_manager(name)`,

  // C · fund_manager_link — 经理与基金的任期
  `CREATE TABLE IF NOT EXISTS fund_manager_link (
    fund_code       TEXT NOT NULL,
    manager_id      TEXT NOT NULL,
    start_date      TEXT NOT NULL,        -- YYYY-MM-DD
    end_date        TEXT,                 -- NULL 表示在任
    tenure_days     INTEGER,
    return_during   REAL,                 -- 任期回报（%）
    updated_at      INTEGER NOT NULL,
    PRIMARY KEY (fund_code, manager_id, start_date),
    FOREIGN KEY (fund_code) REFERENCES fund_basic_info(fund_code),
    FOREIGN KEY (manager_id) REFERENCES fund_manager(manager_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_link_fund ON fund_manager_link(fund_code)`,
  `CREATE INDEX IF NOT EXISTS idx_link_mgr ON fund_manager_link(manager_id)`,
  `CREATE INDEX IF NOT EXISTS idx_link_active ON fund_manager_link(fund_code) WHERE end_date IS NULL`,

  // A · fund_portfolio — 季度重仓股（前 10 大）
  `CREATE TABLE IF NOT EXISTS fund_portfolio (
    fund_code       TEXT NOT NULL,
    report_date     TEXT NOT NULL,          -- 季末日期 YYYY-MM-DD
    stock_code      TEXT NOT NULL,          -- 6 位 A 股 / 5 位港股
    stock_name      TEXT,
    hold_pct        REAL,                   -- 占净值比 %
    hold_shares     REAL,                   -- 持股数量（万股）
    hold_value_wan  REAL,                   -- 持仓市值（万元）
    updated_at      INTEGER NOT NULL,
    PRIMARY KEY (fund_code, report_date, stock_code),
    FOREIGN KEY (fund_code) REFERENCES fund_basic_info(fund_code)
  ) WITHOUT ROWID`,
  `CREATE INDEX IF NOT EXISTS idx_port_report ON fund_portfolio(report_date DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_port_stock ON fund_portfolio(stock_code)`,
];
