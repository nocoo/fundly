import { Database } from 'bun:sqlite';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const TOKEN_SCOPES = [
  'funds:read',
  'managers:read',
  'market:read',
  'stocks:read',
  'selection:read',
  'daily:read',
  'stats:read',
  '*:read',
] as const;
export type TokenScope = (typeof TOKEN_SCOPES)[number];
export type ApiToken = {
  id: string;
  name: string;
  token_prefix: string;
  scopes: TokenScope[];
  status: 'active' | 'revoked';
  created_by: string;
  created_at: number;
  last_used_at: number | null;
  expires_at: number | null;
  revoked_at: number | null;
};
type StoredToken = Omit<ApiToken, 'scopes'> & { scopes: string; token_hash: string };
const PUBLIC_COLUMNS =
  'id, name, token_prefix, scopes, status, created_by, created_at, last_used_at, expires_at, revoked_at';
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
export function defaultAuthDbPath(): string {
  return resolve(
    process.env.AUTH_DB_PATH ??
      (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT
        ? '/data/auth.db'
        : `${import.meta.dirname}/../../../../data/auth.db`),
  );
}
export class TokenStore {
  readonly db: Database;
  constructor(path: string) {
    if (path !== ':memory:') {
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      closeSync(openSync(path, 'a', 0o600));
    }
    this.db = new Database(path, { create: true });
    this.db.exec(`PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS api_tokens (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, token_prefix TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE, scopes TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('active','revoked')),
        created_by TEXT NOT NULL, created_at INTEGER NOT NULL, last_used_at INTEGER,
        expires_at INTEGER, revoked_at INTEGER
      ); PRAGMA user_version=1;`);
  }
  close() {
    this.db.close();
  }
  list(): ApiToken[] {
    return (
      this.db
        .query(`SELECT ${PUBLIC_COLUMNS} FROM api_tokens ORDER BY created_at DESC, id`)
        .all() as Omit<StoredToken, 'token_hash'>[]
    ).map((row) => ({ ...row, scopes: JSON.parse(row.scopes) as TokenScope[] }));
  }
  create(name: string, scopes: TokenScope[], createdBy: string, days?: number, now = Date.now()) {
    const token = `fdk_${randomBytes(32).toString('base64url')}`;
    const item: ApiToken = {
      id: randomUUID(),
      name,
      token_prefix: token.slice(0, 12),
      scopes,
      status: 'active',
      created_by: createdBy,
      created_at: now,
      last_used_at: null,
      expires_at: days === undefined ? null : now + days * 86400000,
      revoked_at: null,
    };
    this.db
      .query(
        'INSERT INTO api_tokens (id,name,token_prefix,token_hash,scopes,status,created_by,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?)',
      )
      .run(
        item.id,
        item.name,
        item.token_prefix,
        hashToken(token),
        JSON.stringify(scopes),
        item.status,
        item.created_by,
        now,
        item.expires_at,
      );
    return { ...item, token };
  }
  authenticate(token: string, now = Date.now()): ApiToken | null {
    if (!/^fdk_[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const row = this.db
      .query(`SELECT ${PUBLIC_COLUMNS} FROM api_tokens WHERE token_hash=?`)
      .get(hashToken(token)) as Omit<StoredToken, 'token_hash'> | null;
    if (row?.status !== 'active' || (row.expires_at !== null && row.expires_at <= now)) return null;
    if (row.last_used_at === null || row.last_used_at < now - 60000)
      this.db.query('UPDATE api_tokens SET last_used_at=? WHERE id=?').run(now, row.id);
    return { ...row, scopes: JSON.parse(row.scopes) as TokenScope[] };
  }
  revoke(id: string): boolean {
    return (
      this.db
        .query(
          "UPDATE api_tokens SET status='revoked', revoked_at=COALESCE(revoked_at,?) WHERE id=?",
        )
        .run(Date.now(), id).changes > 0
    );
  }
  delete(id: string): 'deleted' | 'active' | 'missing' {
    const row = this.db.query('SELECT status FROM api_tokens WHERE id=?').get(id) as {
      status: string;
    } | null;
    if (!row) return 'missing';
    if (row.status !== 'revoked') return 'active';
    this.db.query("DELETE FROM api_tokens WHERE id=? AND status='revoked'").run(id);
    return 'deleted';
  }
}
