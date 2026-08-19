export interface UserInfo {
  email: string | null;
  name: string | null;
  avatar: string | null;
  authenticated: boolean;
}

export type SidebarUserState =
  | { kind: 'loading'; name: string; initial: string; email: null; avatar: null }
  | { kind: 'error'; name: string; initial: string; email: null; avatar: null }
  | { kind: 'guest'; name: string; initial: string; email: null; avatar: null }
  | {
      kind: 'user';
      name: string;
      initial: string;
      email: string | null;
      avatar: string | null;
    };

export function isLocalDevHost(host: string): boolean {
  return (
    host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.endsWith('.dev.hexly.ai')
  );
}

export function getDisplayName(
  user: { name?: string | null; email?: string | null; avatar?: string | null } | null | undefined,
  fallback = '未登录',
): { name: string; initial: string; email: string | null; avatar: string | null } {
  const email = user?.email ?? null;
  const rawName = user?.name;
  const derived = rawName && rawName.length > 0 ? rawName : email?.split('@')[0];
  const name = derived ?? fallback;
  const initial = (derived?.charAt(0) ?? name.charAt(0) ?? '?').toUpperCase();
  const avatar = user?.avatar && user.avatar.length > 0 ? user.avatar : null;
  return { name, initial, email, avatar };
}

export function sidebarUserState(
  isLoading: boolean,
  error: Error | undefined,
  user: UserInfo | undefined,
  host: string,
): SidebarUserState {
  if (isLoading) {
    return { kind: 'loading', name: '加载中', initial: '…', email: null, avatar: null };
  }
  if (error) {
    return { kind: 'error', name: '加载失败', initial: '!', email: null, avatar: null };
  }
  if (user?.authenticated) {
    return { kind: 'user', ...getDisplayName(user, '用户') };
  }
  const guestName = isLocalDevHost(host) ? '本地开发' : '未登录';
  return {
    kind: 'guest',
    name: guestName,
    initial: guestName.charAt(0),
    email: null,
    avatar: null,
  };
}
