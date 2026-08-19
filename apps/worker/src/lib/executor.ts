export interface QueryExec {
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  first<T>(sql: string, params?: unknown[]): Promise<T | null>;
}

export function d1Exec(db: D1Database): QueryExec {
  return {
    async all<T>(sql: string, params: unknown[] = []) {
      const stmt = db.prepare(sql);
      const bound = params.length ? stmt.bind(...params) : stmt;
      const res = await bound.all<T>();
      return res.results ?? [];
    },
    async first<T>(sql: string, params: unknown[] = []) {
      const stmt = db.prepare(sql);
      const bound = params.length ? stmt.bind(...params) : stmt;
      return (await bound.first<T>()) ?? null;
    },
  };
}
