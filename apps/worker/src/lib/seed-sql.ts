export function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${String(value).replaceAll("'", "''")}'`;
}

export const D1_MAX_SQL_BYTES = 90_000;

export function sqlByteLength(sql: string): number {
  return new TextEncoder().encode(sql).byteLength;
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

export function packInsertStatements(
  table: string,
  columns: readonly string[],
  rows: readonly (readonly unknown[])[],
  maxBytes = D1_MAX_SQL_BYTES,
): { statements: string[]; oversized: (readonly unknown[])[] } {
  const statements: string[] = [];
  const oversized: (readonly unknown[])[] = [];
  let batch: (readonly unknown[])[] = [];

  const flush = () => {
    if (batch.length === 0) return;
    statements.push(sqlInsertStatement(table, columns, batch));
    batch = [];
  };

  for (const row of rows) {
    const alone = sqlInsertStatement(table, columns, [row]);
    if (sqlByteLength(alone) > maxBytes) {
      flush();
      oversized.push(row);
      continue;
    }
    const next = [...batch, row];
    if (sqlByteLength(sqlInsertStatement(table, columns, next)) > maxBytes) {
      flush();
      batch = [row];
    } else {
      batch = next;
    }
  }
  flush();
  return { statements, oversized };
}

export function selectSeedTables<T extends { table: string }>(
  all: readonly T[],
  raw?: string,
): T[] {
  const wanted = (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (wanted.length === 0) return [...all];
  const set = new Set(wanted);
  const picked = all.filter((t) => set.has(t.table));
  if (picked.length === 0) throw new Error(`no seed tables matched ${raw}`);
  return picked;
}

export function chunkByCount<T>(items: readonly T[], size: number): T[][] {
  const n = Math.max(1, size);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n) as T[]);
  return out;
}
