import { describe, expect, test } from 'bun:test';
import { extractReportDate, parseJjccResponse } from '../src/fetchers/portfolio.ts';

describe('extractReportDate', () => {
  test('parses standard "截止至" tag', () => {
    expect(extractReportDate("截止至：<font class='px12'>2025-12-31</font>")).toBe('2025-12-31');
  });
  test('parses "YYYY年M月DD" form', () => {
    expect(extractReportDate('2025年6月30日')).toBe('2025-06-30');
  });
  test('null on absent', () => {
    expect(extractReportDate('')).toBeNull();
  });
});

describe('parseJjccResponse', () => {
  test('parses full apidata response', () => {
    const text = `var apidata={ content:"<div>截止至：<font class='px12'>2025-12-31</font>
      <table><thead>
        <tr><th>序号</th><th>股票代码</th><th>股票名称</th><th>相关资讯</th><th>占净值比例</th><th>持股数（万股）</th><th>持仓市值（万元）</th></tr>
      </thead>
      <tbody>
        <tr><td>1</td><td>00700</td><td>腾讯控股</td><td>股吧行情</td><td>9.98%</td><td>572.00</td><td>309,468.46</td></tr>
        <tr><td>2</td><td>600519</td><td>贵州茅台</td><td>股吧行情</td><td>9.90%</td><td>223.00</td><td>307,111.14</td></tr>
      </tbody></table></div>", curyear:2025 };`;
    const holdings = parseJjccResponse(text);
    expect(holdings).toHaveLength(2);
    expect(holdings[0]).toEqual({
      reportDate: '2025-12-31',
      stockCode: '00700',
      stockName: '腾讯控股',
      holdPct: 9.98,
      holdShares: 572,
      holdValueWan: 309468.46,
    });
  });

  test('handles comma-separated numbers', () => {
    const text = `截止至：<font>2025-06-30</font><table><tr><td>1</td><td>000001</td><td>平安</td><td>x</td><td>5.5%</td><td>1,234.56</td><td>10,000,000.00</td></tr></table>`;
    const holdings = parseJjccResponse(text);
    expect(holdings[0]?.holdShares).toBe(1234.56);
    expect(holdings[0]?.holdValueWan).toBe(10000000);
  });

  test('skips header and malformed rows', () => {
    const text = `截止至：<font>2025-03-31</font><table>
      <tr><th>序号</th><th>代码</th></tr>
      <tr><td>no idx</td><td>x</td></tr>
      <tr><td>1</td><td>000001</td><td>A</td><td>-</td><td>1%</td><td>1</td><td>1</td></tr>
    </table>`;
    const holdings = parseJjccResponse(text);
    expect(holdings).toHaveLength(1);
    expect(holdings[0]?.stockCode).toBe('000001');
  });

  test('empty when no report date', () => {
    expect(parseJjccResponse('<html>no date</html>')).toEqual([]);
  });
});
