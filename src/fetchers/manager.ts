/**
 * 基金经理抓取（东财 jjjl 页面）
 *
 * 接口：https://fundf10.eastmoney.com/jjjl_{code}.html
 * 提取的表：class 通常为 'w782 comm jloff'（基金经理变动一览）
 * 列：起始期 / 截止期 / 基金经理 / 任职期间 / 任职回报
 * 基金经理列可能是多人，空格分隔："张坤 杨思亮 何一铖"
 */

import { fetchText } from '../utils/http.ts';

const JJJL_URL = (code: string) => `https://fundf10.eastmoney.com/jjjl_${code}.html`;

export interface ManagerTerm {
  startDate: string;
  endDate: string | null; // null = 至今
  managerNames: string[]; // 可能多个经理并列
  tenureDays: number | null;
  returnDuring: number | null; // %
}

/** 从 jjjl HTML 解析基金经理变动一览 */
export function parseJjjlHtml(html: string): ManagerTerm[] {
  const table = /<table[^>]*class=['"][^'"]*jloff[^'"]*['"][^>]*>[\s\S]*?<\/table>/i.exec(html);
  if (!table) return [];
  const rows = extractRows(table[0]);
  const terms: ManagerTerm[] = [];
  for (const row of rows) {
    if (row.length < 5) continue;
    const startDate = normDate(row[0]);
    const endRaw = row[1] ?? '';
    const managersRaw = row[2] ?? '';
    const tenureRaw = row[3] ?? '';
    const returnRaw = row[4] ?? '';
    if (!startDate) continue;
    const endDate = endRaw.includes('至今') ? null : normDate(endRaw);
    if (endRaw && !endRaw.includes('至今') && !endDate) continue;
    const managerNames = splitManagers(managersRaw);
    if (managerNames.length === 0) continue;
    terms.push({
      startDate,
      endDate,
      managerNames,
      tenureDays: parseTenureDays(tenureRaw),
      returnDuring: parsePctSigned(returnRaw),
    });
  }
  return terms;
}

/** '张坤 杨思亮 何一铖' → ['张坤','杨思亮','何一铖'] */
export function splitManagers(s: string): string[] {
  return s
    .split(/[\s,，、;；]+/g)
    .map((x) => x.trim())
    .filter((x) => x.length > 0 && !/^-+$/.test(x));
}

/** '7年又261天' → 2916；'88天' → 88 */
export function parseTenureDays(s: string): number | null {
  const yearMatch = /(\d+)\s*年/.exec(s);
  const dayMatch = /(\d+)\s*天/.exec(s);
  const years = yearMatch ? Number.parseInt(yearMatch[1] ?? '0', 10) : 0;
  const days = dayMatch ? Number.parseInt(dayMatch[1] ?? '0', 10) : 0;
  if (years === 0 && days === 0 && !yearMatch && !dayMatch) return null;
  return years * 365 + days;
}

/** '61.84%' / '-3.78%' → 61.84 / -3.78 */
export function parsePctSigned(s: string): number | null {
  const m = /(-?[\d.]+)\s*%/.exec(s);
  if (!m) return null;
  const v = Number.parseFloat(m[1] ?? '');
  return Number.isFinite(v) ? v : null;
}

function normDate(s: string | undefined): string | null {
  if (!s) return null;
  const m = /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(s.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}-${(mo ?? '').padStart(2, '0')}-${(d ?? '').padStart(2, '0')}`;
}

function extractRows(tableHtml: string): string[][] {
  const trs = tableHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  const rows: string[][] = [];
  for (const tr of trs) {
    const tds = tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) ?? [];
    if (tds.length === 0) continue;
    const cells = tds.map((td) => stripTags(td).trim());
    // 只要第一行不是全 th 表头
    rows.push(cells);
  }
  return rows;
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

export async function fetchManagers(
  fundCode: string,
  urlBuilder: (code: string) => string = JJJL_URL,
): Promise<ManagerTerm[]> {
  const html = await fetchText(urlBuilder(fundCode), {
    timeout: 20000,
    retries: 3,
    headers: { Referer: `https://fundf10.eastmoney.com/jjjl_${fundCode}.html` },
  });
  return parseJjjlHtml(html);
}
