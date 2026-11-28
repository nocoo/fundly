import { describe, expect, it } from 'bun:test';
import { cn, getAvatarColor, hashString } from './utils';

describe('utils', () => {
  it('merges class names and hashes deterministically into avatar colors', () => {
    expect(cn('px-2', false && 'hidden', 'px-4')).toBe('px-4');
    expect(hashString('alice')).toBe(hashString('alice'));
    expect(getAvatarColor('alice')).toMatch(/^bg-basalt-/);
  });
});
