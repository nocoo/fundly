import { createContext, Suspense, useContext, useLayoutEffect, useState } from 'react';
import { Outlet } from 'react-router';
import LoadingScreen from '@/components/loading-screen';
import { AppShell } from './app-shell';

interface PageChrome {
  title?: string;
  parent?: { label: string; href?: string };
  wallMode?: boolean;
}

const PageChromeContext = createContext<((chrome: PageChrome) => void) | null>(null);

export function usePageChrome({ title, parent, wallMode = false }: PageChrome = {}) {
  const setChrome = useContext(PageChromeContext);
  if (!setChrome) throw new Error('usePageChrome must be used within AppLayout');
  const parentLabel = parent?.label;
  const parentHref = parent?.href;

  useLayoutEffect(() => {
    setChrome({
      title,
      parent: parentLabel === undefined ? undefined : { label: parentLabel, href: parentHref },
      wallMode,
    });
    return () => setChrome({});
  }, [title, parentLabel, parentHref, wallMode, setChrome]);
}

export function AppLayout() {
  const [chrome, setChrome] = useState<PageChrome>({});
  const breadcrumbs = [
    ...(chrome.parent ? [chrome.parent] : []),
    ...(chrome.title === undefined ? [] : [{ label: chrome.title }]),
  ];

  return (
    <PageChromeContext value={setChrome}>
      <AppShell breadcrumbs={breadcrumbs} wallMode={chrome.wallMode}>
        <Suspense fallback={<LoadingScreen />}>
          <Outlet />
        </Suspense>
      </AppShell>
    </PageChromeContext>
  );
}
