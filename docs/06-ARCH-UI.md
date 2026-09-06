# 06 · UI 架构

> 中国公募基金研究与宏观大屏的前端 / Hono API 架构。
> 数据面仍由仓库根目录的 Bun 爬虫写入 SQLite；本文件只覆盖浏览层。
>
> 相关文档：
> - [07-DASHBOARD.md](./07-DASHBOARD.md) — 仪表盘指标与 `/api/stats`
> - [01-ARCHITECTURE.md](./01-ARCHITECTURE.md) — 爬虫与 SQLite 数据面
> - [02-SCHEMA.md](./02-SCHEMA.md) — 本地库表结构
> - [03-SCRIPTS.md](./03-SCRIPTS.md) — `dev:api`

---

## 产品定位

Fundly UI 是一个**私人基金研究与宏观大屏**：把市场指数、跨资产环境、基金列表、净值、阶段业绩、同类排名摊开，按 4433 / 夏普 / 回撤等规则筛选。不做交易、不做投顾、不做公开站点。

采集进程写本地 `data/fundly.db`。浏览层只读这份 sqlite。生产在 Railway Volume，见 [09-RAILWAY.md](./09-RAILWAY.md)。Cloudflare Worker 与 D1 已拆除。

---

## 关键决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 运行时 | Bun + TypeScript 7 | 与爬虫、Surety 一致 |
| 前端 | Vite 8 + React 19 + React Router | Surety / Bat / Pew 同一套 |
| 样式 | Tailwind 4 + Basalt token（朱红主色、四层亮度） | 控件库对齐 Surety / Zhe / Pew / Bat |
| 结构 | MVVM：`lib/*-vm.ts` 纯函数，页面只渲染 | 可单测、页面不堆业务 |
| 部署 | 本机 Vite + `dev:api`；生产 Railway + Volume | 不再托管 Cloudflare Worker / D1 |
| 本地域名 | `fundly.dev.hexly.ai` → `:7044` | Caddy v2.11.4，端口按首次立项续编 |
| 与爬虫关系 | `apps/` 独立，不改 `src/` `scripts/` `tests/` | 避免和正在跑的采集进程抢文件 |
| 本机数据 | `bun run dev:api` 读 sqlite | Vite `/api` 代理到 `:7045` |

不采用的方案：

- 不把 UI 塞进根目录 `src/`（和采集器混在一起）。
- 不把净值库搬上 D1。

---

## 运行时拓扑

```
本地开发
  Browser ──HTTPS──► fundly.dev.hexly.ai (Caddy v2.11.4)
                         │
                         ▼
                    Vite :7044
                         │  /api/* proxy → :7045
                         ▼
                    bun run dev:api
                         └── sqlite  data/fundly.db
```

本地 `*.dev.hexly.ai` **不走 Access**。Vite 代理保留原始 Host（`changeOrigin: false`）。

---

## 目录

```
fundly/
├── src/ scripts/ tests/ data/   # 爬虫（本层不改）
├── apps/
│   ├── web/                     # Vite SPA
│   │   └── src/
│   │       ├── app/             # 路由页面（View）
│   │       ├── components/      # AppShell / Sidebar / Basalt
│   │       ├── hooks/           # SWR
│   │       └── lib/             # ViewModel、导航、类型
│   └── worker/                  # Bun + Hono
│       ├── src/                 # 只读 API / Google OAuth
│       └── static/              # Vite 构建产物（gitignore）
└── docs/06-ARCH-UI.md           # 本文件
```

依赖方向：`apps/web` 构建写入 `apps/worker/static`；Hono API 服务静态资源和 `/api/*`。两边各自 `package.json`，不并进根 workspace，避免和爬虫的 `bun.lock` 打架。

---

## 界面壳

模板来自 Surety 的 Basalt 壳，砍掉保单业务：

| 区域 | 行为 |
|------|------|
| Sidebar | 分组导航，可折叠；移动端 Sheet |
| Header | 面包屑 + 主题切换 |
| Content | 浮动卡片（`rounded-[20px] bg-card`） |
| 用户 | `/api/me` 头像与邮箱；本地显示「本地开发」 |

路由：

| 路径 | 页面 | 数据 |
|------|------|------|
| `/` | 仪表盘 | `/api/stats`、`/api/fund-types` |
| `/funds` | 基金浏览 | `/api/funds`，每页 200，可筛可排；过滤器进 localStorage |
| `/funds/:code` | 基金详情 | `/api/funds/:code` + 净值；已核验 ETF 复用市场 K 线，保留来源列表上下文 |
| `/etfs` | ETF 浏览 | `/api/selection/etfs` 全目录 1,670 只、快照行情、规模与行内曲线 |
| `/select-etf/:lens` | 选 ETF 五视角 | 资产配置 (`allocation`)、交易质量 (`liquidity`)、成本规模 (`cost`)、收益风险 (`risk`)、条件精选 (`picks`) |
| `/etfs/:symbol` | ETF 详情 | 真实交易所不复权大 K 线、净值风险、费率规模、定期披露重仓明细与基金跳转 |
| `/stocks` | 股票浏览 | `/api/selection/stocks` 全 A 股 5,567 只目录与快照行情，带行业与行内走势 |
| `/select-stock/:lens` | 选股六视角 | 估值比较 (`valuation`)、盈利质量 (`quality`)、成长持续 (`growth`)、现金质量 (`cashflow`)、趋势风险 (`trend`)、条件精选 (`picks`) |
| `/stocks/:symbol` | 股票详情 | 前复权真实大 K 线、价格风险、估值、五年完整年报趋势与财报报表 |
| `/market` | 宏观大屏 | 指数、广度、行业 / ETF 与跨资产摘要；见文档 14 |
| `/select/:lens` | 选基六页 | `/api/funds` 按收益/风险/持有/定投/成本/精选排序 |
| `/ranking` | 旧排名 | 按 dim 重定向到 `/select/return` 或 `/select/risk` |
| `/backup` | 备份 | 连接 Backy、推送、最近备份列表 |
| `/settings` | 设置 | 显示与图表 / 数据状态两个页签；涨跌色、参考线、分类基准及真实净值预览 |
| `/login` | Google 登录 | 双栏介绍与 Basalt 登录卡片，窄屏单列 |

导航数据在 `apps/web/src/lib/navigation.ts`，页面不得手写 href 表。

### 全站视觉与布局

非大屏页面复用 `components/layout/research-layout.tsx` 与 `app/research-pages.css`：统一页头、数字摘要、卡片标题、空态与分页。使用 Basalt `LayerCard`、`Button`、`Select`、`ToggleGroup`、`Tabs` 等控件及语义颜色，数字使用等宽字体。卡片交互在实际内容上完成，不使用覆盖文字的空按钮。

- 基金浏览：紧凑工具栏、可滚动结果区、固定表头与分页；移动端将代码放在名称下方，仍可选择所有排序字段。
- 选基：左侧筛选、右侧结果，移动端可展开筛选；六个视角继续使用原有计算与筛选口径。
- 基金详情：大图与右侧基金档案 / 同类排名，下方以页签查看收益、结构与完整资料。来源和独立日期收进小「i」。最新净值单独查询，避免观察窗口影响最新值。
- 设置：显示偏好在前，数据统计独立成页签；分类基准展示所选代码的真实日净值预览。备份页以连接卡片和快照列表并列展示，沿用既有备份 / 恢复操作。
- 手机顶部保留当前页标题，来源返回入口仍在基金详情中，避免长面包屑换行挤压。

### 基金详情 K 线合同

`GET /api/funds/:code` 额外返回 `marketInstrument: { id, symbol, name } | null`。只有来源为 `fuyao` 的已核验 `linked_fund_code`、唯一活跃 ETF 身份、且已有真实日 OHLC 时才返回标的。缺少市场表、只有净值、关联歧义或没有 K 线时返回 `null`，不通过代码 / 名称猜测关系。

已关联 ETF 默认打开场内 K 线，复用 `/api/market/bars/:id?years=…&interval=…`。默认 1 年日 K，3 年周 K、5 年月 K，均可手动切换周期；支持切回净值与基准。净值视图保留 1 / 3 / 5 / 10 年。普通基金保留净值曲线，货币基金保留万份收益与七日年化，均不把日净值构造成交易 OHLC。行情异常 / 所选范围无数据时提供重试和查看净值。

### 选 ETF 与选股交互行为与状态设计

- **列表排序**：支持表头直接点击升降序双向切换，以及工具栏下拉菜单选择；排序字段在显式选择（包括代码 `ticker`）时始终序列化到 URL，切换排序或过滤条件时自动重置页码为第 1 页。
- **覆盖开关**：ETF 列表支持「仅有场内行情」，股票列表支持「仅有价格历史」与「仅有年报」独立布尔开闭。
- **精选门槛往返**：支持门槛开关（`feeOn`, `scaleOn`, `ddOn`, `toOn`, `peOn`, `roeOn`, `yoyOn`, `stOn`）与自定义数值（支持合法 `0`）的完整 URL/本地存储双向序列化；关闭某一门槛时其自定义输入值仍然保留，重新打开时无缝恢复。
- **企业与行业切片**：股票列表提供「全部企业 (含金融)」、「排除已知金融股」、「仅看金融业 (银行/证券/保险)」三态切换；经营类视角默认排除不可比金融股，切换到金融专属切片时自动保留。
- **分页与结果计数**：每页 50 条，即使少于 1 页也展示总数与分页控件状态，提供明确的重置或重试入口。



---

## 鉴权

生产走 Google OAuth + `ALLOWED_EMAILS`，见 [10-AUTH.md](./10-AUTH.md)。Cloudflare Access 已拆除。

本机 `fundly.dev.hexly.ai` 和线上同一套 Google 登录。仓库根目录 `.env` 配好密钥后必须重启 `dev:api`，旧进程的 `/api/me` 没有 `authRequired`，页面会直接放行。

---

## 本地域名

| 项 | 值 |
|----|----|
| 域名 | `https://fundly.dev.hexly.ai` |
| Caddy | v2.11.4，`/opt/homebrew/etc/Caddyfile` |
| 证书 | `*.dev.hexly.ai` 通配（workflow/certs，mkcert） |
| 端口 | **7044**（Caddy 表 7043 之后的下一个空位） |
| DNS | `*.dev.hexly.ai` → `127.0.0.1`，不用改 hosts |

nmem 本机不可用，端口与版本以 Caddyfile + `caddy version` 为准。

---

## 开发与部署

```bash
# 本机浏览
bun run dev:all          # API :7045 + Vite :7044
# 浏览器打开 https://fundly.dev.hexly.ai
```

质量门槛与爬虫相同：Biome 零告警，核心逻辑单测。UI 新增 ViewModel 必须带测试。
