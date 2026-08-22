import { Navigate, useLocation } from 'react-router';
import LoadingScreen from '@/components/loading-screen';
import { useMe } from '@/hooks/use-me';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading, error } = useMe();
  const location = useLocation();

  if (isLoading) return <LoadingScreen />;
  if (error) return <Navigate to="/login" replace />;
  if (user?.authRequired && !user.authenticated) {
    const from = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?from=${encodeURIComponent(from)}`} replace />;
  }
  return children;
}
