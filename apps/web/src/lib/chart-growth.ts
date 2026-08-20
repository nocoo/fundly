import type { ChartPoint } from './chart-data';

export type NavPoint = { date: string; nav: number };

const MS_DAY = 86_400_000;

export function daySpan(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return (b - a) / MS_DAY;
}

export function growthFromBase(nav: number, base: number): number {
  if (!(base > 0) || !Number.isFinite(nav)) return 0;
  return (nav / base - 1) * 100;
}

export function annualizedGrowth(ratePct: number, days: number): number {
  if (!Number.isFinite(ratePct) || !Number.isFinite(days) || days < 0) return 0;
  return ((1 + ratePct / 100) ** (days / 365.25) - 1) * 100;
}

export function parseRefRates(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const item of raw) {
    const n = typeof item === 'number' ? item : Number(item);
    if (!Number.isFinite(n) || n < -50 || n > 50) continue;
    if (out.some((x) => x === n)) continue;
    out.push(n);
    if (out.length === 2) break;
  }
  return out;
}

export function buildGrowthPoints(
  primary: NavPoint[],
  opts: {
    bench?: NavPoint[];
    refRates?: number[];
    from?: string;
    to?: string;
  } = {},
): ChartPoint[] {
  const inWindow = primary.filter((p) => {
    if (opts.from && p.date < opts.from) return false;
    if (opts.to && p.date > opts.to) return false;
    return true;
  });
  if (inWindow.length === 0) return [];
  const benchByDate = new Map((opts.bench ?? []).map((p) => [p.date, p.nav]));
  const start =
    inWindow.find((p) => (opts.bench?.length ? benchByDate.has(p.date) : true)) ?? inWindow[0];
  if (!start) return [];
  const benchBase = benchByDate.get(start.date);
  const refs = opts.refRates ?? [];
  return inWindow
    .filter((p) => p.date >= start.date)
    .map((p) => {
      const point: ChartPoint = {
        name: p.date,
        t: Date.parse(`${p.date}T00:00:00Z`),
        nav: p.nav,
      };
      if (benchBase !== undefined) {
        const b = benchByDate.get(p.date);
        if (b !== undefined) point.bench = growthFromBase(b, benchBase);
      }
      const days = daySpan(start.date, p.date);
      refs.forEach((rate, index) => {
        point[`ref_${index}`] = annualizedGrowth(rate, days);
      });
      return point;
    });
}
