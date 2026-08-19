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

## 🔒 合规

- 所有接口均为公开可访问，无鉴权
- 请求频率保守，避免影响服务器
- 数据仅用于个人学习研究，**不做商业分发**
