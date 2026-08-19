import { describe, expect, test } from 'bun:test';
import { extractMinSubscribeAmount, extractPct, parseJjflHtml } from '../src/fetchers/fees.ts';

describe('extractPct', () => {
  test('parses X.XX%', () => {
    expect(extractPct('1.20%（每年）')).toBe(1.2);
    expect(extractPct('0.5%')).toBe(0.5);
  });
  test('null on non-percent', () => {
    expect(extractPct('---')).toBeNull();
    expect(extractPct('')).toBeNull();
  });
});

describe('extractMinSubscribeAmount', () => {
  test('parses 最低申购金额:X元', () => {
    expect(extractMinSubscribeAmount('最低申购金额：10元')).toBe(10);
    expect(extractMinSubscribeAmount('最低申购金额: 1,000元')).toBe(1000);
  });
  test('parses X元起购', () => {
    expect(extractMinSubscribeAmount('1元起购')).toBe(1);
  });
  test('null when absent', () => {
    expect(extractMinSubscribeAmount('无相关信息')).toBeNull();
  });
});

describe('parseJjflHtml', () => {
  test('extracts main three fees + max sub/red', () => {
    const html = `
      <table>
        <tr><td>管理费率</td><td>1.20%（每年）</td></tr>
        <tr><td>托管费率</td><td>0.20%（每年）</td></tr>
      </table>
      <div>原申购费率
        <table>
          <tr><th>金额</th><th>费率</th></tr>
          <tr><td>&lt;100万</td><td>1.50%</td></tr>
          <tr><td>&gt;=100万</td><td>0.60%</td></tr>
        </table>
      </div>
      <div>赎回费率
        <table>
          <tr><td>&lt;7天</td><td>1.50%</td></tr>
          <tr><td>&gt;=1年</td><td>0.00%</td></tr>
        </table>
      </div>
    `;
    const info = parseJjflHtml(html);
    expect(info.mgmtFeePct).toBe(1.2);
    expect(info.custodianFeePct).toBe(0.2);
    expect(info.subscriptionFeeMax).toBe(1.5);
    expect(info.redemptionFeeMax).toBe(1.5);
    expect(info.rawJson).toContain('mgmt');
  });

  test('all null when html empty', () => {
    const info = parseJjflHtml('');
    expect(info.mgmtFeePct).toBeNull();
    expect(info.custodianFeePct).toBeNull();
  });
});
