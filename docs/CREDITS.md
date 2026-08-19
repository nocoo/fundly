# 致谢与参考

Fundly 站在开源社区的肩膀上，特别向以下项目致敬。

## 🎯 主要参考

### [GoFundBot](https://github.com/Sebastian6848/GoFundBot)

作者：[@Sebastian6848](https://github.com/Sebastian6848) · License: MIT · Stars: 89+

一个基于 Python (Flask) + Vue 3 的中国基金智能分析平台。**Fundly 从中借鉴了：**

- **4433 法则**的具体量化实现（同类排名前 25% / 33.33% 阈值判定）
- **五大预设策略**思路：4433、高夏普、低波动、反脆弱、高卡玛
- **数据源清单**：东方财富 / 天天基金 / 腾讯 / 新浪 / 财联社
- **反爬工程**：`curl_cffi` 模拟 Chrome TLS 指纹、多子域名分流、多层降级 fallback
- **数据表设计**：`FundBasicInfo` / `FundTrend` / `FundEstimate` / `FundRiskMetrics` / `FundScreeningRank` 的字段拆分
- **回测引擎**：11 种策略的思路（定期定额、翻倍定投、定盈计划、网格、均线择时、二八轮动等）

**Fundly 与 GoFundBot 的差异**：
- Fundly **只关注基金**，不做股票行情
- Fundly 用 **Bun + TypeScript**，GoFundBot 是 Python + Vue
- Fundly 是**纯后端 CLI + 数据库工具**，不含前端可视化
- Fundly 用 **bun:sqlite** 单文件存储，架构更轻

### [AKShare](https://github.com/akfamily/akshare)

作者：[@albertandking](https://github.com/albertandking) · License: MIT · Stars: 10k+

Python 开源财经数据库。**Fundly 从中借鉴了：**

- 数据接口清单（`fund_name_em`、`fund_open_fund_info_em`、`fund_portfolio_hold_em` 等）
- 数据字段命名与含义参考
- 作为 **备用数据源** 的 fallback 方案（当东方财富直连接口异常时）

## 📚 数据源

Fundly 使用的**所有公开接口**均来自：

- **东方财富**（`eastmoney.com` / `1234567.com.cn`）
- **腾讯财经**（`qt.gtimg.cn`）— 备用
- **新浪财经**（`hq.sinajs.cn`）— 备用

这些接口无需 API Key，供个人学习研究使用。若接口方 ToS 变化，Fundly 将及时调整。

## 🛠 技术栈参考

- [**Bun**](https://bun.sh) — 运行时、包管理、测试、SQLite 一站式
- [**Biome**](https://biomejs.dev) — Rust 编写的 lint + format
- [**TypeScript**](https://www.typescriptlang.org) — 类型系统

## ⚖️ License 声明

- Fundly 本身采用 **MIT License**
- 参考项目均为 MIT License，兼容
- 所有借鉴的**方法论**（如 4433 法则）均为公开投资知识，不涉及版权
- 所有借鉴的**代码结构**均已用 TypeScript 独立重写，不复制原代码
