# Fundly 架构设计

## 🎯 设计目标

1. **单机可跑**：一台笔记本能完成全量爬取 + 分析，不依赖云服务
2. **可增量**：每日只更新变化数据，20 分钟内完成
3. **易查询**：SQLite 单文件，SQL 直查，也可导出 Parquet
4. **可测试**：核心逻辑 95%+ 单测覆盖
5. **抗风控**：多子域名分流、限流、指数退避、多源 fallback

## 🏗 分层架构

```
┌──────────────────────────────────────────────────────┐
│  scripts/          一次性脚本（爬取入口、初始化）   │
├──────────────────────────────────────────────────────┤
│  src/fetchers/     数据抓取层（按数据源封装）       │
│    ├─ eastmoney    东方财富系（主力）               │
│    └─ tiantian     天天基金（估值/详情备用）        │
├──────────────────────────────────────────────────────┤
│  src/db/           数据访问层（bun:sqlite）         │
│    ├─ schema.ts    建表 DDL                          │
│    ├─ repo.ts      Repository 模式 CRUD              │
│    └─ migrations/  迁移脚本                          │
├──────────────────────────────────────────────────────┤
│  src/utils/        通用工具                          │
│    ├─ http.ts      HTTP 客户端（限流 + 重试）        │
│    ├─ pool.ts      并发池                            │
│    ├─ logger.ts    结构化日志                        │
│    └─ types.ts     全局类型定义                      │
└──────────────────────────────────────────────────────┘
                       ↓
             ┌─────────────────────┐
             │  data/fundly.db     │
             │  (SQLite, ~1.5 GB)  │
             └─────────────────────┘
```

## 🔀 数据流

### 首次全量爬取

```
1. fetch-fund-list.ts
   └─→ GET fund.eastmoney.com/js/fundcode_search.js
       └─→ 解析 JSONP → INSERT fund_basic_info (27,536 只)

2. fetch-fund-nav.ts (仅 MVP 池)
   └─→ 从 DB 读出 fund_type IN ('股票型', '混合型-偏股', '指数型-*') 的代码
       └─→ 并发 5，对每只:
           GET fund.eastmoney.com/pingzhongdata/{code}.js
           └─→ 解析出 净值走势 + 阶段业绩 + 同类排名
               └─→ UPSERT fund_trend + UPDATE fund_basic_info.performance_json
```

### 每日增量

```
1. 拉取估值接口（fundgz.1234567.com.cn）批量更新最新净值
2. 只对昨日无净值的基金拉全量净值刷一遍
```

## 🗄 存储选型

**bun:sqlite** — Bun 原生内置，无需编译，同步 API，性能对齐 better-sqlite3。

### 为什么不用 Postgres？
- 单机场景，SQLite 够快
- 无需运维、无需 Docker
- 一个文件方便备份/迁移

### 为什么不用 DuckDB？
- 写入频繁（增量更新），SQLite 更合适
- 后续需要 OLAP 时，可从 SQLite 导出 Parquet 给 DuckDB

## 🛡 反爬策略

| 层级 | 手段 |
|---|---|
| 1 · 请求 | 真实 User-Agent + Referer（`quote.eastmoney.com`）|
| 2 · 域名 | 主备域名轮询（`fund.eastmoney.com` / `fundmobapi.eastmoney.com`）|
| 3 · 频率 | 全局令牌桶限流（默认 5 req/s，可配）|
| 4 · 退避 | 429/5xx 指数退避重试（1s → 2s → 4s，最多 3 次）|
| 5 · 降级 | 主接口连续失败切换 fallback 数据源 |

## 📊 数据规模（MVP）

详见 [`02-SCHEMA.md`](02-SCHEMA.md)。

| 表 | 行数 | 估算大小 |
|---|---|---|
| `fund_basic_info` | 27,536 | 55 MB |
| `fund_trend` | 14,700 | ~1.5 GB（含 JSON 净值序列） |
| `fund_performance` | 14,700 | 30 MB |
| `fetch_log` | 增量 | ~10 MB/月 |

## 🧪 测试策略

- **单元测试**：`tests/` 目录，覆盖 fetchers 解析逻辑、db repo、utils 工具
- **集成测试**：mock HTTP 响应（用真实抓下来的 fixture）
- **覆盖率目标**：≥ 95%（`bun test --coverage`）
- **CI**：后续接入 GitHub Actions

## 🚧 已知边界

- 不做实时行情推送（走轮询）
- 不做前端可视化（本项目定位为数据+分析后端）
- 不覆盖港股/QDII 特殊字段（首期）
