import { Hono } from 'hono';
import type { AppEnv } from '../lib/types';

const WEBHOOK_KEY = 'backy_webhook_url';
const TOKEN_KEY = 'backy_token';

type History = {
  project_name: string;
  environment: string | null;
  total_backups: number;
  recent_backups: Array<{
    id: string;
    tag: string;
    environment: string;
    file_size: number;
    is_single_json: number;
    created_at: string;
  }>;
};

const app = new Hono<AppEnv>();

async function ensureSettings(db: D1Database): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
    )
    .run();
}

async function readValue(db: D1Database, key: string): Promise<string> {
  const row = await db.prepare('SELECT value FROM app_settings WHERE key = ?').bind(key).first<{
    value: string;
  }>();
  return row?.value.trim() ?? '';
}

async function readConfig(db: D1Database) {
  await ensureSettings(db);
  const webhookUrl = await readValue(db, WEBHOOK_KEY);
  const token = await readValue(db, TOKEN_KEY);
  return { webhookUrl, token, hasToken: Boolean(token) };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

app.get('/api/backy', async (c) => {
  const config = await readConfig(c.env.DB);
  const body = {
    available: true,
    configured: Boolean(config.webhookUrl && config.token),
    webhookUrl: config.webhookUrl,
    hasToken: config.hasToken,
    environment: 'prod',
    history: null as History | null,
    error: undefined as string | undefined,
  };
  if (!body.configured) return c.json(body);
  try {
    const res = await fetch(config.webhookUrl, { headers: auth(config.token) });
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(err?.error ?? `backy list failed (HTTP ${res.status})`);
    }
    return c.json({ ...body, history: (await res.json()) as History });
  } catch (error) {
    return c.json({ ...body, error: error instanceof Error ? error.message : String(error) });
  }
});

app.on(['PUT', 'POST'], '/api/backy/config', async (c) => {
  const input = (await c.req.json().catch(() => ({}))) as { webhookUrl?: string; token?: string };
  const webhookUrl = input.webhookUrl?.trim() ?? '';
  if (!webhookUrl) return c.json({ error: 'webhook url is required' }, 400);
  try {
    const parsed = new URL(webhookUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return c.json({ error: 'webhook url must be http(s)' }, 400);
    }
  } catch {
    return c.json({ error: 'webhook url is invalid' }, 400);
  }
  await ensureSettings(c.env.DB);
  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  )
    .bind(WEBHOOK_KEY, webhookUrl, now)
    .run();
  const token = input.token?.trim() ?? '';
  if (token) {
    await c.env.DB.prepare(
      `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
      .bind(TOKEN_KEY, token, now)
      .run();
  }
  return c.json({ webhookUrl, hasToken: Boolean(await readValue(c.env.DB, TOKEN_KEY)) });
});

app.post('/api/backy/test', async (c) => {
  const config = await readConfig(c.env.DB);
  if (!config.webhookUrl || !config.token) {
    return c.json({ error: 'backy webhook url and token are not configured' }, 400);
  }
  try {
    const res = await fetch(config.webhookUrl, {
      method: 'HEAD',
      headers: auth(config.token),
    });
    if (!res.ok) return c.json({ error: `backy head failed (HTTP ${res.status})` }, 400);
    return c.json({ status: res.status });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});

app.post('/api/backy', (c) => c.json({ error: 'push is only available on the local api' }, 400));

app.post('/api/backy/restore', (c) =>
  c.json({ error: 'restore is only available on the local api' }, 400),
);

export default app;
