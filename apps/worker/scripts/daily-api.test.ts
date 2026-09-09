import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { initSchema } from '../../../src/db/repo.ts';
import type { AuthConfig } from '../src/lib/auth-config.ts';
import type { DailyDetail, DailyListItem } from '../src/lib/daily-service.ts';
import { SESSION_COOKIE, signSession } from '../src/lib/session.ts';
import { createApi } from './app.ts';

const cleanup: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanup.splice(0).reverse()) fn();
});

const publicAuth: AuthConfig = {
  enabled: false,
  required: false,
  clientId: '',
  clientSecret: '',
  sessionSecret: '',
  allowedEmails: [],
};

function emptyDb(): string {
  const dir = mkdtempSync(join(tmpdir(), 'fundly-daily-api-db-'));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'test.db');
  const db = new Database(path, { create: true });
  cleanup.push(() => db.close());
  initSchema(db);
  return path;
}

/** Write temp reports under the real content dir (createApi resolves repoRoot via import.meta). */
function withTempDailyContent(files: Record<string, string>): void {
  const repoRoot = resolve(import.meta.dirname, '../../..');
  const dailyDir = join(repoRoot, 'content', 'macro-daily');
  mkdirSync(dailyDir, { recursive: true });
  const written: string[] = [];
  for (const [name, body] of Object.entries(files)) {
    const target = join(dailyDir, name);
    writeFileSync(target, body);
    written.push(target);
  }
  cleanup.push(() => {
    for (const f of written) rmSync(f, { force: true });
  });
}

describe('local daily API integration', () => {
  test('daily routes require a session when auth is enabled', async () => {
    const path = emptyDb();
    const auth: AuthConfig = {
      enabled: true,
      required: true,
      clientId: 'unit-test',
      clientSecret: 'unit-test',
      sessionSecret: 'unit-test-session-signing-value',
      allowedEmails: ['daily-test@example.invalid'],
    };
    const app = createApi(path, { auth });
    expect((await app.request('/api/daily')).status).toBe(401);
    expect((await app.request('/api/daily/2026-09-09')).status).toBe(401);

    const token = await signSession(
      { email: 'daily-test@example.invalid', sub: 'unit-test', name: null, avatar: null },
      auth.sessionSecret,
    );
    const headers = { cookie: `${SESSION_COOKIE}=${token}` };
    const list = await app.request('/api/daily', { headers });
    expect(list.status).toBe(200);
    expect(Array.isArray(await list.json())).toBe(true);
  });

  test('lists newest-first and returns markdown detail for a valid date', async () => {
    const path = emptyDb();
    withTempDailyContent({
      '2099-01-02.md': `---
title: Future Two
date: 2099-01-02
summary: second
---
## Hello

| col |
| --- |
| x |
`,
      '2099-01-01.md': `---
title: Future One
date: 2099-01-01
summary: first
---
body one
`,
    });
    const app = createApi(path, { auth: publicAuth });
    const listRes = await app.request('/api/daily');
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as DailyListItem[];
    const future = list.filter((x) => x.date.startsWith('2099-'));
    expect(future.map((x) => x.date)).toEqual(['2099-01-02', '2099-01-01']);
    expect(future[0]).toMatchObject({
      title: 'Future Two',
      summary: 'second',
      path: 'content/macro-daily/2099-01-02.md',
    });

    const detailRes = await app.request('/api/daily/2099-01-02');
    expect(detailRes.status).toBe(200);
    const detail = (await detailRes.json()) as DailyDetail;
    expect(detail).toMatchObject({
      date: '2099-01-02',
      title: 'Future Two',
      summary: 'second',
    });
    expect(detail.markdown).toContain('| col |');
    expect((detail as { html?: string }).html).toBeUndefined();
  });

  test('invalid date is 400 and missing report is 404', async () => {
    const path = emptyDb();
    const app = createApi(path, { auth: publicAuth });
    expect((await app.request('/api/daily/not-a-date')).status).toBe(400);
    expect((await app.request('/api/daily/2026-9-9')).status).toBe(400);
    // Format-valid YYYY-MM-DD with no file → 404 (no calendar validation)
    expect((await app.request('/api/daily/2099-12-31')).status).toBe(404);
  });

  test('path traversal style dates are rejected as invalid', async () => {
    const path = emptyDb();
    const app = createApi(path, { auth: publicAuth });
    for (const date of ['../etc/passwd', '..%2Fsecret', '2026-09-09%2F..%2F..%2Fetc']) {
      const res = await app.request(`/api/daily/${date}`);
      expect([400, 404]).toContain(res.status);
    }
  });
});
