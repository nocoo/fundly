import { describe, expect, it } from 'bun:test';
import { getDisplayName, isLocalDevHost, sidebarUserState } from './user';

describe('getDisplayName', () => {
  it('falls back to 未登录 when unauthenticated', () => {
    const d = getDisplayName(null);
    expect(d.name).toBe('未登录');
    expect(d.email).toBeNull();
  });

  it('prefers name over email local-part', () => {
    const d = getDisplayName({ name: 'Zheng', email: 'a@b.com', avatar: null });
    expect(d.name).toBe('Zheng');
    expect(d.initial).toBe('Z');
    expect(d.email).toBe('a@b.com');
  });
});

describe('sidebarUserState', () => {
  it('shows loading and error independently of host', () => {
    expect(sidebarUserState(true, undefined, undefined, 'fundly.hexly.ai').kind).toBe('loading');
    expect(sidebarUserState(false, new Error('nope'), undefined, 'fundly.hexly.ai')).toEqual({
      kind: 'error',
      name: '加载失败',
      initial: '!',
      email: null,
      avatar: null,
    });
  });

  it('uses 本地开发 only on a local host when unauthenticated', () => {
    expect(sidebarUserState(false, undefined, undefined, 'fundly.dev.hexly.ai').name).toBe(
      '本地开发',
    );
    expect(
      sidebarUserState(false, undefined, { authenticated: false } as never, 'fundly.hexly.ai').name,
    ).toBe('未登录');
  });

  it('passes through an authenticated profile', () => {
    const state = sidebarUserState(
      false,
      undefined,
      { authenticated: true, name: 'Zheng Li', email: 'a@b.com', avatar: 'https://img/a.png' },
      'fundly.hexly.ai',
    );
    expect(state).toMatchObject({ kind: 'user', name: 'Zheng Li', email: 'a@b.com' });
  });
});

describe('isLocalDevHost', () => {
  it('recognizes localhost and the Caddy domain', () => {
    expect(isLocalDevHost('localhost:7044')).toBe(true);
    expect(isLocalDevHost('fundly.dev.hexly.ai')).toBe(true);
    expect(isLocalDevHost('fundly.hexly.ai')).toBe(false);
  });
});
