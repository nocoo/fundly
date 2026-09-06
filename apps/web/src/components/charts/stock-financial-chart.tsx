import { useMemo } from 'react';
import { getChartColor } from '@/lib/chart-config';
import { type ChartPoint, toFiniteNumber } from '@/lib/chart-data';
import { formatMetric } from '@/lib/format-number';
import { SeriesChart } from './series-chart';

export interface AnnualStatement {
  fiscalYear: number;
  currency: string;
  income: Record<string, unknown> | null;
  cashFlow: Record<string, unknown> | null;
}

const series = [
  { key: 'revenue', label: '营业收入' },
  { key: 'profit', label: '归母净利润' },
  { key: 'cashflow', label: '经营现金流' },
];

/** Missing disclosures stay absent; a zero or negative reported amount remains a real point. */
export function annualTrendPoints(statements: AnnualStatement[], currency: string): ChartPoint[] {
  return [...statements]
    .sort((a, b) => a.fiscalYear - b.fiscalYear)
    .map((s) => {
      const point: ChartPoint = { name: String(s.fiscalYear) };
      if (s.currency !== currency) return point;
      for (const [key, raw] of [
        ['revenue', s.income?.operating_income],
        ['profit', s.income?.parent_holder_net_profit],
        ['cashflow', s.cashFlow?.act_cash_flow_net],
      ] as const) {
        const value = toFiniteNumber(raw);
        if (value !== null) point[key] = value / 1e8;
      }
      return point;
    });
}

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
