# 03 · 脚本手册

Fundly 提供了一组 CLI 脚本，覆盖**数据库初始化 → 首次全量抓取 → 每日增量刷新**的完整流程。所有脚本用 `bun run` 执行，跨平台可用。

## 📋 脚本一览

| 脚本 | 命令 | 用途 | 耗时 |
|---|---|---|---|
| `init-db.ts` | `bun run db:init` | 初始化 SQLite schema（幂等） | < 1 秒 |
| `backup.ts` | `bun run backup` | `VACUUM INTO` + gzip 后直传 Backy | 实测压缩 43 秒，上传视上行 |
| `restore.ts` | `bun run restore` | 从 Backy 拉最新 prod 快照换机 | 视下行，约 705 MiB |
| `fetch-fund-list.ts` | `bun run fetch:list` | 拉取全市场基金列表 → `fund_basic_info` | ~3 秒 |
| `fetch-fund-nav.ts` | `bun run fetch:nav` | 首次全量抓详情+净值（断点续跑） | ~95 分钟 |
| `fetch-daily.ts` | `bun run fetch:daily` | **每日增量刷新净值+业绩** | ~50 分钟 |
| `fetch-all.ts` | `bun run fetch:all` | 一键：init → list → nav（等价前 3 步串行） | ~95 分钟 |
| `refresh-ranks.ts` | `bun run rank:refresh` | **按同类重算排名百分位 + 4433，写入库** | 全市场 27,527 只实测 4 秒 |
| `fetch-dividend.ts` | `bun run fetch:dividend` | 抓分红事件 → `fund_dividend` | ~92 分钟 |
| `fetch-fees.ts` | `bun run fetch:fees` | 抓费率结构 → `fund_fees` | ~92 分钟 |
| `fetch-manager.ts` | `bun run fetch:manager` | 抓经理履历 → `fund_manager` + `fund_manager_link` | ~92 分钟 |
| `fetch-portfolio.ts` | `bun run fetch:portfolio` | 抓最新季持仓 → `fund_portfolio` | ~98 分钟 |
| `compute-risk-metrics.ts` | `bun run compute:risk` | **本地计算风险指标**（零请求） | ~10 秒 |
| `compute-select-metrics.ts` | `bun run compute:select` | **选基派生指标**（体验/定投/费率/结构/综合分） | 视净值规模 |
| `refresh-select.ts` | `bun run refresh:select` | 全市场 fetch → rank → risk → select，fail-fast | 视抓取 |
| `dev-api.ts` | `bun run dev:api` | 本机只读 API `:7045`，读 sqlite | 常驻 |
| `dev-all.ts` | `bun run dev:all` | 并行起 `dev:api` + `dev:web` | 常驻 |

---

## 🚀 首次搭建（从零开始）

```bash
# 一键完成：建库 + 拉列表 + 抓 15,337 只权益池
bun run fetch:all
```

或者手动分步：

```bash
bun run db:init         # 建库
bun run fetch:list      # 拉 27,527 只基本信息
bun run fetch:nav       # 抓 15,337 只权益 MVP 池（约 52 分钟）
```

如果想拓展到**全市场 27,527 只**（含债券、货币、FOF、Reits）：

```bash
# 一次性把所有基金标记进 MVP 池（在 sqlite 里手工做）
sqlite3 data/fundly.db "UPDATE fund_basic_info SET in_mvp_pool = 1"

# 再跑一次 fetch:nav；已抓过的会自动跳过，只补新增
bun run fetch:nav
```

---

## 🔄 每日增量：`fetch-daily.ts`

**核心用途**：每天更新最新一日净值 + 阶段业绩（1M/3M/6M/1Y/3Y 收益随时间滚动）。

### 为什么不是"只拉一条最新净值"？

我们研究过东财的批量接口 `fundapi.eastmoney.com/fundtradenew.aspx`，实测发现：

- 该接口是**分类排行榜**，单次最多返 35 条，即使 `pn=200` 也被服务端强制截断
- 单只基金实时估值接口 `fundgz.1234567.com.cn/js/{code}.js` 目前已**返回 404**

因此**没有真正意义上"一次拉全市场"的接口**。

### 我们的策略

**复用 pingzhongdata**（同一个接口，同一套解析器）逐只刷新：

- 单次请求返回该基金**完整历史净值** + 最新阶段业绩
- 用 `UPSERT` 语义：已存在的净值日期**跳过重写**（同值），新净值**追加**
- 阶段业绩（1M/3M 等滚动窗口）**每次都会刷新**——这是每日跑的核心价值
- 复用首版验证过的 5 QPS 限流 + 断点续跑 + 单元测试链路，**稳定 0 失败**

### 用法

```bash
# 默认：只刷 MVP 权益池 15,337 只（约 52 分钟）
bun run fetch:daily

# 指定 DB 路径
bun run fetch:daily data/fundly.db

# 刷全市场 27,527 只（约 95 分钟，含债券/货币/FOF/Reits）
FUNDLY_DAILY_POOL=all bun run fetch:daily

# 只刷货币型（补万份收益 / 七日年化）
FUNDLY_DAILY_POOL=money bun run fetch:daily
# 实测 977 只、304 秒、0 失败，写入 fund_money_yield 2,773,709 行

# 调整并发和速率（默认 5/5）
FUNDLY_CONCURRENCY=8 FUNDLY_QPS=8 bun run fetch:daily
```

### 输出关键字段

```json
{
  "poolMode": "mvp",
  "total": 15337,
  "ok": 15337,
  "failed": 0,
  "navRowsWritten": 22500000,   // pingzhongdata upsert 覆盖行数
  "dateAdvanced": true,          // 最新净值日期是否推进
  "beforeLatest": "2026-08-18",
  "newLatestDate": "2026-08-19",
  "deltaRows": 15300,            // 真正新增的净值行数（每只 ~1 条）
  "elapsedSec": 3145
}
```

### 什么时候不用跑？

- **周六、周日**：无新净值发布
- **节假日**：无新净值发布
- **交易日 15:00 之前**：净值当晚 20:00 左右发布，跑早了拉不到新数据

**推荐**：交易日晚 21:00 之后 cron 调度。

---

## 🎯 fetch:daily vs fetch:nav 有什么区别？

两者复用同一个 pingzhongdata 抓取管道，唯一区别是**候选池选择逻辑**：

| 脚本 | 候选池 | 用途 |
|---|---|---|
| `fetch:nav` | **仅缺 performance 的基金**（断点续跑）| 首次全量、扩展池后补齐 |
| `fetch:daily` | **池内全部基金**（强制刷）| 每日增量、刷阶段业绩 |

技术上 `fetch:nav` 走 `listMvpFundCodesMissingPerformance()`，`fetch:daily` 走 `listMvpFundCodes()` 或全表扫描。

---

## 🏆 刷新排名：`refresh-ranks.ts`

同类排名百分位和 4433 **不随打开详情页计算**，也不被 `fetch:daily` 覆盖。净值/业绩入库后手动跑：

```bash
bun run rank:refresh
bun run rank:refresh data/fundly.db
```

口径：

- 分组：`fund_basic_info.fund_type` 全称（不是一级分类）
- 1 月 / 3 月 / 6 月 / 1 年：优先用东财爬到的 `return_*`；缺了再用累计净值回补
- 2 年 / 3 年 / 5 年：东财 `syl_2n/3n/5n` 在本库为 0，一律用净值回补
- 百分位：`(比自己收益更高的只数 + 1) / 同类有数只数 × 100`，越小越靠前
- 4433：近 1/2/3/5 年 ≤ 25%，近 3 月和近 6 月 ≤ 1/3；缺任一窗口则不过

详情页「今年以来 / 成立以来 / 缺的阶段收益」仍是打开时按该基金净值现场算，不写回 `fund_performance`。

---

## ☁ Backy 备份

本机写库换机走 Backy，不分片。细节见 [08-BACKY.md](./08-BACKY.md)。

Webhook / API Key 在本机页 `/backup` 填写，写入 `app_settings`。CLI 读同一张表。

```bash
bun run backup
bun run restore                 # 最新 prod
bun run restore --id <id>       # 指定
bun run restore --force         # 覆盖已有库（先停 dev:all / 采集）
bun run restore --to /tmp/x.db
```

---

### 本机 API：`dev-api.ts`

```bash
bun run dev:all                   # API :7045 + Vite :7044
bun run dev:api                   # 只起 API http://127.0.0.1:7045
FUNDLY_SQLITE=/path bun run dev:api
```

Vite 把 `/api/*` 代理到这里，只读本机 sqlite。`dev:all` 任一子进程退出会停掉另一个。

## 🛠 工具脚本

### `init-db.ts` — 初始化数据库

```bash
bun run db:init                # 默认 data/fundly.db
bun run db:init my/other.db    # 指定路径
```

**幂等**：可以反复运行，只会补齐缺失的表和索引。

### `fetch-fund-list.ts` — 拉基金列表

```bash
bun run fetch:list
```

3 秒拉完 27,527 只基金的**基本信息**（代码、名称、类型、拼音）。**没有净值、没有业绩**，只是"目录"。

## 📊 增量场景的最佳实践

**推荐每日 cron 配置**（Mon-Fri 交易日晚 21:00）：

```cron
0 21 * * 1-5  cd ~/workspace/fundly && FUNDLY_DAILY_POOL=mvp bun run fetch:daily >> logs/daily.log 2>&1
```

**每周一次全市场刷新**（含债券/货币，周日跑）：

```cron
0 3 * * 0  cd ~/workspace/fundly && FUNDLY_DAILY_POOL=all bun run fetch:daily >> logs/weekly.log 2>&1
```

## 🔍 数据验证 SQL

```sql
-- 最新净值日期
SELECT MAX(nav_date) FROM fund_nav;

-- 今日失败任务
SELECT * FROM fetch_log
 WHERE status='failed' AND created_at > strftime('%s','now','-1 day') * 1000;

-- 阶段业绩榜（近1年 Top 10）
SELECT b.fund_name, p.return_1y
  FROM fund_performance p JOIN fund_basic_info b USING(fund_code)
 WHERE b.fund_type LIKE '混合型%' AND p.return_1y IS NOT NULL
 ORDER BY p.return_1y DESC LIMIT 10;
```

## ⚠ 已知边界

1. **周末/节假日跑没意义**：净值不更新，只会消耗配额
2. **普通货币基金无单位净值曲线**：pingzhong 提供万份收益 / 七日年化，写入 `fund_money_yield`；`fetch:nav` 断点续跑只看 performance，补序列用 `FUNDLY_DAILY_POOL=money`
3. **Reits 业绩多为空**：这类产品走 ETF 接口，不是 pingzhongdata（Phase 2 补 fetcher）
4. **风控**：默认 5 QPS 极其保守，历史累计 55,054 次请求 0 失败，无需担心

## 宏观采集

`bun run fetch:macro` 采集指数、沪深广度、行业、ETF 与公开跨资产日值；`--watch --interval-minutes 60` 持续运行，`--sources` 可选择来源。服务端读取 `HITHINK_FINANCE_API_KEY`，浏览器不持有密钥。完整参数、锁与故障语义见 [14 · 宏观大屏实现](./14-MACRO-IMPLEMENTATION.md)。

## 选 ETF 与选股采集：`fetch:selection`

`bun run fetch:selection` 初始化与增量采集全市场 ETF/股票目录、全 A 股快照与批量估值、本地核验关联，以及有界研究池的真实五年日 K、财报与持仓。

```bash
# 全量执行 (全目录 + 全快照/估值 + 默认 60 ETF / 80 股票深采 + 物化)
bun run fetch:selection

# 快速同步 (跳过耗时深采，仅同步全目录、全市场快照与批量估值)
bun run fetch:selection --skip-deep

# 仅同步 ETF 相关数据并物化
bun run fetch:selection --scope etf --etf-limit 60

# 仅同步股票相关数据并物化
bun run fetch:selection --scope stock --stock-limit 80

# 针对指定代码补采深采池
bun run fetch:selection --symbols 600519.SH,000001.SZ,510300.SH,513100.SH

# 日频循环；运行此命令才会常驻，本轮未启动守护进程
bun run fetch:selection --watch --interval-minutes 1440
```

参数与更新规则：

- `--scope` 只接受 `all|etf|stock`，默认 `all`。ETF/股票深采上限默认 60/80，均为 1–200 的整数；`--symbols` 必须是目录中带交易所的完整代码，且受相应上限约束。`588000.SH` 通过 ETF 目录识别，不按代码前缀猜身份。
- `--interval-minutes` 为 15–10080 分钟的整数，默认 1440；`--sqlite` 默认 `data/fundly.db`，要求已有基金库。`--skip-deep` 与指定代码补采不能同时使用。无效参数在打开数据库前拒绝。
- 扶摇请求串行，间隔至少 400ms，每次超时 20 秒，暂时性网络错误最多尝试三次。API key 只读服务端环境。复用 `fetch:macro` 的数据库采集锁，每轮退出均释放，循环等待期间不持锁。
- 两个目录必须非空、身份唯一、资产类型匹配，达到请求条数上限或相较已存目录异常缩水时拒绝。股票快照的分页数量和全体代码、估值每批至多 100 只的代码集合均核验；目录、快照、估值、物化指标和成功状态作为完整基础批次发布，失败保留旧数据。
- ETF 池保留原宏观八只及 `510310.SH`、`159919.SZ`，其余按各资产类已披露规模轮取。股票保留文档 16 中五只样本，再按已知行业有效成交额轮取；没有有效规模/成交额的产品不自动填充默认池，仍可显式补采。研究池构成记录在采集状态中。
- ETF 日 K 按不大于 1,460 天分窗请求，上游包含结束日，合并时裁剪重叠日；NAV 通过 `range=fyear` 一次取得。股票前复权日 K 每次刷新完整五年窗口，避免历史复权变化时只追加末日。
- 日 K、快照、资料、净值、规模、持仓及各张年报独立请求，某项失败不阻断同一证券的其他资源。坏 OHLC、缺少证券或复权标识、错财报期不会覆盖旧资源。上游 `3002` 记录为不可用，不当作零值；披露持仓不可用不影响 K 线展示。
- 每组深采在网络读取完成后，以事务写入可用资源并重新物化本组指标，再发布真实成功/缺项统计。`--scope etf` 不修改股票物化表，反之亦然。部分失败的单次执行以退出码 1 提示检查状态，不推进该深采任务的最近完整成功时间。

`selection_collection_status.details_json` 包含本次池组成、逐资源成功数、不可用代码和失败摘要。行情交易日来自源内日期或交易日历推断，顶层数据时间戳不能当成交易日。页面只重读 SQLite；安排定时任务、更新生产库和同步备份需要由实际运行环境负责，代码发布本身不会启动采集。
