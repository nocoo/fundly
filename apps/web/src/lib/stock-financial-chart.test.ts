import { expect, test } from 'bun:test';
import { annualTrendPoints } from './stock-financial-chart';

test('annual chart preserves negative cashflow and zero profit without inventing missing revenue', () => {
  expect(
    annualTrendPoints(
      [
        {
          fiscalYear: 2025,
          currency: 'CNY',
          income: { operating_income: '', parent_holder_net_profit: 0 },
          cashFlow: { act_cash_flow_net: -200000000 },
        },
      ],
      'CNY',
    ),
  ).toEqual([{ name: '2025', profit: 0, cashflow: -2 }]);
});

test('annual chart sorts calendar years and leaves a gap for incompatible currencies', () => {
  expect(
    annualTrendPoints(
      [
        {
          fiscalYear: 2025,
          currency: 'CNY',
          income: { operating_income: 100000000 },
          cashFlow: null,
        },
        {
          fiscalYear: 2024,
          currency: 'USD',
          income: { operating_income: 200000000 },
          cashFlow: null,
        },
      ],
      'CNY',
    ),
  ).toEqual([{ name: '2024' }, { name: '2025', revenue: 1 }]);
});
