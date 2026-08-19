import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import LoadingScreen from '@/components/loading-screen';

const Dashboard = lazy(() => import('@/app/dashboard'));
const Funds = lazy(() => import('@/app/funds-page'));
const Settings = lazy(() => import('@/app/settings-page'));
const DataAdmin = lazy(() => import('@/app/data-admin-page'));
const FundDetail = lazy(() => import('@/app/fund-detail-page'));
const NotFound = lazy(() => import('@/app/not-found-page'));

export function App() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/funds" element={<Funds />} />
        <Route path="/funds/:code" element={<FundDetail />} />
        <Route path="/data" element={<DataAdmin />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
