import { Button, ContentIsland, Sheet, SheetContent, SheetTitle, ThemeToggle } from '@nocoo/basalt';
import { AppHeader } from '@nocoo/basalt/components/app-header';
import {
  AppMain,
  AppSkipLink,
  AppShell as BasaltAppShell,
} from '@nocoo/basalt/components/app-shell';
import { Menu } from 'lucide-react';
import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { Github } from '@/components/icons/github';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sidebar } from './sidebar';
import { SidebarProvider, useSidebar } from './sidebar-context';

interface AppShellProps {
  children: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
}

function AppShellInner({ children, breadcrumbs = [] }: AppShellProps) {
  const isMobile = useIsMobile();
  const { mobileOpen, setMobileOpen } = useSidebar();
  const { pathname } = useLocation();

  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname triggers close on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, setMobileOpen]);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  // The last crumb is the current page title in AppHeader
  const fullCrumbs = [{ label: '首页', href: '/' }, ...breadcrumbs];
  const currentTitle = fullCrumbs.length > 1 ? fullCrumbs[fullCrumbs.length - 1]?.label : undefined;
  const ancestorCrumbs =
    fullCrumbs.length > 1
      ? fullCrumbs.slice(0, -1).map((c) => ({ label: c.label, href: c.href }))
      : [];

  return (
    <BasaltAppShell>
      <AppSkipLink>跳至主内容</AppSkipLink>
      {!isMobile ? <Sidebar /> : null}

      {isMobile ? (
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent
            side="left"
            className="w-[260px] max-w-[260px] border-0 bg-basalt-background p-0"
          >
            <SheetTitle className="sr-only">导航菜单</SheetTitle>
            <Sidebar mobile />
          </SheetContent>
        </Sheet>
      ) : null}

      <AppMain>
        <AppHeader
          leading={
            isMobile ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileOpen(true)}
                aria-label="打开导航菜单"
                className="h-8 w-8 text-basalt-muted-foreground hover:text-basalt-foreground"
              >
                <Menu className="h-5 w-5" aria-hidden="true" strokeWidth={1.5} />
              </Button>
            ) : null
          }
          breadcrumbs={ancestorCrumbs}
          title={currentTitle}
          actions={
            <div className="flex items-center gap-1">
              <a
                href="https://github.com/nocoo/fundly"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub repository"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-basalt-muted-foreground transition-colors hover:bg-basalt-accent hover:text-basalt-foreground"
              >
                <Github className="h-[18px] w-[18px]" aria-hidden="true" strokeWidth={1.5} />
              </a>
              <ThemeToggle aria-label="切换主题" />
            </div>
          }
        />

        <div className="flex min-h-0 flex-1 flex-col px-2 pb-2 md:px-3 md:pb-3">
          <ContentIsland className="overflow-y-auto p-3 md:p-5">{children}</ContentIsland>
        </div>
      </AppMain>
    </BasaltAppShell>
  );
}

export function AppShell({ children, breadcrumbs = [] }: AppShellProps) {
  return (
    <SidebarProvider>
      <AppShellInner breadcrumbs={breadcrumbs}>{children}</AppShellInner>
    </SidebarProvider>
  );
}
