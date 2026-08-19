import type { SQLQueryBindings } from 'bun:sqlite';

export function toSqliteBindings(params: unknown[]): SQLQueryBindings[] {
  return params.map((value) => {
    if (value === null || value === undefined) return null;
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return value;
    }
    if (value instanceof Uint8Array) return value;
    throw new Error(`unsupported sqlite binding: ${typeof value}`);
  });
}
