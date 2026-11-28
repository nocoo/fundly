import { type ChartPoint, toFiniteNumber } from './chart-data';

export interface AnnualStatement {
  fiscalYear: number;
  currency: string;
  income: Record<string, unknown> | null;
  cashFlow: Record<string, unknown> | null;
}

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
