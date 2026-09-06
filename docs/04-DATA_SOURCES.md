# 数据源清单

Fundly MVP 使用**东方财富系**公开接口，无需 API Key。

## 🥇 主力：东方财富 / 天天基金

### 1. 全市场基金列表

```
GET http://fund.eastmoney.com/js/fundcode_search.js
```

**返回**：JSONP，格式 `var r = [[code, pinyin_abbr, name, type, pinyin_full], ...];`
**数据量**：~27,536 条
**用途**：初始化 `fund_basic_info` 表
**更新频率**：每周一次即可

### 2. 基金详情 + 净值走势（核心）

```
GET https://fund.eastmoney.com/pingzhongdata/{fund_code}.js
Referer: http://fund.eastmoney.com/{fund_code}.html
```

**返回**：JavaScript 变量集合，包含：

| 变量 | 含义 |
|---|---|
| `Data_netWorthTrend` | 单位净值走势（日频，含日增长率） |
| `Data_ACWorthTrend` | 累计净值走势 |
| `Data_millionCopiesIncome` | 货币基金每万份收益 `[[ts, 元], ...]` |
| `Data_sevenDaysYearIncome` | 货币基金七日年化 `[[ts, %], ...]` |
| `ishb` | `true` 时为本接口的货币基金（无单位净值曲线） |
| `Data_grandTotal` | 累计收益率走势（vs 沪深300 / 同类平均） |
| `Data_rateInSimilarType` | 同类排名走势（百分位） |
| `Data_rateInSimilarPersent` | 同类排名百分位 |
| `Data_fluctuationScale` | 规模变动 |
| `Data_holderStructure` | 持有人结构 |
| `Data_assetAllocation` | 资产配置 |
| `Data_currentFundManager` | 当前基金经理 |
| `Data_performanceEvaluation` | 五维能力评估 |
| `syl_1n / syl_6y / syl_3y / syl_1y` | 近 1年/6月/3月/1月 收益率 |

**用途**：填充 `fund_trend` + `fund_performance` 表
**单次响应大小**：50-500 KB
**关键**：**一个接口拿到该基金几乎所有历史数据**，无需多接口拼接

### 3. 实时估值（分钟级）

```
GET http://fundgz.1234567.com.cn/js/{fund_code}.js?rt={timestamp}
```

**返回**：JSONP `jsonpgz({...})`，含估算净值、估算涨跌幅、估算时间
**用途**：交易时段实时估值（MVP 阶段不用，Phase 2+ 用）

### 4. 基金列表（分页 · 带详细业绩）

```
GET http://fund.eastmoney.com/Data/Fund_JJJZ_Data.aspx
    ?t=1&lx=1&letter=&gsid=&text=&sort=zdf,desc&page=1,200
```

**用途**：全市场按类型/收益率分页拉取（MVP 备用）

## 🥈 备用：AKShare Python 库

当东方财富直连接口异常时，通过 Python 子进程调用：

```python
import akshare as ak
df = ak.fund_open_fund_info_em(symbol="004753", indicator="单位净值走势")
```

**用途**：fallback，MVP 期不启用

## 📋 请求头规范

所有请求统一 header：

```
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36
            (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36
Referer: http://fund.eastmoney.com/
Accept: */*
Accept-Language: zh-CN,zh;q=0.9,en;q=0.8
```

## ⏱ 限流约定

| 接口 | 建议 QPS | 超限行为 |
|---|---|---|
| `fund.eastmoney.com/pingzhongdata` | 5 | 触发风控，需退避 30s+ |
| `fund.eastmoney.com/js/fundcode_search.js` | 无限制（静态资源） | — |
| `fundgz.1234567.com.cn` | 10 | 429 |

Fundly 默认配置：**全局 5 QPS**，可通过 `FUNDLY_QPS` 环境变量调整。

## 🚫 已知问题

1. **`pingzhongdata` 偶发返回空**：需按 code 重试 1 次
2. **周末数据不更新**：净值日期停留在最近交易日
3. **新基金（成立<3个月）无同类排名**：字段为 `null`
4. **普通货币基金无 `Data_netWorthTrend`**：同文件有万份收益 / 七日年化，写入 `fund_money_yield`，不要塞进 `unit_nav`

## 🔒 合规

- 所有接口均为公开可访问，无鉴权
- 请求频率保守，避免影响服务器
- 数据仅用于个人学习研究，**不做商业分发**

## 宏观与跨资产来源

新增扶摇 Financial-API、上期所日行情、Cboe VIX、ECB 参考汇率、中国货币网 Shibor / LPR、FRED 日值。实测请求与日期见 [13 · 数据调研](./13-MACRO-DASHBOARD.md)，正式采集口径见 [14 · 宏观大屏实现](./14-MACRO-IMPLEMENTATION.md)。不将日值宣称为已验证实时行情。

## 选 ETF 与选股来源 (扶摇 Financial-API)

选 ETF 与选股模块使用同花顺金融数据服务（扶摇 Financial-API），通过服务端 `HITHINK_FINANCE_API_KEY` 鉴权：

| 接口路径 | 用途 | 实测与口径约束 |
|---|---|---|
| `/api/meta/tickers/list?asset_type=fund-etf` | ETF 独立全目录 | 1,670 只，核验本地 1,614 只 |
| `/api/meta/tickers/list?asset_type=a-share` | A 股独立全目录 | 5,567 只全市场标的 |
| `/api/a-share/calendar/trading-days` | 交易日推断 | 周末、休市和开盘前使用最近适用交易日，记录推断标志 |
| `/api/a-share/prices/snapshot` | A 股全市场行情快照 | 分页批量，包含最新价、涨跌幅、成交额 |
| `/api/fund/market/snapshot` | ETF 有界研究池快照 | 单只请求，没有已验证的全市场 ETF 批量快照接口 |
| `/api/a-share/valuations/snapshot` | A 股全市场批量估值快照 | 每批最多 100 只，包含 PE TTM/MRQ, PB MRQ, PS TTM, PCF TTM |
| `/api/a-share/financials/indicators` | 股票能力评估指标 | 特殊 envelope: `data.abilities[].indicators[]`，按最新完整财年 `YYYY-4` 取数 |
| `/api/a-share/financials/*-statements` | 股票年报三张表 | 利润表、资产负债表、现金流量表，按财年、期末日与币种严格对齐 |
| `/api/a-share/prices/historical` | 股票五年日 K 线 | `adjust=forward` 前复权真实价格走势，失败整窗保留 |
| `/api/fund/market/historical` | ETF 五年日 K 线 | 无复权请求参数，库内标为 `none`；实测包含结束日，裁剪重叠日期后分窗合并 |
| `/api/fund/performance/nav` | ETF 五年净值 | `range=fyear&nav_type=unit,adj`，单位与复权净值分离 |
| `/api/fund/profile/detail` | ETF 基础资料与费率 | 费率枚举支持 `management` 与 `custody`，无日期规模不混入当日规模 |
| `/api/fund/financials/indicators` | ETF 披露财务指标 | 定期披露规模 `asset_nav`，优先于无日期 profile 规模 |
| `/api/fund/portfolio/holdings` | ETF 定期披露重仓 | 披露持仓明细，优先保留带交易所后缀代码 |
| `/api/a-share-index/constituents/ths-stock-list` | 行业成分与金融业标记 | 银行 (881155)、证券 (881157)、保险 (881156) 成员识别 |

股票行业当前覆盖宏观七个观察行业与证券、保险，不能称为全市场统一一级行业分类。金融行业成员读取失败时拒绝股票基础批次，保留原分类，避免错误地让金融股进入通用现金质量筛选。

HTTP 成功还需业务 `code === 0`。必需身份、股票前复权 `adjust`、日线 `interval`、年报期间与币种严格校验；不把缺数据 `3002` 转成 0。日 K 全窗通过几何和日期检查才替换；前复权的非正历史值可以保留，但含非正收盘的窗口不算百分比风险。收盘前采到的当日 K 仍可能变化，不能用于收盘折溢价。指标数值的空字符串为 null，百分数原值不重复乘 100。来源只通过服务端环境鉴权，日志及浏览层不包含 Key。
