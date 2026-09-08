<p align="center">
  <img src="apps/web/public/logo.svg" width="128" height="128" alt="Fundly" />
</p>

<h1 align="center">Fundly</h1>

<p align="center">采集基金与市场数据，在个人站点中比较产品、风险和宏观环境。</p>

<p align="center">
  <a href="https://fundly.hexly.ai">站点</a> ·
  <a href="docs/README.en.md">English</a>
</p>

## 这是什么

Fundly 是中国公募基金、ETF、A 股与宏观市场的个人研究工具。Bun 脚本负责采集和计算，SQLite 保存数据，React 页面通过 Hono API 浏览已落库的结果。

行情查询不会启动上游采集。产品目录、历史行情、财报和指标各有独立覆盖范围，页面保留缺失状态和来源信息；部署代码也不会自动上传本地数据库。当前没有交易下单功能，研究指标和筛选结果不能替代投资判断。

## 功能

- 搜索基金代码、名称和份额，查看净值、阶段收益、同类排名、分红、费率、经理履历与持仓。
- 从收益、风险、持有体验、定投、成本和条件精选比较基金，提供 4433 筛选、夏普 / 卡玛指标和多因子评分。
- 按资产配置、流动性、成本规模和收益风险筛选 ETF，查看价格、净值与折溢价。
- 按估值、盈利、增长、现金流和趋势比较 A 股，查看 K 线、财报与财务指标。
- 在宏观大屏浏览市场指数、行业、市场广度、商品、汇率和利率，并进入相关 ETF 与基金页面。
- 通过 Google 登录与邮箱名单管理访问；使用 Backy 页面或脚本管理 SQLite 备份与恢复。

通用策略回测引擎和 Discord 推送仍未实现。现有定投页面展示基于历史净值计算的指标，不提供自动交易。

## 使用

[在线站点](https://fundly.hexly.ai) 需要 Google 登录；是否允许访问取决于部署者配置的邮箱名单。

| 页面 | 路径 |
| --- | --- |
| 概览与宏观大屏 | `/`、`/market` |
| 基金浏览与比较 | `/funds`、`/select/*` |
| ETF 浏览与比较 | `/etfs`、`/select-etf/*` |
| 股票浏览与比较 | `/stocks`、`/select-stock/*` |
| 备份与设置 | `/backup`、`/settings` |

基金数据主要来自东方财富 / 天天基金；ETF、股票和部分宏观数据使用扶摇 Financial-API，其他宏观来源包括上期所、Cboe、ECB、中国货币网和 FRED。来源口径、历史窗口和缺失处理见[数据源说明](docs/04-DATA_SOURCES.md)与[宏观实现文档](docs/14-MACRO-IMPLEMENTATION.md)。

### 安装与数据库

使用 Bun 1.3 或更新版本；运行环境为 macOS / Linux。根目录、Web 和 API 各有自己的依赖与 lockfile。

```bash
git clone https://github.com/nocoo/fundly.git
cd fundly
bun install --frozen-lockfile
bun install --frozen-lockfile --cwd apps/web
bun install --frozen-lockfile --cwd apps/worker
bun run db:init
```

默认数据库为 `data/fundly.db`。初始化只建表，不附带历史数据；可以自行采集或从已有备份恢复。常用采集与计算命令：

| 命令 | 用途 |
| --- | --- |
| `bun run fetch:list` | 更新基金目录 |
| `bun run fetch:nav` | 采集 MVP 池中的历史净值与业绩，默认支持续跑 |
| `bun run fetch:daily` | 增量更新净值与业绩 |
| `bun run refresh:select` | 更新全池数据，再计算排名、风险与选基指标 |
| `bun run fetch:macro` | 采集宏观市场与跨资产数据 |
| `bun run fetch:selection` | 更新 ETF / 股票目录、行情和有界深度数据 |

扶摇来源需要服务端环境变量 `HITHINK_FINANCE_API_KEY`，不要放入前端变量。宏观和 ETF / 股票脚本支持 `--watch`，需显式启动；仓库不会随 Web 服务自动运行采集任务。范围、数据库路径与限流参数见[脚本手册](docs/03-SCRIPTS.md)，定向采集示例见[选 ETF](docs/15-ETF-SCREENING.md)与[选股](docs/16-STOCK-SCREENING.md)。

## 开发

从 `.env.example` 创建根目录 `.env`，填写 `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`SESSION_SECRET` 和 `ALLOWED_EMAILS`。邮箱名单为空时，所有完成 Google 登录的账号都可访问。

```bash
cp .env.example .env
bun run dev:all
```

Vite 使用 7044，API 使用 7045。仓库的日常开发入口为 `https://fundly.dev.hexly.ai`，需按 [UI 架构](docs/06-ARCH-UI.md) 配置本地 HTTPS 代理，并在 Google OAuth 中登记 `https://fundly.dev.hexly.ai/api/auth/callback`。本机和部署环境都要求登录；缺少认证配置时，受保护 API 返回 503。详情见[认证说明](docs/10-AUTH.md)。

```bash
bun run typecheck
bun run typecheck:scripts
bun run typecheck:web
bun run lint
bun run build:web
```

Web 构建结果写入 `apps/worker/static/`，`bun run start` 由 Bun 同时提供静态页面与 API。生产入口见 [Dockerfile](Dockerfile) 与 [railway.toml](railway.toml)，数据库路径通过 `FUNDLY_SQLITE` 指定并挂载到持久卷。目录虽名为 `apps/worker`，当前部署使用 Bun / Hono，已不依赖 Cloudflare Worker 或 D1。

行情 API 以只读连接查询 SQLite；备份设置、备份和恢复操作会另行写入或替换数据，操作方法见 [Backy 备份文档](docs/08-BACKY.md)。

| 目录 | 内容 |
| --- | --- |
| `src/fetchers`、`scripts` | 数据采集与命令入口 |
| `src/db`、`src/metrics` | SQLite 数据访问与指标计算 |
| `apps/web` | React 页面、viewmodel 与图表 |
| `apps/worker` | Hono API、认证和 Bun 服务入口 |
| `tests` | 采集与计算测试 |
| `data` | 本地数据库，不随代码提交 |

## 测试

| 测试层 | 命令 |
| --- | --- |
| 采集、解析与指标单元测试 | `bun run test` |
| Web viewmodel、认证与 API 测试 | `bun run test:web` |
| 宏观与产品 API 集成测试 | `bun test apps/worker/scripts/market-api.test.ts apps/worker/scripts/selection-api.test.ts` |

测试使用 Bun 内置测试运行器，API 集成测试通过临时 SQLite 与 Hono 请求调用运行。可用 `bun run test:coverage` 查看报告；当前没有独立浏览器端到端测试命令。

## 技术栈

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Bun](https://img.shields.io/badge/Bun-14151A?logo=bun&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white)
![React](https://img.shields.io/badge/React-149ECA?logo=react&logoColor=white)

| 部分 | 实现 |
| --- | --- |
| 采集与存储 | TypeScript、Bun fetch、bun:sqlite |
| Web | React、Vite、React Router、Basalt、Tailwind CSS、Recharts、SWR |
| API 与认证 | Hono、Google OAuth / PKCE、jose |
| 开发与托管 | Bun test、Biome、Docker、Railway Volume |

## 文档

- [文档索引](docs/README.md)
- [架构](docs/01-ARCHITECTURE.md)与[数据表](docs/02-SCHEMA.md)
- [选基指标口径](docs/12-FUND-SCREENING.md)
- [部署与持久卷](docs/09-RAILWAY.md)
- [变更记录](CHANGELOG.md)

筛选方法和数据接口参考了 [GoFundBot](https://github.com/Sebastian6848/GoFundBot) 与 [AKShare](https://github.com/akfamily/akshare)，详见[致谢](docs/05-CREDITS.md)。

## 许可证

[MIT](LICENSE) © 2026 Zheng Li
