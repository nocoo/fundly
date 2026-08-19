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

type D1Like = {
  prepare: (sql: string) => {
    bind: (...args: unknown[]) => {
      all: <T>() => Promise<{ results?: T[] }>;
      first: <T>() => Promise<T | null>;
    };
    all: <T>() => Promise<{ results?: T[] }>;
    first: <T>() => Promise<T | null>;
  };
};

export function d1Exec(db: D1Like): QueryExec {
  return {
    async all<T>(sql: string, params: SqlBinding[] = []) {
      const stmt = db.prepare(sql);
      const res = params.length ? await stmt.bind(...params).all<T>() : await stmt.all<T>();
      return res.results ?? [];
    },
    async first<T>(sql: string, params: SqlBinding[] = []) {
      const stmt = db.prepare(sql);
      return params.length ? await stmt.bind(...params).first<T>() : await stmt.first<T>();
    },
  };
}
