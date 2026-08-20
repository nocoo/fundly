import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import {
  ANIMATION_PROPS,
  CHART_HEIGHTS,
  CHART_TOOLTIP_PROPS,
  getChartColor,
  RESPONSIVE_CONTAINER_PROPS,
} from '@/lib/chart-config';
import { formatMetric } from '@/lib/format-number';
import { SeriesTooltip } from './chart-tooltip';

export function SharePie({
  items,
  height = CHART_HEIGHTS.compact,
}: {
  items: { name: string; value: number }[];
  height?: number;
}) {
  return (
    <div className="h-full w-full min-w-0" style={{ height }} role="img" aria-label="持有人结构">
      <ResponsiveContainer {...RESPONSIVE_CONTAINER_PROPS}>
        <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <Pie
            data={items}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius="48%"
            outerRadius="88%"
            paddingAngle={2}
            {...ANIMATION_PROPS}
          >
            {items.map((item, index) => (
              <Cell key={item.name} fill={getChartColor(index)} stroke="hsl(var(--secondary))" />
            ))}
          </Pie>
          <Tooltip
            {...CHART_TOOLTIP_PROPS}
            content={(props) => (
              <SeriesTooltip
                active={props.active}
                payload={props.payload?.map((item) => ({
                  name: String(item.name ?? ''),
                  value: item.value,
                  color: item.color,
                }))}
                formatValue={(value) => formatMetric(value, 'percent')}
              />
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
