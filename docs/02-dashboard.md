# 02 — 仪表盘

> `/` 的信息架构。现在是占位页；采集库就绪后再填真实数字。
>
> 前置：[01-arch-ui.md](./01-arch-ui.md)

---

## 这一页干什么

仪表盘是登录后的第一屏，回答三件事：

1. 库里现在有多少基金、MVP 池多大
2. 净值数据新不新
3. 选基规则跑完了没有（4433 过线数、榜单入口）

它不是行情大盘，也不放个股 K 线。市场指数、快讯留给以后，不进 MVP。

---

## 布局

沿用 Surety AppShell：左侧 Sidebar，右侧浮动卡片。

```
┌─────────────────────────────────────────────────────┐
│ 面包屑：首页                                         │
├──────────────┬──────────────┬───────────────────────┤
│ 全市场基金    │ MVP 分析池    │ 最新净值日             │
│  --          │  --          │  --                   │
├──────────────┴──────────────┴───────────────────────┤
│ 选基入口                                             │
│   浏览基金 → /funds                                  │
│   排名榜   → /ranking                                │
├─────────────────────────────────────────────────────┤
│ 占位说明：采集完成后这里出现 4433 过线数 / 失败抓取   │
└─────────────────────────────────────────────────────┘
```

移动端三张指标卡改为单列。

---

## ViewModel

文件：`apps/web/src/lib/dashboard-vm.ts`

页面只消费已经算好的快照，不在组件里拼文案或空态规则。

```ts
export type DashboardStatus = 'placeholder' | 'ready' | 'error';

export interface DashboardSnapshot {
  status: DashboardStatus;
  fundCount: number | null;
  mvpCount: number | null;
  lastNavDate: string | null; // YYYY-MM-DD
  pass4433Count: number | null;
  failedFetchCount: number | null;
  message: string;
}
```

| `status` | 页面 |
|----------|------|
| `placeholder` | EmptyState：「数据接入中」+ 去浏览 / 排名的链接 |
| `ready` | 三张指标卡 + 选基入口 + 失败抓取提示（若有） |
| `error` | EmptyState tone=error + 重试 |

当前 Worker 没有 `/api/dashboard`。页面用 `emptyDashboard()` 得到 `placeholder` 快照，不发网络请求。接上 API 后：`useSWR('/api/dashboard', fetchAPI)` → 同一套 View 分支。

---

## 指标口径（等数据面）

数字必须和 [SCHEMA.md](./SCHEMA.md) 一致，禁止前端自己再滤一遍类型。

| 字段 | 来源 | 口径 |
|------|------|------|
| `fundCount` | `fund_basic_info` | `COUNT(*)` |
| `mvpCount` | `fund_basic_info` | `in_mvp_pool = 1` |
| `lastNavDate` | `fund_nav` | `MAX(nav_date)` |
| `pass4433Count` | `fund_performance` | `pass_4433 = 1` |
| `failedFetchCount` | `fetch_log` | 最近一次全量任务里 `status = 'failed'` |

MVP 池类型白名单以 `src/utils/types.ts` 的 `MVP_FUND_TYPES` 为准，UI 不得复制一份。

---

## 空态文案

占位（现在）：

- 标题：数据还在采集
- 说明：全市场列表和净值由本地爬虫写入 SQLite。接上之后，这里会显示基金数量、最新净值和 4433 过线只数。
- 动作：浏览基金、查看排名（进同样的占位页，保证导航先跑通）

接口失败：

- 标题：仪表盘加载失败
- 动作：重试

库已接但零行：

- 标题：还没有基金数据
- 说明：先跑 `bun run fetch:list`

---

## 不做

- 不在仪表盘画净值曲线（放基金详情）
- 不在第一屏堆十个 KPI
- 不把筛选表单塞进仪表盘（那是 `/ranking`）
- 不读 `data/fundly.db` 的原始 JSON 字段

---

## 验收

现在：

- [x] `/` 包在 AppShell 里，Sidebar 高亮「仪表盘」
- [x] 桌面 / 窄屏都能看到占位 EmptyState
- [x] `emptyDashboard()` 有单测
- [ ] 不请求不存在的 `/api/dashboard`

接数据之后另开编号文档补：API 合同、指标卡视觉、失败抓取下钻。
