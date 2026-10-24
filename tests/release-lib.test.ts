import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
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

  it('keeps release version sources aligned with package.json', () => {
    expect(() => assertRepoVersionsInSync(repoRoot)).not.toThrow();
  });
});
