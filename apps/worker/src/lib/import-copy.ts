import { type SqlBinding, toSqlBindings } from './executor';
import {
  flattenRows,
  planIncrementalInsert,
  rowKey,
  sqlInsertOrIgnore,
  sqlUpsert,
} from './import-plan';

export interface SqlExec {
  all<T>(sql: string, params?: SqlBinding[]): T[] | Promise<T[]>;
  run(sql: string, params?: SqlBinding[]): unknown | Promise<unknown>;
}

export const IMPORT_TABLES = [
  {
    mode: 'upsert',
    table: 'fund_basic_info',
    columns: [
      'fund_code',
      'fund_name',
      'fund_type',
      'pinyin_abbr',
      'pinyin_full',
      'established_date',
      'fund_manager',
      'fund_company',
      'fund_scale',
      'scale_date',
      'fee_rate',
      'in_mvp_pool',
      'created_at',
      'updated_at',
    ],
    keyCols: ['fund_code'],
  },
  {
    mode: 'upsert',
    table: 'fund_performance',
    columns: [
      'fund_code',
      'return_1m',
      'return_3m',
      'return_6m',
      'return_1y',
      'return_2y',
      'return_3y',
      'return_5y',
      'return_ytd',
      'return_since_start',
      'rank_pct_1m',
      'rank_pct_3m',
      'rank_pct_6m',
      'rank_pct_1y',
      'rank_pct_2y',
      'rank_pct_3y',
      'rank_pct_5y',
      'pass_4433',
      'rank_stats_json',
      'data_date',
      'updated_at',
    ],
    keyCols: ['fund_code'],
  },
  {
    mode: 'upsert',
    table: 'fund_trend_extra',
    columns: [
      'fund_code',
      'asset_allocation_json',
      'scale_history_json',
      'holder_structure_json',
      'ranking_trend_json',
      'performance_5d_json',
      'updated_at',
    ],
    keyCols: ['fund_code'],
  },
  {
    mode: 'append',
    table: 'fund_nav',
    columns: ['fund_code', 'nav_date', 'unit_nav', 'acc_nav', 'daily_return'],
    keyCols: ['fund_code', 'nav_date'],
  },
  {
    mode: 'append',
    table: 'fetch_log',
    columns: [
      'id',
      'fund_code',
      'source',
      'endpoint',
      'status',
      'http_code',
      'error_msg',
      'duration_ms',
      'created_at',
    ],
    keyCols: ['id'],
  },
] as const;

export type ImportTable = (typeof IMPORT_TABLES)[number];

function keyOfRow(table: ImportTable, row: Record<string, unknown>): string {
  return rowKey(table.keyCols.map((c) => row[c] as string | number | null));
}

export async function existingKeys(dest: SqlExec, table: ImportTable): Promise<Set<string>> {
  const cols = table.keyCols.join(', ');
  const rows = await dest.all<Record<string, unknown>>(`SELECT ${cols} FROM ${table.table}`);
  return new Set(rows.map((r) => keyOfRow(table, r)));
}

export async function copyTableIncremental(
  src: SqlExec,
  dest: SqlExec,
  table: ImportTable,
  options: { batchSize?: number } = {},
): Promise<{ inserted: number; skipped: number }> {
  const batchSize = options.batchSize ?? Math.max(1, Math.floor(80 / table.columns.length));
  const incoming = await src.all<Record<string, unknown>>(`SELECT * FROM ${table.table}`);
  const mode = 'mode' in table ? table.mode : 'append';
  let rows = incoming;
  let skipped = 0;
  if (mode === 'append') {
    const existing = await existingKeys(dest, table);
    const plan = planIncrementalInsert(existing, incoming, (r) => keyOfRow(table, r));
    rows = plan.toInsert;
    skipped = plan.skipped;
  }
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const tuples = chunk.map((row) => table.columns.map((c) => row[c] ?? null));
    const sql =
      mode === 'upsert'
        ? sqlUpsert(table.table, table.columns, table.keyCols, chunk.length)
        : sqlInsertOrIgnore(table.table, table.columns, chunk.length);
    await dest.run(sql, toSqlBindings(flattenRows(tuples)));
    inserted += chunk.length;
  }
  return { inserted, skipped };
}
