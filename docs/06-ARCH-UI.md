# 06 · UI 架构

> 中国公募基金浏览与排名工具的前端 / Worker 架构。
> 数据面仍由仓库根目录的 Bun 爬虫写入 SQLite；本文件只覆盖浏览层。
>
> 相关文档：
> - [07-DASHBOARD.md](./07-DASHBOARD.md) — 仪表盘指标与 `/api/stats`
> - [01-ARCHITECTURE.md](./01-ARCHITECTURE.md) — 爬虫与 SQLite 数据面
> - [02-SCHEMA.md](./02-SCHEMA.md) — 本地库表结构
> - [03-SCRIPTS.md](./03-SCRIPTS.md) — `dev:api`

---

## 产品定位

Fundly UI 是一个**私人基金浏览和排名工具**：把全市场主动权益基金的列表、净值、阶段业绩、同类排名摊开，按 4433 / 夏普 / 回撤等规则筛选。不做交易、不做投顾、不做公开站点。

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
│   │       ├── components/      # AppShell / Sidebar / shadcn
│   │       ├── hooks/           # SWR
│   │       └── lib/             # ViewModel、导航、类型
│   └── worker/                  # Hono + wrangler
│       ├── src/                 # /api/live /api/me + Access
│       └── static/              # Vite 构建产物（gitignore）
└── docs/06-ARCH-UI.md           # 本文件
```

依赖方向：`apps/web` 构建写入 `apps/worker/static`；Worker 只服务静态资源和 `/api/*`。两边各自 `package.json`，不并进根 workspace，避免和爬虫的 `bun.lock` 打架。

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
| `/funds` | 基金浏览 | `/api/funds`，每页 200，可筛可排 |
| `/funds/:code` | 基金详情 | `/api/funds/:code` + 最近 400 点净值 |
| `/data` | 数据管理 | 表行数、净值区间、覆盖率 |
| `/ranking` | 基金排名 | `/api/funds` 现场排序；L1/L2 芯片 + 收益/风险维度 |
| `/backup` | 备份 | 连接 Backy、推送、最近备份列表 |
| `/settings` | 设置 | 涨跌色、基准 |
| `/login` | Google 登录 | 工卡页，仿 Gecko；颜色用 Fundly primary |

导航数据在 `apps/web/src/lib/navigation.ts`，页面不得手写 href 表。

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
