import { Navigate, useLocation } from 'react-router';
import LoadingScreen from '@/components/loading-screen';
import { useMe } from '@/hooks/use-me';
import { mustSignIn } from '@/lib/user';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading, error } = useMe();
  const location = useLocation();

  if (isLoading) return <LoadingScreen />;
  if (error) return <Navigate to="/login" replace />;
  if (mustSignIn(user)) {
    const from = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?from=${encodeURIComponent(from)}`} replace />;
  }
  return children;
}
