# 17 · 财经日报

仓库内研究向 Markdown 日报：写入 `content/macro-daily/` 后，本机 / Railway 容器从磁盘读取并展示，无需灌库。定位为**跨资产研究摘要**，不是聊天流、不是行业涨停屏。

## 内容契约（正文区块顺序固定）

文件：`content/macro-daily/YYYY-MM-DD.md`

### Frontmatter（必填）

```yaml
---
title: 财经日报
date: YYYY-MM-DD
weekday: 周三
summary: 一行专业摘要（跨资产读法）
session: 美东上一交易日收盘；Asia/Shanghai 生成
methodology: 美股以 Yahoo 收盘为主；A 股来自本地 SQLite……
sources: [Yahoo Finance, FRED, Tavily]
---
```

| 字段 | 说明 |
|------|------|
| `title` | 默认「财经日报」；可带日期后缀，**不要** emoji 装饰标题 |
| `date` | 必须与文件名一致（`YYYY-MM-DD`） |
| `weekday` | 中文星期（周一…周日） |
| `summary` | 列表卡与详情 header 使用的一行摘要 |
| `session` | 会话/时区口径，如美东收盘 + Asia/Shanghai 生成 |
| `methodology` | **可选**。数据口径 / 来源说明（原正文 `> 口径：…` blockquote）。详情 header 的 DataInfo 展示；**不要**再写进 section 正文 |
| `sources` | 字符串数组；列表以 muted chips 展示 |

占位样例须在 `sources` 旁注或 `methodology` 中写明「示例占位，非实时行情」，**不得**伪装成实盘精度。**禁止**在 section 正文用 `> 口径：…` 胖 blockquote 占宽；口径走 frontmatter + header DataInfo（遗留稿若仍有 leading/trailing 口径 quote，前端会 peel 到 section 标题旁 circled **i**）。

### 正文 H2 区块（必须按此顺序，标题尽量无 emoji）

| # | 标题 | 要求 |
|---|------|------|
| 1 | `## 概述` | **Thesis first**：3–6 条无序列表（跨资产读法 + 相对前一交易日变化）；**不要**长散文段与口径 blockquote 混排 |
| 2 | `## 全球宏观` | **短 bullet 点评在上**，再接 **GFM 表**。优先列序：`标的 \| 涨跌 \| 最新 \| 备注`（旧样例 `标的 \| 最新 \| 涨跌 \| 备注` 仍可解析）。行至少：S&P 500、NASDAQ、Dow、VIX、US 10Y、DXY（或 broad USD）、crude（USO 或 WTI）、USD/CNY。遗留「仅表后散文」会被前端提升为表前点评 |
| 3 | `## 贵金属` | 同上：bullet 点评 → 表。Gold futures / GLD；沪金可知则写 |
| 4 | `## 科技龙头` | 同上：bullet 点评 → 表。精选 mega-cap（如 TSM、GOOGL、META、AMZN、MSFT、AAPL、NVDA）。**旧标题** `## 科技龙头观察` 仍被前端接受 |
| 5 | `## 中国资产` | 同上：bullet 点评 → 表。**指数 + 代表性 ETF + 行业/主题 ETF**（及可选 ADR）。不限于 FXI / KWEB / MCHI / BABA。**旧标题** `## 中国相关资产` 仍被前端接受 |
| 6 | `## 好消息` | 无序/有序列表：当日偏正面的事实或叙事（可带来源链接） |
| 7 | `## 坏消息` | 无序/有序列表：当日偏负面的事实或叙事；与好消息形成 **two-list 冲突 framing**。可选短「冲突读法」作为列表最后一条（**不要**列表后另起长散文段） |
| 8 | `## 观察要点` | 下一交易时段关注点（无序列表） |
| 9 | 页脚 | 单独一行：`仅供信息参考，不构成投资建议。` |

表格用 GitHub Flavored Markdown。前端将表段解析为 Basalt `Table`，散文段用 `react-markdown` + `remark-gfm`。UI 会给 section 标题补 tasteful emoji；**Markdown 源标题保持纯文字、不加 emoji**。

布局：概述|观察要点、好消息|坏消息 为 2×2 散文卡；维度表在下方。有界宽模式约 `78rem`（可切全宽）。

**向后兼容**：前端 `isTableSection` / `formatSectionTitle` 同时识别新旧 H2（`科技龙头` ↔ `科技龙头观察`，`中国资产` ↔ `中国相关资产`；旧 `要闻` 仍可渲染）。`content/macro-daily/2026-09-09.md` 与 `2026-09-10.md` 已按本契约（bullet 概述、methodology frontmatter、表前点评）；**UI 仍必须两种标题都吃**，以便历史文件可读。

### 明确不做

- **不要**做行业涨跌幅榜、涨停池、龙虎榜、全市场选股扫描等「行业 / 涨停屏」
- **不要**把宏观大屏或选股选 ETF 的列表逻辑搬进日报
- **不要**模仿 potato / Slack 聊天流审美，不要 potato 品牌文案
- 精选 mega-cap（科技龙头）与中国资产（指数 + ETF）**是契约内的固定块**，不是「个股推荐清单」的扩展口；中国资产可覆盖主题 ETF，但目的仍是跨资产读法，不是选股池
- section 标题优先纯文字，避免 emoji 堆砌（emoji 由 UI 层添加）
- **不要**再写单独的 `## 要闻` 作为主契约（旧文件可保留；新稿用好消息 / 坏消息 dual list）

行业下钻、ETF/股票筛选走宏观大屏与 `/select-*` 流程，见 docs/13–16。

## 写入流程

1. 新建 `content/macro-daily/YYYY-MM-DD.md`（参考同目录 `2026-09-09.md` 样例）。
2. 按上方契约写 YAML + 固定 H2 顺序正文。
3. 提交并部署；容器 `COPY . .` 带上 `content/`，Worker 读 `repoRoot/content/macro-daily`。
4. 打开 `/daily` 列表、`/daily/YYYY-MM-DD` 详情。

无需采集脚本，也无需改 SQLite。

## API（需登录会话）

| 方法 | 路径 | 响应 |
|------|------|------|
| `GET` | `/api/daily` | `[{ date, title, summary, path, weekday?, session?, methodology?, sources? }]`，按日期新到旧 |
| `GET` | `/api/daily/:date` | `{ date, title, summary, markdown, weekday?, session?, methodology?, sources? }`；`:date` 须为 `YYYY-MM-DD` |

实现：`apps/worker/src/lib/daily-service.ts`；路由在 `apps/worker/scripts/app.ts` 的 `createApi`。路径用 `path.resolve` 并校验落在 content 目录内，拒绝遍历；缺文件 404，非法日期 400。

## 前端

- `/daily`：AppShell + ResearchHeader「财经日报」、Newspaper 图标；LayerCard 行展示日期（等宽）、星期、摘要、来源 chips；ResearchEmpty 处理空/错；宽度模式 localStorage `fundly_daily_width_mode`（有界 / 全宽）
- `/daily/:date`：**混合渲染**——按 `##` 拆段；顶部 2×2 散文卡（概述|观察要点，好消息|坏消息）；全球宏观 / 贵金属 / 科技龙头（及旧名）/ 中国资产（及旧名）→ **表前 bullet 点评** + Basalt Table（涨跌视觉主列）；页脚 disclaimer；可选 StatTile；header DataInfo 展示 `session` / `methodology` / `sources`；section 若仍残留口径 note，标题旁 circled **i** Popover
- 导航：总览 → **日报**（靠近宏观大屏），Newspaper 图标，专业文案
- 样式：`apps/web/src/app/daily-page.css`（有界宽 `78rem`、列表对齐、研究向表格密度、等宽数字、muted 表头、散文双卡 grid）

## 样例

仓库自带 `content/macro-daily/2026-09-09.md`、`2026-09-10.md`（实采样例），用于验收列表、GFM 表解析、涨跌主列、表前点评与好消息/坏消息双卡。口径在 frontmatter `methodology`，不得当作未经注明的实盘精度。前端同时接受新旧 H2，以便历史稿可读。
