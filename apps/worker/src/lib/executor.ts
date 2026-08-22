export type SqlBinding = string | number | boolean | null;

export function toSqlBindings(params: unknown[]): SqlBinding[] {
  return params.map((value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error('unsupported sqlite binding: non-finite number');
      return value;
    }
    throw new Error(`unsupported sqlite binding: ${typeof value}`);
  });
}

export interface QueryExec {
  all<T>(sql: string, params?: SqlBinding[]): Promise<T[]>;
  first<T>(sql: string, params?: SqlBinding[]): Promise<T | null>;
}
