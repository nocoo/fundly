import { describe, expect, it } from 'bun:test';
import { bump, changelogRange } from '../scripts/release-lib';

describe('release-lib', () => {
  it('bumps patch and uses the previous tag as the log start', () => {
    expect(bump('0.1.1', 'patch')).toBe('0.1.2');
    expect(changelogRange('0.1.1', true)).toBe('v0.1.1..HEAD');
  });

  it('falls back to HEAD when the previous tag is missing', () => {
    expect(changelogRange('0.1.2', false)).toBe('HEAD');
    expect(bump('0.1.1', '0.1.2')).toBe('0.1.2');
  });
});
