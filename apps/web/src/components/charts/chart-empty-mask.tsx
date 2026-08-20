import { CHART_HEIGHTS } from '@/lib/chart-config';
import { cn } from '@/lib/utils';

export function ChartEmptyMask({
  label = '暂无净值数据',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn('relative overflow-hidden rounded-widget', className)}
      style={{ height: CHART_HEIGHTS.compact }}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 400 160"
        preserveAspectRatio="none"
        className="h-full w-full text-chart-1"
      >
        <path
          d="M0 110 C40 108 55 92 90 88 C130 84 150 102 190 70 C230 38 250 48 290 42 C330 36 350 58 400 30"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          opacity="0.35"
        />
        <path
          d="M0 160 L0 110 C40 108 55 92 90 88 C130 84 150 102 190 70 C230 38 250 48 290 42 C330 36 350 58 400 30 L400 160 Z"
          fill="currentColor"
          opacity="0.08"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center bg-secondary/55 backdrop-blur-md">
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
