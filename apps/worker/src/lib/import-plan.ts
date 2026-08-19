/** Incremental copy planner: insert keys that are not already present. */

export function rowKey(parts: readonly (string | number | null)[]): string {
  return parts.map((p) => (p === null || p === undefined ? '' : String(p))).join('\t');
}

export function planIncrementalInsert<T>(
  existingKeys: ReadonlySet<string>,
  incoming: readonly T[],
  keyOf: (row: T) => string,
): { toInsert: T[]; skipped: number } {
  const toInsert: T[] = [];
  let skipped = 0;
  const seen = new Set<string>();
  for (const row of incoming) {
    const key = keyOf(row);
    if (existingKeys.has(key) || seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    toInsert.push(row);
  }
  return { toInsert, skipped };
}

export function sqlInsertOrIgnore(
  table: string,
  columns: readonly string[],
  rowCount: number,
): string {
  const colList = columns.join(', ');
  const one = `(${columns.map(() => '?').join(', ')})`;
  const values = Array.from({ length: rowCount }, () => one).join(', ');
  return `INSERT OR IGNORE INTO ${table} (${colList}) VALUES ${values}`;
}

export function flattenRows(rows: readonly (readonly unknown[])[]): unknown[] {
  const out: unknown[] = [];
  for (const row of rows) out.push(...row);
  return out;
}
