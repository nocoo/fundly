import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Sidebar as BasaltSidebar,
  SidebarUser as BasaltSidebarUser,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  SidebarFooter,
  SidebarHeader,
  SidebarNav,
  SidebarPartition,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@nocoo/basalt';
import {
  CalendarRange,
  ChevronUp,
  Cloud,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  PanelLeft,
  Search,
  Settings,
  Shield,
  Sparkles,
  TrendingUp,
  Trophy,
  Wallet,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useMe } from '@/hooks/use-me';
import { readListOrigin } from '@/lib/list-origin';
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
import { useSidebar } from './sidebar-context';

const APP_VERSION = '0.3.0';

const ICON_MAP: Record<string, LucideIcon> = {
  CalendarRange,
  Cloud,
  HeartPulse,
  LayoutDashboard,
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

function UserCard({
  collapsed = false,
  name,
  initial,
  email,
  avatar,
  canSignOut,
}: {
  collapsed?: boolean;
  name: string;
  initial: string;
  email: string | null;
  avatar: string | null;
  canSignOut: boolean;
}) {
  const face = (
    <Avatar className={cn('h-8 w-8', !collapsed && 'shrink-0')}>
      {avatar ? <AvatarImage src={avatar} alt={name} /> : null}
      <AvatarFallback className={cn('text-xs text-white', getAvatarColor(name))}>
        {initial}
      </AvatarFallback>
    </Avatar>
  );

  if (collapsed) {
    if (!canSignOut) {
      return (
        <SidebarFooter className="flex w-full justify-center px-0">
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <span className="inline-flex">{face}</span>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {name}
            </TooltipContent>
          </Tooltip>
        </SidebarFooter>
      );
    }
    return (
      <SidebarFooter className="flex w-full justify-center px-0">
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => void signOut()}
              className="cursor-pointer"
              aria-label={`${name} — 退出登录`}
            >
              {face}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {name} — 退出登录
          </TooltipContent>
        </Tooltip>
      </SidebarFooter>
    );
  }

  return (
    <SidebarFooter>
      <BasaltSidebarUser
        name={name}
        email={email ?? undefined}
        avatar={face}
        action={
          canSignOut ? (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-basalt-muted-foreground hover:text-basalt-foreground"
                  onClick={() => void signOut()}
                  aria-label="退出登录"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">退出登录</TooltipContent>
            </Tooltip>
          ) : undefined
        }
      />
    </SidebarFooter>
  );
}

function NavGroupSection({
  group,
  pathname,
  listOrigin,
  onNavigate,
}: {
  group: NavGroup;
  pathname: string;
  listOrigin: ReturnType<typeof readListOrigin>;
  onNavigate: () => void;
}) {
  const [open, setOpen] = useState(shouldGroupBeOpenOnMount(group, pathname, listOrigin));

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="mt-2 px-3">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between px-3 py-1.5 text-basalt-muted-foreground transition-colors hover:text-basalt-foreground cursor-pointer"
          >
            <SidebarPartition className="px-0 text-[11px] font-medium">
              {group.label}
            </SidebarPartition>
            <span className="flex h-5 w-5 shrink-0 items-center justify-center">
              <ChevronUp
                className={cn(
                  'h-3.5 w-3.5 text-basalt-muted-foreground transition-transform duration-200',
                  !open && 'rotate-180',
                )}
                strokeWidth={1.5}
              />
            </span>
          </button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div className="flex flex-col gap-0.5 px-3">
          {group.items.map((item) => {
            const isActive = isItemActive(item.href, pathname, listOrigin);
            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={onNavigate}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-normal transition-colors',
                  isActive
                    ? 'bg-basalt-accent text-basalt-foreground font-medium'
                    : 'text-basalt-muted-foreground hover:bg-basalt-accent hover:text-basalt-foreground',
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                <span className="flex-1 truncate text-left">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface SidebarProps {
  mobile?: boolean;
}

export function Sidebar({ mobile = false }: SidebarProps) {
  const { pathname } = useLocation();
  const listOrigin = readListOrigin();
  const { collapsed, toggle, setMobileOpen } = useSidebar();
  const { data: user, error: userError, isLoading: userLoading } = useMe();
  const host = typeof window === 'undefined' ? '' : window.location.host;
  const {
    name: userName,
    initial: userInitial,
    email: userEmail,
    avatar: userAvatar,
  } = sidebarUserState(userLoading, userError, user, host);

  const handleNavigate = () => {
    setMobileOpen(false);
  };
  const isCollapsed = mobile ? false : collapsed;

  return (
    <BasaltSidebar collapsed={isCollapsed} aria-label={mobile ? '主导航抽屉' : '主导航'}>
      {isCollapsed ? (
        <>
          <SidebarHeader className="justify-center px-0">
            <img src="/logo.svg" alt="Fundly" width={22} height={22} className="shrink-0" />
          </SidebarHeader>
          <Button
            variant="ghost"
            size="icon"
            className="mb-1 self-center text-basalt-muted-foreground hover:text-basalt-foreground"
            onClick={toggle}
            aria-label="展开侧边栏"
          >
            <PanelLeft className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
          </Button>
          <SidebarNav className="w-full items-center gap-1 pt-1">
            {ALL_NAV_ITEMS.map((item) => {
              const isActive = isItemActive(item.href, pathname, listOrigin);
              return (
                <Tooltip key={item.href} delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Link
                      to={item.href}
                      onClick={handleNavigate}
                      aria-label={item.label}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
                        isActive
                          ? 'bg-basalt-accent text-basalt-foreground'
                          : 'text-basalt-muted-foreground hover:bg-basalt-accent hover:text-basalt-foreground',
                      )}
                    >
                      <item.icon className="h-4 w-4" strokeWidth={1.5} />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8}>
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </SidebarNav>
          <UserCard
            collapsed
            name={userName}
            initial={userInitial}
            email={userEmail}
            avatar={userAvatar}
            canSignOut={Boolean(user?.authenticated)}
          />
        </>
      ) : (
        <>
          <SidebarHeader>
            <div className="flex w-full items-center justify-between">
              <div className="flex min-w-0 items-center gap-2.5">
                <img src="/logo.svg" alt="Fundly" width={22} height={22} className="shrink-0" />
                <span className="truncate text-lg font-bold tracking-tight text-basalt-foreground">
                  fundly
                </span>
                <span className="shrink-0 rounded-md bg-basalt-secondary px-1.5 py-0.5 text-[10px] leading-none font-medium text-basalt-muted-foreground">
                  v{APP_VERSION}
                </span>
              </div>
              {!mobile && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-basalt-muted-foreground hover:text-basalt-foreground"
                  onClick={toggle}
                  aria-label="收起侧边栏"
                >
                  <PanelLeft className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
                </Button>
              )}
            </div>
          </SidebarHeader>
          <SidebarNav className="pt-1">
            {NAV_GROUPS.map((group) => (
              <NavGroupSection
                key={group.label}
                group={group}
                pathname={pathname}
                listOrigin={listOrigin}
                onNavigate={handleNavigate}
              />
            ))}
          </SidebarNav>
          <UserCard
            name={userName}
            initial={userInitial}
            email={userEmail}
            avatar={userAvatar}
            canSignOut={Boolean(user?.authenticated)}
          />
        </>
      )}
    </BasaltSidebar>
  );
}

export { ALL_NAV_ITEMS, NAV_GROUPS };
