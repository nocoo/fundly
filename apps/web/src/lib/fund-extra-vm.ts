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

export type FundExtras = {
  allocation: AllocationExtra | null;
  scale: ScaleExtra | null;
  holders: HolderExtra | null;
  ranking: RankingPoint[];
  scores: ScoreExtra | null;
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

export function hasFundExtras(extras: FundExtras | null | undefined): boolean {
  if (!extras) return false;
  return Boolean(
    extras.allocation || extras.scale || extras.holders || extras.scores || extras.ranking.length,
  );
}
