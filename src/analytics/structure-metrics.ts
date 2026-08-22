import { windowStartDate } from '../metrics/dates.ts';
import { type TotalReturnPoint, trWindowReturn } from './total-return.ts';

export const HS300_BENCH_CODE = '510300';
const STALE_STRUCTURE_DAYS = 400;
const STALE_EXCESS_DAYS = 14;

export type StructureMetrics = {
  scale_yi: number | null;
  scale_asof: string | null;
  equity_ratio_pct: number | null;
  alloc_asof: string | null;
  inst_holder_pct: number | null;
  holder_asof: string | null;
  top10_weight_pct: number | null;
  port_asof: string | null;
  excess_hs300_1y: number | null;
  excess_asof: string | null;
};

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

function stale(asof: string | null, scoreAsof: string, limit: number): boolean {
  if (!asof) return true;
  return daysBetween(asof, scoreAsof) > limit;
}

function latestNamed(
  latest: Array<{ name: string; value: number }> | undefined,
  pattern: RegExp,
): number | null {
  const hit = latest?.find((item) => pattern.test(item.name));
  return hit && Number.isFinite(hit.value) ? hit.value : null;
}

export function computeTop10Weight(rows: Array<{ hold_pct: number | null }>): number | null {
  if (rows.length === 0) return null;
  if (rows.some((row) => row.hold_pct == null || !Number.isFinite(row.hold_pct))) return null;
  const weights = rows
    .map((row) => row.hold_pct as number)
    .sort((a, b) => b - a)
    .slice(0, 10);
  if (weights.length < 1) return null;
  return weights.reduce((sum, n) => sum + n, 0);
}

export function computeExcessHs300(
  fund: readonly TotalReturnPoint[] | null,
  bench: readonly TotalReturnPoint[] | null,
  scoreAsof: string,
): { excess: number | null; asof: string | null } {
  if (!fund || !bench || fund.length < 2 || bench.length < 2) {
    return { excess: null, asof: null };
  }
  const end = fund[fund.length - 1]?.navDate;
  if (!end) return { excess: null, asof: null };
  const start = windowStartDate(end, 'return_1y');
  if (!start) return { excess: null, asof: null };
  const fundRet = trWindowReturn(fund, start, end);
  const benchRet = trWindowReturn(bench, start, end);
  if (fundRet == null || benchRet == null) return { excess: null, asof: null };
  let asof: string | null = null;
  for (const point of fund) {
    if (point.navDate <= end) asof = point.navDate;
  }
  if (!asof || stale(asof, scoreAsof, STALE_EXCESS_DAYS)) {
    return { excess: null, asof };
  }
  const startPoint = fund.find((p) => p.navDate >= start) ?? fund[0];
  const span = startPoint ? daysBetween(startPoint.navDate, asof) : 0;
  if (span < 0.8 * 365) return { excess: null, asof };
  return { excess: fundRet - benchRet, asof };
}

export function computeStructureMetrics(input: {
  scoreAsof: string;
  scale?: { date: string; value: number } | null;
  allocation?: { date: string; latest: Array<{ name: string; value: number }> } | null;
  holders?: { date: string; latest: Array<{ name: string; value: number }> } | null;
  portfolio?: { date: string; rows: Array<{ hold_pct: number | null }> } | null;
  fundTr: readonly TotalReturnPoint[] | null;
  benchTr: readonly TotalReturnPoint[] | null;
}): StructureMetrics {
  const scaleAsof = input.scale?.date ?? null;
  const allocAsof = input.allocation?.date ?? null;
  const holderAsof = input.holders?.date ?? null;
  const portAsof = input.portfolio?.date ?? null;
  const excess = computeExcessHs300(input.fundTr, input.benchTr, input.scoreAsof);
  return {
    scale_yi: !stale(scaleAsof, input.scoreAsof, STALE_STRUCTURE_DAYS)
      ? (input.scale?.value ?? null)
      : null,
    scale_asof: scaleAsof,
    equity_ratio_pct: !stale(allocAsof, input.scoreAsof, STALE_STRUCTURE_DAYS)
      ? latestNamed(input.allocation?.latest, /股票|权益/)
      : null,
    alloc_asof: allocAsof,
    inst_holder_pct: !stale(holderAsof, input.scoreAsof, STALE_STRUCTURE_DAYS)
      ? latestNamed(input.holders?.latest, /机构/)
      : null,
    holder_asof: holderAsof,
    top10_weight_pct: !stale(portAsof, input.scoreAsof, STALE_STRUCTURE_DAYS)
      ? computeTop10Weight(input.portfolio?.rows ?? [])
      : null,
    port_asof: portAsof,
    excess_hs300_1y: excess.excess,
    excess_asof: excess.asof,
  };
}
