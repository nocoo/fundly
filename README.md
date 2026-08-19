# Fundly 🪴

> 中国公募基金浏览、排名与全市场数据采集工具

**Fundly** 把中国公募基金（不含股票）爬回本地，再在私人 Web 里浏览、筛选、排名。采集是 CLI + SQLite；浏览是 Vite SPA，部署在 Cloudflare Worker，登录走 Cloudflare Access。

## 🎯 项目定位

- 📊 **数据源**：东方财富 / 天天基金公开接口（无需 API Key）
- 🎯 **范围**：MVP 期只覆盖**主动权益基金**（股票型 + 混合型偏股 + 指数型），约 14,700 只
- 🖥️ **浏览**：基金列表、排名、4433 等规则（UI 壳已就绪，数据接入中）
- 🛠 **技术栈**：Bun + TypeScript 7.0.2 + bun:sqlite + Vite + Hono Worker + Biome
- 🧪 **质量**：单元测试覆盖率 ≥ 95%，Biome lint 零告警
- 🔒 **登录**：Cloudflare Access（Google OAuth），生产域 `fundly.hexly.ai`

给 Agent：改代码必须改对应文档；一次 commit 只做一件事；用 Conventional Commits；不要 `git add -A`。爬虫在 `src/` / `scripts/` / `tests/`，UI 在 `apps/`，两边不要混着改。

## 🗺 路线图

| 阶段 | 内容 | 状态 |
|---|---|---|
| **Phase 1 · MVP** | 基本信息 + 净值 + 阶段业绩爬取，SQLite 存储 | 🚧 进行中 |
| Phase 2 · 筛选 | 4433 法则、夏普/卡玛榜、多因子打分 | 📋 计划中 |
| Phase 3 · 回测 | 定投、网格、均线择时等策略回测 | 📋 计划中 |
| Phase 4 · 服务 | HTTP API + 定时增量 + Discord 推送 | 📋 计划中 |

## 📁 项目结构

```
fundly/
├── docs/                  # 文档树
│   ├── 01-arch-ui.md      # UI / Worker 架构
│   ├── 02-dashboard.md    # 仪表盘信息架构
│   ├── ARCHITECTURE.md    # 爬虫架构
│   ├── DATA_SOURCES.md    # 数据源
│   ├── SCHEMA.md          # SQLite 表
│   └── CREDITS.md         # 致谢
├── apps/
│   ├── web/               # Vite + React SPA（MVVM）
│   └── worker/            # Hono Worker + 静态资源
├── data/                  # SQLite（gitignore）
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
```

### 初始化数据库

```bash
bun run db:init
```

### 抓取数据

```bash
# 1. 拉全市场基金列表（~1 秒）
bun run fetch:list

# 2. 拉 MVP 池的历史净值（约 1.5 小时）
bun run fetch:nav

# 或一键跑全流程
bun run fetch:all
```

### 浏览 UI

日常入口是本地域名，不要用 `localhost:7044`：

```bash
bun run dev:web
# https://fundly.dev.hexly.ai   Caddy v2.11.4 → Vite :7044
```

可选：本地 Worker（`https://fundly.dev.hexly.ai/api/*` 会代理过来，见 `apps/web/vite.config.ts`）。

```bash
bun run dev:worker      # wrangler dev :8787
bun run deploy:web      # 构建 SPA 并发布到 Cloudflare Worker
```

生产：`https://fundly.hexly.ai`（Cloudflare Access）。架构见 [`docs/01-arch-ui.md`](docs/01-arch-ui.md)，仪表盘约定见 [`docs/02-dashboard.md`](docs/02-dashboard.md)。

### 开发

```bash
bun run typecheck       # 爬虫 TS 类型检查
bun run typecheck:web   # UI + Worker 类型检查
bun run lint            # Biome 检查（含 apps）
bun run lint:fix        # 自动修复
bun run test            # 爬虫单测
bun run test:web        # UI / Worker 单测
bun run test:coverage   # 带覆盖率
```

## 📊 数据规模估算（MVP，基于 100 只样本实测外推）

| 项目 | 数量 |
|---|---|
| 覆盖基金 | ~15,300 只（MVP 池实测值）|
| 平均净值点/只 | ~3,200 条 |
| 净值点总数 | **~4,900 万条** |
| SQLite 磁盘 | **~5.8 GB**（含 WAL/索引）|
| 首次爬取耗时 | **~50 分钟**（@5 QPS）|
| 日增量更新 | ~5 分钟（只更最新一日）|

> 实测数字比 `docs/ARCHITECTURE.md` 初稿高一倍，因为老基金（2001+ 成立）平均 4000-6000 条净值点。

详见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)。

## 🙏 致敬

本项目在方法论与数据源上参考了以下优秀开源项目，特此致谢：

- [**GoFundBot**](https://github.com/Sebastian6848/GoFundBot) — 提供了 4433 法则实现、多因子筛选思路、反爬工程与数据源清单
- [**AKShare**](https://github.com/akfamily/akshare) — 备用数据源与接口参考

详见 [`docs/CREDITS.md`](docs/CREDITS.md)。

## ⚖️ 免责声明

本项目所有数据均来自公开接口，仅供个人学习及量化研究使用。数据可能存在延迟或错误，**不构成任何投资建议**。投资有风险，入市需谨慎。

## 📄 License

MIT
