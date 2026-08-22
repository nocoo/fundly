# 12 · 选基体系

> 把「选基」做成完整信息架构：按金融问题拆页面，收益与风险并重，缺的指标本地算完写入 SQLite。
>
> 相关文档：
> - [02-SCHEMA.md](./02-SCHEMA.md) — 已有表
> - [03-SCRIPTS.md](./03-SCRIPTS.md) — 实现时同步 `compute:select` 与刷新顺序
> - [06-ARCH-UI.md](./06-ARCH-UI.md) — 现路由（实现时改掉 `/ranking`）
> - [08-BACKY.md](./08-BACKY.md) — schema 升级必须能过 `assertFundlyDb`
> - [11-PHASE2-REPORT.md](./11-PHASE2-REPORT.md) — 卫星表实测覆盖

---

## 产品立场

Fundly 是**私人选基工作台**，不是投顾。页面回答「在给定约束下，谁在哪一个维度更好」，不输出买卖建议或收益承诺。

**比较域（peer）= 完整 `fund_type`**（如 `混合型-偏股`），与现网 `rank_pct_*`、`pass_4433`（`src/metrics/ranks.ts`）一致。侧栏「大类」是 **L1 过滤器**（`splitFundType` 的前半段），用来收窄列表，**不改变百分位分母**。禁止把 L1 说成和 `rank_pct_*` 同一口径。

默认必须带一个 L1（见下表），URL 不得默认为 `typeL1=all`。用户显式选「全部」时，收益/精选页继续显示跨类型警告。

---

## 现状缺口

| 已有 | 缺什么 |
|------|--------|
| `/funds` 浏览、`/ranking` 单表切维度 | 分组名叫「排名」，没有按决策问题拆开的下属页 |
| `fund_performance` 阶段收益 + 同类百分位 + `pass_4433` | 库里 `return_3y` / `return_5y` / `return_ytd` **实测全空**；`rank:refresh` 只临时算 3y/5y 百分位；YTD 抓取固定为空 |
| `fund_risk_metrics` 26,072 只 / 10 秒 | 有 1y/3y/5y 的波动、回撤、夏普、年化；**没有** `sortino_5y`、`calmar_5y`。没有溃疡、水下、连跌 |
| `fund_fees` 27,527 行，管理费 27,055、托管 27,526、销服 **22,168** 非空 | 销服 `null` 不能当 0；没有合成持有成本 |
| `fund_nav` 3,069 万行 | 没有定投路径指标 |
| `02-SCHEMA` 写了 `fund_screening_rank` | **schema.ts 没有这张表** |

---

## 信息架构

侧栏分组改回 **选基**。

| 路径 | 页面 | 问题 | 默认 L1 | 默认排序 |
|------|------|------|---------|----------|
| `/funds` | 浏览 | 叫什么、哪一类 | （无，检索页） | `fund_code` 升 |
| `/select/return` | 收益 | 谁赚得多、同类是否领先 | 混合型 | `return_1y` 降 |
| `/select/risk` | 风险 | 谁回撤浅、波动低、回撤后还能赚 | 混合型 | `max_drawdown_1y` 升 |
| `/select/hold` | 持有体验 | 谁少熬、少长期套、少连阴 | 混合型 | `ulcer_1y` 升 |
| `/select/dca` | 定投 | 谁更适合每月定额买 | 混合型 | `dca_cagr_3y` 降 |
| `/select/cost` | 成本 | 一年持有大概付多少 | 混合型 | `all_in_fee_pct` 升 |
| `/select/picks` | 精选 | 多条件同时过线 | 混合型 | `select_score` **降**（分高更好） |

`/ranking` **不再作为页面**：路由 `Navigate` 到 `/select/return`（保留 query）。`list-origin` 读到旧 `/ranking` 时改写成 `/select/return`。localStorage `fundly_ranking_filters` 读一次后写入 `fundly_select_return`，再删旧 key。

各榜 URL 参数（`select-vm` 规范化，与现 `ranking-vm` 同套路）：

| 参数 | 含义 |
|------|------|
| `typeL1` | 大类，缺省=该页默认，禁止默默变成 all |
| `typeL2` | 细类，完整 `fund_type` |
| `mvpOnly` | `1` 只看 MVP 池 |
| `dim` | 该页可排序列，缺省=上表默认排序列 |
| `page` | 从 1 |
| 精选另加 | `pass4433` `feePeer` `ddPeer` `minSamples`，值 `off` 或百分位上限（默认 50） |

localStorage key：`fundly_select_<lens>`。分页 50。点行进详情，来源记 `/select/<lens>?…`。

---

## 指标口径

**百分位**：在完整 `fund_type` 内，**越小越靠前**（与现列一致）。样本不足 → `null`，不排序、不当 0。

无风险利率 **2%**，年化 **252** 日。见 `src/analytics/risk-metrics.ts`。

### 收益页

**只展示库里有数的窗口**：`return_1m/3m/6m/1y` 及对应 `rank_pct_*`。不把空的 `return_3y/5y/ytd` 画成列。

3y/5y 若以后要上：在 `rank:refresh` **写回** `fund_performance.return_3y/5y`（今日只写了百分位），再开列。YTD 要么从当年首个净值算并落列，要么继续不做。第一期都不做。

货币基金：默认 L1 不是货币，进「货币型」时收益列改用**每只最新** `fund_money_yield.seven_day_yield`（`/api/funds` 增加该字段与 sort key `seven_day_yield`；SQL 用按 `fund_code` 取 `MAX(nav_date)` 的一行，禁止扫全表无索引）。无单位净值路径时不显示 `return_*`。

### 风险页

只用**现有列**：

| 列 | 周期 | 好方向 |
|----|------|--------|
| `volatility_1y/3y/5y` | 有 | 低 |
| `max_drawdown_1y/3y/5y` + `max_drawdown_all` | 有 | 低 |
| `sharpe_1y/3y/5y` | 有 | 高 |
| `sortino_1y/3y` | **无 5y** | 高 |
| `calmar_1y/3y` | **无 5y** | 高 |
| `nav_samples_*` | 1y/3y/5y | 门槛 |

默认 `max_drawdown_1y`。切到 3y 维时门槛改用对应 `nav_samples_3y ≥ 200`，不要永远绑 `nav_samples_1y`（实现时改 `fund-query.ts`）。

### 持有体验（新算）

描述时间折磨，不是回撤深度。

| 字段 | 定义 | 窗 | 最少样本 |
|------|------|----|----------|
| `ulcer_1y` | 相对峰值回撤平方的均方根 | 1y | 200 |
| `underwater_ratio_1y` | 低于滚动峰值的交易日占比 | 1y | 200 |
| `max_underwater_days_1y` | 最长连续水下交易日 | 1y | 200 |
| `max_consec_down_1y` | 最长连续日跌 | 1y | 60 |
| `down_day_ratio_1y` | 日收益 < 0 占比 | 1y | 60 |
| `worst_month_1y` | 最差自然月收益 % | 1y | 10 个完整月 |
| `recovery_days_1y` | 窗内最大回撤后回到峰的交易日；未收复 null | 1y | 200 |

路径：有 `acc_nav` 用累计净值（含分红再投资近似），否则 `unit_nav`。货基 / 无单位净值：整行 null。

### 定投（新算）

**财富路径用累计净值 `acc_nav`**（把现金分红近似成再投资）。没有 `acc_nav` 则整段 null，不用 `unit_nav` 冒充总回报。扣款：每月最后一个有净值日投入 1 元到该日 `acc_nav`，忽略申购费。拆分已反映在净值序列里，不再单独调。

| 字段 | 定义 | 窗 |
|------|------|----|
| `dca_cagr_3y` | 月定投 IRR 年化 % | 36 个月 |
| `dca_vs_lump_3y` | 定投终值 / 期初一次性终值 − 1 | 36 个月 |
| `dca_month_win_3y` | 月收益 > 0 月份占比 | 36 个月 |
| `dca_month_vol_3y` | 月收益标准差年化 | 36 个月 |

至少 30 个扣款月。`dca_vs_lump` 只解释，不默认排序。

### 成本

**只派生、不复制**申赎上限（上限继续 JOIN `fund_fees`）。

| 字段 | 定义 |
|------|------|
| `all_in_fee_pct` | `mgmt_fee_pct + custodian_fee_pct + sales`；管理或托管为 null → **整项 null** |
| `sales_fee_known` | 销服非空为 1，否则 0 |
| `share_class` | 简称末尾 `A/C/H/I/E/B` 等，失败为空 |
| `share_group_key` | 去掉末尾份额记号后的名称规范化字符串，供 A/C 对照 |

销服 null **不得当 0**。成本榜与精选费率规则：**排除** `all_in_fee_pct IS NULL`。销服未知时仍展示管理+托管，并标「销服未知」，但不参与「前 50% 便宜」筛选。

A/C 对照：同 `share_group_key` 的兄弟份额用详情 API `GET /api/funds/:code/siblings` 一次返回，不靠当前页拼盘。分组失败则无对照，不猜。

### 精选

默认规则（query 可关）：

| 规则 | 默认 | 关 |
|------|------|----|
| L1 已选 | 混合型 | `typeL1=all` |
| `pass_4433=1` | 开 | `pass4433=off` |
| `nav_samples_1y ≥ 200` | 开 | `minSamples=off` |
| 综合费同类百分位 ≤ 50（仅 `sales_fee_known=1` 且 fee 非空） | 开 | `feePeer=off` |
| 近 1 年回撤同类百分位 ≤ 50 | 开 | `ddPeer=off` |

「同类前 50%」在 **完整 `fund_type`** 内算。实现：**查询时** SQL 窗口函数（`PERCENT_RANK()` / 自算秩），不另存一张快照表。空值不进分母。

**综合分 `select_score`（越高越好，0–100）**：

```
select_score = mean(
  100 - rank_pct_1y,
  100 - calmar_pct_1y,      -- calmar 越高，百分位应越小；窗口按 calmar 降序编秩
  100 - ulcer_pct_1y,       -- ulcer 越低越好，升序编秩后取「越小越前」的 pct
  100 - fee_pct             -- 费率越低越好
)
```

这里的 `*_pct` 与现网一样是 **0–100、越小越靠前**。综合分先把它们翻成「越大越好」再平均。默认 **降序**。缺维跳过，少于两维 → `select_score` null，排在有分的后面。

API：`GET /api/funds?lens=picks&typeL1=混合型&pass4433=1&feePeer=50&ddPeer=50&sort=select_score&dir=desc`。

并列：秩用竞争名次（1,2,2,4），百分位 `(rank-1)/(n-1)*100`，n=1 则为 0。

---

## 数据与迁移

### `fund_select_metrics`（schema **3**）

只存派生列：体验 7 项、定投 4 项、`all_in_fee_pct`、`sales_fee_known`、`share_class`、`share_group_key`、`select_score`、`score_asof`、`updated_at`。

**不要**再抄 `subscription_fee_max`、风险列、`return_*`。

### 升级路径（必须写进实现）

现网 `initSchema` 只 `INSERT` 当前 `SCHEMA_VERSION`，旧行仍在；`assertFundlyDb` 用无序 `LIMIT 1` 比版本（`src/backup/snapshot.ts`）。升 v3 时同一提交必须：

1. `CREATE TABLE IF NOT EXISTS fund_select_metrics …`
2. `schema_version` 写入 3 时 **按 version 定位**（`WHERE version = 3` upsert；校验改为 `MAX(version)` 或 `ORDER BY version DESC LIMIT 1`）
3. 生产 Volume 已有 v2 库：部署后跑一次 `bun run compute:select`（SSH 或本机），**不要**指望 `serve.ts` 第一次启动建空库
4. Backy：升级后用新校验跑通 `assertFundlyDb` 单测（夹具 version=3）

部署顺序：先发只建表、查询 `LEFT JOIN` 可空的 API → 再算数 → 再开体验/定投/成本/精选默认排序。收益/风险不依赖新表，可与建表同发。

### 刷新顺序（与现脚本对齐）

现网 `fetch:daily` **不会**跑风险或排名。正确依赖：

```
bun run fetch:daily
bun run rank:refresh
bun run compute:risk
bun run compute:select
```

`compute:select` 读 nav + fees + performance + risk，写 select 表并算 `select_score`。失败不回滚前三步。文档实现时写入 `docs/03-SCRIPTS.md`。

算库时打开独立连接、busy_timeout、不要和正在 `VACUUM` 的 backup 并行。WAL 下与只读 API 可共存；写的是小表。

### 计算文件

| 文件 | 职责 |
|------|------|
| `src/analytics/hold-metrics.ts` | 溃疡/水下/连跌/最差月/收复 |
| `src/analytics/dca-metrics.ts` | 月定投，输入必须是 acc_nav 序列 |
| `src/analytics/cost-metrics.ts` | 综合费、销服是否已知、份额与 group key |
| `src/metrics/select-score.ts` | 把已有百分位翻成 `select_score` |
| `scripts/compute-select-metrics.ts` | 批算写入 |
| `package.json` | `compute:select` |

货币/无 acc_nav：体验、定投 null；成本仍可算。

---

## 代码落点

| 层 | 路径 |
|----|------|
| DDL + 版本校验 | `src/db/schema.ts`、`src/db/repo.ts`、`src/backup/snapshot.ts` |
| 文档 | `02-SCHEMA.md`（删 `fund_screening_rank`）、`03-SCRIPTS.md`、`06-ARCH-UI.md` |
| 列表 SQL | `apps/worker/src/lib/fund-query.ts`：新 sort、lens=picks 过滤、货基最新七日、按维切换 `minSamples` 列 |
| 详情兄弟份额 | `apps/worker/scripts/app.ts` `GET /api/funds/:code/siblings` |
| 导航/路由 | `navigation.ts`、`App.tsx`：`/select/:lens`，`/ranking` → `/select/return` |
| VM/页 | `select-vm.ts`、`select-page.tsx`；`ranking-vm` 只留重定向/存储迁移 |
| 来源 | `list-origin.ts` 识别 `/select/*`，兼容旧 `/ranking` |

---

## 原子化提交

1. `fix: compare schema version with max row`（Backy 校验，先于升版）
2. `feat: add select metrics table and compute`
3. `feat: expose select sort keys and picks filters`
4. `feat: add select pages and restore nav group`
5. `docs: sync schema scripts and ui for select`

---

## 6DQ

| 维 | 计划 |
|----|------|
| **L1** | hold/dca/cost/score/select-vm 纯函数；夹具含回撤再收复、无 acc_nav、销服 null、不足月 |
| **L2** | fund-query 新 sort / picks 窗口函数 / siblings；`assertFundlyDb` 在 v3 夹具上通过 |
| **L3** | 手测七页、`/ranking` 跳转、旧 localStorage 迁移、详情返回。不进 CI |
| **G1** | `bun run lint`、`typecheck`、`typecheck:web`、`test`、`test:web`；提交前 `test:coverage` |
| **G2** | 不新增依赖 |
| **D1** | 批算只写本机/Volume sqlite；单测 `:memory:` |

---

## 验收

- 侧栏「选基」七项；`/ranking` 打开即到收益页
- 收益列只有 1m/3m/6m/1y；风险没有虚构的 5y 索提诺/卡玛
- 体验/定投/成本在 `compute:select` 之后有数；销服未知不进「最便宜 50%」
- 精选规则可关；`select_score` 高分在前
- 默认带 L1；schema 升级后 Backy 校验与 Volume 旧库有明确步骤

## 不做

- 组合优化、税收、自定义权重
- 东财五维雷达当主分
- 未实测的全市场批算耗时
- 把销服 null 当 0
- 新建 `fund_screening_rank`
