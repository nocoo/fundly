import type { TotalReturnPoint } from './total-return.ts';

export type HoldMetrics = {
  ulcer_1y: number | null;
  underwater_ratio_1y: number | null;
  max_underwater_days_1y: number | null;
  max_consec_down_1y: number | null;
  down_day_ratio_1y: number | null;
  worst_month_1y: number | null;
  recovery_days_1y: number | null;
  recovery_status_1y: 'recovered' | 'open' | 'insufficient';
};

const EMPTY: HoldMetrics = {
  ulcer_1y: null,
  underwater_ratio_1y: null,
  max_underwater_days_1y: null,
  max_consec_down_1y: null,
  down_day_ratio_1y: null,
  worst_month_1y: null,
  recovery_days_1y: null,
  recovery_status_1y: 'insufficient',
};

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

function cutoffDate(last: string, days: number): string {
  const d = new Date(`${last}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function computeHoldMetrics(points: readonly TotalReturnPoint[] | null): HoldMetrics {
  if (!points || points.length < 2) return { ...EMPTY };
  const last = points[points.length - 1]?.navDate;
  if (!last) return { ...EMPTY };
  const window = points.filter((p) => p.navDate >= cutoffDate(last, 365));
  if (window.length < 60) return { ...EMPTY };

  let peak = window[0]?.trNav ?? 0;
  let peakIndex = 0;
  let maxDd = 0;
  let maxDdTrough = 0;
  let underwaterDays = 0;
  let streakUnder = 0;
  let maxUnder = 0;
  let sq = 0;
  for (let i = 0; i < window.length; i++) {
    const nav = window[i]?.trNav ?? 0;
    if (nav > peak) {
      peak = nav;
      peakIndex = i;
    }
    const dd = peak > 0 ? 1 - nav / peak : 0;
    sq += dd * dd;
    if (dd > 1e-12) {
      underwaterDays += 1;
      streakUnder += 1;
      if (streakUnder > maxUnder) maxUnder = streakUnder;
    } else {
      streakUnder = 0;
    }
    if (dd > maxDd) {
      maxDd = dd;
      maxDdTrough = i;
    }
  }

  let downDays = 0;
  let consec = 0;
  let maxConsec = 0;
  for (let i = 1; i < window.length; i++) {
    const prev = window[i - 1]?.trNav ?? 0;
    const cur = window[i]?.trNav ?? 0;
    if (prev > 0 && cur < prev) {
      downDays += 1;
      consec += 1;
      if (consec > maxConsec) maxConsec = consec;
    } else {
      consec = 0;
    }
  }

  const byMonth = new Map<string, { first: number; last: number }>();
  for (const point of window) {
    const month = point.navDate.slice(0, 7);
    const cur = byMonth.get(month);
    if (!cur) byMonth.set(month, { first: point.trNav, last: point.trNav });
    else cur.last = point.trNav;
  }
  const completeMonths = [...byMonth.values()].filter((m) => m.first > 0);
  let worstMonth: number | null = null;
  if (completeMonths.length >= 10) {
    for (const month of completeMonths) {
      const ret = (month.last / month.first - 1) * 100;
      if (worstMonth == null || ret < worstMonth) worstMonth = ret;
    }
  }

  const enough = window.length >= 200 && daysBetween(window[0]?.navDate ?? last, last) >= 292;
  if (!enough) {
    return {
      ...EMPTY,
      max_consec_down_1y: window.length >= 60 ? maxConsec : null,
      down_day_ratio_1y: window.length >= 60 ? (100 * downDays) / (window.length - 1) : null,
      worst_month_1y: worstMonth,
    };
  }

  let recovery: number | null = null;
  let status: HoldMetrics['recovery_status_1y'] = 'open';
  if (maxDd <= 1e-12) {
    recovery = 0;
    status = 'recovered';
  } else {
    const peakNav = window[peakIndex]?.trNav ?? 0;
    for (let i = maxDdTrough; i < window.length; i++) {
      if ((window[i]?.trNav ?? 0) >= peakNav - 1e-12) {
        recovery = i - maxDdTrough;
        status = 'recovered';
        break;
      }
    }
  }

  return {
    ulcer_1y: 100 * Math.sqrt(sq / window.length),
    underwater_ratio_1y: (100 * underwaterDays) / window.length,
    max_underwater_days_1y: maxUnder,
    max_consec_down_1y: maxConsec,
    down_day_ratio_1y: (100 * downDays) / Math.max(1, window.length - 1),
    worst_month_1y: worstMonth,
    recovery_days_1y: recovery,
    recovery_status_1y: status,
  };
}
