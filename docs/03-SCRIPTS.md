# 03 · 脚本手册

Fundly 提供了一组 CLI 脚本，覆盖**数据库初始化 → 首次全量抓取 → 每日增量刷新**的完整流程。所有脚本用 `bun run` 执行，跨平台可用。

## 📋 脚本一览

| 脚本 | 命令 | 用途 | 耗时 |
|---|---|---|---|
| `init-db.ts` | `bun run db:init` | 初始化 SQLite schema（幂等） | < 1 秒 |
| `fetch-fund-list.ts` | `bun run fetch:list` | 拉取全市场基金列表 → `fund_basic_info` | ~3 秒 |
| `fetch-fund-nav.ts` | `bun run fetch:nav` | 首次全量抓详情+净值（断点续跑） | ~95 分钟 |
| `fetch-daily.ts` | `bun run fetch:daily` | **每日增量刷新净值+业绩** | ~50 分钟 |
| `fetch-all.ts` | `bun run fetch:all` | 一键：init → list → nav（等价前 3 步串行） | ~95 分钟 |
| `refresh-ranks.ts` | `bun run rank:refresh` | **按同类重算排名百分位 + 4433，写入库** | 手动，抓取后跑 |
| `seed-d1.ts` | `bun run import:d1:seed` | 空库首次：SQL 文件 + `wrangler d1 execute --file` | 视文件数 |
| `import-d1.ts` | `bun run import:d1` | 增量：可变表 upsert，净值按水位追加 | 视新增行 |
| `dev-api.ts` | `bun run dev:api` | 本机只读 API `:7045`，默认 sqlite | 常驻 |

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

## ☁ D1 导入

空库先建表，再用 SQL 文件做首次 seed。不要对空库跑 REST 逐批导入 3000 万净值行。

```bash
bun run migrate:d1                # wrangler d1 migrations apply --remote
bun run import:d1:seed            # 默认 data/fundly.db → wrangler d1 execute --file
FUNDLY_SEED_TABLES=fund_nav bun run import:d1:seed   # 只补一张表
FUNDLY_SEED_TABLES=fund_nav FUNDLY_SEED_SKIP_FILES=46 \
  FUNDLY_SEED_SQLITE=data/fundly.db.seed-snapshot.db \
  FUNDLY_SEED_SNAPSHOT='<size:mtimeMs from first run>' bun run import:d1:seed
# 首次 VACUUM INTO data/fundly.db.seed-snapshot.db。已存在时必须显式 FUNDLY_SEED_SQLITE=该路径，或 rm -f data/fundly.db.seed-snapshot.db 后重做。
# SKIP_FILES 按快照内 ORDER BY 主键后的真实打包结果跳过前 N 个文件。
bun run import:d1                 # 之后增量
bun run import:d1 path/to/db      # 指定 sqlite
```

规则：

- 首次：`INSERT OR IGNORE` 写成 SQL 文件，走 D1 execute/import，不是 193 万次 HTTP POST
- 增量 `fund_basic_info` / `fund_performance` / `fund_trend_extra`：`ON CONFLICT DO UPDATE`
- 增量 `fund_nav`：按基金取远端 `MAX(nav_date)`，只上传更新的日期
- `fetch_log`：按主键追加
- Token：`CLOUDFLARE_API_TOKEN`，没有再跑 `wrangler auth token`

发布探活需要 GitHub secrets `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET`，校验 `/api/live` 的 `status=ok` 和版本号。Access 302 不算成功。

首次全量净值仍会走很长时间；重跑只补水位之后的行。

### 本机 API：`dev-api.ts`

```bash
bun run dev:api                   # http://127.0.0.1:7045
FUNDLY_SQLITE=/path bun run dev:api
```

Vite 把 `/api/*` 代理到这里。默认读 sqlite；请求头 `X-Fundly-Source: d1` 改打远端 D1。

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
2. **货币基金无历史净值序列**：日刷时会写 performance 但 nav 无新增（正常现象）
3. **Reits 业绩多为空**：这类产品走 ETF 接口，不是 pingzhongdata（Phase 2 补 fetcher）
4. **风控**：默认 5 QPS 极其保守，历史累计 55,054 次请求 0 失败，无需担心
