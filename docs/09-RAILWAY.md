# 09 · Railway 部署

> 浏览层跑在 Railway 一个服务里：Hono 提供 `/api/*`，同时托管 Vite 静态页。SQLite 放 Volume `/data`。
>
> 相关文档：
> - [06-ARCH-UI.md](./06-ARCH-UI.md) — 本机开发拓扑
> - [08-BACKY.md](./08-BACKY.md) — 备份到 Backy / R2

---

## 关键决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 平台 | Railway | 可挂盘，适合 4GB sqlite |
| 进程 | 单服务 `serve.ts` | API 和 SPA 同域，不用再拆 Worker |
| 数据库 | Volume 挂 `/data`，`FUNDLY_SQLITE=/data/fundly.db` | 容器重启不丢库 |
| 构建 | 根目录 `Dockerfile`（oven/bun:1.3） | 两套 lockfile 一起装 |

采集仍建议本机跑，再把 `fundly.db` 上传到 Volume。海外 IP 打东财不稳定。

---

## CLI

本机已装 `railway` 5.41.3，账号 `lizheng@lizheng.me`，workspace `hexly.ai`。

```bash
railway status
railway logs
railway volume list
railway volume files list / --volume data
```

---

## 首次上线

```bash
railway init --name fundly --workspace hexly.ai
railway up --yes --detach
railway volume add --mount-path /data --json
railway variable set FUNDLY_SQLITE=/data/fundly.db --skip-deploys
railway domain
```

把本机库拷上去（Volume 根目录对应挂载点 `/data`）：

```bash
railway volume files upload data/fundly.db /fundly.db --volume data
railway restart
```

实测本机库约 **4.0 GB**。上传完必须 `restart`，否则进程还握着启动时的空库。

---

## 日常

```bash
bun run build:web          # 只改前端时先构建
railway up --yes --detach  # 推当前目录
```

不要把 `data/*.db` 打进镜像。
