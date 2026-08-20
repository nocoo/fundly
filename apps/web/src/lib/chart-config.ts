import type { CSSProperties } from 'react';

const PALETTE_SIZE = 14;

export function getChartColor(index: number): string {
  const safe = ((index % PALETTE_SIZE) + PALETTE_SIZE) % PALETTE_SIZE;
  return `hsl(var(--chart-${safe + 1}))`;
}

export function getChartToken(index: number): string {
  const safe = ((index % PALETTE_SIZE) + PALETTE_SIZE) % PALETTE_SIZE;
  return `chart-${safe + 1}`;
}

export function withAlpha(token: string, alpha: number): string {
  const pct = Math.min(1, Math.max(0, alpha));
  return `hsl(var(--${token}) / ${pct})`;
}

export const CHART_TYPE = {
  axisFontSize: 11,
  legendFontSize: 12,
  tooltipTitleSize: 12,
  tooltipBodySize: 12,
  tooltipDot: 8,
  strokeWidth: 2,
  gridDash: '3 3',
  gridOpacity: 0.15,
  areaFillAlpha: 0.18,
} as const;

export type ChartTypeFace = 'axis' | 'legend' | 'tooltipTitle' | 'tooltipBody';

export function chartFontSize(face: ChartTypeFace): number {
  if (face === 'legend') return CHART_TYPE.legendFontSize;
  if (face === 'tooltipTitle') return CHART_TYPE.tooltipTitleSize;
  if (face === 'tooltipBody') return CHART_TYPE.tooltipBodySize;
  return CHART_TYPE.axisFontSize;
}

export function chartTextStyle(face: ChartTypeFace): { fontSize: number } {
  return { fontSize: chartFontSize(face) };
}

export function chartTickStyle(face: ChartTypeFace = 'axis'): {
  fontSize: number;
  fill: string;
} {
  return { fontSize: chartFontSize(face), fill: 'hsl(var(--chart-axis))' };
}

export const CHART_PLOT_MARGIN = {
  time: { top: 16, right: 12, left: 0, bottom: 20 },
  timeDual: { top: 16, right: 0, left: 0, bottom: 20 },
  bars: { top: 16, right: 12, left: 4, bottom: 0 },
} as const;

export const AXIS_CONFIG = {
  get tick() {
    return chartTickStyle('axis');
  },
  axisLine: false as const,
  tickLine: false as const,
};

export const GRID_PROPS = {
  vertical: false as const,
  stroke: 'hsl(var(--chart-axis))',
  strokeOpacity: CHART_TYPE.gridOpacity,
  strokeDasharray: CHART_TYPE.gridDash,
};

export type BarCornerRadius = [number, number, number, number];

export const BAR_RADIUS = {
  none: [0, 0, 0, 0] as BarCornerRadius,
  horizontal: [0, 4, 4, 0] as BarCornerRadius,
  vertical: [4, 4, 0, 0] as BarCornerRadius,
};

export function barCornerRadius(
  orientation: 'vertical' | 'horizontal' = 'vertical',
): BarCornerRadius {
  return orientation === 'horizontal' ? BAR_RADIUS.horizontal : BAR_RADIUS.vertical;
}

export const CHART_HEIGHTS = {
  hero: 340,
  standard: 320,
  compact: 220,
} as const;

export const ANIMATION_PROPS = {
  isAnimationActive: false,
};

export const CHART_TOOLTIP_CURSOR_LINE = {
  stroke: 'hsl(var(--chart-axis))',
  strokeOpacity: 0.35,
  strokeWidth: 1,
} as const;

export const CHART_TOOLTIP_CURSOR_BAR = {
  fill: 'hsl(var(--foreground) / 0.06)',
  stroke: 'none',
} as const;

export const CHART_TOOLTIP_PROPS = {
  isAnimationActive: false,
  animationDuration: 0,
  offset: 12,
  cursor: CHART_TOOLTIP_CURSOR_LINE,
  wrapperStyle: {
    outline: 'none',
    zIndex: 40,
    pointerEvents: 'none' as const,
    transition: 'none',
    animation: 'none',
  },
  allowEscapeViewBox: { x: false, y: true },
};

export const TOOLTIP_STYLES = {
  container:
    'max-w-xs rounded-[var(--radius-widget)] border border-border/60 bg-popover px-3 py-2 shadow-lg',
  title: 'mb-1.5 font-semibold leading-none text-popover-foreground',
  row: 'flex min-w-0 items-center gap-2 leading-5',
  label: 'min-w-0 flex-1 truncate text-muted-foreground',
  value: 'shrink-0 font-medium tabular-nums text-popover-foreground',
  titleFace: 'tooltipTitle' as const satisfies ChartTypeFace,
  bodyFace: 'tooltipBody' as const satisfies ChartTypeFace,
  dotSize: CHART_TYPE.tooltipDot,
};

export const CHART_STROKE_DASHES: readonly (string | undefined)[] = [
  undefined,
  '6 4',
  '2 3',
  '8 3 2 3',
];

export function seriesStrokeDash(index: number): string | undefined {
  return CHART_STROKE_DASHES[index % CHART_STROKE_DASHES.length];
}

export function seriesStroke(index: number): string {
  return getChartColor(index);
}

export const GROWTH_STROKE = {
  fund: 'hsl(var(--chart-1))',
  bench: 'hsl(var(--chart-8))',
} as const;

export function refStroke(index: number): string {
  return index % 2 === 0 ? 'hsl(var(--chart-ref-1))' : 'hsl(var(--chart-ref-2))';
}

export function seriesFill(index: number, alpha = CHART_TYPE.areaFillAlpha): string {
  return withAlpha(getChartToken(index), alpha);
}

export const RESPONSIVE_CONTAINER_PROPS = {
  width: '100%' as const,
  height: '100%' as const,
  minWidth: 0,
  minHeight: 0,
  debounce: 150,
};

export function chartWrapperStyle(height: number): CSSProperties {
  return { height };
}
