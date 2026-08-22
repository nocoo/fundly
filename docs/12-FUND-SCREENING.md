# 12 · 选基体系

> 把「选基」做成完整信息架构：按金融问题拆页面，收益与风险并重，缺的指标本地算完写入 SQLite。
>
> 相关文档：
> - [02-SCHEMA.md](./02-SCHEMA.md) — 已有表
> - [06-ARCH-UI.md](./06-ARCH-UI.md) — 现路由
> - [11-PHASE2-REPORT.md](./11-PHASE2-REPORT.md) — 卫星表实测覆盖

---

## 产品立场

Fundly 是**私人选基工作台**，不是投顾。页面回答的是「在给定约束下，谁在哪一个维度更好」，不输出买卖建议、目标仓位或收益承诺。

同类比较必须**先分域再排名**：股票/偏股、纯债、货币、QDII、商品不能混在一张「全市场收益榜」里当同一比赛。现网 `/ranking` 默认大类「混合型」是对的；未选大类时货币与股票同榜，页面已有警告，新体系里默认禁止跨大类比收益。

---

## 现状缺口

| 已有 | 缺什么 |
|------|--------|
| `/funds` 浏览、`/ranking` 单表切维度 | 「选基」被改成「排名」，数据管理已进设置；没有按决策问题拆开的下属页 |
| `fund_performance` 阶段收益 + 同类百分位 + `pass_4433` | 4433 只是一个 0/1，没有「质量」页把过线原因摊开 |
| `fund_risk_metrics`：波动、回撤、夏普、索提诺、卡玛（1y/3y/5y），26,072 只 / 10 秒算完 | 没有水下时间、溃疡指数、连跌、最差月——这些才是「持有体验」 |
| `fund_fees`：管理/托管/销服/申赎上限，27,055 只有效费率 | 没有合成「持有成本」，A/C 份额没有对照 |
| `fund_nav` 3,069 万行 | 没有定投路径指标（月定投 IRR、定投 vs 一次性） |
| `fund_manager_link` 在任任期 | 经理稳定性没进榜 |
| `02-SCHEMA` 写了 `fund_screening_rank` | **schema.ts 里没有这张表**，不能当已交付 |

`/ranking` 已有收益四档 + 夏普/回撤/波动/卡玛，但是**一个页面堆所有维度**，用户无法按「我怕回撤 / 我要定投 / 我嫌贵」进门。

---

## 信息架构

侧栏分组名改回 **选基**。下属页面按**决策问题**而不是按数据表：

| 路径 | 页面 | 回答的问题 | 默认排序 |
|------|------|------------|----------|
| `/funds` | 浏览 | 这只基金叫什么、属哪类 | 代码 |
| `/select/return` | 收益 | 同类里谁赚得多、是否稳定领先 | `return_1y` 降序 |
| `/select/risk` | 风险 | 谁波动小、回撤浅、回撤后恢复赚 | `max_drawdown_1y` 升序 |
| `/select/hold` | 持有体验 | 谁让人少熬、少长期套、少连阴 | `ulcer_1y` 升序 |
| `/select/dca` | 定投 | 谁更适合每月固定买入 | `dca_cagr_3y` 降序 |
| `/select/cost` | 成本 | 持有一年大概要付多少、A/C 谁便宜 | `all_in_fee_pct` 升序 |
| `/select/picks` | 精选 | 多条件同时过线的短名单 | 综合分降序 |

现网 `/ranking` **删除**，能力拆进收益/风险两页（默认维度不同）。`list-origin` 的合法来源从 `/ranking` 改为 `/select/*` + `/funds`。

导航写在 `apps/web/src/lib/navigation.ts`，页面不得手写 href 表。建议：

```
选基
  浏览      /funds
  收益      /select/return
  风险      /select/risk
  持有体验  /select/hold
  定投      /select/dca
  成本      /select/cost
  精选      /select/picks
```

系统组仍是备份、设置。仪表盘 `/` 只做库况，不承担选基。

各榜共用：大类（默认该页主域，禁止「全部」当默认）、细类、仅 MVP、分页 50、点行进详情并记住来源。过滤器继续进 localStorage，key 按页拆开。

---

## 指标口径

比较域 = `fund_type` 的 L1（`splitFundType`）。百分位一律 **同类内、越小越靠前**（与现 `rank_pct_*` 一致）。样本不足则该维 `null`，不参与该维排序，不编造 0。

无风险利率与现风险模块一致：**2%**，年化交易日 **252**。见 `src/analytics/risk-metrics.ts`。

### 收益页

直接读 `fund_performance`：`return_1m/3m/6m/1y/3y/5y/ytd` + 已有 `rank_pct_*`。展示「收益 + 同类%」两列，避免只看绝对收益。

货币基金用 `fund_money_yield.seven_day_yield` 近端，不把万份收益假装成净值涨跌。

### 风险页

读 `fund_risk_metrics`：

| 列 | 含义 | 好方向 |
|----|------|--------|
| `volatility_*` | 年化波动 % | 低 |
| `max_drawdown_*` | 最大回撤 %（正数=亏多少） | 低 |
| `sharpe_*` | (年化 − 2%) / 年化波动 | 高 |
| `sortino_*` | 只罚下行波动 | 高 |
| `calmar_*` | 年化 / 最大回撤 | 高 |

默认近 1 年回撤。样本：现网风险榜要求 `nav_samples_1y ≥ 200`（`RISK_MIN_SAMPLES`），本体系沿用。

### 持有体验页（新算）

回撤深度已经在风险页。体验描述的是**时间折磨**：

| 字段 | 定义 | 窗口 | 最少样本 |
|------|------|------|----------|
| `ulcer_1y` | 溃疡指数：相对峰值回撤平方的均方根 | 1y | 200 |
| `underwater_ratio_1y` | 收盘价低于窗口内滚动峰值的交易日占比 | 1y | 200 |
| `max_underwater_days_1y` | 最长连续水下交易日 | 1y | 200 |
| `max_consec_down_1y` | 最长连续日跌交易日 | 1y | 60 |
| `down_day_ratio_1y` | 日收益 < 0 的占比 | 1y | 60 |
| `worst_month_1y` | 最差自然月收益 % | 1y | 10 个完整月 |
| `recovery_days_1y` | 窗口内最大回撤后回到峰值的交易日；未收复则 null | 1y | 200 |

峰值用**窗口内累计净值**（优先 `acc_nav`，否则 `unit_nav`）。货币基金不定体验榜（没有可比单位净值路径则整行 null）。

### 定投页（新算）

模拟：每个月最后一个有净值的交易日买入 1 元，忽略申购费（费放成本页）。

| 字段 | 定义 | 窗口 |
|------|------|------|
| `dca_cagr_3y` | 月定投内部收益率年化 % | 36 个月 |
| `dca_vs_lump_3y` | 定投终值 / 同等期初一次性终值 − 1 | 36 个月 |
| `dca_month_win_3y` | 月收益 > 0 的月份占比 | 36 个月 |
| `dca_month_vol_3y` | 月收益标准差（年化） | 36 个月 |

至少 30 个扣款月才出数。定投友好：**月波动低、月胜率高、路径别太尖**。`dca_vs_lump` 只作解释列（震荡市定投常优于一次性，单边市相反），**不作为默认排序**。

### 成本页

| 字段 | 定义 |
|------|------|
| `all_in_fee_pct` | `mgmt_fee_pct + custodian_fee_pct + COALESCE(sales_service_fee_pct, 0)` |
| `subscription_fee_max` / `redemption_fee_max` | 已有上限，展示用 |
| `share_class` | 从简称解析 A/C/H 等；解析失败为空 |

C 类通常申购费低、销服年费高；A 类相反。页上按**同一只基金的 A/C 对照**（名称去份额后缀后分组），方便选持有期。

不把申赎一次性费用摊进 `all_in_fee_pct`（持有期未知）。文案写明：一年持有成本 ≈ 综合年费；短期还要看赎回费阶梯（`raw_json`，详情页展开，榜上只用上限）。

### 精选页

默认规则（可关）：

1. 大类已选（默认混合型）
2. `pass_4433 = 1`（现口径，见 `src/db/ranks.ts`）
3. `nav_samples_1y ≥ 200`
4. `all_in_fee_pct` 同类不差于前 50%
5. `max_drawdown_1y` 同类不差于前 50%（回撤更浅）

综合分（0–100，同类分位再等权）：

`score = mean(pct_return_1y, pct_calmar_1y, pct_ulcer_1y_inverted, pct_all_in_fee_inverted)`

缺维则该维不进均值，少于两维则不出分。权重写死在 `src/metrics/select-score.ts`，第一期不做用户自定义。

---

## 数据：缺什么就算什么

### 新表 `fund_select_metrics`（`SCHEMA_VERSION` 2 → 3）

主键 `fund_code`。列即上节体验/定投/成本字段 + `share_class` + `score` + `score_asof` + `updated_at`。

不把已有风险列再抄一份。榜查询 `LEFT JOIN fund_risk_metrics` + `fund_select_metrics` + `fund_fees` + `fund_performance`。

`fund_screening_rank` **不要建**。精选是查询时过滤，不是第三份快照。

### 计算入口

新文件：

| 文件 | 职责 |
|------|------|
| `src/analytics/hold-metrics.ts` | 溃疡、水下、连跌、最差月、收复 |
| `src/analytics/dca-metrics.ts` | 月定投路径 |
| `src/analytics/cost-metrics.ts` | 综合费、份额档 |
| `src/metrics/select-score.ts` | 精选综合分（纯函数） |
| `scripts/compute-select-metrics.ts` | 读 nav/fees，写入 `fund_select_metrics` |
| `package.json` | `compute:select` |

复用 `computeRiskMetrics` 的净值窗口切法。全市场预估与 `compute:risk` 同量级（26,072 只有净值）；定投还要按月抽样，预期仍是分钟内，**以上线后实测回填本文**，不在设计阶段估秒数。

`fetch:daily` 跑完风险后串 `compute:select`。首次：`bun run compute:select`。

货币/无单位净值：体验与定投整行 null，成本仍可算。

### 不爬的数据

- 基金公司全称：`fund_manager.company` 现为空，成本/精选不依赖它
- 精确赎回阶梯：只在详情展开 `fund_fees.raw_json`
- 实时申购状态、限额、盘中估值：不做

---

## 代码落点

| 层 | 路径 | 改动 |
|----|------|------|
| DDL | `src/db/schema.ts` | v3 + `fund_select_metrics` 及索引（ulcer、dca_cagr、all_in_fee） |
| 文档 | `docs/02-SCHEMA.md` | 同步 DDL；删掉未实现的 `fund_screening_rank` |
| 列表 SQL | `apps/worker/src/lib/fund-query.ts` | 新 sort key：`ulcer_1y`、`dca_cagr_3y`、`all_in_fee_pct` 等 |
| API | `apps/worker/scripts/app.ts` | 仍走 `/api/funds`，靠 query 区分页 |
| 导航 | `apps/web/src/lib/navigation.ts` | 分组改回选基，七个子项 |
| 路由 | `apps/web/src/App.tsx` | `/select/:lens`；删除 `/ranking` |
| 榜 VM | `apps/web/src/lib/select-vm.ts` | 各页默认维、列、空态文案（从 `ranking-vm.ts` 长出来） |
| 页面 | `apps/web/src/app/select-page.tsx` | 一页多 lens，列配置来自 VM |
| 来源 | `apps/web/src/lib/list-origin.ts` | `/select/return` 等加入合法列表路径 |
| 详情 | 成本区展示 `all_in_fee_pct` + A/C 提示 | 只读 |

浏览页 `/funds` 保持检索，不改成榜。

---

## 原子化提交

1. `feat: add select metrics table and compute`
2. `feat: expose select sort keys on fund list api`
3. `feat: add select pages and restore nav group`
4. `docs: sync schema and ui for select system`

每步可 `bun test` / `bun test:web`。算库脚本单独可跑，不进 CI 全量扫 3.7GB。

---

## 6DQ

| 维 | 计划 |
|----|------|
| **L1** | `hold-metrics` / `dca-metrics` / `cost-metrics` / `select-score` / `select-vm` 纯函数单测，覆盖率与仓库门槛一致。构造含回撤再收复、不足月、货基无净值的夹具。 |
| **L2** | `fund-query` 新 sort 的 SQL 单测；`getDataStats` 不依赖新表也能跑。不在 CI 打东财。 |
| **L3** | 手测：选基七页切换、大类默认、从定投进详情再返回、过滤器 localStorage。不进 CI。 |
| **G1** | `bun run lint` + `typecheck` + `typecheck:web` |
| **G2** | 不新增依赖；密钥不进新表 |
| **D1** | 计算脚本只写本机/Volume 的 `fundly.db`，单测用 `:memory:` |

---

## 验收

- 侧栏看到「选基」及七个子页，没有单独的「排名」分组，没有 `/ranking`
- 收益/风险用旧表即能排序；体验/定投/成本在 `compute:select` 之后有数
- 精选默认五条规则可理解、可关；综合分缺维不编造
- 跨大类比收益不是默认
- 详情返回仍回到对应 `/select/...` 或 `/funds`

## 不做

- 不做组合优化、再平衡、税收
- 不做用户自定义因子权重（第一期）
- 不把东财五维雷达当精选主分（`performance_5d_json` 仅详情）
- 不在设计里写未实测的全市场计算耗时
