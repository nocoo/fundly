import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import LoadingScreen from '@/components/loading-screen';
import { RequireAuth } from '@/components/require-auth';

const Dashboard = lazy(() => import('@/app/dashboard'));
const Funds = lazy(() => import('@/app/funds-page'));
const Settings = lazy(() => import('@/app/settings-page'));
const Backup = lazy(() => import('@/app/backup-page'));
const DataAdmin = lazy(() => import('@/app/data-admin-page'));
const FundDetail = lazy(() => import('@/app/fund-detail-page'));
const Ranking = lazy(() => import('@/app/ranking-page'));
const NotFound = lazy(() => import('@/app/not-found-page'));
const Login = lazy(() => import('@/app/login-page'));

function Guard({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}

export function App() {
  return (
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
          path="/ranking"
          element={
            <Guard>
              <Ranking />
            </Guard>
          }
        />
        <Route
          path="/data"
          element={
            <Guard>
              <DataAdmin />
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
  );
}
