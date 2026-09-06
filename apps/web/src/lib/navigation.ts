import {
  isEtfDetailPath,
  isFundDetailPath,
  isStockDetailPath,
  type ListOrigin,
} from './list-origin';

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
    defaultOpen: false,
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
    label: '选 ETF',
    defaultOpen: false,
    items: [
      { href: '/etfs', label: '浏览', icon: 'Search' },
      { href: '/select-etf/allocation', label: '资产配置', icon: 'PieChart' },
      { href: '/select-etf/liquidity', label: '交易质量', icon: 'BarChart3' },
      { href: '/select-etf/cost', label: '成本规模', icon: 'Wallet' },
      { href: '/select-etf/risk', label: '收益风险', icon: 'Shield' },
      { href: '/select-etf/picks', label: '条件精选', icon: 'Sparkles' },
    ],
  },
  {
    label: '选股',
    defaultOpen: false,
    items: [
      { href: '/stocks', label: '浏览', icon: 'Search' },
      { href: '/select-stock/valuation', label: '估值比较', icon: 'Scale' },
      { href: '/select-stock/quality', label: '盈利质量', icon: 'Award' },
      { href: '/select-stock/growth', label: '成长持续', icon: 'TrendingUp' },
      { href: '/select-stock/cashflow', label: '现金质量', icon: 'Coins' },
      { href: '/select-stock/trend', label: '趋势风险', icon: 'Shield' },
      { href: '/select-stock/picks', label: '条件精选', icon: 'Sparkles' },
    ],
  },
  {
    label: '系统',
    defaultOpen: false,
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
  { href: '/etfs', title: '选 ETF', description: '资产配置、交易质量与费率比较' },
  { href: '/stocks', title: '选股研究', description: '估值比较、经营质量与价格风险' },
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
  if (isEtfDetailPath(pathname)) {
    return href === (listOrigin?.path ?? '/etfs');
  }
  if (isStockDetailPath(pathname)) {
    return href === (listOrigin?.path ?? '/stocks');
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function shouldGroupBeOpenOnMount(
  group: { items: { href: string }[]; defaultOpen?: boolean | undefined },
  pathname: string,
  listOrigin: ListOrigin | null = null,
): boolean {
  // 如果当前路由或详情来源命中了该组内任意一项，展开该组
  if (group.items.some((item) => isItemActive(item.href, pathname, listOrigin))) return true;
  // 仪表盘根路径下保持总览打开
  if (pathname === '/' && group.items.some((i) => i.href === '/')) return true;
  return group.defaultOpen ?? false;
}
