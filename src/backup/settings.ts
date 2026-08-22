import { Database } from 'bun:sqlite';
import type { BackyCredentials } from './backy.ts';

export const BACKY_WEBHOOK_KEY = 'backy_webhook_url';
export const BACKY_TOKEN_KEY = 'backy_token';

export type StoredBackyConfig = {
  webhookUrl: string;
  hasToken: boolean;
};

export function ensureAppSettings(db: Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
}

export function readSetting(db: Database, key: string): string | null {
  ensureAppSettings(db);
  const row = db.query('SELECT value FROM app_settings WHERE key = ?').get(key) as {
    value: string;
  } | null;
  const value = row?.value.trim() ?? '';
  return value || null;
}

export function writeSetting(db: Database, key: string, value: string): void {
  ensureAppSettings(db);
  db.query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, value, Date.now());
}

export function openSettingsDb(sqlitePath: string): Database {
  return new Database(sqlitePath, { create: false, readwrite: true });
}

export function readBackyConfig(sqlitePath: string): StoredBackyConfig {
  const db = openSettingsDb(sqlitePath);
  try {
    return {
      webhookUrl: readSetting(db, BACKY_WEBHOOK_KEY) ?? '',
      hasToken: Boolean(readSetting(db, BACKY_TOKEN_KEY)),
    };
  } finally {
    db.close();
  }
}

export function loadStoredBackyCredentials(sqlitePath: string): BackyCredentials {
  const db = openSettingsDb(sqlitePath);
  try {
    const webhookUrl = readSetting(db, BACKY_WEBHOOK_KEY) ?? '';
    const token = readSetting(db, BACKY_TOKEN_KEY) ?? '';
    if (!webhookUrl || !token) throw new Error('backy webhook url and token are not configured');
    return { webhookUrl, token };
  } finally {
    db.close();
  }
}

export function saveBackyConfig(
  sqlitePath: string,
  input: { webhookUrl: string; token?: string },
): StoredBackyConfig {
  const webhookUrl = input.webhookUrl.trim();
  if (!webhookUrl) throw new Error('webhook url is required');
  try {
    const parsed = new URL(webhookUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('webhook url must be http(s)');
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('webhook url')) throw error;
    throw new Error('webhook url is invalid');
  }
  const db = openSettingsDb(sqlitePath);
  try {
    writeSetting(db, BACKY_WEBHOOK_KEY, webhookUrl);
    const token = input.token?.trim() ?? '';
    if (token) writeSetting(db, BACKY_TOKEN_KEY, token);
    return {
      webhookUrl,
      hasToken: Boolean(readSetting(db, BACKY_TOKEN_KEY)),
    };
  } finally {
    db.close();
  }
}
