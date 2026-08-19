export function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function sqlInsertStatement(
  table: string,
  columns: readonly string[],
  rows: readonly (readonly unknown[])[],
): string {
  if (rows.length === 0) throw new Error('sqlInsertStatement requires rows');
  const colList = columns.join(', ');
  const values = rows.map((row) => `(${row.map(sqlLiteral).join(', ')})`).join(', ');
  return `INSERT OR IGNORE INTO ${table} (${colList}) VALUES ${values};`;
}

export function chunkByCount<T>(items: readonly T[], size: number): T[][] {
  const n = Math.max(1, size);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n) as T[]);
  return out;
}
