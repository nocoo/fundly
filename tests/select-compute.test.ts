import { describe, expect, test } from 'bun:test';
import { unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  initSchema,
  openDb,
  upsertFees,
  upsertFundList,
  upsertNavPoints,
  upsertPerformance,
  upsertPortfolio,
  upsertRiskMetrics,
  upsertTrendExtra,
} from '../src/db/repo.ts';
import { replaceSelectMetrics } from '../src/db/select-compute.ts';

describe('replaceSelectMetrics', () => {
  test('replaces the table in one transaction and computes fee, extra, and portfolio fields', () => {
    const path = join(tmpdir(), `fundly-select-${Date.now()}.db`);
    const db = openDb(path);
    initSchema(db);
    upsertFundList(db, [
      {
        fundCode: '000001',
        pinyinAbbr: 'X',
        fundName: '测试混合A',
        fundType: '混合型-偏股',
        pinyinFull: 'X',
      },
      {
        fundCode: '000002',
        pinyinAbbr: 'Y',
        fundName: '测试混合C',
        fundType: '混合型-偏股',
        pinyinFull: 'Y',
      },
    ]);
    upsertNavPoints(db, '000001', [
      { navDate: '2024-01-01', unitNav: 1, accNav: 1, dailyReturn: null },
      { navDate: '2026-08-01', unitNav: 1.2, accNav: 1.2, dailyReturn: 0.1 },
    ]);
    upsertPerformance(db, {
      fundCode: '000001',
      return1m: 1,
      return3m: 2,
      return6m: 5,
      return1y: 12,
      return2y: 20,
      return3y: 30,
      return5y: null,
      returnYtd: 8,
      returnSinceStart: 20,
      rankPct1m: 10,
      rankPct3m: 10,
      rankPct6m: 10,
      rankPct1y: 12,
      rankPct2y: 15,
      rankPct3y: 20,
      rankPct5y: null,
      dataDate: '2026-08-01',
    });
    upsertFees(db, {
      fundCode: '000001',
      mgmtFeePct: 1.2,
      custodianFeePct: 0.2,
      salesServiceFeePct: 0,
      subscriptionFeeMax: 1.5,
      redemptionFeeMax: 1.5,
      minSubscribeAmount: 10,
      rawJson: '{}',
    });
    upsertRiskMetrics(db, {
      fundCode: '000001',
      dataDate: '2026-08-01',
      volatility1y: 15,
      volatility3y: null,
      volatility5y: null,
      maxDrawdown1y: 10,
      maxDrawdown3y: null,
      maxDrawdown5y: null,
      maxDrawdownAll: 10,
      sharpe1y: 1.2,
      sharpe3y: null,
      sharpe5y: null,
      sortino1y: 1.3,
      sortino3y: null,
      calmar1y: 1.4,
      calmar3y: null,
      annualReturn1y: 12,
      annualReturn3y: null,
      annualReturn5y: null,
      navSamples1y: 250,
      navSamples3y: 0,
      navSamples5y: 0,
    });
    upsertTrendExtra(db, {
      fundCode: '000001',
      navPoints: [],
      moneyYield: [],
      performance: {
        fundCode: '000001',
        return1m: null,
        return3m: null,
        return6m: null,
        return1y: null,
        return2y: null,
        return3y: null,
        return5y: null,
        returnYtd: null,
        returnSinceStart: null,
        rankPct1m: null,
        rankPct3m: null,
        rankPct6m: null,
        rankPct1y: null,
        rankPct2y: null,
        rankPct3y: null,
        rankPct5y: null,
        dataDate: null,
      },
      extra: {
        assetAllocationJson: JSON.stringify({
          categories: ['2026-06-30'],
          series: [{ name: '股票占净比', data: [85.5] }],
        }),
        scaleHistoryJson: JSON.stringify({
          categories: ['2026-06-30'],
          series: [{ y: 25.4 }],
        }),
        holderStructureJson: JSON.stringify({
          categories: ['2026-06-30'],
          series: [{ name: '机构持有比例', data: [32.1] }],
        }),
        rankingTrendJson: null,
        performance5dJson: null,
        grandTotalJson: null,
      },
    });
    upsertPortfolio(db, [
      {
        fundCode: '000001',
        reportDate: '2026-06-30',
        stockCode: '600519',
        stockName: '贵州茅台',
        holdPct: 8.5,
        holdShares: 10,
        holdValueWan: 1500,
      },
    ]);

    const first = replaceSelectMetrics(db, path);
    expect(first.funds).toBe(2);
    const row = db
      .query(
        'SELECT scale_yi, equity_ratio_pct, inst_holder_pct, top10_weight_pct, all_in_fee_pct FROM fund_select_metrics WHERE fund_code = ?',
      )
      .get('000001') as Record<string, number | null>;
    expect(row.scale_yi).toBe(25.4);
    expect(row.equity_ratio_pct).toBe(85.5);
    expect(row.inst_holder_pct).toBe(32.1);
    expect(row.top10_weight_pct).toBe(8.5);
    expect(row.all_in_fee_pct).toBe(1.4);

    replaceSelectMetrics(db);
    const again = db.query('SELECT COUNT(*) AS n FROM fund_select_metrics').get() as { n: number };
    expect(again.n).toBe(2);
    db.close();
    unlinkSync(path);
  });
});
