import { Menu } from 'lucide-react';
import { useEffect } from 'react';
import { useLocation } from 'react-router';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { Breadcrumbs } from './breadcrumbs';
import { Sidebar } from './sidebar';
import { SidebarProvider, useSidebar } from './sidebar-context';
import { SourceToggle } from './source-toggle';
import { ThemeToggle } from './theme-toggle';

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

  return (
    <div className="flex min-h-screen w-full bg-background">
      {!isMobile && <Sidebar />}

      {isMobile && (
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent
            side="left"
            className="w-[260px] p-0 sm:max-w-[260px]"
            showCloseButton={false}
          >
            <SheetHeader className="sr-only">
              <SheetTitle>导航菜单</SheetTitle>
              <SheetDescription>浏览 Fundly 的主要页面</SheetDescription>
            </SheetHeader>
            <Sidebar mobile />
          </SheetContent>
        </Sheet>
      )}

      <main className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-3">
            {isMobile && (
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                aria-label="打开导航菜单"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Menu className="h-5 w-5" aria-hidden="true" strokeWidth={1.5} />
              </button>
            )}
            <Breadcrumbs items={[{ label: '首页', href: '/' }, ...breadcrumbs]} />
          </div>
          <div className="flex items-center gap-2">
            <SourceToggle />
            <ThemeToggle />
          </div>
        </header>

        <div className="flex-1 px-2 pb-2 md:px-3 md:pb-3">
          <div className="h-full min-h-[calc(100vh-4.5rem)] overflow-y-auto rounded-[16px] bg-card p-3 shadow-sm ring-1 ring-border/40 md:rounded-[20px] md:p-5">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

export function AppShell({ children, breadcrumbs = [] }: AppShellProps) {
  return (
    <SidebarProvider>
      <AppShellInner breadcrumbs={breadcrumbs}>{children}</AppShellInner>
    </SidebarProvider>
  );
}
