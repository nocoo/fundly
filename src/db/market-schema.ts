/**
 * 宏观与跨资产独立数据表 DDL
 * 保持独立于基金核心表，不覆盖/不修改 fund_basic_info, fund_nav, fund_performance 等
 * 确保现有 Backy 备份恢复兼容性与 assertFundlyDb 校验不变
 */

export const MARKET_SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS market_collection_batch (
    batch_id TEXT PRIMARY KEY, source_key TEXT NOT NULL, collection_mode TEXT NOT NULL,
    started_at INTEGER NOT NULL, completed_at INTEGER NOT NULL,
    expected_items INTEGER NOT NULL, actual_items INTEGER NOT NULL,
    quote_count INTEGER NOT NULL, bar_count INTEGER NOT NULL, observation_count INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS market_etf_profile (
    instrument_id TEXT PRIMARY KEY, established_date TEXT, fund_scale REAL, fund_manager TEXT,
    management_company TEXT, source TEXT NOT NULL, collected_at INTEGER NOT NULL, raw_json TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS market_etf_holding (
    instrument_id TEXT NOT NULL, report_date TEXT NOT NULL, stock_code TEXT NOT NULL,
    stock_name TEXT NOT NULL, asset_type TEXT NOT NULL, hold_pct REAL, hold_shares REAL,
    hold_value_wan REAL, published_at TEXT, source TEXT NOT NULL, collected_at INTEGER NOT NULL,
    PRIMARY KEY (instrument_id, report_date, stock_code)
  ) WITHOUT ROWID`,
  // 1. 标的资产主表
  `CREATE TABLE IF NOT EXISTS market_instrument (
    instrument_id    TEXT PRIMARY KEY,       -- 规范标识，如 'index:000300.SH', 'etf:510300.SH', 'comm:SHFE.AU2610'
    asset_class      TEXT NOT NULL,          -- 'index' | 'industry' | 'etf' | 'commodity' | 'fx' | 'rate'
    symbol           TEXT NOT NULL,          -- 代码或标识符
    name             TEXT NOT NULL,          -- 显示名称
    exchange         TEXT,                   -- 'SH' | 'SZ' | 'SHFE' | 'ECB' | 'CFETS' | 'CBOE' | 'FRED'
    currency         TEXT NOT NULL DEFAULT 'CNY',
    unit             TEXT,                   -- 单位如 '点', '元/克', '元/吨', '%', 'bp', '美元/桶'
    trading_calendar TEXT NOT NULL DEFAULT 'CN_STOCK',
    is_active        INTEGER NOT NULL DEFAULT 1,
    created_at       INTEGER NOT NULL,
    updated_at       INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_mkt_inst_asset_class ON market_instrument(asset_class)`,
  `CREATE INDEX IF NOT EXISTS idx_mkt_inst_symbol ON market_instrument(symbol)`,

  // 2. 外部映射别名（代码映射，以及与已核验的 fund_code 关联）
  `CREATE TABLE IF NOT EXISTS market_symbol_alias (
    alias_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    instrument_id    TEXT NOT NULL,
    source           TEXT NOT NULL,          -- 'fuyao' | 'shfe' | 'ecb' | 'chinamoney' | 'cboe' | 'fred'
    source_symbol    TEXT NOT NULL,          -- 源方代码，如 '000300.SH', '881121.TI', '510300.SH'
    linked_fund_code TEXT,                   -- 已核验对应的 fund_code
    notes            TEXT,
    updated_at       INTEGER NOT NULL,
    FOREIGN KEY (instrument_id) REFERENCES market_instrument(instrument_id)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_mkt_alias_source ON market_symbol_alias(source, source_symbol)`,
  `CREATE INDEX IF NOT EXISTS idx_mkt_alias_fund_code ON market_symbol_alias(linked_fund_code)`,

  // 3. 最新快照行行情缓存
  `CREATE TABLE IF NOT EXISTS market_quote_latest (
    instrument_id      TEXT PRIMARY KEY,
    source             TEXT NOT NULL,
    trade_date         TEXT NOT NULL,        -- YYYY-MM-DD
    quote_at           INTEGER,              -- 行情实际毫秒时间戳（若已知）
    is_inferred_date   INTEGER NOT NULL DEFAULT 0,
    price              REAL,                 -- 最新价/点位/汇率/利率
    open               REAL,
    high               REAL,
    low                REAL,
    close              REAL,
    prev_close         REAL,
    change_pct         REAL,                 -- (price - prev_close) / prev_close * 100
    volume             REAL,
    turnover           REAL,
    settlement_price   REAL,                 -- 商品结算价
    prev_settlement    REAL,                 -- 商品昨结算
    source_timestamp   INTEGER,              -- 源返回的顶层 timestamp
    collected_at       INTEGER NOT NULL,
    batch_id           TEXT,
    raw_json           TEXT,
    FOREIGN KEY (instrument_id) REFERENCES market_instrument(instrument_id)
  )`,

  // 4. 日频历史 OHLCV（严禁无OHLC时把close填进open/high/low）
  `CREATE TABLE IF NOT EXISTS market_daily_bar (
    instrument_id   TEXT NOT NULL,
    trade_date      TEXT NOT NULL,           -- YYYY-MM-DD
    source          TEXT NOT NULL,
    open            REAL NOT NULL,
    high            REAL NOT NULL,
    low             REAL NOT NULL,
    close           REAL NOT NULL,
    volume          REAL,                    -- 股/手/张
    turnover        REAL,                    -- 成交金额（元）
    collected_at    INTEGER NOT NULL,
    PRIMARY KEY (instrument_id, trade_date)
  ) WITHOUT ROWID`,
  `CREATE INDEX IF NOT EXISTS idx_mkt_bar_date ON market_daily_bar(trade_date DESC)`,

  // 5. 单值序列观察表（利率、FX参考汇率、宏观指标等非OHLC）
  `CREATE TABLE IF NOT EXISTS market_series_observation (
    instrument_id     TEXT NOT NULL,
    observation_date  TEXT NOT NULL,         -- YYYY-MM-DD
    source            TEXT NOT NULL,
    value             REAL NOT NULL,
    unit              TEXT,
    period_end        TEXT,
    published_at      TEXT,
    collected_at      INTEGER NOT NULL,
    PRIMARY KEY (instrument_id, observation_date)
  ) WITHOUT ROWID`,
  `CREATE INDEX IF NOT EXISTS idx_mkt_series_obs_date ON market_series_observation(observation_date DESC)`,

  // 6. 行业/指数当前成分表（采集截面，不伪造历史区间）
  `CREATE TABLE IF NOT EXISTS market_index_member (
    index_id        TEXT NOT NULL,           -- 如 'index:000300.SH', 'industry:881121.TI'
    stock_code      TEXT NOT NULL,           -- 股票代码 '600519.SH'
    stock_name      TEXT NOT NULL,
    weight          REAL,                    -- 权重%（若未知则为 NULL）
    rank_order      INTEGER NOT NULL DEFAULT 0,
    collected_at    INTEGER NOT NULL,
    PRIMARY KEY (index_id, stock_code)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_mkt_idx_mem_stock ON market_index_member(stock_code)`,

  // 7. 标的关联关系表（行业-ETF主题关联、跟踪指数等）
  `CREATE TABLE IF NOT EXISTS market_instrument_relation (
    relation_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id       TEXT NOT NULL,           -- 如 'industry:881121.TI'
    target_id       TEXT NOT NULL,           -- 如 'etf:512480.SH'
    relation_type   TEXT NOT NULL,           -- 'tracks_index' | 'theme_associated'
    confidence      TEXT NOT NULL DEFAULT 'verified',
    description     TEXT,
    verified_at     INTEGER NOT NULL,
    FOREIGN KEY (source_id) REFERENCES market_instrument(instrument_id),
    FOREIGN KEY (target_id) REFERENCES market_instrument(instrument_id)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_mkt_inst_rel ON market_instrument_relation(source_id, target_id, relation_type)`,

  // 8. 全市场广度聚合统计
  `CREATE TABLE IF NOT EXISTS market_breadth (
    trade_date          TEXT PRIMARY KEY,    -- YYYY-MM-DD
    scope               TEXT NOT NULL DEFAULT 'SH_SZ_A',
    up_count            INTEGER NOT NULL,
    down_count          INTEGER NOT NULL,
    flat_count          INTEGER NOT NULL,
    total_valid_count   INTEGER NOT NULL,
    total_catalog_count INTEGER NOT NULL,
    median_change_pct   REAL,
    valid_turnover_sum  REAL,                -- 有效股票池成交额合计（元）
    limit_up_count      INTEGER,
    limit_down_count    INTEGER,
    limit_break_count   INTEGER,
    collected_at        INTEGER NOT NULL,
    batch_id            TEXT
  )`,

  // 9. 采集批次记录与源状态表
  `CREATE TABLE IF NOT EXISTS market_source_status (
    source_key          TEXT PRIMARY KEY,    -- 'fuyao' | 'shfe' | 'ecb' | 'chinamoney' | 'cboe' | 'fred'
    last_success_at     INTEGER,
    last_trade_date     TEXT,
    last_status_code    INTEGER,
    last_error_message  TEXT,
    expected_items      INTEGER,
    actual_items        INTEGER,
    updated_at          INTEGER NOT NULL
  )`,
];
