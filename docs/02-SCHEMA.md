# 数据表设计

Fundly 使用 **bun:sqlite**（Bun 原生 SQLite），单文件存储于 `data/fundly.db`。

设计思路参考 [GoFundBot](https://github.com/Sebastian6848/GoFundBot) 的 `Backend/models.py`，做了以下调整：

- 去掉股票相关表（`StockIndustry` 等）
- 简化字段，合并冷门 JSON 到 `extra_json`
- 用 `INTEGER` 时间戳替代 `DATETIME`，跨时区一致
- 净值走势拆出独立表 `fund_nav`（原项目塞在 JSON 里，不利于 SQL 查询）

## 📋 表清单

| 表名 | 主键 | 记录数（MVP） | 说明 |
|---|---|---|---|
| `fund_basic_info` | `fund_code` | 27,536 | 全市场基金基本信息 |
| `fund_performance` | `fund_code` | 14,700 | 阶段业绩 + 同类排名 |
| `fund_nav` | `(fund_code, nav_date)` | ~22M | 历史净值明细（长表） |
| `fund_trend_extra` | `fund_code` | 14,700 | 非核心走势 JSON（规模/持有人等） |
| `fetch_log` | `id` | ∞ | 抓取日志（成功/失败） |
| `schema_version` | `version` | 1 | 迁移版本 |

---

## `fund_basic_info` — 基金基本信息

```sql
CREATE TABLE fund_basic_info (
  fund_code         TEXT PRIMARY KEY,         -- 6位基金代码
  fund_name         TEXT NOT NULL,            -- 基金简称
  fund_type         TEXT NOT NULL,            -- 基金类型（如 '混合型-偏股'）
  pinyin_abbr       TEXT,                     -- 拼音缩写（搜索用）
  pinyin_full       TEXT,                     -- 拼音全称
  established_date  TEXT,                     -- 成立日期 YYYY-MM-DD
  fund_manager      TEXT,                     -- 当前基金经理（可能多人，逗号分隔）
  fund_company      TEXT,                     -- 基金公司
  fund_scale        REAL,                     -- 最新规模（亿元）
  scale_date        TEXT,                     -- 规模统计日期
  fee_rate          REAL,                     -- 管理费率
  in_mvp_pool       INTEGER NOT NULL DEFAULT 0, -- 是否属于 MVP 分析池
  created_at        INTEGER NOT NULL,         -- 记录创建时间戳(ms)
  updated_at        INTEGER NOT NULL          -- 记录更新时间戳(ms)
);

CREATE INDEX idx_fund_type   ON fund_basic_info(fund_type);
CREATE INDEX idx_mvp_pool    ON fund_basic_info(in_mvp_pool) WHERE in_mvp_pool = 1;
CREATE INDEX idx_fund_name   ON fund_basic_info(fund_name);
```

**MVP 池定义**：`fund_type` 属于 `{股票型, 混合型-偏股, 混合型-灵活, 指数型-股票, 指数型-海外股票, QDII-普通股票, QDII-混合偏股}` → 约 14,700 只

---

## `fund_performance` — 阶段业绩 + 同类排名

```sql
CREATE TABLE fund_performance (
  fund_code           TEXT PRIMARY KEY,
  -- 阶段收益率（%）
  return_1m           REAL,
  return_3m           REAL,
  return_6m           REAL,
  return_1y           REAL,
  return_2y           REAL,
  return_3y           REAL,
  return_5y           REAL,
  return_ytd          REAL,                   -- 今年以来
  return_since_start  REAL,                   -- 成立以来
  -- 同类排名百分位（0-100，越小越靠前）
  rank_pct_1m         REAL,
  rank_pct_3m         REAL,
  rank_pct_6m         REAL,
  rank_pct_1y         REAL,
  rank_pct_2y         REAL,
  rank_pct_3y         REAL,
  rank_pct_5y         REAL,
  -- 4433 法则标记（本地计算后回填）
  pass_4433           INTEGER NOT NULL DEFAULT 0,
  -- 时间戳
  data_date           TEXT,                    -- 数据统计日期
  updated_at          INTEGER NOT NULL,
  FOREIGN KEY (fund_code) REFERENCES fund_basic_info(fund_code)
);

CREATE INDEX idx_perf_return_1y  ON fund_performance(return_1y DESC);
CREATE INDEX idx_perf_pass_4433  ON fund_performance(pass_4433) WHERE pass_4433 = 1;
```

---

## `fund_nav` — 历史净值明细（长表）

```sql
CREATE TABLE fund_nav (
  fund_code    TEXT NOT NULL,
  nav_date     TEXT NOT NULL,           -- YYYY-MM-DD
  unit_nav     REAL NOT NULL,           -- 单位净值
  acc_nav      REAL,                    -- 累计净值
  daily_return REAL,                    -- 日增长率（%）
  PRIMARY KEY (fund_code, nav_date),
  FOREIGN KEY (fund_code) REFERENCES fund_basic_info(fund_code)
) WITHOUT ROWID;

CREATE INDEX idx_nav_date ON fund_nav(nav_date DESC);
```

**为什么长表**：便于时间序列查询、区间检索、跨基金对比。GoFundBot 用 JSON 存所有净值，SQL 查不了。

**估算**：14,700 只 × 平均 1,500 条 ≈ **2200 万行**，SQLite 单表可轻松承载。

---

## `fund_trend_extra` — 非核心走势 JSON

```sql
CREATE TABLE fund_trend_extra (
  fund_code             TEXT PRIMARY KEY,
  asset_allocation_json TEXT,           -- 资产配置（股/债/现金）
  scale_history_json    TEXT,           -- 历史规模变动
  holder_structure_json TEXT,           -- 持有人结构（机构/个人）
  ranking_trend_json    TEXT,           -- 同类排名走势（历史）
  performance_5d_json   TEXT,           -- 五维能力评估
  updated_at            INTEGER NOT NULL,
  FOREIGN KEY (fund_code) REFERENCES fund_basic_info(fund_code)
);
```

**为什么塞 JSON**：这些数据结构复杂、访问频率低、SQL 查询价值小，JSON 存储省事。

---

## `fetch_log` — 抓取日志

```sql
CREATE TABLE fetch_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  fund_code    TEXT,                    -- NULL 表示批量任务
  source       TEXT NOT NULL,           -- 'eastmoney' / 'tiantian' / 'akshare'
  endpoint     TEXT NOT NULL,           -- 'pingzhongdata' / 'fundcode_search' / ...
  status       TEXT NOT NULL,           -- 'success' / 'failed' / 'skipped'
  http_code    INTEGER,
  error_msg    TEXT,
  duration_ms  INTEGER,
  created_at   INTEGER NOT NULL
);

CREATE INDEX idx_log_created ON fetch_log(created_at DESC);
CREATE INDEX idx_log_status  ON fetch_log(status);
```

用途：审计、性能分析、失败重试队列。

---

## `schema_version` — 迁移版本

```sql
CREATE TABLE schema_version (
  version     INTEGER PRIMARY KEY,
  applied_at  INTEGER NOT NULL,
  description TEXT
);
```

## 🎯 MVP 阶段暂不建的表

以下表在 Phase 2/3 加：

- `fund_portfolio` — 持仓明细（重仓股）
- `fund_manager` — 经理档案
- `fund_dividend` — 分红送配
- `fund_risk_metrics` — 风险指标（本地计算：夏普/卡玛/波动率/最大回撤）
- `fund_screening_rank` — 多因子打分与筛选榜单快照
