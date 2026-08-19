import {
  ChevronUp,
  LayoutDashboard,
  type LucideIcon,
  PanelLeft,
  Search,
  Settings,
  Trophy,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useMe } from '@/hooks/use-me';
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

const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard,
  Search,
  Trophy,
  Settings,
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

function SidebarUser({
  collapsed = false,
  name,
  initial,
  email,
  avatar,
}: {
  collapsed?: boolean;
  name: string;
  initial: string;
  email: string | null;
  avatar: string | null;
}) {
  const face = (
    <Avatar className={cn('h-9 w-9', !collapsed && 'shrink-0')}>
      {avatar ? <AvatarImage src={avatar} alt={name} /> : null}
      <AvatarFallback className={cn('text-xs text-white', getAvatarColor(name))}>
        {initial}
      </AvatarFallback>
    </Avatar>
  );

  if (collapsed) {
    return <div className="flex w-full justify-center py-3">{face}</div>;
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3">
        {face}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{name}</p>
          {email ? <p className="truncate text-xs text-muted-foreground">{email}</p> : null}
        </div>
      </div>
    </div>
  );
}

function NavGroupSection({
  group,
  pathname,
  onNavigate,
}: {
  group: NavGroup;
  pathname: string;
  onNavigate: () => void;
}) {
  const [open, setOpen] = useState(shouldGroupBeOpenOnMount(group, pathname));

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="mt-2 px-3">
        <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2">
          <span className="text-[11px] font-medium text-muted-foreground/70">{group.label}</span>
          <span className="flex h-5 w-5 shrink-0 items-center justify-center">
            <ChevronUp
              className={cn(
                'h-3.5 w-3.5 text-muted-foreground transition-transform duration-200',
                !open && 'rotate-180',
              )}
              strokeWidth={1.5}
            />
          </span>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div className="flex flex-col gap-0.5 px-3">
          {group.items.map((item) => {
            const isActive = isItemActive(item.href, pathname);
            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={onNavigate}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-normal transition-colors',
                  isActive
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                <span className="flex-1 text-left">{item.label}</span>
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
  const { collapsed, toggle, setMobileOpen } = useSidebar();
  const { data: user, error: userError, isLoading: userLoading } = useMe();
  const host = typeof window === 'undefined' ? '' : window.location.host;
  const {
    name: userName,
    initial: userInitial,
    email: userEmail,
    avatar: userAvatar,
  } = sidebarUserState(userLoading, userError, user, host);

  const handleNavigate = () => setMobileOpen(false);
  const isCollapsed = mobile ? false : collapsed;

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        aria-label={mobile ? '主导航抽屉' : '主导航'}
        className={cn(
          'sticky top-0 flex h-screen shrink-0 flex-col overflow-hidden bg-background transition-all duration-300 ease-in-out',
          isCollapsed ? 'w-[68px]' : 'w-[260px]',
        )}
      >
        {isCollapsed ? (
          <div className="flex h-screen w-[68px] flex-col items-center">
            <div className="flex h-14 w-full items-center justify-start pr-3 pl-6">
              <img src="/logo.svg" alt="Fundly" width={24} height={24} className="shrink-0" />
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={toggle}
                  aria-label="展开侧边栏"
                  className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <PanelLeft className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                展开侧边栏
              </TooltipContent>
            </Tooltip>
            <nav className="flex flex-1 flex-col items-center gap-1 overflow-y-auto pt-1">
              {ALL_NAV_ITEMS.map((item) => {
                const isActive = isItemActive(item.href, pathname);
                return (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>
                      <Link
                        to={item.href}
                        onClick={handleNavigate}
                        aria-label={item.label}
                        className={cn(
                          'relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
                          isActive
                            ? 'bg-accent text-foreground'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
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
            </nav>
            <SidebarUser
              collapsed
              name={userName}
              initial={userInitial}
              email={userEmail}
              avatar={userAvatar}
            />
          </div>
        ) : (
          <div className="flex h-screen w-[260px] flex-col">
            <div className="flex h-14 items-center px-3">
              <div className="flex w-full items-center justify-between px-3">
                <div className="flex items-center gap-3">
                  <img src="/logo.svg" alt="Fundly" width={24} height={24} className="shrink-0" />
                  <span className="text-lg font-bold tracking-tighter">fundly</span>
                  <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] leading-none font-medium text-muted-foreground">
                    v0.1.0
                  </span>
                </div>
                {!mobile && (
                  <button
                    type="button"
                    onClick={toggle}
                    aria-label="收起侧边栏"
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <PanelLeft className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
                  </button>
                )}
              </div>
            </div>
            <nav className="flex-1 overflow-y-auto pt-1">
              {NAV_GROUPS.map((group) => (
                <NavGroupSection
                  key={group.label}
                  group={group}
                  pathname={pathname}
                  onNavigate={handleNavigate}
                />
              ))}
            </nav>
            <SidebarUser
              name={userName}
              initial={userInitial}
              email={userEmail}
              avatar={userAvatar}
            />
          </div>
        )}
      </aside>
    </TooltipProvider>
  );
}

export { ALL_NAV_ITEMS, NAV_GROUPS };
