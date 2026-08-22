import { isFundDetailPath, type ListOrigin } from './list-origin';

export interface NavItemDef {
  href: string;
  label: string;
  icon: string;
}

export interface NavGroupDef {
  label: string;
  items: NavItemDef[];
  defaultOpen?: boolean;
}

export const NAV_GROUPS: NavGroupDef[] = [
  {
    label: '总览',
    defaultOpen: true,
    items: [{ href: '/', label: '仪表盘', icon: 'LayoutDashboard' }],
  },
  {
    label: '选基',
    defaultOpen: true,
    items: [
      { href: '/funds', label: '浏览', icon: 'Search' },
      { href: '/select/return', label: '收益', icon: 'TrendingUp' },
      { href: '/select/risk', label: '风险', icon: 'Shield' },
      { href: '/select/hold', label: '持有体验', icon: 'HeartPulse' },
      { href: '/select/dca', label: '定投', icon: 'CalendarRange' },
      { href: '/select/cost', label: '成本', icon: 'Wallet' },
      { href: '/select/picks', label: '精选', icon: 'Sparkles' },
    ],
  },
  {
    label: '系统',
    defaultOpen: true,
    items: [
      { href: '/backup', label: '备份', icon: 'Cloud' },
      { href: '/settings', label: '设置', icon: 'Settings' },
    ],
  },
];

export const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

export function isItemActive(
  href: string,
  pathname: string,
  listOrigin: ListOrigin | null = null,
): boolean {
  if (href === '/') return pathname === '/';
  if (isFundDetailPath(pathname)) {
    return href === (listOrigin?.path ?? '/funds');
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function shouldGroupBeOpenOnMount(
  group: { items: { href: string }[]; defaultOpen?: boolean | undefined },
  pathname: string,
  listOrigin: ListOrigin | null = null,
): boolean {
  if (group.items.some((item) => isItemActive(item.href, pathname, listOrigin))) return true;
  return group.defaultOpen ?? true;
}
