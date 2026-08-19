# 01 — UI 架构

> 中国公募基金浏览与排名工具的前端 / Worker 架构。
> 数据面仍由仓库根目录的 Bun 爬虫写入 SQLite；本文件只覆盖浏览层。
>
> 相关文档：
> - [02-dashboard.md](./02-dashboard.md) — 仪表盘信息架构与占位约定
> - [ARCHITECTURE.md](./ARCHITECTURE.md) — 爬虫与 SQLite 数据面
> - [SCHEMA.md](./SCHEMA.md) — 本地库表结构

---

## 产品定位

Fundly UI 是一个**私人基金浏览和排名工具**：把全市场主动权益基金的列表、净值、阶段业绩、同类排名摊开，按 4433 / 夏普 / 回撤等规则筛选。不做交易、不做投顾、不做公开站点。

当前阶段只搭**可登录的应用壳**。基金数据仍由另一个进程写入 `data/fundly.db`，UI 先不读库。

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

不采用的方案：

- 不把 UI 塞进根目录 `src/`（和采集器混在一起）。
- 不在 Phase 1 把 SQLite 直接绑到 Worker。采集库是单机文件，Worker 在边缘读不到；以后要嘛导出到 D1，要嘛走受控 API。
- 不单独做 `fundly-api.hexly.ai`。现在没有机器写路径，一个浏览器域名够用。

---

## 运行时拓扑

```
本地开发
  Browser ──HTTPS──► fundly.dev.hexly.ai (Caddy v2.11.4)
                         │
                         ▼
                    Vite :7044
                         │  /api/* proxy
                         ▼
                    wrangler dev 或占位 JSON

生产
  Browser ──► Cloudflare Access (nocoo.cloudflareaccess.com)
                 │  Google OAuth + 邮箱白名单
                 ▼
              fundly.hexly.ai
                 │
                 ▼
              Hono Worker
                 ├── /api/live     公开探活
                 ├── /api/me       Access JWT → 当前用户
                 └── /*            Vite SPA（ASSETS binding）
```

本地 `*.dev.hexly.ai` **不走 Access**。`wrangler dev` 读 `.dev.vars` 里的 `ENVIRONMENT=development`，此时 Host 为 localhost / 127.0.0.1 / `*.dev.hexly.ai` 的请求走开发旁路。Vite 代理保留原始 Host（`changeOrigin: false`）。

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
└── docs/01-arch-ui.md           # 本文件
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

路由（全部先放 placeholder）：

| 路径 | 页面 | 后续 |
|------|------|------|
| `/` | 仪表盘 | 见 [02-dashboard.md](./02-dashboard.md) |
| `/funds` | 基金浏览 | 列表、类型过滤、详情 |
| `/ranking` | 排名 | 4433 / 夏普 / 回撤榜 |
| `/settings` | 设置 | 数据新鲜度、主题以外的偏好 |

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
# 本地 SPA（日常入口）
bun run dev:web
# 浏览器打开 https://fundly.dev.hexly.ai

# 本地 Worker（可选）
bun run dev:worker

# 构建 SPA → Worker static，再发布
bun run deploy:web
```

质量门槛与爬虫相同：Biome 零告警，核心逻辑单测。UI 新增 ViewModel 必须带测试。

---

## 以后怎么接数据

仪表盘和列表**不**在本阶段读 `data/fundly.db`。采集稳定后有两条路，到时单独立项：

1. 定时把 SQLite 同步进 D1，Worker 直查。
2. 本机起只读 API，Worker 不碰原库。

在那之前，页面一律走 placeholder，避免半套 schema 绑死 UI。
