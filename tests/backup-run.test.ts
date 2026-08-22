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

  test('backup refuses to start without stored credentials', async () => {
    await expect(runBackup({ sqlite: '/tmp/missing-fundly.db' })).rejects.toThrow();
  });
});
