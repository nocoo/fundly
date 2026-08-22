/**
 * 费率抓取（东财 jjfl 页面）
 *
 * 接口：https://fundf10.eastmoney.com/jjfl_{code}.html
 * 提取：
 *   - 管理费率 mgmt_fee_pct
 *   - 托管费率 custodian_fee_pct
 *   - 销售服务费率 sales_service_fee_pct（部分基金无）
 *   - 申购费率上限（最高一档）
 *   - 赎回费率上限（最高一档）
 *   - 最低申购金额
 */

import { fetchText } from '../utils/http.ts';

const JJFL_URL = (code: string) => `https://fundf10.eastmoney.com/jjfl_${code}.html`;

export interface FeeInfo {
  mgmtFeePct: number | null;
  custodianFeePct: number | null;
  salesServiceFeePct: number | null;
  subscriptionFeeMax: number | null;
  redemptionFeeMax: number | null;
  minSubscribeAmount: number | null;
  rawJson: string;
}

export function parseJjflHtml(html: string): FeeInfo {
  const mgmt = extractLabelValue(html, ['管理费率']);
  const cust = extractLabelValue(html, ['托管费率']);
  const sales = extractLabelValue(html, ['销售服务费率']);
  const subMax = extractMaxPctFromTableNear(html, ['原申购费率', '申购费率']);
  const redMax = extractMaxPctFromTableNear(html, ['赎回费率']);
  const minSub = extractMinSubscribeAmount(html);

  return {
    mgmtFeePct: mgmt,
    custodianFeePct: cust,
    salesServiceFeePct: sales,
    subscriptionFeeMax: subMax,
    redemptionFeeMax: redMax,
    minSubscribeAmount: minSub,
    rawJson: JSON.stringify({
      mgmt,
      cust,
      sales,
      subMax,
      redMax,
      minSub,
    }),
  };
}

/** 从 <td>标签</td><td>0.5%（每年）</td> 提取百分比数字 */
function extractLabelValue(html: string, labels: readonly string[]): number | null {
  for (const label of labels) {
    const re = new RegExp(`${label}</td>\\s*<td[^>]*>\\s*([^<]+)`, 'i');
    const m = re.exec(html);
    if (!m) continue;
    const pct = extractPct(m[1] ?? '');
    if (pct !== null) return pct;
  }
  return null;
}

/** 从段落中找形如 X.XX% 的最大值 */
function extractMaxPctFromTableNear(html: string, keywords: readonly string[]): number | null {
  for (const kw of keywords) {
    const idx = html.indexOf(kw);
    if (idx < 0) continue;
    const scope = html.slice(idx, idx + 3000);
    const pcts: number[] = [];
    for (const m of scope.matchAll(/([\d.]+)\s*%/g)) {
      const v = Number.parseFloat(m[1] ?? '');
      if (Number.isFinite(v)) pcts.push(v);
    }
    if (pcts.length > 0) return Math.max(...pcts);
  }
  return null;
}

/** '1.20%（每年）' → 1.2 */
export function extractPct(s: string): number | null {
  const m = /([\d.]+)\s*%/.exec(s);
  if (!m) return null;
  const v = Number.parseFloat(m[1] ?? '');
  return Number.isFinite(v) ? v : null;
}

export function extractMinSubscribeAmount(html: string): number | null {
  // 常见格式："最低申购金额：10元" / "1元起购"
  const m1 = /最低申购金额[^0-9]{0,10}([\d,]+)\s*元/.exec(html);
  if (m1) {
    const v = Number.parseFloat((m1[1] ?? '').replace(/,/g, ''));
    if (Number.isFinite(v)) return v;
  }
  const m2 = /([\d,]+)\s*元起购/.exec(html);
  if (m2) {
    const v = Number.parseFloat((m2[1] ?? '').replace(/,/g, ''));
    if (Number.isFinite(v)) return v;
  }
  return null;
}

export async function fetchFees(
  fundCode: string,
  urlBuilder: (code: string) => string = JJFL_URL,
): Promise<FeeInfo> {
  const html = await fetchText(urlBuilder(fundCode), {
    timeout: 20000,
    retries: 3,
    headers: { Referer: `https://fundf10.eastmoney.com/jjfl_${fundCode}.html` },
  });
  return parseJjflHtml(html);
}
