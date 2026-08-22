import { Database } from 'bun:sqlite';
import { computeCostMetrics } from '../analytics/cost-metrics.ts';
import { computeDcaMetrics } from '../analytics/dca-metrics.ts';
import { computeHoldMetrics } from '../analytics/hold-metrics.ts';
import { assignShareGroups } from '../analytics/share-class.ts';
import { computeStructureMetrics, HS300_BENCH_CODE } from '../analytics/structure-metrics.ts';
import { buildTotalReturn } from '../analytics/total-return.ts';
import { computeSelectScore, type ScoreParts } from '../metrics/select-score.ts';
import { latestNavDate, readDividends, readNav } from './repo.ts';

export type SelectMetricRow = {
  fund_code: string;
  ulcer_1y: number | null;
  underwater_ratio_1y: number | null;
  max_underwater_days_1y: number | null;
  max_consec_down_1y: number | null;
  down_day_ratio_1y: number | null;
  worst_month_1y: number | null;
  recovery_days_1y: number | null;
  recovery_status_1y: string;
  dca_cagr_3y: number | null;
  dca_vs_lump_3y: number | null;
  dca_month_win_3y: number | null;
  dca_month_vol_3y: number | null;
  all_in_fee_pct: number | null;
  sales_fee_known: number;
  share_class: string;
  share_group_key: string;
  scale_yi: number | null;
  scale_asof: string | null;
  equity_ratio_pct: number | null;
  alloc_asof: string | null;
  inst_holder_pct: number | null;
  holder_asof: string | null;
  top10_weight_pct: number | null;
  port_asof: string | null;
  excess_hs300_1y: number | null;
  excess_asof: string | null;
  select_score: number | null;
  score_asof: string | null;
};

function tableExists(db: Database, name: string): boolean {
  const row = db
    .query(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(name) as { ok: number } | null;
  return Boolean(row);
}

function parseJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function scaleLatest(raw: string | null): { date: string; value: number } | null {
  const rec = parseJson(raw) as { categories?: unknown; series?: unknown } | null;
  if (!rec || !Array.isArray(rec.categories) || !Array.isArray(rec.series)) return null;
  const last = rec.categories.length - 1;
  if (last < 0) return null;
  const date = String(rec.categories[last] ?? '');
  const point = rec.series[last] as { y?: unknown } | undefined;
  const value = typeof point?.y === 'number' ? point.y : Number(point?.y);
  if (!date || !Number.isFinite(value)) return null;
  return { date, value };
}

function namedLatest(
  raw: string | null,
): { date: string; latest: Array<{ name: string; value: number }> } | null {
  const rec = parseJson(raw) as { categories?: unknown; series?: unknown } | null;
  if (!rec || !Array.isArray(rec.categories) || !Array.isArray(rec.series)) return null;
  const last = rec.categories.length - 1;
  if (last < 0) return null;
  const date = String(rec.categories[last] ?? '');
  const latest: Array<{ name: string; value: number }> = [];
  for (const item of rec.series) {
    const row = item as { name?: unknown; data?: unknown };
    const name = String(row.name ?? '');
    const data = Array.isArray(row.data) ? row.data : [];
    const value = typeof data[last] === 'number' ? data[last] : Number(data[last]);
    if (name && Number.isFinite(value)) latest.push({ name, value });
  }
  if (!date || latest.length === 0) return null;
  return { date, latest };
}

function computeSelectRows(db: Database): SelectMetricRow[] {
  const scoreAsof = latestNavDate(db);
  if (!scoreAsof) return [];
  const names = db
    .query(
      'SELECT fund_code AS fundCode, fund_name AS fundName, fund_type AS fundType FROM fund_basic_info',
    )
    .all() as Array<{ fundCode: string; fundName: string; fundType: string }>;
  const groups = assignShareGroups(names);
  const benchTr = buildTotalReturn(
    readNav(db, HS300_BENCH_CODE),
    readDividends(db, HS300_BENCH_CODE),
  );

  const hasFees = tableExists(db, 'fund_fees');
  const hasRisk = tableExists(db, 'fund_risk_metrics');
  const hasExtra = tableExists(db, 'fund_trend_extra');
  const hasPort = tableExists(db, 'fund_portfolio');

  const feeMap = new Map<
    string,
    { mgmt: number | null; cust: number | null; sales: number | null }
  >();
  if (hasFees) {
    for (const row of db
      .query(
        `SELECT fund_code, mgmt_fee_pct, custodian_fee_pct, sales_service_fee_pct FROM fund_fees`,
      )
      .all() as Array<{
      fund_code: string;
      mgmt_fee_pct: number | null;
      custodian_fee_pct: number | null;
      sales_service_fee_pct: number | null;
    }>) {
      feeMap.set(row.fund_code, {
        mgmt: row.mgmt_fee_pct,
        cust: row.custodian_fee_pct,
        sales: row.sales_service_fee_pct,
      });
    }
  }
  const riskMap = new Map<string, number | null>();
  const rankMap = new Map<string, number | null>();
  for (const row of db.query('SELECT fund_code, rank_pct_1y FROM fund_performance').all() as Array<{
    fund_code: string;
    rank_pct_1y: number | null;
  }>) {
    rankMap.set(row.fund_code, row.rank_pct_1y);
  }
  if (hasRisk) {
    for (const row of db
      .query('SELECT fund_code, calmar_1y FROM fund_risk_metrics')
      .all() as Array<{ fund_code: string; calmar_1y: number | null }>) {
      riskMap.set(row.fund_code, row.calmar_1y);
    }
  }
  const extraMap = new Map<
    string,
    { scale: string | null; alloc: string | null; holders: string | null }
  >();
  if (hasExtra) {
    for (const row of db
      .query(
        'SELECT fund_code, scale_history_json, asset_allocation_json, holder_structure_json FROM fund_trend_extra',
      )
      .all() as Array<{
      fund_code: string;
      scale_history_json: string | null;
      asset_allocation_json: string | null;
      holder_structure_json: string | null;
    }>) {
      extraMap.set(row.fund_code, {
        scale: row.scale_history_json,
        alloc: row.asset_allocation_json,
        holders: row.holder_structure_json,
      });
    }
  }
  const portMap = new Map<string, { date: string; rows: Array<{ hold_pct: number | null }> }>();
  if (hasPort) {
    for (const row of db
      .query(
        `SELECT p.fund_code, p.report_date, p.hold_pct
         FROM fund_portfolio p
         JOIN (
           SELECT fund_code, MAX(report_date) AS d FROM fund_portfolio GROUP BY fund_code
         ) last ON last.fund_code = p.fund_code AND last.d = p.report_date`,
      )
      .all() as Array<{ fund_code: string; report_date: string; hold_pct: number | null }>) {
      const cur = portMap.get(row.fund_code) ?? { date: row.report_date, rows: [] };
      cur.rows.push({ hold_pct: row.hold_pct });
      portMap.set(row.fund_code, cur);
    }
  }

  const rows: SelectMetricRow[] = [];
  const scoreParts: ScoreParts[] = [];
  for (const fund of names) {
    const tr = buildTotalReturn(readNav(db, fund.fundCode), readDividends(db, fund.fundCode));
    const hold = computeHoldMetrics(tr);
    const dca = computeDcaMetrics(tr);
    const fee = feeMap.get(fund.fundCode);
    const cost = computeCostMetrics({
      mgmtFeePct: fee?.mgmt ?? null,
      custodianFeePct: fee?.cust ?? null,
      salesServiceFeePct: fee?.sales ?? null,
    });
    const extra = extraMap.get(fund.fundCode);
    const structure = computeStructureMetrics({
      scoreAsof,
      scale: scaleLatest(extra?.scale ?? null),
      allocation: namedLatest(extra?.alloc ?? null),
      holders: namedLatest(extra?.holders ?? null),
      portfolio: portMap.get(fund.fundCode) ?? null,
      fundTr: tr,
      benchTr,
    });
    const share = groups.get(fund.fundCode) ?? { shareClass: '', shareGroupKey: '' };
    const part: ScoreParts = {
      rank_pct_1y: rankMap.get(fund.fundCode) ?? null,
      calmar_1y: riskMap.get(fund.fundCode) ?? null,
      ulcer_1y: hold.ulcer_1y,
      all_in_fee_pct: cost.all_in_fee_pct,
      sales_fee_known: cost.sales_fee_known,
    };
    scoreParts.push(part);
    rows.push({
      fund_code: fund.fundCode,
      ...hold,
      ...dca,
      all_in_fee_pct: cost.all_in_fee_pct,
      sales_fee_known: cost.sales_fee_known,
      share_class: share.shareClass,
      share_group_key: share.shareGroupKey,
      ...structure,
      select_score: null,
      score_asof: scoreAsof,
    });
  }

  const byType = new Map<string, number[]>();
  names.forEach((fund, index) => {
    const list = byType.get(fund.fundType) ?? [];
    list.push(index);
    byType.set(fund.fundType, list);
  });
  for (const indexes of byType.values()) {
    const peers = indexes.flatMap((i) => {
      const part = scoreParts[i];
      return part ? [part] : [];
    });
    for (const index of indexes) {
      const row = rows[index];
      const part = scoreParts[index];
      if (!row || !part) continue;
      row.select_score = computeSelectScore(part, peers);
    }
  }

  return rows;
}

function writeSelectRows(db: Database, rows: readonly SelectMetricRow[]): void {
  const insert = db.prepare(
    `INSERT INTO fund_select_metrics (
      fund_code, ulcer_1y, underwater_ratio_1y, max_underwater_days_1y, max_consec_down_1y,
      down_day_ratio_1y, worst_month_1y, recovery_days_1y, recovery_status_1y,
      dca_cagr_3y, dca_vs_lump_3y, dca_month_win_3y, dca_month_vol_3y,
      all_in_fee_pct, sales_fee_known, share_class, share_group_key,
      scale_yi, scale_asof, equity_ratio_pct, alloc_asof, inst_holder_pct, holder_asof,
      top10_weight_pct, port_asof, excess_hs300_1y, excess_asof, select_score, score_asof, updated_at
    ) VALUES (${Array.from({ length: 30 }, () => '?').join(',')})`,
  );
  const now = Date.now();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec('DELETE FROM fund_select_metrics');
    for (const row of rows) {
      insert.run(
        row.fund_code,
        row.ulcer_1y,
        row.underwater_ratio_1y,
        row.max_underwater_days_1y,
        row.max_consec_down_1y,
        row.down_day_ratio_1y,
        row.worst_month_1y,
        row.recovery_days_1y,
        row.recovery_status_1y,
        row.dca_cagr_3y,
        row.dca_vs_lump_3y,
        row.dca_month_win_3y,
        row.dca_month_vol_3y,
        row.all_in_fee_pct,
        row.sales_fee_known,
        row.share_class,
        row.share_group_key,
        row.scale_yi,
        row.scale_asof,
        row.equity_ratio_pct,
        row.alloc_asof,
        row.inst_holder_pct,
        row.holder_asof,
        row.top10_weight_pct,
        row.port_asof,
        row.excess_hs300_1y,
        row.excess_asof,
        row.select_score,
        row.score_asof,
        now,
      );
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function replaceSelectMetrics(db: Database, path?: string): { funds: number } {
  let rows: SelectMetricRow[];
  if (path && path !== ':memory:') {
    const snapshot = new Database(path, { readonly: true });
    try {
      snapshot.exec('BEGIN');
      rows = computeSelectRows(snapshot);
    } finally {
      snapshot.close();
    }
  } else {
    rows = computeSelectRows(db);
  }
  writeSelectRows(db, rows);
  return { funds: rows.length };
}
