import {
  ANIMATION_PROPS,
  AXIS_CONFIG,
  BAR_RADIUS,
  getChartColor as basaltChartColor,
  withAlpha as basaltWithAlpha,
  CHART_COLORS,
  CHART_TOOLTIP_CURSOR_BAR,
  CHART_TOOLTIP_CURSOR_LINE,
  CHART_TYPE,
  type ChartTypeFace,
  chartAxis,
  chartFontSize,
  chartMuted,
  chartTextStyle,
  chartTickStyle,
  GRID_PROPS,
  RESPONSIVE_CONTAINER_PROPS,
} from '@nocoo/basalt/components/chart';
import type { CSSProperties } from 'react';

const CHART_TOKENS = ['chart-1', 'chart-11', 'chart-5', 'chart-7', 'chart-24'] as const;

function paletteIndex(index: number): number {
  return ((index % CHART_COLORS.length) + CHART_COLORS.length) % CHART_COLORS.length;
}

export function getChartColor(index: number): string {
  return basaltChartColor(paletteIndex(index));
}

export function getChartToken(index: number): string {
  return CHART_TOKENS[paletteIndex(index)] ?? CHART_TOKENS[0];
}

export function withAlpha(token: string, alpha: number): string {
  return basaltWithAlpha(token, Math.min(1, Math.max(0, alpha)));
}

export const CHART_PLOT_MARGIN = {
  time: { top: 16, right: 12, left: 0, bottom: 20 },
  timeDual: { top: 16, right: 0, left: 0, bottom: 20 },
  bars: { top: 16, right: 12, left: 4, bottom: 0 },
} as const;

export type BarCornerRadius = [number, number, number, number];

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
    'max-w-xs rounded-basalt-widget border border-basalt-border/60 bg-basalt-popover px-3 py-2 shadow-basalt-card',
  title: 'mb-1.5 font-semibold leading-none text-basalt-popover-foreground',
  row: 'flex min-w-0 items-center gap-2 leading-5',
  label: 'min-w-0 flex-1 truncate text-basalt-muted-foreground',
  value: 'shrink-0 font-medium tabular-nums text-basalt-popover-foreground',
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
  fund: getChartColor(0),
  bench: getChartColor(2),
} as const;

export function refStroke(index: number): string {
  return index % 2 === 0 ? chartAxis : chartMuted;
}

export function seriesFill(index: number, alpha = CHART_TYPE.areaFillAlpha): string {
  return withAlpha(getChartToken(index), alpha);
}

export function chartWrapperStyle(height: number): CSSProperties {
  return { height };
}

export {
  ANIMATION_PROPS,
  AXIS_CONFIG,
  BAR_RADIUS,
  CHART_COLORS,
  CHART_TOOLTIP_CURSOR_BAR,
  CHART_TOOLTIP_CURSOR_LINE,
  CHART_TYPE,
  type ChartTypeFace,
  chartFontSize,
  chartTextStyle,
  chartTickStyle,
  GRID_PROPS,
  RESPONSIVE_CONTAINER_PROPS,
};
