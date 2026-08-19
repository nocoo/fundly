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
