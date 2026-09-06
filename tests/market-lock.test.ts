import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireMarketLock } from '../src/utils/market-lock.ts';

describe('macro collector exclusion', () => {
  test('only one collector owns a database while other databases remain independent', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fundly-macro-lock-'));
    const path = join(dir, 'fundly.db');
    const release = acquireMarketLock(path);
    const other = acquireMarketLock(join(dir, 'other.db'));
    try {
      expect(() => acquireMarketLock(path)).toThrow('already running');
      release();
      const again = acquireMarketLock(path);
      again();
      again();
    } finally {
      release();
      other();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a crashed process cannot leave a permanent collection lock', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fundly-macro-lock-crash-'));
    const path = join(dir, 'fundly.db');
    const modulePath = join(import.meta.dir, '../src/utils/market-lock.ts');
    const child = Bun.spawn(
      [
        'bun',
        '-e',
        `import { acquireMarketLock } from ${JSON.stringify(modulePath)}; acquireMarketLock(${JSON.stringify(path)}); console.log('locked'); await Bun.sleep(60000);`,
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    try {
      const reader = child.stdout.getReader();
      const first = await reader.read();
      expect(new TextDecoder().decode(first.value)).toContain('locked');
      expect(() => acquireMarketLock(path)).toThrow('already running');
      child.kill('SIGKILL');
      await child.exited;
      const release = acquireMarketLock(path);
      release();
      reader.releaseLock();
    } finally {
      if (child.exitCode === null) {
        child.kill();
        await child.exited;
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
