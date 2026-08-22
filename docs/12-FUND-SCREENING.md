# 12 · 选基体系

> 把「选基」做成完整信息架构：按金融问题拆页面，收益与风险并重，缺的指标本地算完写入 SQLite。
>
> 相关文档：
> - [02-SCHEMA.md](./02-SCHEMA.md) — 已有表（实现时删掉未落地的 `fund_screening_rank`）
> - [03-SCRIPTS.md](./03-SCRIPTS.md) — 实现时同步 `compute:select` / `refresh:select`
> - [06-ARCH-UI.md](./06-ARCH-UI.md) — 现路由（实现时改掉 `/ranking`）
> - [08-BACKY.md](./08-BACKY.md) — schema 升级必须能过 `assertFundlyDb`；旧 v2 快照走 restore-then-migrate
> - [09-RAILWAY.md](./09-RAILWAY.md) — 生产 Volume；`serve.ts` 只读
> - [11-PHASE2-REPORT.md](./11-PHASE2-REPORT.md) — 卫星表实测覆盖

---

## 产品立场

Fundly 是**私人选基工作台**，不是投顾。页面回答「在给定约束下，谁在哪一个维度更好」，不输出买卖建议或收益承诺。

公募基金不能只按近一年涨幅排队。同一涨幅背后可以是不同的回撤深度、水下时间、定投路径和持有成本。本体系按**决策问题**拆页，每页只回答一个问题，精选页再做交集。

| 页 | 金融问题 | 为什么单独成页 |
|----|----------|----------------|
| 浏览 | 这只基金是谁 | 检索，不做比较 |
| 收益 | 谁在窗口内赚得多、同类是否领先 | 收益是必要但不充分条件 |
| 风险 | 谁波动低、回撤浅、单位回撤还能赚 | 夏普/卡玛/回撤是风险调整后收益，不是「跌得少」的别名 |
| 持有体验 | 谁少让持有人长期套、少连阴 | 同样 20% 回撤，三个月收复和十八个月水下不是同一种折磨 |
| 定投 | 谁更适合每月定额买 | 路径依赖：波动可以把定投成本摊低，也可能长期不创新高 |
| 成本 | 一年持有大概付多少 | 费率是确定的负期望；销服未知不能当 0 |
| 精选 | 多条硬约束同时过线 | 交集，不是加权黑箱 |

**比较域（peer）= 完整 `fund_type`**（如 `混合型-偏股`），与现网 `rank_pct_*`、`pass_4433`（`src/metrics/ranks.ts`）一致。侧栏「大类」是 **L1 过滤器**（`splitFundType` 的前半段），用来收窄列表，**不改变百分位分母**。禁止把 L1 说成和 `rank_pct_*` 同一口径。

默认必须带一个 L1（见下表），URL 不得默认为 `typeL1=all`。用户显式选「全部」时，**所有选基页**（收益 / 风险 / 持有 / 定投 / 成本 / 精选）显示同一条跨类型警告：列表混排不可比，行内百分位仍按完整 `fund_type`。

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
| `apps/worker/scripts/app.ts` `openReadonlySqlite` | 生产 **`{ readonly: true }`**，**不会** `initSchema`（只在文件不存在时建空库）。Volume 上的活库缺表时 `JOIN` 会直接炸 |

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

### `/ranking` 退役

`/ranking` **不再作为页面**：`<Navigate>` 到对应选基页，**保留其余 query**。

| 旧 `dim` | 落到 |
|----------|------|
| 缺省、`return_1m` / `return_3m` / `return_6m` / `return_1y` | `/select/return` |
| `sharpe_1y` / `max_drawdown_1y` / `volatility_1y` / `calmar_1y` | `/select/risk` |
| 无法识别的 `dim` | `/select/return`，丢掉 `dim` |

`list-origin` 读到旧 `/ranking` 时按上表改写。localStorage `fundly_ranking_filters` 读一次：按其中 `dim` 写入 `fundly_select_return` 或 `fundly_select_risk`，再删旧 key。

### URL 参数

各榜 URL 由 `select-vm` 规范化，与现 `ranking-vm` 同套路。`typeL2` **必须是 L2 后缀**（`偏股`），**不是**完整 `fund_type`。现网 `fund-query.ts` 在同时有 L1/L2 时拼 `b.fund_type = ${typeL1}-${typeL2}`，与 `splitFundType` / `listTypeL2` 一致。

| 参数 | 含义 | 取值 |
|------|------|------|
| `typeL1` | 大类 | 缺省=该页默认；禁止默默变成 `all`；显式 `all` 才跨类 |
| `typeL2` | 细类后缀 | 如 `偏股`；空=该 L1 下全部细类 |
| `mvpOnly` | 只看 MVP 池 | `1` 或省略 |
| `dim` | 该页可排序列 | 缺省=上表默认排序列 |
| `page` | 页码 | 从 1 |
| `pass4433` | 精选：是否要求过 4433 | 缺省开（等价 `1`）；`off` 关闭。**不是**百分位 |
| `minSamples` | 样本门槛 | 缺省开（风险/持有/精选 = `200`）；`off` 关闭；或正整数。**不是**百分位 |
| `feePeer` | 精选：综合费同类百分位上限 | 缺省 `50`；`off` 关闭；或 `1`–`100` |
| `ddPeer` | 精选：近 1 年回撤同类百分位上限 | 缺省 `50`；`off` 关闭；或 `1`–`100` |

localStorage key：`fundly_select_<lens>`。分页 50。点行进详情，来源记 `/select/<lens>?…`。

---

## 指标口径

**百分位必须复用现网 `rankPct`**（`src/metrics/ranks.ts`）：

```
rank = betterCount + 1          -- 竞争名次 1,2,2,4
pct  = 100 * rank / n           -- 即 (betterCount + 1) / n * 100
```

越小越靠前。`n = 1` → `pct = 100`。样本不足或值为 null → 百分位 `null`，不排序、不当 0。

**禁止**另写 `(rank-1)/(n-1)*100` 或 `PERCENT_RANK()`（SQLite `PERCENT_RANK` 是 `(rank-1)/(n-1)`，与现网 `rank_pct_*` 不一致）。查询时用窗口 `RANK() OVER (...)` 得竞争名次，再 `100.0 * rank / n`；`n` 只计该维非空行。

无风险利率 **2%**，年化 **252** 日。见 `src/analytics/risk-metrics.ts`。

### 收益页

**只展示库里有数的窗口**：`return_1m/3m/6m/1y` 及对应 `rank_pct_*`。不把空的 `return_3y/5y/ytd` 画成列。

3y/5y 若以后要上：在 `rank:refresh` **写回** `fund_performance.return_3y/5y`（今日只写了百分位），再开列。YTD 要么从当年首个净值算并落列，要么继续不做。第一期都不做。

货币基金：默认 L1 不是货币。进入 `typeL1=货币型` 时：

- 收益列改用每只**最新且未过期**的 `fund_money_yield.seven_day_yield`
- `/api/funds` 增加该字段与 sort key `seven_day_yield`
- SQL：按 `fund_code` 取 `MAX(nav_date)` 那一行（主键 `(fund_code, nav_date)`，禁止无索引全表扫）
- **新鲜度**：该行 `nav_date >= date(market_asof, '-7 day')`，其中 `market_asof = (SELECT MAX(nav_date) FROM fund_money_yield)`。过期 → 字段 null，不参与排序
- 无单位净值路径时不显示 `return_*`

### 风险页

只用**现有列**（不新造 5y 索提诺/卡玛）：

| 列 | 周期 | 好方向 |
|----|------|--------|
| `volatility_1y/3y/5y` | 有 | 低 |
| `max_drawdown_1y/3y/5y` + `max_drawdown_all` | 有 | 低 |
| `sharpe_1y/3y/5y` | 有 | 高 |
| `sortino_1y/3y` | **无 5y** | 高 |
| `calmar_1y/3y` | **无 5y** | 高 |
| `nav_samples_*` | 1y/3y/5y | 门槛 |

默认 `max_drawdown_1y`。切到 3y / 5y 维时：

1. 样本门槛改用对应 `nav_samples_3y` / `nav_samples_5y ≥ 200`，不要永远绑 `nav_samples_1y`（实现时改 `fund-query.ts`）
2. **日历跨度门槛**（只靠样本数不够：成立 14 个月的基金也可以攒出 `nav_samples_3y ≥ 200`）

`compute:risk` 必须在写窗口指标前加跨度门：

```
spanDays = daysBetween(window.first.navDate, window.last.navDate)
if spanDays < 0.8 * windowDays: 该窗波动/回撤/夏普/索提诺/卡玛/年化全部写 null
nav_samples_* 仍写实际样本数
```

`windowDays` 与现实现一致：1y=365，3y=1095，5y=1825。即 3y 至少约 2.4 年、5y 至少约 4.0 年。此门写进 `src/analytics/risk-metrics.ts`，下次 `compute:risk` 覆盖旧值。选基页不再另算跨度。

### 持有体验（新算）

描述时间折磨，不是回撤深度。同样的最大回撤，溃疡指数高 = 深回撤持续更久。

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

溃疡：第 t 日回撤 `dd_t = 1 - nav_t / peak_t`（`peak_t` 为截至 t 的滚动峰值），`ulcer = 100 * sqrt(mean(dd_t^2))`。

### 定投（新算）

**财富路径只用累计净值 `acc_nav`**。没有 `acc_nav` 则整段 null，不用 `unit_nav` 冒充总回报。拆分已反映在净值序列里，不再单独调。忽略申购费。

扣款：以最新净值日为窗尾，向前 36 个自然月；每月最后一个有 `acc_nav` 的交易日投入 **1 元**。缺月跳过。有效扣款月 **N < 30** → 四个字段全 null。

**本金对齐**（必须写死，禁止实现时另选）：

- 定投现金流：每个扣款日 `Di` 流出 1，期末一次流入终值
- 定投份额 = `Σ 1 / acc_nav(Di)`，定投终值 `dca_fv = 份额 × acc_nav(Dend)`
- 一次性对照本金 = **N 元**（与定投现金流出合计相等），全部在 **首个扣款日 D0** 按当天 `acc_nav` 买入
- 一次性终值 `lump_fv = N / acc_nav(D0) × acc_nav(Dend)`
- `dca_vs_lump_3y = dca_fv / lump_fv - 1`

| 字段 | 定义 | 窗 |
|------|------|----|
| `dca_cagr_3y` | 上述现金流的 XIRR，再换算成年化 % | 至多 36 个月 |
| `dca_vs_lump_3y` | 定投终值 / 等额期初一次性终值 − 1 | 同上 |
| `dca_month_win_3y` | 相邻扣款日之间区间收益 > 0 的月份占比 | 同上 |
| `dca_month_vol_3y` | 上述月收益标准差 × `sqrt(12)` | 同上 |

`dca_vs_lump` 只解释，不默认排序。正值表示这段路径里定投终值高于「同等现金、第一天一次买完」。

### 成本

**只派生、不复制**申赎上限（上限继续 JOIN `fund_fees`）。

| 字段 | 定义 |
|------|------|
| `all_in_fee_pct` | `mgmt_fee_pct + custodian_fee_pct + sales_service_fee_pct`；管理或托管为 null → **整项 null** |
| `sales_fee_known` | 销服非空为 1，否则 0 |
| `share_class` | 见下方规则 |
| `share_group_key` | 见下方规则 |

销服 null **不得当 0**。成本榜与精选费率规则：**排除** `all_in_fee_pct IS NULL`。销服未知时仍展示管理+托管，并标「销服未知」，但不参与「前 50% 便宜」筛选。

#### 份额记号（必须按此解析，失败则不分组）

对 `fund_name` 去首尾空白后，只认**一次**末尾记号（先试长的）：

1. `(人民币|美元现汇|美元现钞|美元)?[ABCDEHI]类$`
2. `(人民币|美元现汇|美元现钞|美元)[ABCDEHI]$`
3. `[ABCDEHI]$`，且其前一个字符属于 `型股债指混接汇码FOFETFlofLOF`

命中则 `share_class` = 最后那个字母（大写）；`share_group_key` = 去掉该末尾记号后的名称再 `trim`。未命中、或去掉后长度 < 2 → `share_class=''`、`share_group_key=''`，**不猜**。

兄弟份额：`GET /api/funds/:code/siblings` 返回 `share_group_key` 相同且非空、`fund_code` 不同的全部行（代码、简称、份额、综合费、销服是否已知）。不靠当前列表页拼盘。

### 精选

默认规则（query 可关）：

| 规则 | 默认 | 关 |
|------|------|----|
| L1 已选 | 混合型 | `typeL1=all` |
| `pass_4433=1` | 开 | `pass4433=off` |
| `nav_samples_1y ≥ 200` | 开 | `minSamples=off` |
| 综合费同类百分位 ≤ 50（仅 `sales_fee_known=1` 且 fee 非空） | 开 | `feePeer=off` |
| 近 1 年回撤同类百分位 ≤ 50 | 开 | `ddPeer=off` |

「同类前 50%」在 **完整 `fund_type`** 内算，**先编秩、再套用户过滤**。禁止在已过滤子集上算百分位（否则 `pass4433` 会改变「前 50%」的分母）。

实现必须是两层 CTE，查询时算，不另存快照表：

```sql
WITH peer AS (
  -- 全市场行：只 JOIN 需要的表。这里不套 typeL1 / pass4433 / mvp / minSamples
  SELECT b.fund_code, b.fund_type, ...
  FROM fund_basic_info b
  LEFT JOIN fund_performance p ON p.fund_code = b.fund_code
  LEFT JOIN fund_risk_metrics r ON r.fund_code = b.fund_code
  LEFT JOIN fund_select_metrics s ON s.fund_code = b.fund_code
),
ranked AS (
  -- 百分位只在完整 fund_type 内、该维非空行上编
  SELECT *,
    100.0 * RANK() OVER (
      PARTITION BY fund_type
      ORDER BY all_in_fee_pct ASC
    ) / COUNT(all_in_fee_pct) OVER (PARTITION BY fund_type)
      AS fee_pct,
    100.0 * RANK() OVER (
      PARTITION BY fund_type
      ORDER BY max_drawdown_1y ASC
    ) / COUNT(max_drawdown_1y) OVER (PARTITION BY fund_type)
      AS dd_pct
  FROM peer
)
SELECT * FROM ranked
 WHERE /* 这里才套 typeL1 / typeL2 / mvp / pass4433 / minSamples */
   AND (feePeer off OR (sales_fee_known = 1 AND fee_pct <= :feePeer))
   AND (ddPeer  off OR dd_pct <= :ddPeer)
```

空值不进该维 `COUNT`。`RANK()` 是竞争名次，与 `assignRanks` 一致。

**综合分 `select_score`（越高越好，0–100）** 在 `compute:select` 时按同样 peer 口径写入表，查询不再重算：

```
select_score = mean(
  100 - rank_pct_1y,
  100 - calmar_pct_1y,      -- calmar 越高越好：按 calmar 降序编秩
  100 - ulcer_pct_1y,       -- ulcer 越低越好：升序编秩
  100 - fee_pct             -- 费率越低越好；sales_fee_known=0 或 fee null 则跳过该维
)
```

这里的 `*_pct` 与现网一样是 **0–100、越小越靠前**。缺维跳过，少于两维 → `select_score` null，排在有分的后面。默认 **降序**。

API：`GET /api/funds?lens=picks&typeL1=混合型&pass4433=1&feePeer=50&ddPeer=50&sort=select_score&dir=desc`。

---

## 数据与迁移

### `fund_select_metrics`（schema **3**）

只存派生列。主键 `fund_code`。**不要**再抄申赎上限、风险列、`return_*`。

```sql
CREATE TABLE IF NOT EXISTS fund_select_metrics (
  fund_code              TEXT PRIMARY KEY,
  ulcer_1y               REAL,
  underwater_ratio_1y    REAL,
  max_underwater_days_1y INTEGER,
  max_consec_down_1y     INTEGER,
  down_day_ratio_1y      REAL,
  worst_month_1y         REAL,
  recovery_days_1y       INTEGER,
  dca_cagr_3y            REAL,
  dca_vs_lump_3y         REAL,
  dca_month_win_3y       REAL,
  dca_month_vol_3y       REAL,
  all_in_fee_pct         REAL,
  sales_fee_known        INTEGER NOT NULL DEFAULT 0,
  share_class            TEXT NOT NULL DEFAULT '',
  share_group_key        TEXT NOT NULL DEFAULT '',
  select_score           REAL,
  score_asof             TEXT,
  updated_at             INTEGER NOT NULL,
  FOREIGN KEY (fund_code) REFERENCES fund_basic_info(fund_code)
);

CREATE INDEX IF NOT EXISTS idx_select_ulcer
  ON fund_select_metrics(ulcer_1y);
CREATE INDEX IF NOT EXISTS idx_select_dca
  ON fund_select_metrics(dca_cagr_3y DESC);
CREATE INDEX IF NOT EXISTS idx_select_fee
  ON fund_select_metrics(all_in_fee_pct);
CREATE INDEX IF NOT EXISTS idx_select_score
  ON fund_select_metrics(select_score DESC);
CREATE INDEX IF NOT EXISTS idx_select_share_group
  ON fund_select_metrics(share_group_key)
  WHERE share_group_key != '';
```

### 谁建表、谁只读

| 进程 | 打开方式 | 可否建表 |
|------|----------|----------|
| `serve.ts` / `dev:api` | `{ readonly: true }` | **否**。禁止在 boot 调 `initSchema` |
| `db:init` / `compute:select` / `compute:risk` / `refresh:select` | 读写 | 是。`compute:select` **必须**先 `initSchema` |
| `restore` | 读写 | 解压后先迁再校验 |

列表 SQL 沿用现网 `hasTable`：`fund_select_metrics` 不存在或无行时，体验/定投/成本/精选的 sort 回退到该页不依赖新表的列（收益/风险页本身不依赖新表），**禁止**对不存在的表 `JOIN`。

生产 Volume 已有 v2 库：部署 v3 代码后，在可写环境跑一次 `bun run compute:select`（Railway SSH 或本机对着同一文件），**不要**指望 `serve.ts` 第一次启动建表。

部署顺序：

1. 先发 API：`hasTable` 守卫 + `LEFT JOIN` 仅在表存在时；收益/风险可同发
2. 可写侧跑 `compute:select`（建表 + 填数）
3. 再让体验/定投/成本/精选默认排序指向新列

### schema_version 与 Backy

现网 `initSchema` 只 `INSERT` 当前 `SCHEMA_VERSION`，旧行仍在；`assertFundlyDb` 用无序 `LIMIT 1` 比版本。升 v3 时同一提交必须：

1. `CREATE TABLE IF NOT EXISTS fund_select_metrics …` 进入 `SCHEMA_DDL`
2. `SCHEMA_VERSION = 3`；`schema_version` **按 version 定位**插入 3（`WHERE version = 3` 不存在才 INSERT）
3. `assertFundlyDb` 改为 `SELECT MAX(version) FROM schema_version`，必须等于 `SCHEMA_VERSION`；并检查核心三表 + `fund_select_metrics` 表存在（可空）
4. 单测夹具：当前库用 `MAX=3`（允许同时留着 version=2 行，这是增量写入的正常形态，不是错误）
5. **旧 v2 快照不能直接当现行库**：`restore` 在 `assertFundlyDb` 之前跑 `initSchema`（只补表和 version=3 行，不改净值）。顺序：gunzip → 打开读写 → `initSchema` → `assertFundlyDb`。这样 v2 Backy 仍可换机，不会因为缺 version=3 / 缺新表而失败
6. 备份源仍走 `assertFundlyDb`，只接受已迁到 3 的库

不要在 `assertFundlyDb` 里接受「MAX=2 也算过」——那会把未迁的库备份出去。v2 只允许走 restore-then-migrate。

### 刷新顺序

现网 `fetch:daily` **不会**跑风险或排名。新增包装脚本，**失败即停**：

```
bun run refresh:select
# 内部严格按序：
bun run fetch:daily
bun run rank:refresh
bun run compute:risk
bun run compute:select
```

`compute:select` 读 nav + fees + performance + risk，写 select 表并算 `select_score`。单独重跑后三步可以，但日常只跑包装脚本，避免漏步。失败不回滚已成功的前步。实现时写入 `docs/03-SCRIPTS.md` 与 `package.json`。

算库时打开独立连接、busy_timeout、不要和正在 `VACUUM` 的 backup 并行。WAL 下与只读 API 可共存；写的是小表。

### 计算文件

| 文件 | 职责 |
|------|------|
| `src/analytics/risk-metrics.ts` | 补 3y/5y 日历跨度门（0.8 × 窗长） |
| `src/analytics/hold-metrics.ts` | 溃疡/水下/连跌/最差月/收复 |
| `src/analytics/dca-metrics.ts` | 月定投；输入必须是 acc_nav 序列；lump = N 元 @ D0 |
| `src/analytics/cost-metrics.ts` | 综合费、销服是否已知、份额与 group key |
| `src/metrics/select-score.ts` | 用现网 `rankPct` 翻成 `select_score` |
| `scripts/compute-select-metrics.ts` | `initSchema` + 批算写入 |
| `scripts/refresh-select.ts` | 四步包装，fail-fast |
| `package.json` | `compute:select`、`refresh:select` |

货币/无 acc_nav：体验、定投 null；成本仍可算。

---

## 代码落点

| 层 | 路径 |
|----|------|
| DDL + 版本校验 | `src/db/schema.ts`、`src/db/repo.ts`、`src/backup/snapshot.ts`、`src/backup/run.ts`（restore 先 migrate） |
| 文档 | `02-SCHEMA.md`（删 `fund_screening_rank`）、`03-SCRIPTS.md`、`06-ARCH-UI.md`、`08-BACKY.md`（restore-then-migrate） |
| 列表 SQL | `apps/worker/src/lib/fund-query.ts`：新 sort、lens=picks 两层 CTE、货基最新七日+7 日新鲜度、按维切换 `minSamples` 列；`hasTable` 守卫新表 |
| 详情兄弟份额 | `apps/worker/scripts/app.ts` `GET /api/funds/:code/siblings` |
| 导航/路由 | `navigation.ts`、`App.tsx`：`/select/:lens`；`/ranking` 按 dim 分组跳转 |
| VM/页 | `select-vm.ts`、`select-page.tsx`；`ranking-vm` 只留重定向/存储迁移 |
| 来源 | `list-origin.ts` 识别 `/select/*`，兼容旧 `/ranking` |

`serve.ts` / `openReadonlySqlite` **保持只读**，不在本需求里改成可写。

---

## 原子化提交

1. `fix: compare schema version with max row`（Backy 校验改 `MAX(version)`，先于升版）
2. `fix: require calendar span for multi year risk`（3y/5y 跨度门，独立可测）
3. `feat: add select metrics table and compute`
4. `feat: restore migrates v2 snapshots to v3`
5. `feat: expose select sort keys and picks filters`
6. `feat: add select pages and restore nav group`
7. `docs: sync schema scripts and ui for select`

---

## 6DQ

| 维 | 计划 |
|----|------|
| **L1** | hold/dca/cost/score/select-vm/share-class 纯函数；夹具含回撤再收复、无 acc_nav、销服 null、不足月、lump=N@D0、份额未命中、3y 样本够但跨度不够 |
| **L2** | fund-query 新 sort / picks 两层 CTE（过滤前后百分位分母不变）/ siblings / 货基新鲜度；`assertFundlyDb` 在 MAX=3 夹具上通过；restore(v2)→migrate→assert 通过 |
| **L3** | 手测七页、`/ranking?dim=sharpe_1y` 进风险页、旧 localStorage 迁移、详情返回、`typeL1=all` 六页都有警告。不进 CI |
| **G1** | `bun run lint`、`typecheck`、`typecheck:web`、`test`、`test:web`；提交前 `test:coverage` |
| **G2** | 不新增依赖 |
| **D1** | 批算只写本机/Volume sqlite；单测 `:memory:`；serve 只读 |

---

## 验收

- 侧栏「选基」七项；`/ranking` 打开即到收益页；`/ranking?dim=sharpe_1y` 到风险页
- `typeL2` 仍是后缀；百分位公式与 `rankPct` 一致
- 收益列只有 1m/3m/6m/1y；风险没有虚构的 5y 索提诺/卡玛；3y/5y 指标在跨度不足时为 null
- 体验/定投/成本在 `compute:select` 之后有数；销服未知不进「最便宜 50%」
- 精选百分位分母是完整 `fund_type`，不受 `pass4433` 影响；规则可关；`select_score` 高分在前
- 默认带 L1；六页在 `typeL1=all` 时都警告
- Volume 缺表时 API 不 500；restore 旧 v2 快照会迁到 3 再校验
- 货基七日年化超过市场最新日 7 天视为过期

## 不做

- 组合优化、税收、自定义权重
- 东财五维雷达当主分
- 未实测的全市场批算耗时
- 把销服 null 当 0
- 新建 `fund_screening_rank`
- 在只读 `serve.ts` 里建表或升版本
- 用 `PERCENT_RANK()` 或 `(rank-1)/(n-1)` 冒充现网百分位
