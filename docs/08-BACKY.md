# 08 · Backy 备份与恢复

> 本机 SQLite 是 Fundly 的写库和换机单位。Backy 只存 gzip 快照，不跑查询。
>
> 相关文档：
> - [01-ARCHITECTURE.md](./01-ARCHITECTURE.md) — 采集写 `data/fundly.db`
> - [02-SCHEMA.md](./02-SCHEMA.md) — 表结构
> - [03-SCRIPTS.md](./03-SCRIPTS.md) — CLI 入口（实现后补 `backup` / `restore`）
> - [06-ARCH-UI.md](./06-ARCH-UI.md) — 浏览层；本文件不改 Worker / D1

已实现：`bun run backup` / `bun run restore`，设置页只读本机 API。

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
FUNDLY_SQLITE=data/fundly.db BACKY_ENV=prod bun run backup
```

`FUNDLY_SQLITE` 默认 `data/fundly.db`（`DEFAULT_DB_PATH`）。源文件必须**已经存在**。禁止走 `openDb()`：它是 `{ create: true }`，路径写错会造出空库再被当成最新 prod。

步骤：

1. 读 `BACKY_WEBHOOK_URL` / `BACKY_TOKEN`。缺一则退出，不碰磁盘。可选 `HEAD` webhook，只认 HTTP 200（现网没有 `X-Project-Name`）。
2. 预检目标卷空闲 ≥ 快照 + gzip（按 2026-08-22 实测约 **4.46 GB**）。不够则退出。
3. 拿锁：`{sqlite}.backy.lock` 用 `O_EXCL` 创建。锁已存在则读 pid，进程仍在就退出；pid 不存在则删锁和残留 snap/gz 后重建。锁与 snap **分开**：失败留下的 `.backy-snap.db*` 不是锁。无锁残留一律删除再做，不续传（R2 单次 PUT 不能断点）。
4. 只读打开已存在的源库，跑 `assertFundlyDb`（见下节），再 `VACUUM INTO {sqlite}.backy-snap.db`。不要 gzip 活库文件。
5. `gzip -6` → `{sqlite}.backy-snap.db.gz`，记录精确字节数。
6. `POST {webhook}/uploads`：
   - `file_name`: `fundly.db.gz`
   - `content_type`: `application/gzip`
   - `file_size`: gzip 精确字节
   - `environment`: `prod`（`BACKY_ENV` 可改为 `test`）
   - `tag`: `fundly-db`
7. 按 init 返回的 `headers` **原样** `PUT put_url`。禁止改 header。流式读 gz，不要整文件进内存。
8. `POST {webhook}/uploads/{upload_id}/complete`。201 打印 `id` / `file_size`。
9. 成功：删 snap、gz、锁。PUT/complete 失败：`DELETE …/uploads/{upload_id}`，删 snap/gz/锁，非零退出。下次从零做。

不在 `fetch:daily` 结束时自动备份。

---

## 恢复

```
bun run restore                         # prod 最新一条 → FUNDLY_SQLITE
bun run restore --id <id>               # 指定 id，不筛 environment（可拉 test 探测包）
bun run restore --force                 # 覆盖已有目标库
bun run restore --to /tmp/fundly.db     # 写到别的路径；存在则仍要 --force
FUNDLY_SQLITE=data/fundly.db bun run restore
```

`--to` 覆盖目标路径；未传则用 `FUNDLY_SQLITE` / `DEFAULT_DB_PATH`。`--id` 与默认「最新 prod」互斥筛选：有 id 就只按 id 取。

步骤：

1. 读凭证。无 `--id` 则 `GET {webhook}`，筛 `environment === prod`，按 `created_at` 取最新；没有则退出。
2. 拿 `{target}.backy.lock`。启动时若无活锁，清理由上次崩溃留下的 `{target}.backy-dl.gz`、`{target}.restored`。
3. 目标已存在且无 `--force`：退出（在下载前）。下载期间别人新建的目标不能靠这一步挡住，见第 10 步。
4. 预检空闲：至少 gzip + 解压后体积（约 **4.46 GB**）。`--force` 另提示：旧库会改名为 prev，再占约 4 GB，且只保留**一份**该目标的最新 prev。
5. `--force` 且目标存在时，先停写：
   - 调用方必须先停 `dev:all` / `fetch:*` / 其它打开该库的进程。
   - 用 `{ readwrite: true, create: false }` 打开目标（只读连接无法 `wal_checkpoint`，bun:sqlite 会报 `attempt to write a readonly database`）。
   - 跑 `PRAGMA wal_checkpoint(TRUNCATE)`，**必须** `busy === 0`。`busy !== 0` 表示还有读者/写者，退出且不下载。不要把 `busy: 1` 当成成功。
   - 关掉连接后才能改名、删 sidecar。
6. `GET {origin}/api/restore/{id}`。`expires_in: 900` 约束的是**下一次发起 GET 该 URL 的时刻**，不是整次下载必须在 900 秒内结束。健康的流式传输不要在第 900 秒主动掐断。只有尚未开始的请求、中断后重试、或收到 403 才重新申请 restore URL（最多再签 2 次）。
7. 拿到 `url` 后立刻流式写入 `{target}.backy-dl.gz`。禁止整包进内存。校验 HTTP 状态；若有 `Content-Length` 或 JSON `file_size`，落地字节必须一致。
8. 解压到 `{target}.restored`。gzip CRC 失败则删 partial 并退出。
9. 对 `{target}.restored` 跑 `PRAGMA integrity_check` **和** `assertFundlyDb`。任一层失败：删 restored / dl，不碰活库。
10. 无 `--force`：用**不覆盖**的原子改名（Linux `renameat2(RENAME_NOREPLACE)` / macOS `renamex_np(RENAME_EXCL)`，或先 `link` 再检查）。目标已存在则失败，不覆盖。
11. `--force`：`rename(target, {target}.prev-YYYYmmddTHHMMSS)`，再把 restored 改到 target。第二步失败则把 prev 改回 target。成功后只删 **`{target}.prev-*` 里更旧的那几份**，不要扫目录里其它 `*.prev-*`。然后删 `{target}-wal` / `{target}-shm`。
12. 成功：删 dl gz、锁。捕获到的失败：删本次 dl / restored，释放锁。

崩溃恢复（SIGKILL / 断电，下次启动）：

- 有锁但 pid 已死：删锁、dl、restored，按普通失败处理。
- 目标不存在、但存在一份完整且通过 `assertFundlyDb` 的 `{target}.prev-*`：视为替换中断，把最新那份 prev 改回 target，再报失败。不要自动把未校验的 restored 推上去。
- 目标与 prev 都在：视为上次已成功改名、第二步未完成或已回滚到「旧库仍叫 target」；以 target 为准，只清 dl / restored。

换机：clone → `bun install` → 导出两个环境变量 → 确认没有残留 `-wal`/`-shm` → `bun run restore` → `bun run dev:all`。

`GET` 只保证 `recent_backups`。默认恢复只认最新 prod。不要按 tag 拼多文件。

---

## 库校验 `assertFundlyDb`

`integrity_check = ok` 不够：空库、错库也能过。备份源和恢复结果都要过这一关：

- 文件存在，且打开时 `{ create: false }`
- `schema_version` 表有行，且 `version` 等于当前 `SCHEMA_VERSION`
- 存在 `fund_basic_info`、`fund_performance`、`fund_nav`
- `fund_basic_info`、`fund_nav` 行数都 `> 0`

不要把 3069 万行写死成下限。换机当天的库只要「是 Fundly 且非空」。

---

## 代码落点

采集侧，不进 `apps/`。

| 路径 | 职责 |
|---|---|
| `src/backup/backy.ts` | init / 流式 PUT / complete / abort / list / restoreUrl / 流式下载 |
| `src/backup/snapshot.ts` | 锁、`assertFundlyDb`、`VACUUM INTO`、gzip、wal 收尾、prev 轮转 |
| `src/db/repo.ts` | 可复用 `SCHEMA_VERSION`；备份**不要**调用会 `create: true` 的 `openDb` |
| `scripts/backup.ts` | 读 env、磁盘预检、编排备份 |
| `scripts/restore.ts` | `--id` / `--force` / `--to`、编排恢复 |
| `tests/backy.test.ts` | URL、header 原样、选最新 prod、过期 URL 重签、下载字节不符 |
| `tests/snapshot.test.ts` | 见 6DQ L1 |
| `.gitignore` | 补 `data/*.db.gz`、`data/*.restored`、`data/*.prev-*`、`data/*.backy.lock`、`data/*.backy-dl.gz` |
| `package.json` | `backup` / `restore` |
| `tsconfig.scripts.json` | include 两个脚本 |
| `docs/03-SCRIPTS.md` | 命令表 |
| `apps/web/src/components/settings/backy-settings.tsx` | 设置页：Cloud 图标、推送、历史卡片 |
| `apps/worker/scripts/dev-api.ts` | `/api/backy*` 本机入口 |

`DEFAULT_DB_PATH` 仍是默认路径。现有 `data/fundly.db.prev-20260819` 已被 ignore 漏掉，实现 `.gitignore` 时一并收口。

---

## 6DQ

| 维 | 计划 |
|---|---|
| **L1** | mock fetch + 临时小库。必测：缺源文件 / `create: false`、`assertFundlyDb` 拒空库、已有目标且无 `--force`、锁互斥、stale lock（死 pid）、无锁残留 snap 删除重建、磁盘不足、过期 URL 重签、下载中断、gzip CRC 失败、`--force` 第二步 rename 失败回滚、backup 与 restore 并发抢锁、WAL sidecar 在替换后被删、`wal_checkpoint` 的 `busy !== 0`、无 `--force` 时目标在下载后出现须 noreplace 失败、中断在 `target→prev` 之后须把 prev 改回。禁止打 `backy.hexly.ai`。 |
| **L2** | **N/A（本迭代）**。生产 Backy 项目不是隔离实例；`environment=test` 仍是同一项目。有独立 Backy 测试项目再补真 HTTP。 |
| **L3** | 手测：`bun run backup` → `bun run restore --id <prod> --to /tmp/fundly-restore.db` → `assertFundlyDb`。覆盖已有库时再测 `--force`（先停 `dev:all`）。不进 CI。 |
| **G1** | `bun run typecheck`、`typecheck:scripts`、`lint`。提交前 `bun run test:coverage`（仓库规定 ≥ 95%）。 |
| **G2** | token 只走环境变量。提交前 `gitleaks`；文档禁止粘贴 Bearer。 |
| **D1** | 本功能不新建 Cloudflare 资源。单测只用进程内临时 sqlite / mock fetch。 |

本迭代最高 **Tier B**（L1 + G1）。不要为了刷 Tier 去打生产 webhook。

---

## 原子化提交（实现时）

1. `feat: add backy http client` — `src/backup/backy.ts` + `tests/backy.test.ts`
2. `feat: add sqlite gzip snapshot` — `src/backup/snapshot.ts` + `tests/snapshot.test.ts`
3. `feat: add backup and restore cli` — 两个脚本、`package.json`、`tsconfig.scripts.json`、`.gitignore`
4. `docs: document backup restore commands` — `03-SCRIPTS.md`

文档本身（本文件 + 编号表）单独先合，不跟代码混。

---

## 实现时不要做

- 不分片、不写清单 JSON、不启用 Pull
- 不改 D1 导入、不改 Worker
- 不把探测备份当默认恢复源（`--id` 显式指定除外）
- 不在成功路径保留 `*.backy-snap.db*` / 下载中的 `.backy-dl.gz`
- 不调用 `openDb()` 去打开备份源
- 不把 705 MiB gzip 读进 ArrayBuffer
