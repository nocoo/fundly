# 09 · Railway 部署

> 浏览层跑在 Railway 一个服务里：Hono 提供 `/api/*`，同时托管 Vite 静态页。SQLite 放 Volume `/data`。
>
> 相关文档：
> - [06-ARCH-UI.md](./06-ARCH-UI.md) — 本机开发拓扑
> - [08-BACKY.md](./08-BACKY.md) — 备份到 Backy / R2

---

## 线上实例（2026-08-22 实测）

| 项 | 值 |
|---|---|
| workspace | `hexly.ai` |
| 项目 | `fundly` `c0f17860-907e-40eb-9ae1-d64258f0a6e2` |
| 服务 | `fundly` `87995549-a6fc-486a-8613-30d0b8cfc3f8` |
| 环境 | `production` |
| Volume | `fundly-volume` `64a72912-6250-4aaa-9f8d-d00f81f858df`，挂 `/data`，配额 50 GB |
| 区域 | `asia-southeast1-eqsg3a`，1 replica，2 vCPU / 8 GB |
| 默认域 | https://fundly-production-5442.up.railway.app |
| 自定义域 | https://fundly.hexly.ai |
| sqlite | `FUNDLY_SQLITE=/data/fundly.db`（3,723,972,608 B） |
| `/api/stats` | 27,527 只基金、30,690,680 净值行，区间 2001-09-21 → 2026-08-20 |

`df -h /data`：46G 盘、已用 3.5G。CLI `currentSizeMB` 可能仍报 `0.0`，以容器里 `df` 为准。

---

## 关键决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 平台 | Railway | 可挂盘，适合 4GB sqlite |
| 进程 | 单服务 `serve.ts` | API 和 SPA 同域，不用再拆 Worker |
| 数据库 | Volume 挂 `/data`，`FUNDLY_SQLITE=/data/fundly.db` | 容器重启不丢库 |
| 构建 | 根目录 `Dockerfile`（oven/bun:1.3） | 两套 lockfile 一起装 |
| 灌库 | 容器从 Backy/R2 直拉 gzip，再 `gzip -dc` | 本机 `volume files upload` 传 4GB / 906MB 会断或极慢 |

采集仍建议本机跑。海外 IP 打东财不稳定。

---

## CLI

本机已装 `railway` 5.41.3，账号 `lizheng@lizheng.me`。公司网打 `backboard.railway.com` 常 TLS 失败，命令前加：

```bash
export HTTPS_PROXY=http://127.0.0.1:7890 HTTP_PROXY=http://127.0.0.1:7890
```

```bash
railway status
railway logs
railway volume list --json
railway volume files -v fundly-volume list / --json
railway ssh -- sh -c 'ls -lah /data; df -h /data'
```

`volume add` 不要带 `--service`（CLI 会拒或不稳定）。先 `railway service link fundly`，再：

```bash
railway volume add --mount-path /data --json
```

---

## 首次上线

```bash
railway init --name fundly --workspace hexly.ai
railway up --yes --detach
railway service link fundly
railway volume add --mount-path /data --json
railway variable set FUNDLY_SQLITE=/data/fundly.db --skip-deploys
railway domain
```

`serve.ts` 在库不存在时会建空 schema。第一次启动后 `/data/fundly.db` 只有约 12 MB，必须用真实库覆盖后再 `railway restart`。

### 灌库（实测可用）

本机 `railway volume files upload` 传 4.0 GB 原库约 118s 后 `session closed`；传本机 gzip（906 MB）约 6 MB/min。不要走这条。

容器在新加坡，打 Cloudflare R2 很快。用已有 Backy prod 备份（本次 `ObAmSwORwjG0-VasYCNoU`，749,352,407 B）：

1. 本机取 restore 短链（token 只活在本机 sqlite，不要提交、不要写进 Volume）
2. SSH 进容器 `fetch` 到 `/data/seed.db.gz`（本次 19s）
3. `gzip -dc /data/seed.db.gz > /data/fundly.db.new`（本次 45s，得到 3,723,972,608 B）
4. 只读打开核对：`fund_basic_info = 27527`，`fund_nav = 30690680`
5. `mv` 换上 `/data/fundly.db`，删掉 shm/wal
6. `railway restart -y`，让新进程打开真实库
7. 清掉 `seed.db.gz` / 空库 / 临时脚本

换库前旧进程若还握着空库，`/api/stats` 可能打出 `SQLITE_CORRUPT`。以 restart 之后的响应为准。

### 不要做的

- 不要把 `data/*.db` 打进镜像
- 不要把 Backy token 或 restore URL 提交进 git
- 不要以为 `volume files upload` 完了进程就会读新文件——必须 restart

---

## 日常

```bash
bun run build:web          # 只改前端时先构建
railway up --yes --detach  # 推当前目录
```

探活：

```bash
curl -sS https://fundly.hexly.ai/api/live
curl -sS https://fundly.hexly.ai/api/stats
```

`/api/live` 应含 `"status":"ok"` 和 `"version"`。首次 `/api/stats` 扫 3069 万净值行约 15s，之后约 2.5s。
