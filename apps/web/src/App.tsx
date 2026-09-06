import { LinkProvider, ThemeProvider, TooltipProvider } from '@nocoo/basalt';
import { lazy, Suspense } from 'react';
import { Route, Link as RouterLink, Routes } from 'react-router';
import LoadingScreen from '@/components/loading-screen';
import { RequireAuth } from '@/components/require-auth';

const Dashboard = lazy(() => import('@/app/dashboard'));
const Funds = lazy(() => import('@/app/funds-page'));
const Settings = lazy(() => import('@/app/settings-page'));
const Backup = lazy(() => import('@/app/backup-page'));
const FundDetail = lazy(() => import('@/app/fund-detail-page'));
const Select = lazy(() => import('@/app/select-page'));
const Market = lazy(() => import('@/app/market-page'));
const RankingRedirect = lazy(() =>
  import('@/app/select-page').then((mod) => ({ default: mod.RankingRedirect })),
);
const NotFound = lazy(() => import('@/app/not-found-page'));
const Login = lazy(() => import('@/app/login-page'));

function Guard({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}

function AppLink({
  href,
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href?: string }) {
  if (!href || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  }
  return (
    <RouterLink to={href} {...props}>
      {children}
    </RouterLink>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <LinkProvider render={AppLink}>
        <TooltipProvider>
          <Suspense fallback={<LoadingScreen />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                path="/"
                element={
                  <Guard>
                    <Dashboard />
                  </Guard>
                }
              />
              <Route
                path="/market"
                element={
                  <Guard>
                    <Market />
                  </Guard>
                }
              />
              <Route
                path="/funds"
                element={
                  <Guard>
                    <Funds />
                  </Guard>
                }
              />
              <Route
                path="/funds/:code"
                element={
                  <Guard>
                    <FundDetail />
                  </Guard>
                }
              />
              <Route
                path="/select/:lens"
                element={
                  <Guard>
                    <Select />
                  </Guard>
                }
              />
              <Route
                path="/ranking"
                element={
                  <Guard>
                    <RankingRedirect />
                  </Guard>
                }
              />
              <Route
                path="/backup"
                element={
                  <Guard>
                    <Backup />
                  </Guard>
                }
              />
              <Route
                path="/settings"
                element={
                  <Guard>
                    <Settings />
                  </Guard>
                }
              />
              <Route
                path="*"
                element={
                  <Guard>
                    <NotFound />
                  </Guard>
                }
              />
            </Routes>
          </Suspense>
        </TooltipProvider>
      </LinkProvider>
    </ThemeProvider>
  );
}
