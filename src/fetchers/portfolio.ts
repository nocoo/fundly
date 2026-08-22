/**
 * 持仓抓取（东财 FundArchivesDatas.aspx type=jjcc）
 *
 * 接口：
 *   https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code={CODE}&topline=10
 * 不传 year/month 会返回最新可用季报。
 *
 * 返回：var apidata={ content:"<div>...<table>...", ... };
 * 表格列：序号 / 股票代码 / 股票名称 / 相关资讯 / 占净值比例 / 持股数(万股) / 持仓市值(万元)
 */

import { fetchText } from '../utils/http.ts';

const JJCC_URL = (code: string) =>
  `https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code=${code}&topline=10`;

export interface PortfolioHolding {
  reportDate: string; // YYYY-MM-DD 季末日
  stockCode: string;
  stockName: string;
  holdPct: number | null; // 占净值比 %
  holdShares: number | null; // 万股
  holdValueWan: number | null; // 万元
}

export function parseJjccResponse(text: string): PortfolioHolding[] {
  const reportDate = extractReportDate(text);
  if (!reportDate) return [];
  const trs = text.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  const holdings: PortfolioHolding[] = [];
  for (const tr of trs) {
    const tds = tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) ?? [];
    if (tds.length < 7) continue;
    const cells = tds.map((td) => stripTags(td).trim());
    // 跳过表头
    if (cells[0] === '序号' || !/^\d+$/.test(cells[0] ?? '')) continue;

    const stockCode = cells[1] ?? '';
    const stockName = cells[2] ?? '';
    const holdPct = parsePctPlain(cells[4] ?? '');
    const holdShares = parseWan(cells[5] ?? '');
    const holdValueWan = parseWan(cells[6] ?? '');

    if (!stockCode || !stockName) continue;
    holdings.push({
      reportDate,
      stockCode,
      stockName,
      holdPct,
      holdShares,
      holdValueWan,
    });
  }
  return holdings;
}

export function extractReportDate(text: string): string | null {
  const m = /截止至：<font[^>]*>([\d-]+)<\/font>/.exec(text);
  if (m?.[1]) return m[1];
  const m2 = /(\d{4})年(\d{1,2})[月-](\d{1,2})/.exec(text);
  if (m2) {
    const [, y, mo, d] = m2;
    return `${y}-${(mo ?? '').padStart(2, '0')}-${(d ?? '').padStart(2, '0')}`;
  }
  return null;
}

/** '9.98%' → 9.98 */
function parsePctPlain(s: string): number | null {
  const m = /(-?[\d.]+)\s*%/.exec(s);
  if (!m) return null;
  const v = Number.parseFloat(m[1] ?? '');
  return Number.isFinite(v) ? v : null;
}

/** '572.00' or '1,234.56' → number */
function parseWan(s: string): number | null {
  const cleaned = s.replace(/[,\s]/g, '');
  if (!cleaned) return null;
  const v = Number.parseFloat(cleaned);
  return Number.isFinite(v) ? v : null;
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

export async function fetchPortfolio(
  fundCode: string,
  urlBuilder: (code: string) => string = JJCC_URL,
): Promise<PortfolioHolding[]> {
  const text = await fetchText(urlBuilder(fundCode), {
    timeout: 20000,
    retries: 3,
    headers: { Referer: `https://fundf10.eastmoney.com/ccmx_${fundCode}.html` },
  });
  return parseJjccResponse(text);
}
