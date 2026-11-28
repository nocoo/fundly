import { describe, expect, it } from 'bun:test';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  assertRepoVersionsInSync,
  bump,
  changelogRange,
  packageVersionFromJson,
  runtimeVersionFromTs,
  uiVersionFromTsx,
} from '../scripts/release-lib';

const repoRoot = resolve(import.meta.dirname, '..');

describe('release-lib', () => {
  it('bumps patch and uses the previous tag as the log start', () => {
    expect(bump('0.1.1', 'patch')).toBe('0.1.2');
    expect(changelogRange('0.1.1', true)).toBe('v0.1.1..HEAD');
  });

  it('falls back to HEAD when the previous tag is missing', () => {
    expect(changelogRange('0.1.2', false)).toBe('HEAD');
    expect(bump('0.1.1', '0.1.2')).toBe('0.1.2');
  });

  it('parses package and runtime version markers', () => {
    expect(packageVersionFromJson('{"version":"1.2.3"}')).toBe('1.2.3');
    expect(runtimeVersionFromTs("export const APP_VERSION = '1.2.3';")).toBe('1.2.3');
    expect(uiVersionFromTsx("const APP_VERSION = '1.2.3';")).toBe('1.2.3');
  });

  it('keeps release version sources aligned with package.json and rejects drift', () => {
    expect(() => assertRepoVersionsInSync(repoRoot)).not.toThrow();

    const dir = mkdtempSync(join(tmpdir(), 'fundly-release-lib-'));
    try {
      for (const rel of [
        'package.json',
        'apps/web/package.json',
        'apps/worker/package.json',
        'apps/worker/src/lib/version.ts',
        'apps/web/src/components/layout/sidebar.tsx',
        'apps/web/src/app/login-page.tsx',
      ]) {
        cpSync(resolve(repoRoot, rel), join(dir, rel), { recursive: true });
      }
      writeFileSync(join(dir, 'apps/web/package.json'), JSON.stringify({ version: '9.9.9' }));
      expect(() => assertRepoVersionsInSync(dir)).toThrow('does not match root');

      cpSync(resolve(repoRoot, 'apps/web/package.json'), join(dir, 'apps/web/package.json'));
      writeFileSync(
        join(dir, 'apps/worker/src/lib/version.ts'),
        "export const APP_VERSION = '9.9.9';\n",
      );
      expect(() => assertRepoVersionsInSync(dir)).toThrow('APP_VERSION');

      cpSync(
        resolve(repoRoot, 'apps/worker/src/lib/version.ts'),
        join(dir, 'apps/worker/src/lib/version.ts'),
      );
      writeFileSync(join(dir, 'apps/web/src/app/login-page.tsx'), "const APP_VERSION = '9.9.9';\n");
      expect(() => assertRepoVersionsInSync(dir)).toThrow('APP_VERSION');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
