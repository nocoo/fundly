/**
 * 分红送配抓取（东财 fhsp 页面）
 *
 * 接口：https://fundf10.eastmoney.com/fhsp_{code}.html
 * 返回：HTML 页面，包含两个表：
 *   1. 分红送配详情表：年份 / 权益登记日 / 除息日 / 每10份分红 / 分红发放日
 *   2. 拆分详情表：年份 / 拆分折算日 / 拆分类型 / 拆分折算比例
 */

import { fetchText } from '../utils/http.ts';

const FHSP_URL = (code: string) => `https://fundf10.eastmoney.com/fhsp_${code}.html`;

export interface DividendEvent {
  eventDate: string; // YYYY-MM-DD（除息日）
  eventType: 'dividend' | 'split';
  dividendPerShare: number | null; // 每份分红（元）
  splitRatio: number | null; // 拆分比例
  remark: string;
}

/** 从 fhsp HTML 页面解析分红 + 拆分事件 */
export function parseFhspHtml(html: string): DividendEvent[] {
  const events: DividendEvent[] = [];

  // 分红表：class='cfxq' 或 class 含 'cfxq'
  const dividendTable = /<table[^>]*class=['"][^'"]*cfxq[^'"]*['"][^>]*>[\s\S]*?<\/table>/i.exec(
    html,
  );
  if (dividendTable) {
    for (const tr of extractRows(dividendTable[0])) {
      if (tr.length < 5) continue;
      const exDate = normDate(tr[2]);
      const desc = tr[3];
      if (!exDate || !desc || desc.includes('暂无')) continue;
      const per10 = extractDividendPer10(desc);
      if (per10 === null) continue;
      events.push({
        eventDate: exDate,
        eventType: 'dividend',
        dividendPerShare: Number((per10 / 10).toFixed(6)),
        splitRatio: null,
        remark: desc,
      });
    }
  }

  // 拆分表：class='cfb' 或类似
  const splitTable = /<table[^>]*class=['"][^'"]*cfb[^'"]*['"][^>]*>[\s\S]*?<\/table>/i.exec(html);
  if (splitTable) {
    for (const tr of extractRows(splitTable[0])) {
      if (tr.length < 4) continue;
      const splitDate = normDate(tr[1]);
      const kind = tr[2];
      const ratioStr = tr[3];
      if (!splitDate || !ratioStr || ratioStr.includes('暂无')) continue;
      const ratio = extractSplitRatio(ratioStr);
      if (ratio === null) continue;
      events.push({
        eventDate: splitDate,
        eventType: 'split',
        dividendPerShare: null,
        splitRatio: ratio,
        remark: `${kind ?? ''} ${ratioStr}`.trim(),
      });
    }
  }

  return events;
}

/** 从表格块中提取所有行（每行 = 字段数组） */
function extractRows(tableHtml: string): string[][] {
  const trs = tableHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  const rows: string[][] = [];
  for (const tr of trs) {
    const tds = tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) ?? [];
    if (tds.length === 0) continue;
    const cells = tds.map((td) => stripTags(td).trim());
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

/** '2022-01-13' → '2022-01-13'；'2022/01/13' 也接受 */
function normDate(s: string | undefined): string | null {
  if (!s) return null;
  const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(s.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}-${(mo ?? '').padStart(2, '0')}-${(d ?? '').padStart(2, '0')}`;
}

/** '每10份派现金0.1500元' → 0.15 */
export function extractDividendPer10(desc: string): number | null {
  const m = /派现金?\s*([\d.]+)\s*元/.exec(desc);
  if (!m) return null;
  const v = Number.parseFloat(m[1] ?? '');
  return Number.isFinite(v) ? v : null;
}

/** '1:1.5' or '1.5' → 1.5 */
export function extractSplitRatio(desc: string): number | null {
  const colon = /(\d+(?:\.\d+)?)\s*[:：]\s*(\d+(?:\.\d+)?)/.exec(desc);
  if (colon) {
    const from = Number.parseFloat(colon[1] ?? '');
    const to = Number.parseFloat(colon[2] ?? '');
    if (from > 0 && Number.isFinite(to)) return to / from;
  }
  const m = /(\d+(?:\.\d+)?)/.exec(desc);
  const v = m ? Number.parseFloat(m[1] ?? '') : Number.NaN;
  return Number.isFinite(v) ? v : null;
}

export async function fetchDividends(
  fundCode: string,
  urlBuilder: (code: string) => string = FHSP_URL,
): Promise<DividendEvent[]> {
  const html = await fetchText(urlBuilder(fundCode), {
    timeout: 20000,
    retries: 3,
    headers: { Referer: `https://fundf10.eastmoney.com/fhsp_${fundCode}.html` },
  });
  return parseFhspHtml(html);
}
