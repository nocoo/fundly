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
    items: [
      { href: '/', label: '仪表盘', icon: 'LayoutDashboard' },
      { href: '/market', label: '宏观大屏', icon: 'LineChart' },
    ],
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

const DASHBOARD_ENTRY_COPY = [
  { href: '/market', title: '宏观大屏', description: '市场指数、行业与跨资产环境' },
  { href: '/funds', title: '基金浏览', description: '检索产品，深入净值与基金档案' },
  { href: '/select/return', title: '收益比较', description: '阶段收益与同类位置' },
  { href: '/select/risk', title: '风险观察', description: '回撤、波动与风险调整收益' },
];

export const DASHBOARD_ENTRIES = DASHBOARD_ENTRY_COPY.flatMap((entry) => {
  const nav = ALL_NAV_ITEMS.find((item) => item.href === entry.href);
  return nav ? [{ ...nav, ...entry }] : [];
});

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
