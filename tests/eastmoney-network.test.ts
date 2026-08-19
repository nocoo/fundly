import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { fetchFundList, fetchPingzhongData } from '../src/fetchers/eastmoney.ts';

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
});
