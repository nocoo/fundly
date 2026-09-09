# 17 · 宏观日报

仓库内 Markdown 日报（potato style / 财经日报）：写入 `content/macro-daily/` 后，本机 / Railway 容器从磁盘读取并展示，无需灌库。

## 内容契约（正文区块顺序固定）

文件：`content/macro-daily/YYYY-MM-DD.md`

### Frontmatter（必填）

```yaml
---
title: 📊 财经日报 · YYYY-MM-DD
date: YYYY-MM-DD
summary: 一行摘要
sources:
  - 来源 A
  - 来源 B
---
```

- `date` 必须与文件名一致（`YYYY-MM-DD`）
- `title` 建议与正文 H1 一致，带 emoji
- 占位样例须在 `sources` 或全球宏观段注明「示例占位，非实时」

### 正文区块（必须按此顺序）

| # | 标题 | 要求 |
|---|------|------|
| 1 | `# 📊 财经日报 · YYYY-MM-DD` | 与 frontmatter `title` 对齐 |
| 2 | `## 🌍 全球宏观` | **GFM 表格**，行至少含：S&P500、NASDAQ、道指、VIX、10Y美债、美元指数、USO/油、USD/CNY。涨跌用 🟢 / 🔴。表下短段解读，并写明数据源与时段（如 Yahoo Finance、US cash close / as-of） |
| 3 | `## 💰 黄金` | GC 与/或 GLD（可知则写区间）+ 短解读 |
| 4 | `## 🤖 AI 七巨头` | **仅**这些 ticker：TSM、GOOGL、META、AMZN、MSFT、AAPL、NVDA；价格与涨跌幅 |
| 5 | `## 🇨🇳 中国相关` | FXI、KWEB、MCHI、BABA |
| 6 | `## 📰 要闻` | 最多 3 条，带链接 |
| 7 | `## 📝 总结` | 核心组合 + 短线观察要点 + **非投资建议** 免责声明 |

表格用 GitHub Flavored Markdown（`\| col \|` + 分隔行）；前端 `remark-gfm` 渲染。

### 明确不做

- **不要**做行业涨跌幅榜、涨停池、龙虎榜、全市场选股扫描等「行业 / 涨停屏」
- **不要**把宏观大屏或选股选 ETF 的列表逻辑搬进日报
- 精选 mega-cap（AI 七巨头）与中国相关 ETF/ADR **是契约内的固定块**，不是「个股推荐清单」的扩展口

行业下钻、ETF/股票筛选走宏观大屏与 `/select-*` 流程，见 docs/13–16。

## 写入流程

1. 新建 `content/macro-daily/YYYY-MM-DD.md`（参考同目录 `2026-09-09.md` 样例）。
2. 按上方契约写 YAML + 七段正文。
3. 提交并部署；容器 `COPY . .` 带上 `content/`，Worker 读 `repoRoot/content/macro-daily`。
4. 打开 `/daily` 列表、`/daily/YYYY-MM-DD` 详情。

无需采集脚本，也无需改 SQLite。

## API（需登录会话）

| 方法 | 路径 | 响应 |
|------|------|------|
| `GET` | `/api/daily` | `[{ date, title, summary, path }]`，按日期新到旧 |
| `GET` | `/api/daily/:date` | `{ date, title, summary, markdown, sources? }`；`:date` 须为 `YYYY-MM-DD` |

实现：`apps/worker/src/lib/daily-service.ts`；路由在 `apps/worker/scripts/app.ts` 的 `createApi`。路径用 `path.resolve` 并校验落在 content 目录内，拒绝遍历；缺文件 404，非法日期 400。

## 前端

- `/daily`：列表（空态提示尚无日报）
- `/daily/:date`：详情，`react-markdown` + `remark-gfm` 渲染正文（表格、链接、emoji 标题）
- 导航：总览 → **日报**
- 样式：`apps/web/src/app/daily-page.css`（`.daily-md` 表格与标题）

## 样例

仓库自带 `content/macro-daily/2026-09-09.md`（potato style 占位样例），用于验收列表、GFM 表格与 emoji 标题渲染。样例行情标明「示例占位，非实时」，不得当作实盘报价。
