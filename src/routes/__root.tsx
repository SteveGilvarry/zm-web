import { createRootRoute, Outlet, useNavigate, useLocation } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth';

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  const { isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!isAuthenticated && location.pathname !== '/login') {
      navigate({ to: '/login' });
    }
  }, [isAuthenticated, location.pathname, navigate]);

  return (
    <>
      <Outlet />
      {import.meta.env.DEV && <TanStackRouterDevtools position="bottom-right" toggleButtonProps={{ style: { transform: 'translateX(-4rem)' } }} />}
    </>
  );
}
