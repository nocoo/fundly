import { describe, expect, test } from 'bun:test';
import { MarketReader } from '../src/fetchers/market-reader.ts';
import {
  fetchEtfFinancials,
  fetchEtfHoldings,
  fetchEtfNavPoints,
  fetchEtfProfile,
  fetchStockIndicators,
  fetchStockStatements,
  fetchStockValuationsBatch,
  parseFeePercent,
  validateAndCleanDailyBars,
} from '../src/fetchers/selection-fuyao.ts';

function readerWith(handler: (url: string) => Response | Promise<Response>): MarketReader {
  return new MarketReader({
    mode: 'live',
    apiKey: 'test-only',
    intervalMs: 0,
    fetchImpl: (url) => Promise.resolve(handler(url)),
  });
}

describe('selection-fuyao adapters', () => {
  test('parseFeePercent handles strings, numbers, and invalid inputs', () => {
    expect(parseFeePercent('0.15%')).toBe(0.15);
    expect(parseFeePercent(0.2)).toBe(0.2);
    expect(parseFeePercent(-0.1)).toBeNull();
    expect(parseFeePercent('bad')).toBeNull();
  });

  test('fetchStockIndicators handles 3002 null, mismatches, and invalid JSON', async () => {
    expect(
      await fetchStockIndicators(
        readerWith(() => Response.json({ code: 3002, message: 'empty' })),
        '600519.SH',
        '2025-4',
      ),
    ).toBeNull();

    await expect(
      fetchStockIndicators(
        readerWith(() => new Response('not-json')),
        '600519.SH',
        '2025-4',
      ),
    ).rejects.toThrow('Invalid JSON');

    await expect(
      fetchStockIndicators(
        readerWith(() => Response.json({ code: 500, message: 'fail' })),
        '600519.SH',
        '2025-4',
      ),
    ).rejects.toThrow('Fuyao indicators error');

    await expect(
      fetchStockIndicators(
        readerWith(() =>
          Response.json({
            code: 0,
            data: { thscode: '000001.SZ', report: '2025-4', abilities: [] },
          }),
        ),
        '600519.SH',
        '2025-4',
      ),
    ).rejects.toThrow('Mismatched thscode');

    await expect(
      fetchStockIndicators(
        readerWith(() =>
          Response.json({
            code: 0,
            data: { thscode: '600519.SH', report: '2024-4', abilities: [] },
          }),
        ),
        '600519.SH',
        '2025-4',
      ),
    ).rejects.toThrow('Mismatched report');
  });

  test('fetchStockValuationsBatch handles empty input, >100 batch guard, and valid snapshot', async () => {
    expect(
      await fetchStockValuationsBatch(
        readerWith(() => Response.json({})),
        [],
      ),
    ).toEqual([]);
    await expect(
      fetchStockValuationsBatch(
        readerWith(() => Response.json({})),
        Array.from({ length: 101 }, (_, i) => `${i}.SH`),
      ),
    ).rejects.toThrow('Maximum batch size');

    const vals = await fetchStockValuationsBatch(
      readerWith(() =>
        Response.json({
          code: 0,
          data: {
            timestamp: 1000,
            item: [{ thscode: '600519.SH', trade_date: '2026-09-04', pe_ttm: 22.5, pb_mrq: 7.1 }],
          },
        }),
      ),
      ['600519.SH'],
    );
    expect(vals[0]).toMatchObject({ symbol: '600519.SH', peTtm: 22.5, pbMrq: 7.1 });
  });

  test('fetchStockStatements parses income/balance/cash_flow and rejects mismatched or bad periods', async () => {
    const ms2025End = Date.parse('2025-12-31T00:00:00+08:00');
    const msReport = Date.parse('2026-04-01T00:00:00+08:00');
    for (const stmt of ['income', 'balance', 'cash_flow'] as const) {
      const rows = await fetchStockStatements(
        readerWith(() =>
          Response.json({
            code: 0,
            data: {
              thscode: '600519.SH',
              item: [
                {
                  thscode: '600519.SH',
                  fiscal_year: 2025,
                  fiscal_period: 'FY',
                  period_end_ms: ms2025End,
                  report_date_ms: msReport,
                  currency: 'CNY',
                  operating_income: 1000,
                },
              ],
            },
          }),
        ),
        '600519.SH',
        stmt,
      );
      expect(rows[0]).toMatchObject({
        statementType: stmt,
        fiscalYear: 2025,
        periodEnd: '2025-12-31',
        currency: 'CNY',
      });
    }

    await expect(
      fetchStockStatements(
        readerWith(() =>
          Response.json({
            code: 0,
            data: {
              thscode: '000001.SZ',
              item: [],
            },
          }),
        ),
        '600519.SH',
        'income',
      ),
    ).rejects.toThrow('Mismatched top-level thscode');

    await expect(
      fetchStockStatements(
        readerWith(() =>
          Response.json({
            code: 0,
            data: {
              item: [
                {
                  thscode: '600519.SH',
                  fiscal_year: 2025,
                  fiscal_period: 'Q1',
                  period_end_ms: ms2025End,
                  report_date_ms: msReport,
                  currency: 'CNY',
                },
              ],
            },
          }),
        ),
        '600519.SH',
        'income',
      ),
    ).rejects.toThrow('Invalid annual statement period');
  });

  test('fetchEtfNavPoints, fetchEtfProfile, fetchEtfFinancials, fetchEtfHoldings, and validateAndCleanDailyBars', async () => {
    const navs = await fetchEtfNavPoints(
      readerWith(() =>
        Response.json({
          code: 0,
          data: {
            thscode: '510300.SH',
            item: [
              { nav_date: Date.parse('2026-09-04T00:00:00+08:00'), unit_nav: 4.1, adj_nav: 4.5 },
              { nav_date: '2026-09-03', unit_nav: 4.0, adj_nav: 4.4 },
            ],
          },
        }),
      ),
      '510300.SH',
    );
    expect(navs.map((n) => n.navDate)).toEqual(['2026-09-03', '2026-09-04']);

    const profile = await fetchEtfProfile(
      readerWith(() =>
        Response.json({
          code: 0,
          data: {
            item: [
              {
                thscode: '510300.SH',
                estab_date: Date.parse('2012-05-04T00:00:00+08:00'),
                mgmt_name: '华泰柏瑞',
                manager_name: '柳军',
                fund_scale: 1e11,
                rate_info: [
                  { rate_type: 'management', standard_rate: '0.15%' },
                  { rate_type: '托管费', standard_rate: 0.05 },
                ],
              },
            ],
          },
        }),
      ),
      '510300.SH',
    );
    expect(profile).toMatchObject({
      symbol: '510300.SH',
      estabDate: '2012-05-04',
      managementFeePct: 0.15,
      custodyFeePct: 0.05,
    });

    const fins = await fetchEtfFinancials(
      readerWith(() =>
        Response.json({
          code: 0,
          data: {
            item: [
              {
                start_date_ms: Date.parse('2026-01-01T00:00:00+08:00'),
                end_date_ms: Date.parse('2026-06-30T00:00:00+08:00'),
                publish_date_ms: Date.parse('2026-08-20T00:00:00+08:00'),
                asset_nav: 2e11,
              },
            ],
          },
        }),
      ),
      '510300.SH',
    );
    expect(fins[0]).toMatchObject({ endDate: '2026-06-30', assetNav: 2e11 });

    const holdings = await fetchEtfHoldings(
      readerWith(() =>
        Response.json({
          code: 0,
          data: {
            item: [
              {
                end_date_ms: Date.parse('2026-06-30T00:00:00+08:00'),
                publish_date_ms: Date.parse('2026-07-20T00:00:00+08:00'),
                thscode: '600519.SH',
                stock_name: '贵州茅台',
                asset_type: 'stock',
                hold_ratio: 5.5,
                position_capital: 1000000,
                position_count: 1000,
              },
            ],
          },
        }),
      ),
      '510300.SH',
    );
    expect(holdings[0]).toMatchObject({ stockCode: '600519.SH', holdRatio: 5.5 });

    const cleaned = validateAndCleanDailyBars([
      {
        assetType: 'etf',
        symbol: '510300.SH',
        adjust: 'none',
        tradeDate: '2026-09-04',
        open: 0,
        high: 1,
        low: 0,
        close: 1,
        volume: 10,
        turnover: 10,
        collectedAt: 1,
      },
      {
        assetType: 'stock',
        symbol: '600519.SH',
        adjust: 'forward',
        tradeDate: '2026-09-04',
        open: 10,
        high: 11,
        low: 9,
        close: 10,
        volume: -1,
        turnover: 10,
        collectedAt: 1,
      },
    ]);
    expect(cleaned).toEqual([]);
  });
});
