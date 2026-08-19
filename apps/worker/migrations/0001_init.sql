CREATE TABLE IF NOT EXISTS fund_basic_info (
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
);
CREATE INDEX IF NOT EXISTS idx_fund_type ON fund_basic_info(fund_type);
CREATE INDEX IF NOT EXISTS idx_mvp_pool ON fund_basic_info(in_mvp_pool) WHERE in_mvp_pool = 1;
CREATE INDEX IF NOT EXISTS idx_fund_name ON fund_basic_info(fund_name);

CREATE TABLE IF NOT EXISTS fund_performance (
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
);
CREATE INDEX IF NOT EXISTS idx_perf_return_1y ON fund_performance(return_1y DESC);
CREATE INDEX IF NOT EXISTS idx_perf_pass_4433 ON fund_performance(pass_4433) WHERE pass_4433 = 1;

CREATE TABLE IF NOT EXISTS fund_nav (
  fund_code    TEXT NOT NULL,
  nav_date     TEXT NOT NULL,
  unit_nav     REAL NOT NULL,
  acc_nav      REAL,
  daily_return REAL,
  PRIMARY KEY (fund_code, nav_date)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_nav_date ON fund_nav(nav_date DESC);

CREATE TABLE IF NOT EXISTS fund_trend_extra (
  fund_code             TEXT PRIMARY KEY,
  asset_allocation_json TEXT,
  scale_history_json    TEXT,
  holder_structure_json TEXT,
  ranking_trend_json    TEXT,
  performance_5d_json   TEXT,
  updated_at            INTEGER NOT NULL,
  FOREIGN KEY (fund_code) REFERENCES fund_basic_info(fund_code)
);

CREATE TABLE IF NOT EXISTS fetch_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  fund_code    TEXT,
  source       TEXT NOT NULL,
  endpoint     TEXT NOT NULL,
  status       TEXT NOT NULL,
  http_code    INTEGER,
  error_msg    TEXT,
  duration_ms  INTEGER,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_log_created ON fetch_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_log_status ON fetch_log(status);

CREATE TABLE IF NOT EXISTS schema_version (
  version     INTEGER PRIMARY KEY,
  applied_at  INTEGER NOT NULL,
  description TEXT
);
INSERT OR IGNORE INTO schema_version (version, applied_at, description) VALUES (1, 0, 'initial schema');
