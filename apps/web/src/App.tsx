import { LinkProvider, ThemeProvider, TooltipProvider } from '@nocoo/basalt';
import { lazy, Suspense } from 'react';
import { Route, Link as RouterLink, Routes } from 'react-router';
import { AppLayout } from '@/components/layout';
import LoadingScreen from '@/components/loading-screen';
import { RequireAuth } from '@/components/require-auth';

const Dashboard = lazy(() => import('@/app/dashboard'));
const Funds = lazy(() => import('@/app/funds-page'));
const Settings = lazy(() => import('@/app/settings-page'));
const Backup = lazy(() => import('@/app/backup-page'));
const FundDetail = lazy(() => import('@/app/fund-detail-page'));
const Select = lazy(() => import('@/app/select-page'));
const Market = lazy(() => import('@/app/market-page'));
const Daily = lazy(() => import('@/app/daily-page'));
const DailyDetail = lazy(() => import('@/app/daily-detail-page'));
const Etfs = lazy(() => import('@/app/etfs-page'));
const EtfDetail = lazy(() => import('@/app/etf-detail-page'));
const Stocks = lazy(() => import('@/app/stocks-page'));
const StockDetail = lazy(() => import('@/app/stock-detail-page'));
const RankingRedirect = lazy(() =>
  import('@/app/select-page').then((mod) => ({ default: mod.RankingRedirect })),
);
const NotFound = lazy(() => import('@/app/not-found-page'));
const Login = lazy(() => import('@/app/login-page'));

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
          <Routes>
            <Route
              path="/login"
              element={
                <Suspense fallback={<LoadingScreen />}>
                  <Login />
                </Suspense>
              }
            />
            <Route
              element={
                <RequireAuth>
                  <AppLayout />
                </RequireAuth>
              }
            >
              <Route path="/" element={<Dashboard />} />
              <Route path="/market" element={<Market />} />
              <Route path="/daily" element={<Daily />} />
              <Route path="/daily/:date" element={<DailyDetail />} />
              <Route path="/funds" element={<Funds />} />
              <Route path="/funds/:code" element={<FundDetail />} />
              {/* 选 ETF 系列路由 */}
              <Route path="/etfs" element={<Etfs forcedLens="browse" />} />
              <Route path="/etfs/:symbol" element={<EtfDetail />} />
              <Route path="/select-etf/:lens" element={<Etfs />} />
              {/* 选股系列路由 */}
              <Route path="/stocks" element={<Stocks forcedLens="browse" />} />
              <Route path="/stocks/:symbol" element={<StockDetail />} />
              <Route path="/select-stock/:lens" element={<Stocks />} />
              <Route path="/select/:lens" element={<Select />} />
              <Route path="/ranking" element={<RankingRedirect />} />
              <Route path="/backup" element={<Backup />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </TooltipProvider>
      </LinkProvider>
    </ThemeProvider>
  );
}
