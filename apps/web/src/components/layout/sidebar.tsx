import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Sidebar as BasaltSidebar,
  SidebarUser as BasaltSidebarUser,
  SidebarBrand,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarIconItem,
  SidebarItem,
  SidebarNav,
  SidebarToggle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@nocoo/basalt';
import { useSidebar } from '@nocoo/basalt/components/sidebar';
import {
  Award,
  BarChart3,
  CalendarRange,
  Cloud,
  Coins,
  HeartPulse,
  LayoutDashboard,
  LineChart,
  type LucideIcon,
  Newspaper,
  PieChart,
  Scale,
  Search,
  Settings,
  Shield,
  Sparkles,
  TrendingUp,
  Trophy,
  Wallet,
} from '@nocoo/basalt/icons';
import { Link, useLocation } from 'react-router';
import { useMe } from '@/hooks/use-me';
import { resolveNavigationOrigin } from '@/lib/list-origin';
import {
  ALL_NAV_ITEMS as ALL_NAV_ITEMS_DEF,
  isItemActive,
  NAV_GROUPS as NAV_GROUPS_DEF,
  type NavGroupDef,
  type NavItemDef,
  shouldGroupBeOpenOnMount,
} from '@/lib/navigation';
import { sidebarUserState } from '@/lib/user';
import { cn, getAvatarColor } from '@/lib/utils';

const APP_VERSION = '0.6.12';

const ICON_MAP: Record<string, LucideIcon> = {
  Award,
  BarChart3,
  CalendarRange,
  Cloud,
  Coins,
  HeartPulse,
  LayoutDashboard,
  LineChart,
  Newspaper,
  PieChart,
  Scale,
  Search,
  Settings,
  Shield,
  Sparkles,
  TrendingUp,
  Trophy,
  Wallet,
};

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  label: string;
  items: NavItem[];
  defaultOpen?: boolean | undefined;
}

function resolveNavItem(item: NavItemDef): NavItem {
  return {
    href: item.href,
    label: item.label,
    icon: ICON_MAP[item.icon] ?? LayoutDashboard,
  };
}

function resolveNavGroup(group: NavGroupDef): NavGroup {
  return {
    label: group.label,
    items: group.items.map(resolveNavItem),
    defaultOpen: group.defaultOpen,
  };
}

const NAV_GROUPS: NavGroup[] = NAV_GROUPS_DEF.map(resolveNavGroup);
const ALL_NAV_ITEMS: NavItem[] = ALL_NAV_ITEMS_DEF.map(resolveNavItem);

async function signOut() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(
    () => undefined,
  );
  window.location.assign('/login');
}

interface SidebarProps {
  mobile?: boolean;
  onNavigate?: () => void;
}

export function Sidebar({ mobile = false, onNavigate }: SidebarProps) {
  const { pathname, state } = useLocation();
  const listOrigin = resolveNavigationOrigin(pathname, state);
  const { collapsed } = useSidebar();
  const { data: user, error: userError, isLoading: userLoading } = useMe();
  const host = typeof window === 'undefined' ? '' : window.location.host;
  const {
    name: userName,
    initial: userInitial,
    email: userEmail,
    avatar: userAvatar,
  } = sidebarUserState(userLoading, userError, user, host);
  const canSignOut = Boolean(user?.authenticated);
  const isCollapsed = mobile ? false : collapsed;

  const face = (
    <Avatar className="shrink-0">
      {userAvatar ? <AvatarImage src={userAvatar} alt={userName} /> : null}
      <AvatarFallback className={cn('text-xs text-white', getAvatarColor(userName))}>
        {userInitial}
      </AvatarFallback>
    </Avatar>
  );

  return (
    <BasaltSidebar resizable={!mobile} aria-label={mobile ? '主导航抽屉' : '主导航'}>
      <SidebarHeader>
        <SidebarBrand
          logo={
            <Link to="/" aria-label="Fundly 首页" onClick={onNavigate}>
              <img src="/logo-128.png" alt="" />
            </Link>
          }
          name="fundly"
          version={`v${APP_VERSION}`}
          action={
            mobile ? (
              <SidebarToggle
                mode="dismiss"
                onDismiss={() => onNavigate?.()}
                dismissLabel="关闭导航菜单"
              />
            ) : (
              <SidebarToggle expandLabel="展开侧边栏" collapseLabel="收起侧边栏" />
            )
          }
        />
      </SidebarHeader>
      {isCollapsed ? (
        <SidebarNav aria-label="主导航">
          {ALL_NAV_ITEMS.map((item) => {
            const isActive = isItemActive(item.href, pathname, listOrigin);
            return (
              <Tooltip key={item.href} delayDuration={0}>
                <TooltipTrigger asChild>
                  <SidebarIconItem
                    href={item.href}
                    active={isActive}
                    aria-label={item.label}
                    onClick={onNavigate}
                  >
                    <item.icon className="h-4 w-4" strokeWidth={1.5} />
                    <span className="sr-only">{item.label}</span>
                  </SidebarIconItem>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {item.label}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </SidebarNav>
      ) : (
        <SidebarNav aria-label="主导航">
          {NAV_GROUPS.map((group) => (
            <SidebarGroup
              key={group.label}
              label={group.label}
              defaultOpen={shouldGroupBeOpenOnMount(group, pathname, listOrigin)}
            >
              {group.items.map((item) => {
                const isActive = isItemActive(item.href, pathname, listOrigin);
                return (
                  <SidebarItem
                    key={item.href}
                    href={item.href}
                    active={isActive}
                    onClick={onNavigate}
                  >
                    <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                    <span className="flex-1 truncate text-left">{item.label}</span>
                  </SidebarItem>
                );
              })}
            </SidebarGroup>
          ))}
        </SidebarNav>
      )}
      <SidebarFooter>
        <BasaltSidebarUser
          name={userName}
          email={userEmail ?? undefined}
          avatar={face}
          onSignOut={canSignOut ? () => void signOut() : undefined}
          signOutLabel="退出登录"
        />
      </SidebarFooter>
    </BasaltSidebar>
  );
}

export { ALL_NAV_ITEMS, NAV_GROUPS };
