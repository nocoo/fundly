import { ContentIsland, SidebarDrawer, SidebarProvider, ThemeToggle } from '@nocoo/basalt';
import { AppHeader, AppHeaderMenuButton, ProjectLinks } from '@nocoo/basalt/components/app-header';
import {
  AppMain,
  AppSkipLink,
  AppShell as BasaltAppShell,
} from '@nocoo/basalt/components/app-shell';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { Sidebar } from './sidebar';

interface AppShellProps {
  children: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
  wallMode?: boolean;
}

const MOBILE_NAV_ID = 'fundly-mobile-nav';

function AppShellInner({ children, breadcrumbs = [], wallMode = false }: AppShellProps) {
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();

  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname triggers close on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // The last crumb is the current page title in AppHeader
  const fullCrumbs = [{ label: '首页', href: '/' }, ...breadcrumbs];
  const currentTitle = fullCrumbs.length > 1 ? fullCrumbs[fullCrumbs.length - 1]?.label : undefined;
  const ancestorCrumbs =
    fullCrumbs.length > 1
      ? fullCrumbs.slice(0, -1).map((c) => ({ label: c.label, href: c.href }))
      : [];

  return (
    <SidebarProvider collapsed={collapsed} onCollapsedChange={setCollapsed}>
      <BasaltAppShell>
        <AppSkipLink>跳至主内容</AppSkipLink>
        {!isMobile && !wallMode ? <Sidebar /> : null}

        {isMobile && !wallMode ? (
          <SidebarDrawer
            open={mobileOpen}
            onOpenChange={setMobileOpen}
            id={MOBILE_NAV_ID}
            returnFocusRef={menuButtonRef}
            title="导航菜单"
          >
            <Sidebar mobile onNavigate={() => setMobileOpen(false)} />
          </SidebarDrawer>
        ) : null}

        <AppMain>
          {!wallMode ? (
            <AppHeader
              leading={
                isMobile ? (
                  <AppHeaderMenuButton
                    ref={menuButtonRef}
                    label="打开导航菜单"
                    aria-haspopup="dialog"
                    aria-expanded={mobileOpen}
                    aria-controls={mobileOpen ? MOBILE_NAV_ID : undefined}
                    onClick={() => setMobileOpen(true)}
                  />
                ) : null
              }
              breadcrumbs={isMobile ? [] : ancestorCrumbs}
              title={currentTitle}
              actions={
                <div className="flex items-center gap-1">
                  <ProjectLinks github="nocoo/fundly" hexly="fundly" name="Fundly" />
                  <ThemeToggle
                    aria-label="切换主题"
                    labels={{
                      light: '切换为浅色主题',
                      dark: '切换为深色主题',
                      system: '跟随系统主题',
                    }}
                  />
                </div>
              }
            />
          ) : null}

          <div
            className={cn(
              'flex min-h-0 min-w-0 flex-1 flex-col',
              !wallMode &&
                'px-basalt-space-lg pb-basalt-space-lg md:px-basalt-layout-sm md:pb-basalt-layout-sm',
            )}
          >
            <ContentIsland
              className="overflow-y-auto"
              mobileSurface={wallMode ? 'edge-to-edge' : 'inset'}
            >
              {children}
            </ContentIsland>
          </div>
        </AppMain>
      </BasaltAppShell>
    </SidebarProvider>
  );
}

export function AppShell({ children, breadcrumbs = [], wallMode = false }: AppShellProps) {
  return (
    <AppShellInner breadcrumbs={breadcrumbs} wallMode={wallMode}>
      {children}
    </AppShellInner>
  );
}
