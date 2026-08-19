import type { ReactNode } from 'react';
import { chartTextStyle, getChartColor, TOOLTIP_STYLES } from '@/lib/chart-config';
import { formatCompact, type TooltipRow, tooltipRowsFromPayload } from '@/lib/chart-data';
import { cn } from '@/lib/utils';

export function ChartTooltip({
  title,
  children,
  className,
}: {
  title?: string | undefined;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(TOOLTIP_STYLES.container, className)} data-testid="chart-tooltip">
      {title ? (
        <p className={TOOLTIP_STYLES.title} style={chartTextStyle(TOOLTIP_STYLES.titleFace)}>
          {title}
        </p>
      ) : null}
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

export function ChartTooltipRow({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: string;
}) {
  return (
    <div className={TOOLTIP_STYLES.row} style={chartTextStyle(TOOLTIP_STYLES.bodyFace)}>
      <div
        className="shrink-0 rounded-full"
        style={{
          backgroundColor: color,
          width: TOOLTIP_STYLES.dotSize,
          height: TOOLTIP_STYLES.dotSize,
        }}
      />
      <span className={TOOLTIP_STYLES.label}>{label}</span>
      <span className={TOOLTIP_STYLES.value}>{value}</span>
    </div>
  );
}

export function SeriesTooltip({
  active,
  payload,
  label,
  formatValue = formatCompact,
  rows,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ name?: string | number; value?: unknown; color?: string }>;
  label?: string | number;
  formatValue?: (value: number) => string;
  rows?: TooltipRow[];
}) {
  const list = rows && rows.length > 0 ? rows : tooltipRowsFromPayload(payload);
  if (!active || list.length === 0) return null;
  return (
    <ChartTooltip title={label === undefined ? undefined : String(label)}>
      {list.map((item, index) => (
        <ChartTooltipRow
          key={`${item.label}-${String(index)}`}
          color={item.color ?? getChartColor(index)}
          label={item.label}
          value={formatValue(item.value)}
        />
      ))}
    </ChartTooltip>
  );
}
