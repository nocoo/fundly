import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveEnvironment, resolveSqlite, runBackup, runRestore } from '../src/backup/run.ts';
import { saveBackyConfig } from '../src/backup/settings.ts';
import {
  DEFAULT_DB_PATH,
  initSchema,
  openDb,
  upsertFundList,
  upsertNavPoints,
} from '../src/db/repo.ts';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function setupDb() {
  const dir = mkdtempSync(join(tmpdir(), 'fundly-backup-run-'));
  dirs.push(dir);
  const sqlite = join(dir, 'fundly.db');
  const db = openDb(sqlite);
  initSchema(db);
  upsertFundList(db, [
    {
      fundCode: '000001',
      pinyinAbbr: 'HX',
      fundName: '华夏成长',
      fundType: '股票型',
      pinyinFull: 'HUAXIA',
    },
  ]);
  upsertNavPoints(db, '000001', [
    { navDate: '2026-01-02', unitNav: 1.1, accNav: 1.1, dailyReturn: 1 },
  ]);
  db.close();
  saveBackyConfig(sqlite, { webhookUrl: 'https://backy.example/hook', token: 'tok-1' });
  return { dir, sqlite };
}

describe('backup run helpers', () => {
  test('resolves sqlite path', () => {
    expect(resolveSqlite('/tmp/x.db')).toBe('/tmp/x.db');
    expect(resolveSqlite()).toBe(process.env.FUNDLY_SQLITE ?? DEFAULT_DB_PATH);
  });

  test('resolves environment', () => {
    expect(resolveEnvironment('prod')).toBe('prod');
    expect(resolveEnvironment('test')).toBe('test');
    expect(() => resolveEnvironment('qa')).toThrow('invalid BACKY_ENV');
  });

  test('backup refuses to start without stored credentials', async () => {
    await expect(runBackup({ sqlite: '/tmp/missing-fundly.db' })).rejects.toThrow();
  });

  test('runBackup uploads gzipped snapshot and aborts direct upload on put failure', async () => {
    const { sqlite } = setupDb();
    const uploadedSizes: number[] = [];
    let aborted = false;
    const prevFetch = globalThis.fetch;

    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      if (url.endsWith('/uploads')) {
        return Response.json({
          upload_id: 'up-1',
          put_url: 'https://r2.example/put',
          method: 'PUT',
          headers: {},
          file_key: 'k',
          expires_in: 60,
          max_bytes: 10_000_000,
        });
      }
      if (url === 'https://r2.example/put') {
        const bytes = new Uint8Array(await new Response(init?.body).arrayBuffer());
        uploadedSizes.push(bytes.byteLength);
        return new Response(null, { status: 200 });
      }
      if (url.endsWith('/uploads/up-1/complete')) {
        return Response.json({
          id: 'bk-1',
          project_id: 'fundly',
          file_size: uploadedSizes[0] ?? 0,
          created_at: '2026-10-01T00:00:00Z',
        });
      }
      throw new Error(`unexpected url: ${url}`);
    }) as typeof fetch;

    try {
      const created = await runBackup({ sqlite, environment: 'test', tag: 'unit' });
      expect(created.id).toBe('bk-1');
      expect(uploadedSizes[0] ?? 0).toBeGreaterThan(0);
      expect(existsSync(`${sqlite}.backy.lock`)).toBe(false);
    } finally {
      globalThis.fetch = prevFetch;
    }

    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      if (url.endsWith('/uploads')) {
        return Response.json({
          upload_id: 'up-fail',
          put_url: 'https://r2.example/put-fail',
          method: 'PUT',
          headers: {},
          file_key: 'k',
          expires_in: 60,
          max_bytes: 10_000_000,
        });
      }
      if (url === 'https://r2.example/put-fail') return new Response('put error', { status: 500 });
      if (url.endsWith('/uploads/up-fail') && init?.method === 'DELETE') {
        aborted = true;
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected url: ${url}`);
    }) as typeof fetch;

    try {
      await expect(runBackup({ sqlite })).rejects.toThrow('backy put failed');
      expect(aborted).toBe(true);
      expect(existsSync(`${sqlite}.backy.lock`)).toBe(false);
    } finally {
      globalThis.fetch = prevFetch;
    }
  });

  test('runRestore validates target/backup and restores into new target and --force target', async () => {
    const { dir, sqlite } = setupDb();
    let gzPayload: Uint8Array | null = null;
    const prevFetch = globalThis.fetch;

    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      if (url.endsWith('/uploads')) {
        return Response.json({
          upload_id: 'up-2',
          put_url: 'https://r2.example/put2',
          method: 'PUT',
          headers: {},
          file_key: 'k',
          expires_in: 60,
          max_bytes: 10_000_000,
        });
      }
      if (url === 'https://r2.example/put2') {
        gzPayload = new Uint8Array(await new Response(init?.body).arrayBuffer());
        return new Response(null, { status: 200 });
      }
      if (url.endsWith('/uploads/up-2/complete')) {
        return Response.json({
          id: 'bk-2',
          project_id: 'fundly',
          file_size: 1,
          created_at: '2026-10-01',
        });
      }
      if (url === 'https://backy.example/hook') {
        return Response.json({
          project_name: 'fundly',
          environment: 'prod',
          total_backups: 1,
          recent_backups: [
            {
              id: 'bk-2',
              tag: 't',
              environment: 'prod',
              file_size: gzPayload?.byteLength ?? 0,
              is_single_json: 0,
              created_at: '2026-10-01T00:00:00Z',
            },
          ],
        });
      }
      if (url === 'https://backy.example/api/restore/bk-2') {
        return Response.json({
          url: 'https://r2.example/dl/bk-2',
          backup_id: 'bk-2',
          project_id: 'fundly',
          file_size: gzPayload?.byteLength ?? 0,
          expires_in: 60,
        });
      }
      if (url === 'https://r2.example/dl/bk-2') {
        return new Response(gzPayload, {
          status: 200,
          headers: { 'content-length': String(gzPayload?.byteLength ?? 0) },
        });
      }
      throw new Error(`unexpected url: ${url}`);
    }) as typeof fetch;

    try {
      await runBackup({ sqlite });
      await expect(runRestore({ sqlite })).rejects.toThrow('target exists');
      await expect(
        runRestore({ sqlite, to: join(dir, 'other.db'), id: 'missing' }),
      ).rejects.toThrow('backup not found');

      const newTarget = join(dir, 'restored.db');
      expect(await runRestore({ sqlite, to: newTarget })).toEqual({
        id: 'bk-2',
        target: newTarget,
      });
      expect(existsSync(newTarget)).toBe(true);

      expect(await runRestore({ sqlite, force: true, id: 'bk-2' })).toEqual({
        id: 'bk-2',
        target: sqlite,
      });
    } finally {
      globalThis.fetch = prevFetch;
    }
  });
});
