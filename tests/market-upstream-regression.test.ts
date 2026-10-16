import { describe, expect, test } from 'bun:test';
import { macroExitCode } from '../scripts/fetch-macro.ts';
import { parseWatchlistSnapshot } from '../src/fetchers/market-fuyao-collection.ts';
import { isPublishedShfeReport } from '../src/fetchers/market-public-collection.ts';
import { parseSelectionOptions } from '../src/utils/selection-options.ts';

describe('partial macro upstream availability', () => {
  test('selection honors the isolated database environment and explicit override', () => {
    const previous = process.env.FUNDLY_SQLITE;
    try {
      process.env.FUNDLY_SQLITE = 'data/dev.db';
      expect(parseSelectionOptions([]).sqlite).toBe('data/dev.db');
      expect(parseSelectionOptions(['--sqlite', 'explicit.db']).sqlite).toBe('explicit.db');
    } finally {
      if (previous === undefined) delete process.env.FUNDLY_SQLITE;
      else process.env.FUNDLY_SQLITE = previous;
    }
  });

  test('missing and null watchlist quotes retain valid peers and warn', () => {
    const warnings: string[] = [];
    const quotes = parseWatchlistSnapshot(
      {
        item: [
          { thscode: '000001.SH', last_price: 3700 },
          { thscode: '399001.SZ', last_price: null },
        ],
        collectedAt: 123,
      },
      'index',
      ['000001.SH', '399001.SZ', '399006.SZ'],
      '2026-10-16',
      warnings,
    );
    expect(quotes.map((q) => q.instrumentId)).toEqual(['index:000001.SH']);
    expect(quotes[0]?.collectedAt).toBe(123);
    expect(warnings).toEqual([
      'Missing watchlist price: 399001.SZ',
      'Missing watchlist price: 399006.SZ',
    ]);
  });

  test('unexpected or duplicate identities still reject the snapshot', () => {
    for (const item of [[{ thscode: 'bad' }], [{ thscode: 'ok' }, { thscode: 'ok' }]]) {
      expect(() =>
        parseWatchlistSnapshot({ item, collectedAt: 1 }, 'index', ['ok'], '2026-10-16', []),
      ).toThrow('watchlist identity');
    }
  });

  test('today intraday SHFE report is not a published close', () => {
    const raw = JSON.stringify({
      report_date: '20261016',
      o_curinstrument: ['cu', 'au'].map((product) => ({
        PRODUCTID: `${product}_f`,
        DELIVERYMONTH: '2611',
        OPENINTEREST: 100,
        OPENPRICE: 10,
        HIGHESTPRICE: 11,
        LOWESTPRICE: 9,
        CLOSEPRICE: '',
        SETTLEMENTPRICE: '',
      })),
    });
    expect(isPublishedShfeReport(raw, '2026-10-16', '2026-10-16')).toBe(false);
    expect(() => isPublishedShfeReport(raw, '2026-10-16', '2026-10-17')).toThrow('Incomplete');
    expect(() => isPublishedShfeReport(raw, '2026-10-15', '2026-10-16')).toThrow('Invalid');
    expect(() =>
      isPublishedShfeReport('<html>blocked</html>', '2026-10-16', '2026-10-16'),
    ).toThrow();
  });

  test('only total source failure fails the CLI', () => {
    expect(macroExitCode([{ success: true }, { success: false }])).toBe(0);
    expect(macroExitCode([{ success: true }])).toBe(0);
    expect(macroExitCode([{ success: false }])).toBe(1);
    expect(macroExitCode([])).toBe(1);
  });
});
