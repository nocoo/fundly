#!/usr/bin/env bun
/** Cut a version: bump package.json, changelog, commit, tag, gh release. */

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

function bump(from: string, kind: 'patch' | 'minor' | 'major' | string): string {
  if (/^\d+\.\d+\.\d+$/.test(kind)) return kind;
  const [a, b, c] = from.split('.').map(Number);
  if (kind === 'minor') return `${a}.${(b ?? 0) + 1}.0`;
  if (kind === 'major') return `${(a ?? 0) + 1}.0.0`;
  return `${a}.${b}.${(c ?? 0) + 1}`;
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string };
const next = bump(pkg.version, process.argv[2] ?? 'patch');
pkg.version = next;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

const log = run('git', ['log', '--pretty=format:%s', `v${pkg.version}..HEAD`])
  .split('\n')
  .filter(Boolean);
const today = new Date().toISOString().slice(0, 10);
const entry = `## ${next} — ${today}\n\n${log.map((s) => `- ${s}`).join('\n')}\n\n`;
const prev = readFileSync(changelogPath, 'utf8');
writeFileSync(changelogPath, `${entry}${prev}`);

run('git', ['add', 'package.json', 'CHANGELOG.md']);
run('git', ['commit', '-m', `chore: release ${next}`]);
run('git', ['tag', `v${next}`]);
console.log(`tagged v${next}`);
