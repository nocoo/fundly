/**
 * 全局共享类型定义
 */

/** MVP 分析池的基金类型白名单 */
export const MVP_FUND_TYPES = [
  '股票型',
  '混合型-偏股',
  '混合型-灵活',
  '指数型-股票',
  '指数型-海外股票',
  'QDII-普通股票',
  'QDII-混合偏股',
] as const;

export type MvpFundType = (typeof MVP_FUND_TYPES)[number];

/** 基金列表接口返回的原始一行（东方财富 fundcode_search.js） */
export interface RawFundListRow {
  fundCode: string;
  pinyinAbbr: string;
  fundName: string;
  fundType: string;
  pinyinFull: string;
}

/** 净值单点 */
export interface NavPoint {
  navDate: string; // YYYY-MM-DD
  unitNav: number;
  accNav: number | null;
  dailyReturn: number | null;
}

/** 阶段业绩 + 排名 */
export interface FundPerformance {
  fundCode: string;
  return1m: number | null;
  return3m: number | null;
  return6m: number | null;
  return1y: number | null;
  return2y: number | null;
  return3y: number | null;
  return5y: number | null;
  returnYtd: number | null;
  returnSinceStart: number | null;
  rankPct1m: number | null;
  rankPct3m: number | null;
  rankPct6m: number | null;
  rankPct1y: number | null;
  rankPct2y: number | null;
  rankPct3y: number | null;
  rankPct5y: number | null;
  dataDate: string | null;
}

/** pingzhongdata 解析结果 */
export interface PingzhongData {
  fundCode: string;
  navPoints: NavPoint[];
  performance: FundPerformance;
  extra: {
    assetAllocationJson: string | null;
    scaleHistoryJson: string | null;
    holderStructureJson: string | null;
    rankingTrendJson: string | null;
    performance5dJson: string | null;
  };
}

/** 抓取日志条目 */
export interface FetchLogEntry {
  fundCode: string | null;
  source: 'eastmoney' | 'tiantian' | 'akshare';
  endpoint: string;
  status: 'success' | 'failed' | 'skipped';
  httpCode: number | null;
  errorMsg: string | null;
  durationMs: number;
}

/** MVP 判定：给定基金类型字符串是否属于分析池 */
export function isMvpFundType(fundType: string): boolean {
  return (MVP_FUND_TYPES as readonly string[]).includes(fundType);
}
