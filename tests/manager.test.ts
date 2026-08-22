import { describe, expect, test } from 'bun:test';
import {
  parseJjjlHtml,
  parsePctSigned,
  parseTenureDays,
  splitManagers,
} from '../src/fetchers/manager.ts';

describe('splitManagers', () => {
  test('splits by whitespace/comma/等', () => {
    expect(splitManagers('张坤 杨思亮 何一铖')).toEqual(['张坤', '杨思亮', '何一铖']);
    expect(splitManagers('张三,李四')).toEqual(['张三', '李四']);
    expect(splitManagers('张三、李四')).toEqual(['张三', '李四']);
  });
  test('empty input', () => {
    expect(splitManagers('')).toEqual([]);
    expect(splitManagers('---')).toEqual([]);
  });
});

describe('parseTenureDays', () => {
  test('parses X年Y天', () => {
    expect(parseTenureDays('7年又261天')).toBe(7 * 365 + 261);
    expect(parseTenureDays('88天')).toBe(88);
    expect(parseTenureDays('3年')).toBe(3 * 365);
  });
  test('null on garbage', () => {
    expect(parseTenureDays('---')).toBeNull();
  });
});

describe('parsePctSigned', () => {
  test('handles negative', () => {
    expect(parsePctSigned('-3.78%')).toBe(-3.78);
    expect(parsePctSigned('61.84%')).toBe(61.84);
  });
  test('null on absent', () => {
    expect(parsePctSigned('---')).toBeNull();
  });
});

describe('parseJjjlHtml', () => {
  test('parses current + past managers', () => {
    const html = `<table class="w782 comm jloff">
      <thead><tr><th>起始期</th><th>截止期</th><th>基金经理</th><th>任职期间</th><th>回报</th></tr></thead>
      <tbody>
        <tr><td>2026-05-23</td><td>至今</td><td>张坤 杨思亮 何一铖</td><td>88天</td><td class='red'>-3.78%</td></tr>
        <tr><td>2018-09-05</td><td>2026-05-22</td><td>张坤</td><td>7年又261天</td><td>61.84%</td></tr>
      </tbody>
    </table>`;
    const terms = parseJjjlHtml(html);
    expect(terms).toHaveLength(2);
    expect(terms[0]?.startDate).toBe('2026-05-23');
    expect(terms[0]?.endDate).toBeNull();
    expect(terms[0]?.managerNames).toEqual(['张坤', '杨思亮', '何一铖']);
    expect(terms[0]?.tenureDays).toBe(88);
    expect(terms[0]?.returnDuring).toBe(-3.78);
    expect(terms[1]?.endDate).toBe('2026-05-22');
    expect(terms[1]?.managerNames).toEqual(['张坤']);
    expect(terms[1]?.returnDuring).toBe(61.84);
  });

  test('empty when table absent', () => {
    expect(parseJjjlHtml('')).toEqual([]);
    expect(parseJjjlHtml('<html>nothing</html>')).toEqual([]);
  });
});
