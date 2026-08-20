export type ChartPoint = {
  name: string;
  [key: string]: string | number;
};

export type ChartSeries = {
  key: string;
  label: string;
  color?: string;
  dashed?: boolean;
};

export type TooltipRow = {
  label: string;
  value: number;
  color?: string;
};

export function toFiniteNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export { formatCompact, formatNav } from './format-number';

export function cleanNamedPoints(
  rows: Array<{ name?: unknown; value?: unknown }>,
  valueKey = 'value',
): ChartPoint[] {
  const points: ChartPoint[] = [];
  for (const row of rows) {
    const name = String(row.name ?? '').trim();
    const value = toFiniteNumber(row.value);
    if (!name || value === null) continue;
    points.push({ name, [valueKey]: value });
  }
  return points;
}

export function categoryFromChartClick(
  state: { activeLabel?: string | number } | null | undefined,
): string | null {
  if (state?.activeLabel === undefined || state.activeLabel === '') return null;
  return String(state.activeLabel);
}

export function tooltipRowsFromPayload(
  payload: ReadonlyArray<{ name?: string | number; value?: unknown; color?: string }> | undefined,
): TooltipRow[] {
  if (!payload?.length) return [];
  const rows: TooltipRow[] = [];
  payload.forEach((item, index) => {
    const value = toFiniteNumber(item.value);
    if (value === null) return;
    const label = String(item.name ?? '').trim() || `series-${String(index)}`;
    rows.push({
      label,
      value,
      ...(item.color ? { color: item.color } : {}),
    });
  });
  return rows;
}
