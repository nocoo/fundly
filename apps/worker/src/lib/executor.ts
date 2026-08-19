export interface QueryExec {
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  first<T>(sql: string, params?: unknown[]): Promise<T | null>;
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
    async all<T>(sql: string, params: unknown[] = []) {
      const stmt = db.prepare(sql);
      const res = params.length ? await stmt.bind(...params).all<T>() : await stmt.all<T>();
      return res.results ?? [];
    },
    async first<T>(sql: string, params: unknown[] = []) {
      const stmt = db.prepare(sql);
      return params.length ? await stmt.bind(...params).first<T>() : await stmt.first<T>();
    },
  };
}
