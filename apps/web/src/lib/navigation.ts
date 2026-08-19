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
      { href: '/funds', label: '基金浏览', icon: 'Search' },
      { href: '/data', label: '数据管理', icon: 'Database' },
    ],
  },
  {
    label: '系统',
    defaultOpen: true,
    items: [{ href: '/settings', label: '设置', icon: 'Settings' }],
  },
];

export const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

export function isItemActive(href: string, pathname: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

export function shouldGroupBeOpenOnMount(
  group: { items: { href: string }[]; defaultOpen?: boolean | undefined },
  pathname: string,
): boolean {
  if (group.items.some((item) => isItemActive(item.href, pathname))) return true;
  return group.defaultOpen ?? true;
}
