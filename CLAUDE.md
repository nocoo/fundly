# CLAUDE.md — Fundly 项目上下文（AI 协作规约）

> 本文档给 Claude / Codex / Grok 等 AI 编程 agent 使用。人类开发者请优先看 [`README.md`](README.md)。

## 🎯 项目定位

Fundly 是**中国公募基金数据采集与量化选基工具**，外加私人 Web 浏览壳。

- **语言/运行时**：Bun + TypeScript 7.0.2（不是 Node，参考 `README.md`）
- **数据库**：`bun:sqlite`（原生内置，**不要引入 better-sqlite3**）
- **Lint/Format**：Biome（**不要引入 ESLint/Prettier**）
- **测试**：`bun test`（**不要引入 vitest/jest**）
- **HTTP**：内置 `fetch`（**不要引入 axios/node-fetch**）
- **浏览层**：Vite + React + Hono Worker，部署 Cloudflare，登录走 Access

## 📁 目录规约

```
fundly/
├── docs/                # 项目文档（编号 01-99）
├── apps/
│   ├── web/             # Vite SPA
│   └── worker/          # Hono Worker + 静态资源
├── data/                # SQLite 数据库（gitignore）
├── scripts/             # CLI 入口
├── src/
│   ├── db/              # 数据访问层
│   ├── fetchers/        # 抓取器（按数据源分文件）
│   ├── metrics/         # 收益 / 排名 / 4433 纯计算（无 I/O、无 View）
│   └── utils/           # 通用工具
├── tests/               # 单元测试（覆盖率 ≥ 95%）
├── README.md
├── CLAUDE.md            # 本文件
├── package.json
├── tsconfig.json
└── biome.json
```

采集在 `src/` / `scripts/` / `tests/`，浏览在 `apps/`，两边不要混在同一个 commit 里改。

### `docs/` 文档编号规则

**必须按数字前缀命名**，方便阅读顺序和交叉引用：

| 编号 | 文档 | 内容 |
|---|---|---|
| **01** | `01-ARCHITECTURE.md` | 采集架构分层、数据流、反爬策略、测试策略 |
| **02** | `02-SCHEMA.md` | 数据表 DDL、字段说明、索引 |
| **03** | `03-SCRIPTS.md` | 所有 CLI 脚本的用途 + 使用姿势 |
| **04** | `04-DATA_SOURCES.md` | 数据源清单、URL、请求头、限流约定 |
| **05** | `05-CREDITS.md` | 致敬与参考项目（GoFundBot、AKShare 等） |
| **06** | `06-ARCH-UI.md` | UI / Worker 架构、Access、本地域名 |
| **07** | `07-DASHBOARD.md` | 仪表盘 `/api/stats` 与空态 |
| **08** | `08-BACKY.md` | 本机 SQLite → Backy / R2 备份与换机恢复 |

**新增文档规则**：
- 数字**顺延**（下一份文档用 `08-`）
- 文件名**大写字母 + 短横线**（`08-BACKTEST-ENGINE.md`）
- 主标题第一行必须写 `# NN · 中文标题`（示例：`# 03 · 脚本手册`）
- 内容以**中文为主**，代码/命令保持英文
- 涉及数据规模、耗时的数字**必须来自真实实测**，不能是拍脑袋估算

**修改文档规则**：
- 只调整**存量文档内容**时不需要改编号
- **文档合并/拆分**必须同步更新 `README.md` 和本文件的编号表

## 🛠 开发工作流

### 每次改代码后必跑

```bash
bun run typecheck   # 爬虫 TS 类型检查
bun run lint        # Biome 检查
bun run test        # 爬虫单测
```

改 `apps/` 时额外：

```bash
bun run typecheck:web
bun run test:web
```

### 提交前必做

```bash
bun run lint:fix    # 自动修格式
bun run test:coverage  # 确认覆盖率 ≥ 95%
```

### Git 规范

- **直接在 main 分支提交**（个人项目，无 PR 流程）
- **原子化提交**：一个逻辑变更 = 一个 commit
- **Conventional Commits**：`feat:` / `fix:` / `docs:` / `test:` / `chore:` / `refactor:`
- Commit message 首行不超过 72 字符
- 不要 `git add -A`

## 📊 数据抓取要点

详见 [`docs/03-SCRIPTS.md`](docs/03-SCRIPTS.md) 和 [`docs/04-DATA_SOURCES.md`](docs/04-DATA_SOURCES.md)。

**核心接口**：东方财富 `pingzhongdata.js`——一次请求拿到某基金完整历史 + 业绩。**不要**尝试用 `fundtradenew.aspx`（被证明只是分类排行榜，不是全市场净值接口）。

**限流**：全局 5 QPS，历史已跑 55,054 次请求 **0 失败**。改并发/QPS 要慎重。

## 🚫 反模式（不要做的事）

- ❌ 不要引入 `axios / lodash / dayjs / dotenv` — Bun 内置全覆盖
- ❌ 不要用 `require()` — 全项目 ESM，用 `import`
- ❌ 不要在 `data/` 目录提交 `.db` 文件（已 gitignore）
- ❌ 不要在 `README` 用未实测的数据规模数字
- ❌ 不要动 `bun.lock` 手工编辑
- ❌ 不要引入 CommonJS 依赖除非绝对必要
- ❌ 不要给 bun 设全局 registry（会把镜像 URL 写进 lockfile）

## ✅ 当前进度（截至最后一次更新）

- ✅ Phase 1 MVP 完成：3.7GB 数据库、27,527 只基金、3069 万净值行
- ✅ 覆盖率 99.15% 行 / 92.86% 函数、50/50 单测通过
- ✅ 每日增量脚本 `fetch:daily` 上线
- ✅ UI：D1 浏览、本机 sqlite/D1 切换、仪表盘读 `/api/stats`
- 📋 Phase 2 待办：4433 法则筛选、多因子打分、Reits ETF 补齐
- 📋 Phase 3 待办：回测引擎、Discord 推送

## Retrospective

- `v0.1.1` 打在 D1 bind-limit 修复之前。不要移动已发布 tag；含导入修复的版本走 `0.1.2`。
- 可变表不能只 `INSERT OR IGNORE`，否则业绩/经理永远停在首次导入。
- `/api/live` 整站 Access。发布探活必须带 Access service token，并校验 `status=ok` 和版本号；302 不能当成功。
- 空库首次导入走 `import:d1:seed`（`wrangler d1 execute --file`）。REST 逐批只留给增量。

## 🔗 关键文件快速链接

- 数据库入口：`src/db/repo.ts`
- 抓取器主力：`src/fetchers/eastmoney.ts`
- HTTP 客户端：`src/utils/http.ts`
- 限流/并发池：`src/utils/pool.ts`
- 测试套件：`tests/`
- UI 入口：`apps/web/src/`
- Worker 入口：`apps/worker/src/index.ts`
