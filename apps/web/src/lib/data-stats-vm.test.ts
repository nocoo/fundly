import { describe, expect, it } from 'bun:test';
import {
  coverageBars,
  fetchStatusSlices,
  glanceKpis,
  tableCountRows,
  typeL1Bars,
} from './data-stats-vm';

const stats = {
  counts: {
    fund_basic_info: 100,
    fund_performance: 80,
    fund_nav: 1000,
    fund_risk_metrics: 40,
    fund_fees: 90,
  },
  navSpan: { min: '2020-01-01', max: '2026-08-20' },
  lastFetchAt: 1,
  lastFetchStatus: 'success',
  lastPerfDate: '2026-08-18',
  flags: { mvp: 60, pass4433: 10 },
  fetchStatus: [
    { status: 'success', n: 90 },
    { status: 'error', n: 10 },
  ],
};

describe('data stats vm', () => {
  it('rolls type L1 bars and coverage gaps', () => {
    expect(
      typeL1Bars([
        { fund_type: '混合型-偏股', n: 8 },
        { fund_type: '混合型-灵活', n: 2 },
        { fund_type: '股票型', n: 3 },
      ]),
    ).toEqual([
      { name: '混合型', n: 10 },
      { name: '股票型', n: 3 },
    ]);
    expect(coverageBars(stats)[0]).toEqual({ name: '业绩', have: 80, gap: 20 });
  });

  it('builds glance kpis and fetch slices', () => {
    const kpis = glanceKpis(stats);
    expect(kpis[0]?.label).toBe('基金');
    expect(kpis[1]?.hint).toBe('60.0%');
    expect(fetchStatusSlices(stats)).toEqual([
      { name: 'success', value: 90 },
      { name: 'error', value: 10 },
    ]);
    expect(tableCountRows(stats)[0]?.key).toBe('fund_nav');
  });
});
