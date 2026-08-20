import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ANIMATION_PROPS,
  AXIS_CONFIG,
  barCornerRadius,
  CHART_HEIGHTS,
  CHART_TOOLTIP_CURSOR_BAR,
  CHART_TOOLTIP_PROPS,
  CHART_TYPE,
  GRID_PROPS,
  getChartColor,
  RESPONSIVE_CONTAINER_PROPS,
  seriesFill,
  seriesStroke,
  seriesStrokeDash,
} from '@/lib/chart-config';
import type { ChartPoint, ChartSeries } from '@/lib/chart-data';
import { formatCompact } from '@/lib/chart-data';
import { SeriesTooltip } from './chart-tooltip';

export type SeriesChartType = 'line' | 'area' | 'bar';

function formatMonthTick(value: number): string {
  return new Date(value).toISOString().slice(0, 7);
}

function TimeXTick({
  x = 0,
  y = 0,
  payload,
  index = 0,
  visibleTicksCount = 0,
}: {
  x?: number;
  y?: number;
  payload?: { value: number };
  index?: number;
  visibleTicksCount?: number;
}) {
  if (payload == null || !Number.isFinite(payload.value)) return null;
  const last = visibleTicksCount > 1 && index === visibleTicksCount - 1;
  const anchor = index === 0 ? 'start' : last ? 'end' : 'middle';
  return (
    <text
      x={x}
      y={y}
      dy={12}
      textAnchor={anchor}
      fontSize={CHART_TYPE.axisFontSize}
      fill="hsl(var(--chart-axis))"
    >
      {formatMonthTick(payload.value)}
    </text>
  );
}

function axisWidth(
  points: ChartPoint[],
  series: ChartSeries[],
  format: (value: number) => string,
): number {
  let max = 3;
  for (const point of points) {
    for (const item of series) {
      const raw = point[item.key];
      if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
      max = Math.max(max, format(raw).length);
    }
  }
  return Math.min(84, Math.max(52, max * 8 + 10));
}

function ChartTooltipLayer({
  type,
  formatValue,
  formatLabel,
}: {
  type: SeriesChartType;
  formatValue: (value: number, row: { key?: string; label: string }) => string;
  formatLabel?: (label: string | number) => string;
}) {
  const cursor = type === 'bar' ? CHART_TOOLTIP_CURSOR_BAR : CHART_TOOLTIP_PROPS.cursor;
  return (
    <Tooltip
      {...CHART_TOOLTIP_PROPS}
      cursor={cursor}
      content={(props) => (
        <SeriesTooltip
          active={props.active}
          payload={props.payload?.map((item) => ({
            name: item.name,
            value: item.value,
            color: item.color,
            dataKey: typeof item.dataKey === 'function' ? undefined : item.dataKey,
          }))}
          label={formatLabel && props.label !== undefined ? formatLabel(props.label) : props.label}
          formatValue={formatValue}
        />
      )}
    />
  );
}

export function SeriesChart({
  type,
  points,
  series,
  height = CHART_HEIGHTS.standard,
  orientation = 'vertical',
  colorByCategory,
  valueFormatter = formatCompact,
  axisValueFormatter,
  rightValueFormatter,
  rightAxisValueFormatter,
  xMinTickGap,
  ariaLabel,
  timeDomain,
}: {
  type: SeriesChartType;
  points: ChartPoint[];
  series: ChartSeries[];
  height?: number;
  orientation?: 'vertical' | 'horizontal';
  colorByCategory?: boolean;
  valueFormatter?: (value: number) => string;
  axisValueFormatter?: (value: number) => string;
  rightValueFormatter?: (value: number) => string;
  rightAxisValueFormatter?: (value: number) => string;
  xMinTickGap?: number;
  ariaLabel?: string;
  timeDomain?: { from: number; to: number };
}) {
  const formatAxisValue = axisValueFormatter ?? valueFormatter;
  const formatRightValue = rightValueFormatter ?? valueFormatter;
  const formatRightAxis = rightAxisValueFormatter ?? formatRightValue;
  const horizontalBars = type === 'bar' && orientation === 'horizontal';
  const categoryColors =
    type === 'bar' && series.length === 1 && (colorByCategory ?? true) && points.length > 1;
  const Chart = type === 'line' ? LineChart : type === 'area' ? AreaChart : BarChart;
  const leftSeries = series.filter((item) => item.yAxis !== 'right');
  const rightSeries = series.filter((item) => item.yAxis === 'right');
  const hasRight = !horizontalBars && rightSeries.length > 0;
  const yLabelWidth = horizontalBars
    ? Math.min(220, Math.max(72, ...points.map((point) => String(point.name).length * 12)))
    : axisWidth(points, leftSeries.length > 0 ? leftSeries : series, formatAxisValue);
  const rightLabelWidth = hasRight ? axisWidth(points, rightSeries, formatRightAxis) : 0;
  const rightKeys = new Set(rightSeries.map((item) => item.key));

  return (
    <div
      data-testid="series-chart"
      data-type={type}
      data-orientation={orientation}
      className="h-full w-full min-w-0"
      style={{ height }}
      {...(ariaLabel ? { role: 'img', 'aria-label': ariaLabel } : {})}
    >
      <div aria-hidden="true" className="h-full w-full">
        <ResponsiveContainer {...RESPONSIVE_CONTAINER_PROPS}>
          <Chart
            data={points}
            layout={horizontalBars ? 'vertical' : 'horizontal'}
            accessibilityLayer={false}
            margin={{
              top: 8,
              right: hasRight ? 0 : 12,
              left: horizontalBars ? 4 : 0,
              bottom: horizontalBars ? 0 : 18,
            }}
          >
            <CartesianGrid {...GRID_PROPS} horizontal={!horizontalBars} vertical={horizontalBars} />
            {horizontalBars ? (
              <>
                <XAxis type="number" {...AXIS_CONFIG} tickFormatter={formatAxisValue} />
                <YAxis type="category" dataKey="name" width={yLabelWidth} {...AXIS_CONFIG} />
              </>
            ) : timeDomain ? (
              <>
                <XAxis
                  type="number"
                  dataKey="t"
                  domain={[timeDomain.from, timeDomain.to]}
                  {...AXIS_CONFIG}
                  tick={<TimeXTick />}
                  tickMargin={4}
                  {...(xMinTickGap !== undefined
                    ? { minTickGap: xMinTickGap }
                    : { minTickGap: 48 })}
                />
                <YAxis
                  {...AXIS_CONFIG}
                  yAxisId="left"
                  width={yLabelWidth}
                  tickFormatter={formatAxisValue}
                  tickMargin={4}
                />
                {hasRight ? (
                  <YAxis
                    {...AXIS_CONFIG}
                    yAxisId="right"
                    orientation="right"
                    width={rightLabelWidth}
                    tickFormatter={formatRightAxis}
                    tickMargin={4}
                  />
                ) : null}
              </>
            ) : (
              <>
                <XAxis
                  dataKey="name"
                  {...AXIS_CONFIG}
                  interval={points.length <= 6 ? 0 : 'preserveStartEnd'}
                  {...(xMinTickGap !== undefined ? { minTickGap: xMinTickGap } : {})}
                />
                <YAxis {...AXIS_CONFIG} width={yLabelWidth} tickFormatter={formatAxisValue} />
              </>
            )}
            <ChartTooltipLayer
              type={type}
              formatValue={(value, row) =>
                row.key && rightKeys.has(row.key) ? formatRightValue(value) : valueFormatter(value)
              }
              formatLabel={
                timeDomain
                  ? (label) =>
                      typeof label === 'number'
                        ? new Date(label).toISOString().slice(0, 10)
                        : String(label)
                  : undefined
              }
            />
            {series.map((item, index) => {
              const stroke = item.color ?? seriesStroke(index);
              const axisId = timeDomain ? (item.yAxis === 'right' ? 'right' : 'left') : undefined;
              if (type === 'line') {
                const dash = item.dashed ? seriesStrokeDash(1) : undefined;
                return (
                  <Line
                    key={item.key}
                    type="monotone"
                    dataKey={item.key}
                    name={item.label}
                    stroke={stroke}
                    dot={false}
                    strokeWidth={CHART_TYPE.strokeWidth}
                    {...(axisId ? { yAxisId: axisId } : {})}
                    {...(dash ? { strokeDasharray: dash } : {})}
                    {...ANIMATION_PROPS}
                  />
                );
              }
              if (type === 'area') {
                return (
                  <Area
                    key={item.key}
                    type="monotone"
                    dataKey={item.key}
                    name={item.label}
                    stroke={stroke}
                    fill={seriesFill(index)}
                    strokeWidth={CHART_TYPE.strokeWidth}
                    {...(axisId ? { yAxisId: axisId } : {})}
                    {...ANIMATION_PROPS}
                  />
                );
              }
              return (
                <Bar
                  key={item.key}
                  dataKey={item.key}
                  name={item.label}
                  fill={stroke}
                  radius={barCornerRadius(horizontalBars ? 'horizontal' : 'vertical')}
                  {...(axisId ? { yAxisId: axisId } : {})}
                  {...ANIMATION_PROPS}
                >
                  {categoryColors
                    ? points.map((point, pointIndex) => (
                        <Cell key={`${item.key}-${point.name}`} fill={getChartColor(pointIndex)} />
                      ))
                    : null}
                </Bar>
              );
            })}
          </Chart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
