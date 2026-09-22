# 18 · 文档与采集约定

当前命令和质量状态见根 AGENTS.md。保留原有文档命名及采集约束。



**必须按数字前缀命名**，方便阅读顺序和交叉引用：

| 编号 | 文档 | 内容 |
|---|---|---|
| **01** | `01-ARCHITECTURE.md` | 采集架构分层、数据流、反爬策略、测试策略 |
| **02** | `02-SCHEMA.md` | 数据表 DDL、字段说明、索引 |
| **03** | `03-SCRIPTS.md` | 所有 CLI 脚本的用途 + 使用姿势 |
| **04** | `04-DATA_SOURCES.md` | 数据源清单、URL、请求头、限流约定 |
| **05** | `05-CREDITS.md` | 致敬与参考项目（GoFundBot、AKShare 等） |
| **06** | `06-ARCH-UI.md` | UI / Worker 架构、本地域名 |
| **07** | `07-DASHBOARD.md` | 仪表盘 `/api/stats` 与空态 |
| **08** | `08-BACKY.md` | 本机 SQLite → Backy / R2 备份与换机恢复 |
| **09** | `09-RAILWAY.md` | Railway 单服务 + Volume 挂 sqlite |
| **10** | `10-AUTH.md` | Google 登录、白名单、回调 URL |
| **11** | `11-PHASE2-REPORT.md` | Phase 2 卫星表实测覆盖 |
| **12** | `12-FUND-SCREENING.md` | 选基分类、下属页、指标口径与落库 |
| **13** | `13-MACRO-DASHBOARD.md` | 宏观大屏、跨资产来源实测、行业 / ETF 下钻与接入方案 |
| **14** | `14-MACRO-IMPLEMENTATION.md` | 宏观大屏实现、真实 K 线、采集 / 持续更新与只读 API |
| **15** | `15-ETF-SCREENING.md` | ETF 配置、交易质量、成本规模与净值风险筛选 |
| **16** | `16-STOCK-SCREENING.md` | 股票估值、经营质量、成长、现金流与趋势风险筛选 |
| **17** | `17-MACRO-DAILY.md` | 财经日报（跨资产研究摘要）Markdown 契约、只读 API 与 `/daily` 混合渲染 |

**新增文档规则**：
- 数字**顺延**（下一份文档用 `19-`）
- 文件名**大写字母 + 短横线**（`10-BACKTEST-ENGINE.md`）
- 主标题第一行必须写 `# NN · 中文标题`（示例：`# 03 · 脚本手册`）
- 内容以**中文为主**，代码/命令保持英文
- 涉及数据规模、耗时的数字**必须来自真实实测**，不能是拍脑袋估算

**修改文档规则**：
- 只调整**存量文档内容**时不需要改编号
- **文档合并/拆分**必须同步更新 `README.md` 和本文件的编号表


## 采集约束


详见 [`docs/03-SCRIPTS.md`](03-SCRIPTS.md) 和 [`docs/04-DATA_SOURCES.md`](04-DATA_SOURCES.md)。

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


## 既有阶段记录

以下是原手册的历史状态，不是本次文档规范化重新验证的结果。



- ✅ Phase 1 MVP 完成：3.7GB 数据库、27,527 只基金、3069 万净值行
- ✅ 当前验收（2026-09-06）：514 项测试通过，行覆盖率 89.62% / 函数 87.13%；尚未达到 95% 目标，不沿用 Phase 1 的旧覆盖率数字
- ✅ 每日增量脚本 `fetch:daily` 上线
- ✅ UI：本机 sqlite 浏览、仪表盘读 `/api/stats`、Backy 备份页、Google 登录
- ✅ 生产：Railway `fundly` + Volume `/data`，https://fundly.hexly.ai 已读到 27,527 / 3069 万行
- ✅ Phase 2 卫星数据：风险指标/分红/费率/经理履历/持仓
- ✅ 宏观大屏代码已随 v0.5.0 部署：Basalt 2.0.3、真实日 K、沪深广度、行业 / ETF / 基金下钻、23 个跨资产指标；`fetch:macro` 及 `--watch`；生产 SQLite 的宏观数据需单独采集/同步
- ✅ v0.6.0 选 ETF / 选股：docs/15、16 规划及实现完成；六个 ETF 列表、七个股票列表、两个独立详情，Basalt 2.0.3；本地真实目录 1,670 / 5,567，K 线深度池 60 / 80，股票年报 80，生产覆盖需以 Volume 实际数据为准
- ✅ `fetch:selection` 独立表、只读 API、有界深采与失败保留；本轮完成实采但没有启用 `--watch` / 常驻调度，生产 SQLite 需另行同步
- 📋 Phase 3 待办：4433 法则筛选、多因子打分、Reits ETF 补齐、回测引擎、Discord 推送
