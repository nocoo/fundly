import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart as RechartsRadar,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import {
  ANIMATION_PROPS,
  CHART_HEIGHTS,
  CHART_TOOLTIP_PROPS,
  chartTickStyle,
  getChartColor,
  RESPONSIVE_CONTAINER_PROPS,
} from '@/lib/chart-config';
import { formatMetric } from '@/lib/format-number';
import { SeriesTooltip } from './chart-tooltip';

export function ScoreRadar({
  items,
  height = CHART_HEIGHTS.compact,
}: {
  items: { name: string; value: number }[];
  height?: number;
}) {
  const peak = Math.max(100, ...items.map((item) => item.value), 0);
  return (
    <div className="h-full w-full min-w-0" style={{ height }} role="img" aria-label="五维能力">
      <ResponsiveContainer {...RESPONSIVE_CONTAINER_PROPS}>
        <RechartsRadar data={items} margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
          <PolarGrid stroke="hsl(var(--chart-axis))" strokeOpacity={0.2} />
          <PolarAngleAxis dataKey="name" tick={chartTickStyle('axis')} />
          <PolarRadiusAxis angle={90} domain={[0, peak]} tick={false} axisLine={false} />
          <Radar
            name="评分"
            dataKey="value"
            stroke={getChartColor(0)}
            fill={getChartColor(0)}
            fillOpacity={0.2}
            {...ANIMATION_PROPS}
          />
          <Tooltip
            {...CHART_TOOLTIP_PROPS}
            content={(props) => (
              <SeriesTooltip
                active={props.active}
                payload={props.payload?.map((item) => ({
                  name: String(item.payload?.name ?? item.name ?? ''),
                  value: item.value,
                  color: item.color,
                }))}
                formatValue={(value) => formatMetric(value, 'count')}
              />
            )}
          />
        </RechartsRadar>
      </ResponsiveContainer>
    </div>
  );
}
