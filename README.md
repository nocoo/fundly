# Fundly 🪴

> 中国公募基金全市场数据采集与量化选基工具

**Fundly** 是一个专注于**中国公募基金**（不含股票）的开源项目，目标是把全市场基金数据爬回本地，做多维度筛选、评分与回测分析。

## 🎯 项目定位

- 📊 **数据源**：东方财富 / 天天基金公开接口（无需 API Key）
- 🎯 **范围**：MVP 期只覆盖**主动权益基金**（股票型 + 混合型偏股 + 指数型），约 14,700 只
- 🛠 **技术栈**：Bun + TypeScript 7.0.2 + bun:sqlite + Biome
- 🧪 **质量**：单元测试覆盖率 ≥ 95%，Biome lint 零告警

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
├── docs/              # 项目文档（编号 01-05，详见 CLAUDE.md）
│   ├── 01-ARCHITECTURE.md    # 架构设计
│   ├── 02-SCHEMA.md          # 数据表设计
│   ├── 03-SCRIPTS.md         # 脚本使用手册
│   ├── 04-DATA_SOURCES.md    # 数据源说明
│   └── 05-CREDITS.md         # 致谢与参考
├── data/              # SQLite 数据库（gitignore）
├── scripts/           # 一次性脚本（爬取、初始化）
├── src/               # 核心库代码
│   ├── db/                # 数据库层
│   ├── fetchers/          # 数据抓取器（分数据源）
│   └── utils/             # 工具函数（限流、日志、类型）
└── tests/             # 单元测试
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
# 1. 拉全市场基金列表（~3 秒）
bun run fetch:list

# 2. 拉 MVP 池的历史净值（约 52 分钟，5 QPS）
bun run fetch:nav

# 或一键跑全流程
bun run fetch:all

# 每日增量刷新（约 52 分钟，交易日晚 21:00 后跑）
bun run fetch:daily
```

详见 [`docs/03-SCRIPTS.md`](docs/03-SCRIPTS.md)。

### 开发

```bash
bun run typecheck       # TS 类型检查
bun run lint            # Biome 检查
bun run lint:fix        # 自动修复
bun run test            # 跑单测
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
