/** Calendar horizons and OHLC aggregation. Input bars must be in date order. */
export type MarketBarInterval = 'day' | 'week' | 'month';
export type MarketYears = 1 | 3 | 5;

export interface HistoryBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  turnover: number | null;
  source: string;
  collectedAt: number | null;
  periodStart?: string;
  tradingDays?: number;
}

export function yearsBefore(date: string, years: MarketYears): string {
  const year = Number(date.slice(0, 4)) - years;
  const month = Number(date.slice(5, 7));
  const day = Math.min(Number(date.slice(8, 10)), new Date(Date.UTC(year, month, 0)).getUTCDate());
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function periodKey(date: string, interval: MarketBarInterval): string {
  if (interval === 'month') return date.slice(0, 7);
  if (interval === 'day') return date;
  const monday = new Date(`${date}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

export function aggregateMarketBars(
  bars: readonly HistoryBar[],
  interval: MarketBarInterval,
): HistoryBar[] {
  const result: HistoryBar[] = [];
  let key = '';
  for (const bar of bars) {
    const nextKey = periodKey(bar.date, interval);
    const active = result.at(-1);
    if (!active || nextKey !== key) {
      result.push({ ...bar, periodStart: bar.date, tradingDays: 1 });
      key = nextKey;
      continue;
    }
    active.date = bar.date;
    active.high = Math.max(active.high, bar.high);
    active.low = Math.min(active.low, bar.low);
    active.close = bar.close;
    // A missing member makes the aggregate unknown, not a misleading partial total.
    active.volume =
      active.volume === null || bar.volume === null ? null : active.volume + bar.volume;
    active.turnover =
      active.turnover === null || bar.turnover === null ? null : active.turnover + bar.turnover;
    const sources = new Set([...active.source.split(', '), bar.source]);
    active.source = [...sources].join(', ');
    active.collectedAt =
      active.collectedAt === null && bar.collectedAt === null
        ? null
        : Math.max(active.collectedAt ?? 0, bar.collectedAt ?? 0);
    active.tradingDays = (active.tradingDays ?? 1) + 1;
  }
  return result;
}
