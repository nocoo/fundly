import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const RELEASE_PACKAGE_PATHS = [
  'package.json',
  'apps/web/package.json',
  'apps/worker/package.json',
] as const;

export const RELEASE_RUNTIME_VERSION_PATH = 'apps/worker/src/lib/version.ts';

export const RELEASE_UI_VERSION_PATHS = [
  'apps/web/src/components/layout/sidebar.tsx',
  'apps/web/src/app/login-page.tsx',
] as const;

export function packageVersionFromJson(text: string): string {
  return (JSON.parse(text) as { version: string }).version;
}

export function runtimeVersionFromTs(text: string): string | null {
  const match = text.match(/export const APP_VERSION = ['"]([^'"]+)['"];/);
  return match?.[1] ?? null;
}

export function uiVersionFromTsx(text: string): string | null {
  const match = text.match(/const APP_VERSION = ['"]([^'"]+)['"];/);
  return match?.[1] ?? null;
}

/** Same sources checked by `.github/workflows/release.yml` plus UI version strings. */
export function assertRepoVersionsInSync(root: string): void {
  const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');
  const expected = packageVersionFromJson(read('package.json'));

  for (const path of RELEASE_PACKAGE_PATHS) {
    const version = packageVersionFromJson(read(path));
    if (version !== expected) {
      throw new Error(`${path} version ${version} does not match root ${expected}`);
    }
  }

  const runtime = runtimeVersionFromTs(read(RELEASE_RUNTIME_VERSION_PATH));
  if (runtime !== expected) {
    throw new Error(
      `${RELEASE_RUNTIME_VERSION_PATH} APP_VERSION ${runtime ?? 'missing'} does not match root ${expected}`,
    );
  }

  for (const path of RELEASE_UI_VERSION_PATHS) {
    const version = uiVersionFromTsx(read(path));
    if (version !== expected) {
      throw new Error(
        `${path} APP_VERSION ${version ?? 'missing'} does not match root ${expected}`,
      );
    }
  }
}

export function bump(from: string, kind: 'patch' | 'minor' | 'major' | string): string {
  if (/^\d+\.\d+\.\d+$/.test(kind)) return kind;
  const [a, b, c] = from.split('.').map(Number);
  if (kind === 'minor') return `${a}.${(b ?? 0) + 1}.0`;
  if (kind === 'major') return `${(a ?? 0) + 1}.0.0`;
  return `${a}.${b}.${(c ?? 0) + 1}`;
}

export function changelogRange(previous: string, tagExists: boolean): string {
  return tagExists ? `v${previous}..HEAD` : 'HEAD';
}
