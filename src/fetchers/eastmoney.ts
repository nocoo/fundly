/**
 * 东方财富 / 天天基金 数据抓取器
 */

import { fetchText } from '../utils/http.ts';
import type { FundPerformance, NavPoint, PingzhongData, RawFundListRow } from '../utils/types.ts';

const FUNDCODE_SEARCH_URL = 'http://fund.eastmoney.com/js/fundcode_search.js';
const PINGZHONG_URL = (code: string) =>
  `https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${Date.now()}`;

// ============================================================
// 1. 全市场基金列表
// ============================================================

/**
 * 解析 fundcode_search.js
 * 返回体：var r = [["000001","HXCZHH","华夏成长混合","混合型-灵活","HUAXIACHENGZHANGHUNHE"], ...];
 */
export function parseFundList(jsText: string): RawFundListRow[] {
  const startIdx = jsText.indexOf('[');
  const endIdx = jsText.lastIndexOf(']');
  if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
    throw new Error('parseFundList: cannot locate array boundary');
  }
  const arrayLiteral = jsText.slice(startIdx, endIdx + 1);
  // 内容是纯 JSON 数组（都是字符串），可以直接 JSON.parse
  const raw = JSON.parse(arrayLiteral) as unknown[];
  const result: RawFundListRow[] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 4) continue;
    const [code, pyAbbr, name, type, pyFull] = row as (string | undefined)[];
    if (!code || !name || !type) continue;
    result.push({
      fundCode: code,
      pinyinAbbr: pyAbbr ?? '',
      fundName: name,
      fundType: type,
      pinyinFull: pyFull ?? '',
    });
  }
  return result;
}

export async function fetchFundList(): Promise<RawFundListRow[]> {
  const text = await fetchText(FUNDCODE_SEARCH_URL, { timeout: 30000, retries: 3 });
  return parseFundList(text);
}

// ============================================================
// 2. pingzhongdata.js — 详情 + 净值 + 业绩
// ============================================================

/**
 * pingzhongdata.js 是一段 JS，形如：
 *   var fS_name = "xxx";
 *   var Data_netWorthTrend = [{"x":123, "y":1.234, "equityReturn":0.5, "unitMoney":""}, ...];
 *   var Data_ACWorthTrend = [[timestamp, value], ...];
 *   var syl_1n = "12.34";
 *   ...
 *
 * 用正则抓取赋值语句右侧，尝试 JSON.parse。
 */
export function parsePingzhongData(fundCode: string, jsText: string): PingzhongData {
  const vars = extractJsVars(jsText);

  const navPoints = parseNavPoints(vars.Data_netWorthTrend, vars.Data_ACWorthTrend);
  const performance = parsePerformance(fundCode, vars, navPoints);

  return {
    fundCode,
    navPoints,
    performance,
    extra: {
      assetAllocationJson: vars.Data_assetAllocation ?? null,
      scaleHistoryJson: vars.Data_fluctuationScale ?? null,
      holderStructureJson: vars.Data_holderStructure ?? null,
      rankingTrendJson: vars.Data_rateInSimilarType ?? null,
      performance5dJson: vars.Data_performanceEvaluation ?? null,
    },
  };
}

/** 从 JS 文本抓所有 `var xxx = ...;` 的原始 RHS（不解析） */
export function extractJsVars(jsText: string): Record<string, string> {
  const result: Record<string, string> = {};
  // 匹配 var NAME = <VALUE>;   VALUE 可能是 数字/字符串/数组/对象
  // 用宽松策略：找到 = 后到分号（分号前不能出现在字符串或方括号内部）；
  // 更稳的方法：手写扫描（跟踪 [] {} "" '' 平衡）
  const varRegex = /var\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/g;
  let match: RegExpExecArray | null = varRegex.exec(jsText);
  while (match !== null) {
    const name = match[1];
    if (!name) continue;
    const startPos = match.index + match[0].length;
    const value = readJsValue(jsText, startPos);
    if (value !== null) result[name] = value;
    match = varRegex.exec(jsText);
  }
  return result;
}

/** 从 pos 开始读一个 JS 值，直到平衡的分号 */
function readJsValue(text: string, pos: number): string | null {
  // 跳过前导空白
  while (pos < text.length && /\s/.test(text[pos] as string)) pos++;
  const start = pos;

  let depth = 0;
  let inStr: '"' | "'" | null = null;
  let escaped = false;

  while (pos < text.length) {
    const ch = text[pos] as string;
    if (escaped) {
      escaped = false;
      pos++;
      continue;
    }
    if (inStr) {
      if (ch === '\\') escaped = true;
      else if (ch === inStr) inStr = null;
      pos++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = ch;
      pos++;
      continue;
    }
    if (ch === '[' || ch === '{' || ch === '(') depth++;
    else if (ch === ']' || ch === '}' || ch === ')') depth--;
    else if (ch === ';' && depth === 0) {
      return text.slice(start, pos).trim();
    }
    pos++;
  }
  return null;
}

/** 单引号字符串转 JSON 字符串（把单引号 key 转双引号），保守做 */
function jsToJson(raw: string): string {
  // pingzhongdata.js 大多数是 JSON 兼容格式（双引号），少数字段是纯字符串
  return raw;
}

/**
 * 解析净值走势
 * Data_netWorthTrend = [{"x":timestamp_ms, "y":unit_nav, "equityReturn":pct, "unitMoney":""}, ...]
 * Data_ACWorthTrend  = [[timestamp_ms, acc_nav], ...]
 */
export function parseNavPoints(
  netWorthRaw: string | undefined,
  accWorthRaw: string | undefined,
): NavPoint[] {
  if (!netWorthRaw) return [];

  let netWorth: Array<{ x: number; y: number; equityReturn?: number }> = [];
  try {
    netWorth = JSON.parse(jsToJson(netWorthRaw));
  } catch {
    return [];
  }

  const accMap = new Map<string, number>();
  if (accWorthRaw) {
    try {
      const accArr = JSON.parse(jsToJson(accWorthRaw)) as Array<[number, number]>;
      for (const [ts, val] of accArr) {
        const date = tsToDate(ts);
        if (date) accMap.set(date, val);
      }
    } catch {
      // 忽略累计净值缺失
    }
  }

  const points: NavPoint[] = [];
  for (const item of netWorth) {
    const date = tsToDate(item.x);
    if (!date || typeof item.y !== 'number') continue;
    points.push({
      navDate: date,
      unitNav: item.y,
      accNav: accMap.get(date) ?? null,
      dailyReturn: typeof item.equityReturn === 'number' ? item.equityReturn : null,
    });
  }
  return points;
}

/** 从 pingzhongdata 的字段拼出阶段业绩 */
export function parsePerformance(
  fundCode: string,
  vars: Record<string, string>,
  navPoints: readonly NavPoint[],
): FundPerformance {
  const num = (key: string): number | null => {
    const v = vars[key];
    if (!v) return null;
    // 去掉引号
    const stripped = v.replace(/^["']|["']$/g, '');
    if (stripped === '' || stripped === 'null') return null;
    const n = Number.parseFloat(stripped);
    return Number.isFinite(n) ? n : null;
  };

  // 东方财富 pingzhongdata 里的收益率变量名（观察实测得来）
  // syl_1n 近1年, syl_6y 近6月, syl_3y 近3月, syl_1y 近1月, syl_3n 近3年, syl_5n 近5年
  const dataDate = navPoints.length > 0 ? (navPoints[navPoints.length - 1]?.navDate ?? null) : null;

  return {
    fundCode,
    return1m: num('syl_1y'),
    return3m: num('syl_3y'),
    return6m: num('syl_6y'),
    return1y: num('syl_1n'),
    return2y: num('syl_2n'),
    return3y: num('syl_3n'),
    return5y: num('syl_5n'),
    returnYtd: null, // pingzhong 里没有稳定的 YTD 字段，后续 Phase 补
    returnSinceStart: null,
    rankPct1m: null,
    rankPct3m: null,
    rankPct6m: null,
    rankPct1y: null,
    rankPct2y: null,
    rankPct3y: null,
    rankPct5y: null,
    dataDate,
  };
}

/** timestamp(ms) → YYYY-MM-DD (UTC+8 北京时间) */
export function tsToDate(ts: number): string | null {
  if (!Number.isFinite(ts) || ts <= 0) return null;
  const d = new Date(ts + 8 * 60 * 60 * 1000);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export async function fetchPingzhongData(fundCode: string): Promise<PingzhongData> {
  const text = await fetchText(PINGZHONG_URL(fundCode), {
    timeout: 20000,
    retries: 3,
    headers: { Referer: `http://fund.eastmoney.com/${fundCode}.html` },
  });
  return parsePingzhongData(fundCode, text);
}
