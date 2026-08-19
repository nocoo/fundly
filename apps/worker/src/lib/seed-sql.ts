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

export function defaultSnapshotAction(
  exists: boolean,
  explicitPath: boolean,
): 'create' | 'reuse' | 'reject' {
  if (explicitPath) return 'reuse';
  if (exists) return 'reject';
  return 'create';
}

export function resolveSeedSqlitePath(opts: {
  livePath: string;
  resumeSqlite?: string;
  skipFiles: number;
}): string {
  if (opts.skipFiles > 0) {
    if (!opts.resumeSqlite) throw new Error('resume requires FUNDLY_SEED_SQLITE');
    return opts.resumeSqlite;
  }
  return opts.resumeSqlite ?? opts.livePath;
}

export function sqliteSnapshot(size: number, mtimeMs: number): string {
  return `${size}:${mtimeMs}`;
}

export function assertSeedSnapshot(
  actual: string,
  expected: string | undefined,
  skipFiles: number,
): void {
  if (skipFiles <= 0) return;
  if (!expected) throw new Error('FUNDLY_SEED_SKIP_FILES requires FUNDLY_SEED_SNAPSHOT');
  if (expected !== actual) throw new Error(`sqlite snapshot ${actual} != ${expected}`);
}

export function parseSkipFiles(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return 0;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error('FUNDLY_SEED_SKIP_FILES must be an integer >= 0');
  }
  return n;
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
  const known = new Set(all.map((t) => t.table));
  const unknown = wanted.filter((name) => !known.has(name));
  if (unknown.length) throw new Error(`unknown seed tables: ${unknown.join(', ')}`);
  return all.filter((t) => wanted.includes(t.table));
}

export function chunkByCount<T>(items: readonly T[], size: number): T[][] {
  const n = Math.max(1, size);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n) as T[]);
  return out;
}
