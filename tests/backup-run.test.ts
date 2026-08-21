import { describe, expect, test } from 'bun:test';
import { resolveEnvironment, resolveSqlite, runBackup } from '../src/backup/run.ts';
import { DEFAULT_DB_PATH } from '../src/db/repo.ts';

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

  test('backup refuses to start without credentials', async () => {
    const prevUrl = process.env.BACKY_WEBHOOK_URL;
    const prevTok = process.env.BACKY_TOKEN;
    delete process.env.BACKY_WEBHOOK_URL;
    delete process.env.BACKY_TOKEN;
    try {
      await expect(runBackup({ sqlite: '/tmp/missing.db' })).rejects.toThrow(
        'BACKY_WEBHOOK_URL and BACKY_TOKEN are required',
      );
    } finally {
      if (prevUrl) process.env.BACKY_WEBHOOK_URL = prevUrl;
      else delete process.env.BACKY_WEBHOOK_URL;
      if (prevTok) process.env.BACKY_TOKEN = prevTok;
      else delete process.env.BACKY_TOKEN;
    }
  });
});
