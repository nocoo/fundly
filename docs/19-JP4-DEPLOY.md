# 19 · jp4 Docker 部署（生产 CD）

> **状态**：仓库侧 CD 已就绪；主机目录、proxy、`edge` 网络、`.env.runtime` 与 GitHub Environment secrets 由运维在切流前补齐。本稿不执行数据迁移或 DNS 变更。
>
> 历史 Railway 记录见 [09-RAILWAY.md](./09-RAILWAY.md)（已弃用，仅作回滚参考）。

---

## 架构摘要

| 项 | 值 |
|---|---|
| 镜像 | `ghcr.io/nocoo/fundly:<commit SHA>`（CD 注入 `IMAGE_SHA`；digest 校验见 Deploy 私验） |
| 主机 | jp4（Tailscale 短名 `jp4`，SSH `52722`） |
| 部署目录 | `/data/fundly`（`compose.yaml`、`.env.runtime`、`.base-ci-releases/`） |
| 数据盘 | `/data/fundly/data` bind → 容器 `/data`，`FUNDLY_SQLITE=/data/fundly.db` |
| 环回端口 | `127.0.0.1:17040` → 容器 `8080` |
| Docker 网络 | `edge`（external，接共享 proxy-caddy） |
| 公网域名 | `https://fundly.hexly.ai`（切流前可保持指向 Railway） |
| CI 工作流 | `.github/workflows/deploy.yml` → `nocoo/base-ci` `deploy-docker.yml@af9a2b3f82c367d6eb6def5c3583ac717e0868ad` |
| GitHub Environment | `fundly / production` |

源码 tag 发布与 Docker 部署分离：`.github/workflows/source-release.yml` 仅打 GitHub Release，不碰 sqlite。

---

## 仓库内文件

- `deploy/compose.yaml` — 单服务 `web`，`container_name: fundly-app`；`image` 使用 `${IMAGE_SHA:-deploy-required}`（见下节）
- `Dockerfile` — Bun 生产镜像；`.dockerignore` 排除 `data/` 与 `*.db`
- `scripts/verify-deployment.mjs` — 按 `DEPLOY_PHASE` / `DEPLOY_URL` / `DEPLOY_ORIGIN_MARKER` 做公网或私验

---

## `IMAGE_SHA` 与 Compose

Compose 会**解析** `image` 行（含 `docker compose restart`），因此不能把「未设置就报错」的 `${IMAGE_SHA:?…}` 写在生产 `compose.yaml` 里：主机 `/data/fundly/.env` 通常**不**持久化 `IMAGE_SHA`，日常 `restart web`（如 Studio daily-sync 换库后）不应因缺变量而 `exit 1`。

| 操作 | 谁设置 `IMAGE_SHA` | 行为 |
|---|---|---|
| **GitHub Actions 部署**（`deploy-docker`） | 远端 shell 注入为已通过 CI 的 **40 位 commit SHA** | `compose pull` / `up` 拉取并启动 `ghcr.io/nocoo/fundly:<sha>`；`deploy.yml` 私验核对 digest 与运行中容器 |
| **`docker compose restart web`** | 不需要 | 仅重启已有 `fundly-app`；未设置时用占位标签 `deploy-required` 满足插值，**不会**改镜像 |
| **手动 `pull` / `up` / `down`+`up`** | 运维必须 `export IMAGE_SHA=<40位 sha>`（或写入当次 shell 的 `.env`） | 勿用 `:latest`；缺 `IMAGE_SHA` 时会指向不存在的 `deploy-required` 标签并在拉取阶段失败 |

部署目录中的 `.env.runtime` 只给**容器内**应用变量，**不**替代上述 `IMAGE_SHA`。

---

## 主机准备（VPS，不进 git）

```bash
mkdir -p /data/fundly/data /data/fundly/backups
chown -R nocoo:nocoo /data/fundly
chmod 755 /data/fundly /data/fundly/data
docker network create edge  # 若尚未存在
```

- 在 `/data/fundly/.env.runtime`（`chmod 600`）写入应用变量：从 Railway 复制 `ALLOWED_EMAILS`、`AUTH_ORIGIN`、`FUNDLY_SQLITE`、`GOOGLE_*`、`SESSION_SECRET`；**不要**复制 `RAILWAY_*`。
- jp4 建议增加 `FUNDLY_LIVE_COMPONENT=jp4`（`/api/live` 与公网验收）；Caddy 可对 `fundly.hexly.ai` 加响应头 `X-Fundly-Origin: jp4`。
- 共享 **proxy-caddy** + Cloudflare Origin 证书 + `reverse_proxy fundly-app:8080`（与 pew/firefly 同型）；应用端口不对公网开放。

数据迁移、停写窗口与 DNS 切换见迁移计划；**未批准前不得覆盖** `/data/fundly/data`。

---

## GitHub Actions

### Environment `fundly / production`

**Secrets**（名称与 pew/firefly 对齐；值为 fundly 专用 WIF，勿复用他仓）：

| Secret | 含义 |
|---|---|
| `TS_OAUTH_CLIENT_ID` | Tailscale WIF OAuth client |
| `TS_AUDIENCE` | WIF audience |
| `VPS_HOST` | 通常 `jp4` |
| `VPS_PORT` | 通常 `52722` |
| `VPS_USER` | 通常 `nocoo` |
| `VPS_SSH_KEY` | 部署 SSH 私钥 |
| `VPS_KNOWN_HOSTS` | `[jp4]:52722` 与 `[100.101.0.6]:52722` 两行 ed25519（由运维签发，不进仓库） |
| `GHCR_PULL_USER` / `GHCR_PULL_TOKEN` | 主机拉 GHCR |

**Variables**（验收）：

| Variable | 切流前 | 切流后 |
|---|---|---|
| `DEPLOY_PHASE` | `precutover` | `production` |
| `DEPLOY_URL` | `https://fundly.hexly.ai` | 同左 |
| `DEPLOY_ORIGIN_MARKER` | `jp4` | `jp4` |

建议为 Environment 配置保护规则，在 secrets 与主机就绪前阻止自动部署。

### 触发

- `main` 上 **CI** 成功后 `workflow_run` 触发 Deploy。
- 或 `workflow_dispatch` 并填写已通过 CI 的 `ci-run-id`。

私验：环回 `curl -H 'Host: fundly.hexly.ai' http://127.0.0.1:17040/api/live`。

---

## 回滚

- **代码/镜像**：重新部署上一 digest 或 revert `main` 后走 CD。
- **路由**：DNS 改回 Railway（见 09 文档中的域名与 volume ID）；保留 jp4 数据目录作对照。
- **Railway**：切流前勿删项目/volume；停 runtime 需单独批准。

---

## Studio 每日库发布（`fundly-daily-sync.sh`）

采集机在 Studio（与 jp4 同 Tailscale）本地跑抓取与校验后，经 SSH **只替换** `/data/fundly/data/fundly.db`（及 `-wal`/`-shm`），**不得**覆盖 `auth.db`、`.env.runtime`、`compose.yaml` 或 `backups/`。

| 项 | 值 |
|---|---|
| 脚本（仓库） | `scripts/fundly-daily-sync.sh` |
| Studio 安装 | `cp scripts/fundly-daily-sync.sh ~/.local/bin/fundly-daily-sync.sh` 或 `ln -sf <repo>/scripts/fundly-daily-sync.sh ~/.local/bin/fundly-daily-sync.sh` |
| SSH | `nocoo@100.101.0.6`（或 MagicDNS `jp4`），端口 `52722`；私钥默认 `~/.ssh/id_rsa` |
| 私钥 | `FUNDLY_JP4_SSH_KEY`（默认 `~/.ssh/id_rsa`）；`known_hosts` 需包含 `[jp4]:52722` 与 `[100.101.0.6]:52722` |
| 远端流程 | `scp` → `fundly.db.new.gz` → 校验 md5 → `gunzip` → `sqlite3 quick_check` + 行数/最新净值 → 原子 swap → `docker restart fundly-app` |
| 验收 | `https://fundly.hexly.ai/api/live`：`status=ok`、`component=jp4`、`database.connected=true`；主机环回 `http://127.0.0.1:17040/api/live` |

常用标志：`--no-fetch`、`--no-sync`、`--weekly`、`--skip-upload`（复用 jp4 上已有 `fundly.db.new`）、`--lock-check`。状态与日志默认在 `~/.local/state/fundly/`（`FUNDLY_STATE_DIR` 可改）。

---

## 相关

- [08-BACKY.md](./08-BACKY.md) — 备份与 restore
- [10-AUTH.md](./10-AUTH.md) — Google OAuth（`AUTH_ORIGIN` 保持 `https://fundly.hexly.ai`）
- [03-SCRIPTS.md](./03-SCRIPTS.md) — 脚本手册（含 daily-sync 摘要）
