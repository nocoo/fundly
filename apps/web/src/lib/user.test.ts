import { describe, expect, it } from 'bun:test';
import { getDisplayName } from './user';

describe('getDisplayName', () => {
  it('falls back to 本地开发 when unauthenticated', () => {
    const d = getDisplayName(null);
    expect(d.name).toBe('本地开发');
    expect(d.email).toBeNull();
  });

  it('prefers name over email local-part', () => {
    const d = getDisplayName({ name: 'Zheng', email: 'a@b.com', avatar: null });
    expect(d.name).toBe('Zheng');
    expect(d.initial).toBe('Z');
    expect(d.email).toBe('a@b.com');
  });
});
