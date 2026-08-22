#!/usr/bin/env bun
/** Cut a version: bump package.json, changelog, commit, tag, gh release. */

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { bump, changelogRange } from './release-lib.ts';

const root = resolve(import.meta.dirname, '..');
const pkgPath = resolve(root, 'package.json');
const changelogPath = resolve(root, 'CHANGELOG.md');

function run(cmd: string, args: string[]) {
  const res = spawnSync(cmd, args, { cwd: root, encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error(res.stderr || res.stdout || `${cmd} failed`);
  }
  return res.stdout.trim();
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string };
const previous = pkg.version;
const next = bump(previous, process.argv[2] ?? 'patch');
pkg.version = next;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

const versionPath = resolve(root, 'apps/worker/src/lib/version.ts');
writeFileSync(versionPath, `export const APP_VERSION = '${next}';\n`);

const sidebarPath = resolve(root, 'apps/web/src/components/layout/sidebar.tsx');
const sidebar = readFileSync(sidebarPath, 'utf8');
writeFileSync(sidebarPath, sidebar.replace(`v${previous}`, `v${next}`));

const loginPath = resolve(root, 'apps/web/src/app/login-page.tsx');
const login = readFileSync(loginPath, 'utf8');
writeFileSync(loginPath, login.replace(`'${previous}'`, `'${next}'`));

const range = changelogRange(previous, Boolean(run('git', ['tag', '-l', `v${previous}`])));
const log = run('git', ['log', '--pretty=format:%s', range]).split('\n').filter(Boolean);
const today = new Date().toISOString().slice(0, 10);
const entry = `## ${next} — ${today}\n\n${log.map((s) => `- ${s}`).join('\n')}\n\n`;
const prev = readFileSync(changelogPath, 'utf8');
writeFileSync(changelogPath, `${entry}${prev}`);

run('git', [
  'add',
  'package.json',
  'CHANGELOG.md',
  'apps/worker/src/lib/version.ts',
  'apps/web/src/components/layout/sidebar.tsx',
  'apps/web/src/app/login-page.tsx',
]);
run('git', ['commit', '-m', `chore: release ${next}`]);
run('git', ['tag', `v${next}`]);
console.log(`tagged v${next}`);
