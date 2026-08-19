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
} from '@/lib/chart-config';
import type { ChartPoint, ChartSeries } from '@/lib/chart-data';
import { formatCompact } from '@/lib/chart-data';
import { SeriesTooltip } from './chart-tooltip';

export type SeriesChartType = 'line' | 'area' | 'bar';

function ChartTooltipLayer({
  type,
  formatValue,
}: {
  type: SeriesChartType;
  formatValue: (value: number) => string;
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
          }))}
          label={props.label}
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
  xMinTickGap,
  ariaLabel,
}: {
  type: SeriesChartType;
  points: ChartPoint[];
  series: ChartSeries[];
  height?: number;
  orientation?: 'vertical' | 'horizontal';
  colorByCategory?: boolean;
  valueFormatter?: (value: number) => string;
  axisValueFormatter?: (value: number) => string;
  xMinTickGap?: number;
  ariaLabel?: string;
}) {
  const formatAxisValue = axisValueFormatter ?? valueFormatter;
  const horizontalBars = type === 'bar' && orientation === 'horizontal';
  const categoryColors =
    type === 'bar' && series.length === 1 && (colorByCategory ?? true) && points.length > 1;
  const Chart = type === 'line' ? LineChart : type === 'area' ? AreaChart : BarChart;
  const yLabelWidth = horizontalBars
    ? Math.min(220, Math.max(72, ...points.map((point) => String(point.name).length * 12)))
    : 44;

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
              right: 12,
              left: horizontalBars ? 4 : 0,
              bottom: 0,
            }}
          >
            <CartesianGrid {...GRID_PROPS} horizontal={!horizontalBars} vertical={horizontalBars} />
            {horizontalBars ? (
              <>
                <XAxis type="number" {...AXIS_CONFIG} tickFormatter={formatAxisValue} />
                <YAxis type="category" dataKey="name" width={yLabelWidth} {...AXIS_CONFIG} />
              </>
            ) : (
              <>
                <XAxis
                  dataKey="name"
                  {...AXIS_CONFIG}
                  interval={points.length <= 6 ? 0 : 'preserveStartEnd'}
                  {...(xMinTickGap !== undefined ? { minTickGap: xMinTickGap } : {})}
                />
                <YAxis {...AXIS_CONFIG} width={44} tickFormatter={formatAxisValue} />
              </>
            )}
            <ChartTooltipLayer type={type} formatValue={valueFormatter} />
            {series.map((item, index) => {
              const stroke = item.color ?? seriesStroke(index);
              if (type === 'line') {
                return (
                  <Line
                    key={item.key}
                    type="monotone"
                    dataKey={item.key}
                    name={item.label}
                    stroke={stroke}
                    dot={false}
                    strokeWidth={CHART_TYPE.strokeWidth}
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
