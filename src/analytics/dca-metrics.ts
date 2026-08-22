import type { TotalReturnPoint } from './total-return.ts';

export type DcaMetrics = {
  dca_cagr_3y: number | null;
  dca_vs_lump_3y: number | null;
  dca_month_win_3y: number | null;
  dca_month_vol_3y: number | null;
};

const EMPTY: DcaMetrics = {
  dca_cagr_3y: null,
  dca_vs_lump_3y: null,
  dca_month_win_3y: null,
  dca_month_vol_3y: null,
};

function addMonths(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1 + delta, 1));
  const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(d ?? 1, last);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function lastInMonth(
  points: readonly TotalReturnPoint[],
  start: string,
  end: string,
): TotalReturnPoint | null {
  let found: TotalReturnPoint | null = null;
  for (const point of points) {
    if (point.navDate >= start && point.navDate <= end) found = point;
    if (point.navDate > end) break;
  }
  return found;
}

function xirr(cash: Array<{ date: string; amount: number }>): number | null {
  if (cash.length < 2) return null;
  const t0 = Date.parse(`${cash[0]?.date}T00:00:00Z`);
  const years = cash.map((row) => (Date.parse(`${row.date}T00:00:00Z`) - t0) / (365 * 86_400_000));
  let rate = 0.08;
  for (let i = 0; i < 40; i++) {
    let npv = 0;
    let d = 0;
    for (let j = 0; j < cash.length; j++) {
      const amt = cash[j]?.amount ?? 0;
      const y = years[j] ?? 0;
      const disc = (1 + rate) ** y;
      npv += amt / disc;
      d -= (y * amt) / (disc * (1 + rate));
    }
    if (Math.abs(d) < 1e-12) break;
    const next = rate - npv / d;
    if (!Number.isFinite(next) || next <= -0.99) return null;
    if (Math.abs(next - rate) < 1e-8) return next;
    rate = next;
  }
  return Number.isFinite(rate) ? rate : null;
}

export function computeDcaMetrics(points: readonly TotalReturnPoint[] | null): DcaMetrics {
  if (!points || points.length < 2) return { ...EMPTY };
  const end = points[points.length - 1];
  if (!end) return { ...EMPTY };
  const windowStart = addMonths(end.navDate, -36);
  const debits: TotalReturnPoint[] = [];
  for (let i = 35; i >= 0; i--) {
    const monthEnd = addMonths(windowStart, i + 1);
    const monthStart = addMonths(windowStart, i);
    const hit = lastInMonth(points, monthStart < windowStart ? windowStart : monthStart, monthEnd);
    if (hit) debits.push(hit);
  }
  if (debits.length < 30) return { ...EMPTY };
  const lastTr = end.trNav;
  if (!(lastTr > 0)) return { ...EMPTY };
  let shares = 0;
  for (const debit of debits) {
    if (debit.trNav > 0) shares += 1 / debit.trNav;
  }
  const dcaFv = shares * lastTr;
  const first = debits[0];
  if (!first || !(first.trNav > 0)) return { ...EMPTY };
  const n = debits.length;
  const lumpFv = (n / first.trNav) * lastTr;
  const cash = debits.map((row) => ({ date: row.navDate, amount: -1 }));
  cash.push({ date: end.navDate, amount: dcaFv });
  const irr = xirr(cash);

  const monthRets: number[] = [];
  for (let i = 1; i < debits.length; i++) {
    const prev = debits[i - 1];
    const cur = debits[i];
    if (!prev || !cur || prev.trNav <= 0) continue;
    const prevMonth = prev.navDate.slice(0, 7);
    const expected = addMonths(`${prevMonth}-01`, 1).slice(0, 7);
    if (cur.navDate.slice(0, 7) !== expected) continue;
    monthRets.push(cur.trNav / prev.trNav - 1);
  }
  let win: number | null = null;
  let vol: number | null = null;
  if (monthRets.length >= 2) {
    win = (100 * monthRets.filter((r) => r > 0).length) / monthRets.length;
    const mean = monthRets.reduce((s, r) => s + r, 0) / monthRets.length;
    const varr = monthRets.reduce((s, r) => s + (r - mean) ** 2, 0) / (monthRets.length - 1);
    vol = Math.sqrt(varr) * Math.sqrt(12) * 100;
  }

  return {
    dca_cagr_3y: irr == null ? null : irr * 100,
    dca_vs_lump_3y: lumpFv > 0 ? (dcaFv / lumpFv - 1) * 100 : null,
    dca_month_win_3y: win,
    dca_month_vol_3y: vol,
  };
}
