# 08 · Backy 备份与恢复

> 本机 SQLite 是 Fundly 的写库和换机单位。Backy 只存 gzip 快照，不跑查询。
>
> 相关文档：
> - [01-ARCHITECTURE.md](./01-ARCHITECTURE.md) — 采集写 `data/fundly.db`
> - [02-SCHEMA.md](./02-SCHEMA.md) — 表结构
> - [03-SCRIPTS.md](./03-SCRIPTS.md) — CLI 入口（实现后补 `backup` / `restore`）
> - [06-ARCH-UI.md](./06-ARCH-UI.md) — 浏览层；本文件不改 Worker / D1

本文是实现前的设计。未实现前不要加 `package.json` 脚本。

---

## 问题

生产浏览可以继续用或不走 D1，但 **4GB 写库不搬上云当查询引擎**。换电脑、磁盘坏了，必须能从 R2 把同一份 SQLite 拉回来。

Backy 项目名 `fundly`，webhook 已开通。Pull 未开，也不开：采集机不是 24 小时在线，由本机 Push。

---

## 实测（2026-08-22）

| 项 | 值 |
|---|---|
| 活库 `data/fundly.db` | 4,009,930,752 字节（4.010 GB） |
| WAL | 78,312 字节 / 19 页；`wal_checkpoint(FULL)` 已全部写入 |
| `VACUUM INTO` 快照 | 3,723,964,416 字节（3.724 GB），4.86 秒 |
| `gzip -6` | **738,866,150 字节（704.6 MiB）**，43.34 秒，约 5.04× |
| Backy 直传上限 | 5,000,000,000 字节；`5000000001` 被拒 |
| 直传 PUT 有效期 | 3600 秒 |
| restore URL 有效期 | 900 秒 |
| 小文件 webhook | `.json` 201；`.zip` HTTP 500 但对象已入库 |
| 一次备份多个文件 | 不支持；第二个 `file` 被丢，`files[]` 400 |

704.6 MiB 远低于 5GB，也低于 2GB。**不分片。**

---

## 关键决策

| 决策 | 选择 | 理由 |
|---|---|---|
| 备份对象 | 一份 `fundly.db.gz` | 实测 704.6 MiB，一次 PUT 能完 |
| 快照方法 | `VACUUM INTO` 再 gzip | 并入 WAL、压掉空页；不直接拷活库 |
| 上传路径 | 直传 3b（init → PUT R2 → complete） | 50MB webhook 装不下 |
| 调度 | 本机 Push，不开 Pull | 笔记本不常驻 |
| 多文件 / 分片 | 不做 | 接口一次一条；当前体积无必要 |
| 密钥 | 环境变量，不进 git | webhook token 是 secret |
| 默认恢复 | `environment=prod` 最新一条 | 探测用过 `test`，不能当换机源 |

不采用：

- 裸传 4.01GB（上限只剩 0.99GB；PUT 1 小时窗口紧）
- 先打大 gzip 再切（缺一片解不开）
- 把 token 写进文档或脚本默认值
- 自动化测试打生产 Backy 项目

---

## 凭证

| 环境变量 | 含义 |
|---|---|
| `BACKY_WEBHOOK_URL` | `https://backy.hexly.ai/api/webhook/<projectId>` |
| `BACKY_TOKEN` | `Authorization: Bearer …` 的 token |

restore 不在 webhook 路径下。实现从 `BACKY_WEBHOOK_URL` 取 origin，拼 `GET {origin}/api/restore/{backupId}`。

缺任一变量：CLI 非零退出，不碰数据库。

---

## 备份

```
bun run backup
# 可选
FUNDLY_SQLITE=data/fundly.db BACKY_ENV=prod bun run backup
```

步骤：

1. 读 `BACKY_WEBHOOK_URL` / `BACKY_TOKEN`。可选 `HEAD` webhook，只认 HTTP 200（现网没有 `X-Project-Name`，不要当成功条件）。
2. `VACUUM INTO` 写到 `data/fundly.db.backy-snap.db`（与活库同目录，避免跨卷拷 3.7GB）。活库保持打开可读；不要 `gzip` 正在写的 `fundly.db`。
3. `gzip -6` → `data/fundly.db.backy-snap.db.gz`。记下字节数。
4. `POST {webhook}/uploads`，JSON：
   - `file_name`: `fundly.db.gz`
   - `content_type`: `application/gzip`
   - `file_size`: gzip 精确字节
   - `environment`: `prod`（可用 `BACKY_ENV` 覆盖为 `test`）
   - `tag`: `fundly-db`
5. 按 init 返回的 `headers` **原样** `PUT put_url`（`Content-Type`、`Content-Length`、`If-None-Match: *`）。禁止改 header。
6. `POST {webhook}/uploads/{upload_id}/complete`。201 打印 `id` / `file_size`。
7. 删除本地 snap 与 gz。PUT 或 complete 失败则 `DELETE …/uploads/{upload_id}`，保留 snap 以便重试。

失败必须非零退出。并发：同一台机器同时跑两个 `backup` 会抢 snap 路径，用 `O_EXCL` 创建 snap，已存在则退出。

不在 `fetch:daily` 结束时自动备份。先手动；要挂调度另开文档。

---

## 恢复

```
bun run restore              # prod 最新一条
bun run restore --id <id>    # 指定
bun run restore --force      # 覆盖已有 data/fundly.db
```

步骤：

1. 读凭证。`--id` 没有则 `GET {webhook}`，在 `recent_backups` 里筛 `environment === prod`，按 `created_at` 取最新。没有 prod 备份则退出。
2. `GET {origin}/api/restore/{id}`，900 秒内把 `url` 下到临时 `.gz`。
3. 解压到 `data/fundly.db.restored`。
4. `PRAGMA integrity_check` 必须 `ok`。
5. 若 `data/fundly.db` 已存在且无 `--force`：退出，不覆盖。
6. `--force` 时把活库改名为 `data/fundly.db.prev-YYYYmmddTHHMMSS`，再把 restored 改成 `data/fundly.db`。
7. 删临时 gz。

换机最低路径：clone → `bun install` → 导出两个环境变量 → `bun run restore` → `bun run dev:all`。

`GET` 只保证 `recent_backups`。默认恢复只依赖「最新一条 prod」。不要按 tag 前缀拼多文件。

---

## 代码落点

采集侧，不进 `apps/`。

| 路径 | 职责 |
|---|---|
| `src/backup/backy.ts` | init / PUT / complete / abort / list / restoreUrl；纯 HTTP + 解析 |
| `src/backup/snapshot.ts` | `VACUUM INTO`、gzip、integrity_check、snap 互斥 |
| `scripts/backup.ts` | 读 env、调上面两步、打日志 |
| `scripts/restore.ts` | 选备份、下载、校验、替换 |
| `tests/backy.test.ts` | URL 拼接、header 原样、选最新 prod、缺字段报错 |
| `tests/snapshot.test.ts` | 互斥、integrity 失败拒绝替换（用临时小库） |
| `package.json` | `backup` / `restore` |
| `tsconfig.scripts.json` | include 两个脚本 |
| `docs/03-SCRIPTS.md` | 实现后补命令表 |

`src/db/repo.ts` 的 `DEFAULT_DB_PATH` 继续当默认库路径。

---

## 6DQ

| 维 | 计划 |
|---|---|
| **L1** | `backy.ts` / 选备份 / snap 互斥 / integrity 拒绝覆盖。`bun test`。禁止在单测里打 `backy.hexly.ai`。 |
| **L2** | **N/A（本迭代）**。生产 Backy 项目不是隔离实例；`environment=test` 仍是同一项目。有独立 Backy 测试项目再补真 HTTP。 |
| **L3** | 换机手测：backup → restore --force 到临时路径 → `integrity_check`。不进 CI。 |
| **G1** | `bun run typecheck`、`typecheck:scripts`、`lint`。 |
| **G2** | token 只走环境变量。提交前 `gitleaks`；文档禁止粘贴 Bearer。 |
| **D1** | 本功能不新建 Cloudflare 资源。单测只用进程内临时 sqlite / mock fetch。 |

本迭代最高 **Tier B**（L1 + G1）。不要为了刷 Tier 去打生产 webhook。

---

## 原子化提交（实现时）

1. `feat: add backy http client` — `src/backup/backy.ts` + `tests/backy.test.ts`
2. `feat: add sqlite gzip snapshot` — `src/backup/snapshot.ts` + `tests/snapshot.test.ts`
3. `feat: add backup and restore cli` — 两个脚本、`package.json`、`tsconfig.scripts.json`
4. `docs: document backup restore commands` — `03-SCRIPTS.md`

文档本身（本文件 + 编号表）单独先合，不跟代码混。

---

## 实现时不要做

- 不分片、不写清单 JSON、不启用 Pull
- 不改 D1 导入、不改 Worker
- 不把探测备份当默认恢复源
- 不在成功路径保留 `*.backy-snap.db*`
