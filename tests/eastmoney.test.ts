import { describe, expect, test } from 'bun:test';
import {
  extractJsVars,
  parseFundList,
  parseNavPoints,
  parsePerformance,
  parsePingzhongData,
  tsToDate,
} from '../src/fetchers/eastmoney.ts';

describe('parseFundList', () => {
  test('parses standard fundcode_search.js payload', () => {
    const js = `var r = [["000001","HXCZHH","华夏成长混合","混合型-灵活","HUAXIACHENGZHANGHUNHE"],["000002","HXCZHH","华夏成长混合(后端)","混合型-灵活","HUAXIACHENGZHANGHUNHE"]];`;
    const rows = parseFundList(js);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      fundCode: '000001',
      pinyinAbbr: 'HXCZHH',
      fundName: '华夏成长混合',
      fundType: '混合型-灵活',
      pinyinFull: 'HUAXIACHENGZHANGHUNHE',
    });
  });

  test('skips malformed rows', () => {
    const js = `var r = [["000001","","华夏","股票型",""],["bad"],["","","",""]];`;
    const rows = parseFundList(js);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.fundCode).toBe('000001');
  });

  test('throws on unparseable input', () => {
    expect(() => parseFundList('total garbage')).toThrow();
  });
});

describe('tsToDate', () => {
  test('converts ms timestamp to Beijing date YYYY-MM-DD', () => {
    // 2020-01-01 00:00:00 UTC+8 = 2019-12-31 16:00:00 UTC
    // ts (UTC) = Date.UTC(2019, 11, 31, 16, 0, 0) = 1577808000000
    expect(tsToDate(1577808000000)).toBe('2020-01-01');
  });

  test('returns null for invalid input', () => {
    expect(tsToDate(0)).toBeNull();
    expect(tsToDate(Number.NaN)).toBeNull();
    expect(tsToDate(-1)).toBeNull();
  });
});

describe('extractJsVars', () => {
  test('extracts simple string and number vars', () => {
    const js = `var a = "hello"; var b = 123; var c = "world";`;
    const vars = extractJsVars(js);
    expect(vars.a).toBe('"hello"');
    expect(vars.b).toBe('123');
    expect(vars.c).toBe('"world"');
  });

  test('extracts array vars with nested structure', () => {
    const js = `var arr = [{"x":1,"y":"a;b"},[1,2,3]]; var next = 42;`;
    const vars = extractJsVars(js);
    expect(vars.arr).toBe('[{"x":1,"y":"a;b"},[1,2,3]]');
    expect(vars.next).toBe('42');
  });

  test('handles semicolons inside strings', () => {
    const js = `var s = "a;b;c"; var n = 1;`;
    const vars = extractJsVars(js);
    expect(vars.s).toBe('"a;b;c"');
    expect(vars.n).toBe('1');
  });

  test('handles escaped quotes', () => {
    const js = `var s = "he said \\"hi\\""; var n = 1;`;
    const vars = extractJsVars(js);
    expect(vars.s).toContain('he said');
    expect(vars.n).toBe('1');
  });
});

describe('parseNavPoints', () => {
  test('joins net worth with accumulated worth by date', () => {
    // 2020-01-01 = 1577808000000, 2020-01-02 = 1577894400000
    const netWorth = JSON.stringify([
      { x: 1577808000000, y: 1.234, equityReturn: 0.5 },
      { x: 1577894400000, y: 1.245, equityReturn: 0.89 },
    ]);
    const accWorth = JSON.stringify([
      [1577808000000, 2.234],
      [1577894400000, 2.245],
    ]);
    const points = parseNavPoints(netWorth, accWorth);
    expect(points).toHaveLength(2);
    expect(points[0]).toEqual({
      navDate: '2020-01-01',
      unitNav: 1.234,
      accNav: 2.234,
      dailyReturn: 0.5,
    });
  });

  test('returns empty for missing net worth', () => {
    expect(parseNavPoints(undefined, undefined)).toEqual([]);
  });

  test('handles missing acc worth gracefully', () => {
    const netWorth = JSON.stringify([{ x: 1577808000000, y: 1.0, equityReturn: 0 }]);
    const points = parseNavPoints(netWorth, undefined);
    expect(points).toHaveLength(1);
    expect(points[0]?.accNav).toBeNull();
  });

  test('returns empty on malformed json', () => {
    expect(parseNavPoints('not json', undefined)).toEqual([]);
  });

  test('skips points with invalid values', () => {
    const netWorth = JSON.stringify([
      { x: 1577808000000, y: 1.0 },
      { x: 0, y: 2.0 }, // invalid ts
      { x: 1577894400000, y: 'bad' }, // invalid y
    ]);
    const points = parseNavPoints(netWorth, undefined);
    expect(points).toHaveLength(1);
  });
});

describe('parsePerformance', () => {
  test('extracts returns from syl_* vars', () => {
    const vars = {
      syl_1n: '"25.5"',
      syl_6y: '"10.2"',
      syl_3y: '"5.1"',
      syl_1y: '"1.2"',
      syl_3n: '"60.0"',
      syl_5n: '"120.0"',
    };
    const nav = [
      { navDate: '2026-01-01', unitNav: 1, accNav: 1, dailyReturn: 0 },
      { navDate: '2026-08-18', unitNav: 1.2, accNav: 1.2, dailyReturn: 0 },
    ];
    const perf = parsePerformance('123456', vars, nav);
    expect(perf.fundCode).toBe('123456');
    expect(perf.return1y).toBe(25.5);
    expect(perf.return6m).toBe(10.2);
    expect(perf.return3m).toBe(5.1);
    expect(perf.return1m).toBe(1.2);
    expect(perf.return3y).toBe(60);
    expect(perf.return5y).toBe(120);
    expect(perf.dataDate).toBe('2026-08-18');
  });

  test('null when vars absent', () => {
    const perf = parsePerformance('999999', {}, []);
    expect(perf.return1y).toBeNull();
    expect(perf.return3y).toBeNull();
    expect(perf.dataDate).toBeNull();
  });

  test('handles "null" string literal', () => {
    const perf = parsePerformance('123', { syl_1n: 'null' }, []);
    expect(perf.return1y).toBeNull();
  });
});

describe('parsePingzhongData', () => {
  test('assembles NavPoints + Performance + extras', () => {
    const js = `
      var fS_code = "000001";
      var Data_netWorthTrend = [{"x":1577808000000,"y":1.5,"equityReturn":0.5}];
      var Data_ACWorthTrend = [[1577808000000,3.5]];
      var syl_1n = "20.0";
      var Data_assetAllocation = {"foo":"bar"};
      var Data_fluctuationScale = {"scale":100};
      var Data_holderStructure = {};
      var Data_rateInSimilarType = [];
      var Data_performanceEvaluation = {"score":5};
    `;
    const data = parsePingzhongData('000001', js);
    expect(data.fundCode).toBe('000001');
    expect(data.navPoints).toHaveLength(1);
    expect(data.navPoints[0]?.unitNav).toBe(1.5);
    expect(data.performance.return1y).toBe(20);
    expect(data.extra.assetAllocationJson).toContain('bar');
    expect(data.extra.scaleHistoryJson).toContain('100');
    expect(data.extra.performance5dJson).toContain('score');
  });
});
