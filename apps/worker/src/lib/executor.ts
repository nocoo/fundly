export type SqlBinding = string | number | boolean | null;

export interface QueryExec {
  all<T>(sql: string, params?: SqlBinding[]): Promise<T[]>;
  first<T>(sql: string, params?: SqlBinding[]): Promise<T | null>;
}
