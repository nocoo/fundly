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

## CI 与自动部署

GitHub Actions：`.github/workflows/ci.yml`。`main` 的 push / PR 和手动运行复用
`nocoo/base-ci v2026.7`（固定 SHA `ad43150de3a2be2fa464b5cd2f921dc4fa9f8f0f`）：

- 使用 Bun 1.3.14，以项目 lifecycle 策略冻结安装根目录、`apps/web`、`apps/worker` 三套依赖。
- 执行三组 typecheck、Biome、`test:coverage`（包含采集、Web、API 与临时 SQLite 集成测试）、Web build。
- 上传覆盖率报告，运行 Gitleaks 与三套 lockfile 的 OSV 扫描，以及 actionlint / YAML 校验。
- 不启用浏览器 E2E / L3。CI 无需生产 secrets，只有 `contents: read` 权限。

`main` 的必需 check 为 **CI Gate**（GitHub Actions）。该 job 始终汇总质量检查和 workflow
校验，任何失败、取消、非预期跳过或 tested SHA 不匹配都会失败。分支保护要求分支与 `main`
保持同步，并对管理员生效；通过 PR 合并，不直接 push `main`。

Railway 服务已接 `nocoo/fundly`。要让它**等 CI 全绿再部署**：

1. 打开 [fundly 服务设置](https://railway.com/project/c0f17860-907e-40eb-9ae1-d64258f0a6e2/service/87995549-a6fc-486a-8613-30d0b8cfc3f8)
2. 打开 **Wait for CI**
3. GitHub 上确认 Railway App 已接受最新权限：https://github.com/settings/installations

打开后，推 `main` 会先 `WAITING`，CI 失败则 `SKIPPED`，全绿才构建镜像。`railway up` 从本机直推不走这道闸。

本机 CLI token 没有改 `checkSuites` 的权限，这个开关只能在 Dashboard 拨一次。

## GitHub Release

`.github/workflows/release.yml` 发布 GitHub 源码版本，继续由 Railway 的 GitHub 集成部署
`main`。项目包均为 `private`，不发布 npm 包；这里也不运行 Wrangler、SSH / Compose 或
SQLite 数据迁移。

发布步骤：

1. 在版本分支更新三个 `package.json`、API / UI 版本与 `CHANGELOG.md`，提交 PR。
   `bun run release patch` 可以生成版本 commit，但也会创建一个本地 tag；此时不要推送该 tag。
2. 合并版本 PR 后，等待合并提交的 **main push CI** 全绿。PR 的检查记录不能作为发布凭据。
3. 为该 main 提交创建 `vX.Y.Z` tag 并推送。若第 1 步生成的本地 tag 指向合并前的提交，
   先确认远端没有同名 tag，再删除这个未推送的本地 tag，并在已通过 CI 的 main 提交上重建。
   已发布的 tag 不可移动。
4. tag push 自动触发 Release。共享 `release-source` action 通过 GitHub API 核对仓库、
   workflow 路径 / 名称、main 分支、push 事件、成功状态、tag 与完整 commit SHA；同时要求
   tag 与根包版本一致。随后验证子包、API 版本和 changelog，再创建带 CI 链接的 Release。

必须先等 main CI 成功，再推送 tag；提前推送会因缺少成功凭据而失败。可在 CI 完成后重跑
失败的 Release，或手动指定 tag 和对应 `source-run-id`。

手动运行默认 `publish=false`，只验证来源、版本和 release notes；设置 `publish=true`
才会发布。已有 GitHub Release 不会被覆盖。发布 job 仅使用 GitHub 自带 token，权限为
`actions: read` 和 `contents: write`，无需额外部署凭据。

## 日常

```bash
bun run build:web          # 只改前端时先构建
railway up --yes --detach  # 本机直推，不等 GitHub CI
# 合并 PR 后的 main push 走 GitHub → CI →（Wait for CI 打开后）Railway
```

探活：

```bash
curl -sS https://fundly.hexly.ai/api/live
curl -sS https://fundly.hexly.ai/api/stats
```

`/api/live` 无需登录，使用 `Cache-Control: no-store`，轻量只读查询基金主表。
数据库可读时返回 HTTP 200、`"status":"ok"` 和当前 `version`；读取失败返回
HTTP 503、`"status":"error"`，不公开数据库路径或错误细节。空表仍表示连接正常。
首次 `/api/stats` 扫 3069 万净值行约 15s，之后约 2.5s。

---

## 实测上线过程（2026-08-22）

按发生顺序记录，数字都是当场测的。

1. **本机 CLI**：`railway` 5.41.3，账号 `lizheng@lizheng.me`，workspace `hexly.ai`。公司网必须 `HTTPS_PROXY=http://127.0.0.1:7890`，否则 `backboard.railway.com/graphql/v2` 会 `tls handshake eof`。
2. **建项目 / 服务**：项目 `fundly` `c0f17860-907e-40eb-9ae1-d64258f0a6e2`，服务 `fundly` `87995549-a6fc-486a-8613-30d0b8cfc3f8`。根目录 `Dockerfile`（`oven/bun:1.3`）+ `railway.toml`，`railway up --yes --detach`。区域 `asia-southeast1-eqsg3a`，2 vCPU / 8 GB。
3. **挂盘**：先 `railway service link fundly`，再 `railway volume add --mount-path /data --json`。带 `--service` 会拒或不稳定。得到 `fundly-volume` `64a72912-6250-4aaa-9f8d-d00f81f858df`，配额 50 GB。变量 `FUNDLY_SQLITE=/data/fundly.db`。
4. **空库陷阱**：镜像不含 `data/*.db`。`serve.ts` 发现文件不存在会 `initSchema`，第一次起来后 `/data/fundly.db` 只有 **12,582,912 B**，`/api/live` 正常、`/api/stats` 500。
5. **本机直传失败**：`railway volume files upload` 传 4.0 GB 原库约 118s 后 `session closed`。本机 `gzip` 活库得到 `/tmp/fundly.db.gz` **906 MB / 45.7s**，CLI 上传约 6 MB/min，跑了十几分钟只到约 70 MB，杀掉。
6. **可用灌库**：新加坡容器打 R2 很快。本机用 sqlite 里的 Backy 凭证取 restore 短链（**不**写进 Volume、不提交）。`ObAmSwORwjG0-VasYCNoU`（749,352,407 B，tag `fundly-db`，2026-08-22T00:55:41Z）：
   - 容器 `fetch` → `/data/seed.db.gz`，**19s**，字节数对齐
   - `gzip -dc` → `/data/fundly.db.new`，**45s**，3,723,972,608 B
   - 只读核对：`fund_basic_info = 27527`，`fund_nav = 30690680`
   - `mv` 换上 `/data/fundly.db`，删 shm/wal
7. **必须 restart**：旧进程还握着空库 inode。换文件后 `railway restart -y`。换库过程中 `/api/stats` 打过 `SQLITE_CORRUPT`，restart 之后消失。
8. **探活**：`https://fundly.hexly.ai/api/stats` 与 `https://fundly-production-5442.up.railway.app/api/stats` 均为 27,527 / 30,690,680，净值区间 2001-09-21 → 2026-08-20。首页 HTML 200。`df -h /data`：46G 盘、已用 3.5G。CLI `currentSizeMB` 仍可能报 `0.0`。
9. **清场**：删掉 `seed.db.gz`、空库、restore URL、临时脚本。

SSH 灌库时不要把 restore URL 走 `railway ssh` 的 stdin（CLI 会吞掉，容器里的 bun 一直等输入）。把短链写进卷上的临时文件再 `bun /data/seed.ts`，跑完立刻删。

## 宏观与研究功能运行边界

宏观代码已随 `v0.5.0` 部署，`v0.6.0` 新增选 ETF / 选股页面与只读 API。生产数据需独立采集或同步；运行 `fetch:macro`、`fetch:selection` 或其 `--watch` 模式的进程需访问同一 SQLite Volume，并配置服务端 `HITHINK_FINANCE_API_KEY`。浏览服务继续只读，页面刷新不触发上游补采。不要把密钥放进 Vite 构建环境。操作说明见 [14 · 宏观大屏实现](./14-MACRO-IMPLEMENTATION.md)、[15 · 选 ETF](./15-ETF-SCREENING.md) 和 [16 · 选股](./16-STOCK-SCREENING.md)。
