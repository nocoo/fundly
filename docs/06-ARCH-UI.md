# 06 · UI 架构

> 中国公募基金浏览与排名工具的前端 / Worker 架构。
> 数据面仍由仓库根目录的 Bun 爬虫写入 SQLite；本文件只覆盖浏览层。
>
> 相关文档：
> - [07-DASHBOARD.md](./07-DASHBOARD.md) — 仪表盘指标与 `/api/stats`
> - [01-ARCHITECTURE.md](./01-ARCHITECTURE.md) — 爬虫与 SQLite 数据面
> - [02-SCHEMA.md](./02-SCHEMA.md) — 本地库表结构
> - [03-SCRIPTS.md](./03-SCRIPTS.md) — `import:d1` / `dev:api`

---

## 产品定位

Fundly UI 是一个**私人基金浏览和排名工具**：把全市场主动权益基金的列表、净值、阶段业绩、同类排名摊开，按 4433 / 夏普 / 回撤等规则筛选。不做交易、不做投顾、不做公开站点。

采集进程写本地 `data/fundly.db`。浏览层读 **D1 `fundly-db`**（生产 Worker 只绑 D1）。本机默认同源 SQLite，可用 header 切到远端 D1。

---

## 关键决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 运行时 | Bun + TypeScript 7 | 与爬虫、Surety 一致 |
| 前端 | Vite 8 + React 19 + React Router | Surety / Bat / Pew 同一套 |
| 样式 | Tailwind 4 + Basalt token（朱红主色、三层亮度） | 控件库对齐 Surety / Zhe / Pew / Bat |
| 结构 | MVVM：`lib/*-vm.ts` 纯函数，页面只渲染 | 可单测、页面不堆业务 |
| 部署 | 单个 Cloudflare Worker 托管 API + SPA | 无独立 Pages / Node 主机 |
| 登录 | Cloudflare Access（Google OAuth，hexly team） | 家族项目统一零信任入口 |
| 本地域名 | `fundly.dev.hexly.ai` → `:7044` | Caddy v2.11.4，端口按首次立项续编 |
| 生产域名 | `fundly.hexly.ai` | 与 `surety.hexly.ai` / `bat.hexly.ai` 对齐 |
| 与爬虫关系 | `apps/` 独立，不改 `src/` `scripts/` `tests/` | 避免和正在跑的采集进程抢文件 |
| 生产数据 | Cloudflare D1 `fundly-db`，binding `DB` | Worker 在边缘读不到本机 sqlite |
| 本机数据 | `bun run dev:api`（默认 sqlite，可切 D1） | Vite `/api` 代理到 `:7045` |

不采用的方案：

- 不把 UI 塞进根目录 `src/`（和采集器混在一起）。
- 不把本机 sqlite 文件绑进 workerd。生产只读 D1；本机 sqlite 走 Bun API。
- 不单独做 `fundly-api.hexly.ai`。浏览器域名同时托管 SPA 和 `/api/*`。

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
                         ├── sqlite  data/fundly.db（默认）
                         └── d1      需 `X-Fundly-Source: d1`

生产
  Browser ──► Cloudflare Access (nocoo.cloudflareaccess.com)
                 │  Google OAuth + 邮箱白名单
                 ▼
              fundly.hexly.ai
                 │
                 ▼
              Hono Worker + D1 fundly-db
                 ├── /api/live     探活（整站 Access；无令牌会 302）
                 ├── /api/me       Access JWT → lizheng.blog 头像/名字
                 ├── /api/funds*   列表 / 详情 / 净值
                 ├── /api/stats    仪表盘与数据管理
                 └── /*            Vite SPA（Worker 先处理，再 ASSETS）
```

本地 `*.dev.hexly.ai` **不走 Access**。`wrangler dev --local-upstream fundly.dev.hexly.ai` 读 `.dev.vars` 的 `ENVIRONMENT=development`，Host / URL 落在 localhost、127.0.0.1 或 `*.dev.hexly.ai` 时走开发旁路。不加 `--local-upstream` 时 Wrangler 会把 Host 改写成生产域 `fundly.hexly.ai`，旁路失效。Vite 代理保留原始 Host（`changeOrigin: false`）。

生产 `ENVIRONMENT=production`，Worker **从不**旁路，必须校验 `Cf-Access-Jwt-Assertion`（JWKS + `iss` + `aud`）。缺 header → 401，签名不对 → 403，环境变量没配 → 500。

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
| `/ranking` | 排名 | 仍是入口页 |
| `/settings` | 设置 | 本机可切 sqlite / D1 |

导航数据在 `apps/web/src/lib/navigation.ts`，页面不得手写 href 表。

---

## 鉴权

| 环境 | 谁拦登录 | Worker 做什么 |
|------|----------|----------------|
| `fundly.hexly.ai` | CF Access | 验 JWT；`/api/me` 用邮箱 SHA-256 查 `lizheng.blog` 头像和名字 |
| `fundly.dev.hexly.ai` | 无 | `isLocalhost` 旁路 |
| `wrangler dev` | 无 | 同上 |

密钥（`wrangler secret put`，不进 git）：

- `CF_ACCESS_TEAM_DOMAIN` = `nocoo.cloudflareaccess.com`（team：`nocoo`）
- `CF_ACCESS_AUD` = `3cc4b46229051f806a91d53dea596f6aaccd197c1a780ba5f5515f764f1bbe80`

`fundly.hexly.ai` 已被 team `nocoo` 的 Access 应用拦住（含 `/api/live`）。策略复用同一 Google OAuth / 邮箱白名单。本地 `*.dev.hexly.ai` 不走 Access。

侧栏左下角用户区：`/api/me` 把 Access 邮箱规范化后做 SHA-256，请求 `https://lizheng.blog/api/authors/profile?hash=`。命中用博客上的 name / avatar；未命中或超时回退 JWT name / 邮箱前缀。和 Surety / Bat 同一套。

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
# 本机浏览：先起 API，再起 SPA
bun run dev:api          # :7045，默认 sqlite
bun run dev:web
# 浏览器打开 https://fundly.dev.hexly.ai

# 可选：直接打远端 Worker（无 sqlite）
bun run dev:worker

# sqlite → D1（可变表 upsert，净值按日期水位追加）
bun run import:d1

# 构建 SPA → Worker static，再发布
bun run deploy:web
```

本机切 D1：设置页或请求头 `X-Fundly-Source: d1`。生产 Worker 的 `/api/source` 只声明 `d1`。

Token 优先读 `CLOUDFLARE_API_TOKEN`，没有再回退本机 Wrangler oauth。

质量门槛与爬虫相同：Biome 零告警，核心逻辑单测。UI 新增 ViewModel 必须带测试。
