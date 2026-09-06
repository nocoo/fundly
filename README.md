# Fundly 🪴

> 中国公募基金研究与宏观市场大屏

**Fundly** 在私人 Web 中展示中国公募基金、沪深大盘和跨资产宏观环境，支持从行业、ETF 深入基金研究。采集是 Bun CLI + SQLite；浏览是 Vite SPA + Hono 只读 API。

## 🎯 项目定位

- 📊 **数据源**：东方财富 / 天天基金、扶摇 Financial-API（服务端 Key）、上期所、Cboe、ECB、中国货币网、FRED
- 🎯 **范围**：公募基金研究，沪深指数 / 广度、行业观察池、ETF、商品、汇率和利率
- 🖥️ **浏览**：全站统一 Basalt 风格；基金列表、六维选基、基金详情与宏观大屏，已关联 ETF 默认展示真实 K 线
- 🛠 **技术栈**：Bun + TypeScript 7.0.2 + bun:sqlite + Vite + Hono 本机 API + Biome
- 🧪 **质量**：单元测试覆盖率 ≥ 95%，Biome lint 零告警

给 Agent：改代码必须改对应文档；一次 commit 只做一件事；用 Conventional Commits；不要 `git add -A`。爬虫在 `src/` / `scripts/` / `tests/`，UI 在 `apps/`，两边不要混着改。完整规约见 [`CLAUDE.md`](CLAUDE.md)。

## 🗺 路线图

| 阶段 | 内容 | 状态 |
|---|---|---|
| **Phase 1 · MVP** | 基本信息 + 净值 + 阶段业绩爬取，SQLite 存储 | ✅ 完成 |
| Phase 2 · 筛选 | 4433 法则、夏普/卡玛榜、多因子打分 | 📋 计划中 |
| Phase 3 · 回测 | 定投、网格、均线择时等策略回测 | 📋 计划中 |
| Phase 4 · 服务 | HTTP API + 定时增量 + Discord 推送 | 📋 计划中 |

宏观大屏已在本地实现：真实日 K、沪深广度、行业 → ETF → 基金下钻，以及 23 个跨资产指标。来源与边界见 [13 · 数据调研](docs/13-MACRO-DASHBOARD.md)，采集、持续更新、API 与实测见 [14 · 宏观大屏实现](docs/14-MACRO-IMPLEMENTATION.md)。尚未部署到生产。

## 📁 项目结构

```
fundly/
├── docs/                  # 项目文档（编号 01-14，详见 CLAUDE.md）
│   ├── 01-ARCHITECTURE.md # 采集架构
│   ├── 02-SCHEMA.md       # 数据表
│   ├── 03-SCRIPTS.md      # CLI 手册
│   ├── 04-DATA_SOURCES.md # 数据源
│   ├── 05-CREDITS.md      # 致谢
│   ├── 06-ARCH-UI.md      # UI / 本机 API 架构
│   ├── 07-DASHBOARD.md    # 仪表盘
│   ├── 08-BACKY.md        # Backy 备份 / 换机恢复
│   ├── 09-RAILWAY.md      # Railway + Volume
│   ├── 10-AUTH.md         # Google 登录
│   ├── 11-PHASE2-REPORT.md # Phase 2 卫星表实测
│   ├── 12-FUND-SCREENING.md # 选基体系
│   ├── 13-MACRO-DASHBOARD.md # 宏观大屏与跨资产调研
│   └── 14-MACRO-IMPLEMENTATION.md # 宏观实现与运行
├── apps/
│   ├── web/               # Vite + React SPA（MVVM）
│   └── worker/            # 本机 / Railway Hono API
├── data/                  # SQLite 数据库（gitignore）
├── scripts/               # 爬取、初始化
├── src/                   # 采集核心库
└── tests/                 # 采集单测
```

## 🚀 快速开始

### 环境要求

- **Bun** ≥ 1.3
- macOS / Linux

### 安装

```bash
git clone https://github.com/nocoo/fundly.git
cd fundly
bun install
bun run install:web   # apps/web + apps/worker，各自一份 lockfile
```

### 初始化数据库

```bash
bun run db:init
```

### 抓取数据

```bash
# 1. 拉全市场基金列表（~3 秒）
bun run fetch:list

# 2. 拉 MVP 池的历史净值（约 52 分钟，5 QPS）
bun run fetch:nav

# 或一键跑全流程
bun run fetch:all

# 每日增量刷新（约 52 分钟，交易日晚 21:00 后跑）
bun run fetch:daily

# 宏观市场与跨资产（扶摇 Key 配置在服务端环境，见文档 14）
bun run fetch:macro
# 持续采集：bun run fetch:macro --watch --interval-minutes 60
```

详见 [`docs/03-SCRIPTS.md`](docs/03-SCRIPTS.md)。

### 浏览 UI

日常入口是本地域名，不要用 `localhost:7044`：

```bash
bun run dev:all         # 同时起 API :7045 + Vite :7044
# https://fundly.dev.hexly.ai   Caddy v2.11.4 → Vite :7044 → API :7045
```

分开起：`bun run dev:api`（读 `data/fundly.db`）和 `bun run dev:web`。

架构见 [`docs/06-ARCH-UI.md`](docs/06-ARCH-UI.md)，仪表盘约定见 [`docs/07-DASHBOARD.md`](docs/07-DASHBOARD.md)。备份见 [`docs/08-BACKY.md`](docs/08-BACKY.md)。

### 开发

```bash
bun run typecheck       # 爬虫 TS 类型检查
bun run typecheck:scripts  # import/seed/dev-api
bun run typecheck:web   # UI + Worker 类型检查
bun run lint            # Biome 检查（含 apps）
bun run lint:fix        # 自动修复
bun run test            # 爬虫单测
bun run test:web        # UI / Worker 单测
bun run test:coverage   # 带覆盖率
```

## 📊 数据规模（Phase 1 MVP · 已实测完成）

| 项目 | 数量 |
|---|---|
| 全市场基金覆盖 | **27,527 只**（100%）|
| Performance 覆盖 | 27,527 条 |
| 有净值序列 | 26,072 只（94.7%）|
| 净值行总数 | **~3,069 万条** |
| SQLite 磁盘 | **~3.7 GB** |
| 首次爬取耗时 | ~95 分钟（分两批完成）|
| 每日增量 | ~52 分钟（`fetch:daily`）|

详见 [`docs/01-ARCHITECTURE.md`](docs/01-ARCHITECTURE.md) 和 [`docs/03-SCRIPTS.md`](docs/03-SCRIPTS.md)。

## 🙏 致敬

本项目在方法论与数据源上参考了以下优秀开源项目，特此致谢：

- [**GoFundBot**](https://github.com/Sebastian6848/GoFundBot) — 提供了 4433 法则实现、多因子筛选思路、反爬工程与数据源清单
- [**AKShare**](https://github.com/akfamily/akshare) — 备用数据源与接口参考

详见 [`docs/05-CREDITS.md`](docs/05-CREDITS.md)。

## ⚖️ 免责声明

本项目所有数据均来自公开接口，仅供个人学习及量化研究使用。数据可能存在延迟或错误，**不构成任何投资建议**。投资有风险，入市需谨慎。

## 📄 License

MIT
