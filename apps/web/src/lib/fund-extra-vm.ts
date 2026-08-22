import type { ChartPoint, ChartSeries } from './chart-data';

export type ExtraSeries = {
  name: string;
  values: number[];
};

export type AllocationExtra = {
  categories: string[];
  series: ExtraSeries[];
  latest: { name: string; value: number }[];
};

export type ScaleExtra = {
  points: { date: string; value: number; mom: string | null }[];
  latest: { date: string; value: number };
};

export type HolderExtra = {
  categories: string[];
  series: ExtraSeries[];
  latest: { name: string; value: number }[];
};

export type RankingPoint = {
  date: string;
  rank: number;
  peers: number | null;
};

export type ScoreExtra = {
  avr: number | null;
  items: { name: string; value: number }[];
};

export type GrandTotalPoint = {
  date: string;
  fund: number | null;
  hs300: number | null;
  peer: number | null;
};

export type GrandTotalExtra = {
  points: GrandTotalPoint[];
};

export type FundExtras = {
  allocation: AllocationExtra | null;
  scale: ScaleExtra | null;
  holders: HolderExtra | null;
  ranking: RankingPoint[];
  scores: ScoreExtra | null;
  grandTotal: GrandTotalExtra | null;
};

export function seriesChartFromCategories(
  categories: string[],
  series: ExtraSeries[],
): { points: ChartPoint[]; series: ChartSeries[] } {
  const points: ChartPoint[] = categories.map((name, index) => {
    const point: ChartPoint = { name };
    for (const item of series) {
      const value = item.values[index];
      if (typeof value === 'number') point[item.name] = value;
    }
    return point;
  });
  return {
    points,
    series: series.map((item) => ({ key: item.name, label: item.name })),
  };
}

export function scaleChart(scale: ScaleExtra): { points: ChartPoint[]; series: ChartSeries[] } {
  return {
    points: scale.points.map((item) => ({ name: item.date, scale: item.value })),
    series: [{ key: 'scale', label: '规模（亿元）' }],
  };
}

export function rankingChart(ranking: RankingPoint[]): {
  points: ChartPoint[];
  series: ChartSeries[];
} {
  return {
    points: ranking.map((item) => ({ name: item.date, rank: item.rank })),
    series: [{ key: 'rank', label: '同类排名' }],
  };
}

export function scoreChart(scores: ScoreExtra): { points: ChartPoint[]; series: ChartSeries[] } {
  return {
    points: scores.items.map((item) => ({ name: item.name, score: item.value })),
    series: [{ key: 'score', label: '评分' }],
  };
}

export function clipTimePoints(points: ChartPoint[], from: string, to: string): ChartPoint[] {
  return points.flatMap((point) => {
    const day = String(point.name);
    if (day < from || day > to) return [];
    const t = Date.parse(`${day}T00:00:00Z`);
    if (!Number.isFinite(t)) return [];
    return [{ ...point, t }];
  });
}

export function grandTotalChart(grand: GrandTotalExtra): {
  points: ChartPoint[];
  series: ChartSeries[];
  from: string;
  to: string;
} {
  const points: ChartPoint[] = grand.points.map((item) => {
    const point: ChartPoint = { name: item.date };
    if (item.fund != null) point.fund = item.fund;
    if (item.hs300 != null) point.hs300 = item.hs300;
    if (item.peer != null) point.peer = item.peer;
    return point;
  });
  const first = grand.points[0]?.date ?? '';
  const last = grand.points[grand.points.length - 1]?.date ?? '';
  return {
    points,
    series: [
      { key: 'fund', label: '本基金' },
      { key: 'hs300', label: '沪深300' },
      { key: 'peer', label: '同类平均' },
    ],
    from: first,
    to: last,
  };
}

export function hasFundExtras(extras: FundExtras | null | undefined): boolean {
  if (!extras) return false;
  return Boolean(
    extras.allocation ||
      extras.scale ||
      extras.holders ||
      extras.scores ||
      extras.grandTotal ||
      extras.ranking.length,
  );
}
