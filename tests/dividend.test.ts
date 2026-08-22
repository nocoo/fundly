import { describe, expect, test } from 'bun:test';
import {
  extractDividendPer10,
  extractSplitRatio,
  parseFhspHtml,
} from '../src/fetchers/dividend.ts';

describe('extractDividendPer10', () => {
  test('parses "每10份派现金X元"', () => {
    expect(extractDividendPer10('每10份派现金0.1500元')).toBe(0.15);
    expect(extractDividendPer10('每10份派现金1.2000元')).toBe(1.2);
  });
  test('returns null for unknown format', () => {
    expect(extractDividendPer10('暂无分红')).toBeNull();
    expect(extractDividendPer10('')).toBeNull();
  });
});

describe('extractSplitRatio', () => {
  test('parses X:Y form', () => {
    expect(extractSplitRatio('1:1.5')).toBe(1.5);
    expect(extractSplitRatio('1：2')).toBe(2);
  });
  test('parses plain number', () => {
    expect(extractSplitRatio('1.5')).toBe(1.5);
  });
  test('returns null for empty', () => {
    expect(extractSplitRatio('')).toBeNull();
    expect(extractSplitRatio('---')).toBeNull();
  });
});

describe('parseFhspHtml', () => {
  test('parses standard dividend table', () => {
    const html = `<div>
      <h4>分红送配详情</h4>
      <table class='w782 comm cfxq'><thead><tr><th>年份</th><th>权益登记日</th><th>除息日</th><th>每10份分红</th><th>发放日</th></tr></thead>
      <tbody>
        <tr><td>2022年</td><td>2022-01-13</td><td>2022-01-13</td><td>每10份派现金0.1500元</td><td>2022-01-14</td></tr>
        <tr><td>2021年</td><td>2021-09-24</td><td>2021-09-24</td><td>每10份派现金0.3000元</td><td>2021-09-27</td></tr>
      </tbody>
      </table>
    </div>`;
    const events = parseFhspHtml(html);
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      eventDate: '2022-01-13',
      eventType: 'dividend',
      dividendPerShare: 0.015,
      splitRatio: null,
      remark: '每10份派现金0.1500元',
    });
    expect(events[1]?.dividendPerShare).toBe(0.03);
  });

  test('returns empty on "暂无" placeholder', () => {
    const html = `<table class='cfxq'><tr><th>a</th><th>b</th><th>c</th><th>d</th><th>e</th></tr>
      <tr><td>-</td><td>-</td><td>-</td><td>暂无分红</td><td>-</td></tr></table>`;
    expect(parseFhspHtml(html)).toEqual([]);
  });

  test('parses split table', () => {
    const html = `<table class='cfb'>
      <tr><th>年份</th><th>拆分折算日</th><th>拆分类型</th><th>比例</th></tr>
      <tr><td>2020年</td><td>2020-03-10</td><td>拆分</td><td>1:1.5</td></tr>
    </table>`;
    const events = parseFhspHtml(html);
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe('split');
    expect(events[0]?.splitRatio).toBe(1.5);
  });

  test('handles both tables together', () => {
    const html = `
      <table class='cfxq'>
        <tr><th>a</th><th>b</th><th>c</th><th>d</th><th>e</th></tr>
        <tr><td>2022</td><td>2022-01-01</td><td>2022-01-01</td><td>每10份派现金0.10元</td><td>2022-01-02</td></tr>
      </table>
      <table class='cfb'>
        <tr><th>a</th><th>b</th><th>c</th><th>d</th></tr>
        <tr><td>2020</td><td>2020-03-10</td><td>拆分</td><td>1:2</td></tr>
      </table>`;
    const events = parseFhspHtml(html);
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.eventType).sort()).toEqual(['dividend', 'split']);
  });

  test('empty html returns empty', () => {
    expect(parseFhspHtml('')).toEqual([]);
    expect(parseFhspHtml('<html><body>nothing</body></html>')).toEqual([]);
  });
});
