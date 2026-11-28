import { useMemo } from 'react';
import { getChartColor } from '@/lib/chart-config';
import { formatMetric } from '@/lib/format-number';
import { type AnnualStatement, annualTrendPoints } from '@/lib/stock-financial-chart';
import { SeriesChart } from './series-chart';

const series = [
  { key: 'revenue', label: '营业收入' },
  { key: 'profit', label: '归母净利润' },
  { key: 'cashflow', label: '经营现金流' },
];

export function StockFinancialChart({
  statements,
  currency,
}: {
  statements: AnnualStatement[];
  currency: string;
}) {
  const points = useMemo(() => annualTrendPoints(statements, currency), [statements, currency]);
  return (
    <div className="mb-5" data-annual-financial-trend>
      <div className="flex flex-wrap gap-4 text-xs mb-1">
        {series.map((s, index) => (
          <span
            key={s.key}
            className="inline-flex items-center gap-1.5 text-basalt-muted-foreground"
          >
            <span
              className="inline-block h-0.5 w-4"
              style={{ backgroundColor: getChartColor(index) }}
            />
            {s.label}
          </span>
        ))}
        <span className="text-basalt-muted-foreground">
          单位：亿 {currency === 'CNY' ? '人民币' : currency}
        </span>
      </div>
      <SeriesChart
        type="line"
        points={points}
        series={series}
        height={230}
        ariaLabel="年度营业收入、归母净利润与经营现金流趋势"
        valueFormatter={(v) => formatMetric(v, 'scale')}
      />
    </div>
  );
}
