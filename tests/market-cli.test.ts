import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { initSchema } from '../src/db/repo.ts';

const script = resolve(import.meta.dir, '../scripts/fetch-macro.ts');
describe('macro continuous collector', () => {
  test('a failed source enters the next scheduled wait and SIGTERM shuts down cleanly', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fundly-macro-watch-'));
    const path = join(dir, 'test.db');
    const seed = new Database(path, { create: true });
    initSchema(seed);
    seed.close();
    // A private cwd and explicit empty key guarantee no request uses the developer credential.
    const child = Bun.spawn(
      [process.execPath, 'run', script, '--watch', '--sources', 'fuyao', '--sqlite', path],
      {
        cwd: dir,
        env: { PATH: process.env.PATH, HITHINK_FINANCE_API_KEY: '' },
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    try {
      const reader = child.stdout.getReader();
      let output = '';
      while (!output.includes('waiting for next refresh')) {
        const part = await reader.read();
        if (part.done) throw new Error('Watcher ended before entering its refresh wait');
        output += new TextDecoder().decode(part.value);
      }
      child.kill('SIGTERM');
      expect(await child.exited).toBe(0);
      reader.releaseLock();
      const db = new Database(path, { readonly: true });
      try {
        expect(db.query('SELECT COUNT(*) AS n FROM market_collection_batch').get()).toEqual({
          n: 0,
        });
        expect(
          db.query('SELECT source_key, last_status_code FROM market_source_status').get(),
        ).toEqual({ source_key: 'fuyao', last_status_code: 503 });
      } finally {
        db.close();
      }
    } finally {
      if (child.exitCode === null) {
        child.kill('SIGKILL');
        await child.exited;
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('watch rejects archived mode and an overly aggressive refresh interval before collecting', async () => {
    for (const args of [
      ['--watch', '--offline'],
      ['--watch', '--interval-minutes', '1'],
    ]) {
      const child = Bun.spawn([process.execPath, 'run', script, ...args], {
        env: { PATH: process.env.PATH },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      expect(await child.exited).toBe(1);
      const error = await new Response(child.stderr).text();
      expect(error).toContain(
        args.includes('--offline')
          ? 'Watch mode requires live collection'
          : 'interval-minutes must be an integer',
      );
    }
  });
});
