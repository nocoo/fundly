# 17 · 宏观日报

仓库内 Markdown 日报：写入 `content/macro-daily/` 后，本机 / Railway 容器从磁盘读取并展示，无需灌库。

## 内容约定

| 项 | 说明 |
|----|------|
| 路径 | `content/macro-daily/YYYY-MM-DD.md` |
| 文件名 | 与 frontmatter `date` 一致，格式 `YYYY-MM-DD` |
| Frontmatter（可选） | `title`、`date`、`summary`（一行）、`sources`（字符串数组） |
| 正文 | 普通 Markdown（标题、表格、列表、链接、粗体）；前端按 GFM 渲染表格 |

**范围**：利率、汇率、商品、风险偏好等宏观主题。不要写个股清单或行业下钻列表（那些走宏观大屏 / 选股选 ETF）。

## 写入流程

1. 新建 `content/macro-daily/YYYY-MM-DD.md`（可参考同目录样例）。
2. 可选 YAML frontmatter + 正文。
3. 提交到 `main` 并部署；容器 `COPY . .` 会带上 `content/`，Worker 从 `repoRoot/content/macro-daily` 读文件。
4. 打开站点 `/daily` 列表、`/daily/YYYY-MM-DD` 详情。

无需跑采集脚本，也无需改 SQLite。

## API（需登录会话）

| 方法 | 路径 | 响应 |
|------|------|------|
| `GET` | `/api/daily` | `[{ date, title, summary, path }]`，按日期新到旧 |
| `GET` | `/api/daily/:date` | `{ date, title, summary, markdown }`；`:date` 须为 `YYYY-MM-DD` |

实现：`apps/worker/src/lib/daily-service.ts`；路由在 `apps/worker/scripts/app.ts` 的 `createApi`。路径用 `path.resolve` 并校验落在 content 目录内，拒绝遍历；缺文件 404，非法日期 400。

## 前端

- `/daily`：列表（空态提示尚无日报）
- `/daily/:date`：详情，`react-markdown` + `remark-gfm` 渲染正文
- 导航：总览 → **日报**

## 样例

仓库自带 `content/macro-daily/2026-09-09.md`，用于验收列表与 GFM 表格渲染。
