import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { fetchDividends } from '../src/fetchers/dividend.ts';
import { fetchFundList, fetchPingzhongData } from '../src/fetchers/eastmoney.ts';
import { fetchFees } from '../src/fetchers/fees.ts';
import { fetchManagers } from '../src/fetchers/manager.ts';
import { fetchPortfolio } from '../src/fetchers/portfolio.ts';

// biome-ignore lint/suspicious/noExplicitAny: Bun.serve return type is generic; local test scope
let server: any;

beforeEach(() => {
  server = Bun.serve({
    port: 0,
    fetch: (req) => {
      const url = new URL(req.url);
      if (url.pathname === '/list') {
        return new Response(
          `var r = [["000001","HXCZ","华夏成长","股票型","HUAXIA"],["000002","","","",""]];`,
          { status: 200 },
        );
      }
      if (url.pathname === '/pz/000001') {
        return new Response(
          `var fS_code = "000001";
           var Data_netWorthTrend = [{"x":1577808000000,"y":1.5,"equityReturn":0.5}];
           var Data_ACWorthTrend = [[1577808000000,2.5]];
           var syl_1n = "18.5";`,
          { status: 200 },
        );
      }
      if (url.pathname === '/fhsp/000001') {
        return new Response(
          `<table class='cfxq'><tr><th>年份</th><th>权益登记日</th><th>除息日</th><th>每10份分红</th><th>分红发放日</th></tr><tr><td>2025年</td><td>2025-06-10</td><td>2025-06-11</td><td>每10份派现金0.50元</td><td>2025-06-12</td></tr></table>`,
          { status: 200 },
        );
      }
      if (url.pathname === '/jjfl/000001') {
        return new Response(
          `<table><tr><td>管理费率</td><td>1.20%（每年）</td></tr><tr><td>托管费率</td><td>0.20%（每年）</td></tr></table>`,
          { status: 200 },
        );
      }
      if (url.pathname === '/jjjl/000001') {
        return new Response(
          `<table class="w782 comm jloff"><thead><tr><th>起始期</th><th>截止期</th><th>基金经理</th><th>任职期间</th><th>回报</th></tr></thead><tbody><tr><td>2023-01-01</td><td>至今</td><td>张三</td><td>2年10天</td><td>12.3%</td></tr></tbody></table>`,
          { status: 200 },
        );
      }
      if (url.pathname === '/jjcc/000001') {
        return new Response(
          `var apidata={ content:"<div>截止至：<font>2026-06-30</font><table><tr><td>1</td><td>600519</td><td>贵州茅台</td><td>x</td><td>8.5%</td><td>10</td><td>1500</td></tr></table></div>" };`,
          { status: 200 },
        );
      }
      return new Response('nope', { status: 404 });
    },
  });
});

afterEach(() => {
  server.stop(true);
});

describe('fetchFundList (network)', () => {
  test('fetches and parses list from injected URL', async () => {
    const rows = await fetchFundList(`http://localhost:${server.port}/list`);
    expect(rows.length).toBe(1);
    expect(rows[0]?.fundCode).toBe('000001');
  });
});

describe('fetchPingzhongData (network)', () => {
  test('fetches and parses pingzhong from injected URL builder', async () => {
    const data = await fetchPingzhongData(
      '000001',
      (code) => `http://localhost:${server.port}/pz/${code}`,
    );
    expect(data.fundCode).toBe('000001');
    expect(data.navPoints).toHaveLength(1);
    expect(data.navPoints[0]?.unitNav).toBe(1.5);
    expect(data.performance.return1y).toBe(18.5);
  });

  test('fetches and parses dividend, fees, manager, and portfolio via injected URL builders', async () => {
    const divs = await fetchDividends('000001', (c) => `http://localhost:${server.port}/fhsp/${c}`);
    expect(divs).toHaveLength(1);
    expect(divs[0]?.dividendPerShare).toBeCloseTo(0.05, 6);

    const fees = await fetchFees('000001', (c) => `http://localhost:${server.port}/jjfl/${c}`);
    expect(fees.mgmtFeePct).toBe(1.2);
    expect(fees.custodianFeePct).toBe(0.2);

    const mgrs = await fetchManagers('000001', (c) => `http://localhost:${server.port}/jjjl/${c}`);
    expect(mgrs[0]?.managerNames).toEqual(['张三']);

    const port = await fetchPortfolio('000001', (c) => `http://localhost:${server.port}/jjcc/${c}`);
    expect(port[0]?.stockCode).toBe('600519');
  });
});
