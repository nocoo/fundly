import { describe, expect, test } from 'bun:test';
import { aggregateMarketBars, type HistoryBar, yearsBefore } from '../src/metrics/market-bars.ts';

const bar = (
  date: string,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number | null = 0,
): HistoryBar => ({
  date,
  open,
  high,
  low,
  close,
  volume,
  turnover: volume === null ? null : volume * 10,
  source: 'fuyao',
  collectedAt: 100,
});

describe('multi-year candlestick data', () => {
  test('calendar windows clamp leap day and retain month/day otherwise', () => {
    expect(yearsBefore('2024-02-29', 1)).toBe('2023-02-28');
    expect(yearsBefore('2026-09-04', 5)).toBe('2021-09-04');
  });

  test('weekly OHLC uses Monday boundaries across years, first open and final close', () => {
    const source = [
      bar('2024-12-27', 10, 13, 8, 12, 1),
      bar('2024-12-30', 12, 15, 9, 14, 2),
      bar('2025-01-02', 14, 19, 11, 16, 3),
      bar('2025-01-06', 15, 17, 13, 14, 0),
    ];
    const result = aggregateMarketBars(source, 'week');
    expect(result.map((b) => b.date)).toEqual(['2024-12-27', '2025-01-02', '2025-01-06']);
    expect(result[1]).toMatchObject({
      periodStart: '2024-12-30',
      open: 12,
      high: 19,
      low: 9,
      close: 16,
      volume: 5,
      turnover: 50,
      tradingDays: 2,
    });
    expect(result[2]?.volume).toBe(0);
    expect(source[1]?.date).toBe('2024-12-30');
  });

  test('month boundaries and incomplete volume never manufacture totals', () => {
    const result = aggregateMarketBars(
      [
        bar('2026-01-30', 10, 12, 9, 11, 20),
        bar('2026-02-02', 11, 13, 10, 12, 0),
        { ...bar('2026-02-03', 12, 15, 8, 13, null), collectedAt: 200 },
        bar('2026-02-27', 13, 16, 12, 15, 40),
      ],
      'month',
    );
    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({
      periodStart: '2026-02-02',
      date: '2026-02-27',
      open: 11,
      high: 16,
      low: 8,
      close: 15,
      volume: null,
      turnover: null,
      collectedAt: 200,
      tradingDays: 3,
    });
    expect(aggregateMarketBars([], 'month')).toEqual([]);
  });
});
