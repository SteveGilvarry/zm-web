import { createRootRoute, Outlet, useNavigate, useLocation } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useUiStore, type Skin } from '@/stores/ui';

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  const { isAuthenticated } = useAuthStore();
  const setSkin = useUiStore((s) => s.setSkin);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!isAuthenticated && location.pathname !== '/login') {
      navigate({ to: '/login' });
    }
  }, [isAuthenticated, location.pathname, navigate]);

  // Honour `?skin=modern|classic` so an operator can preview or pin a skin
  // via a shareable URL; once read, strip the param to keep URLs clean.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('skin');
    if (requested === 'modern' || requested === 'classic') {
      setSkin(requested as Skin);
      params.delete('skin');
      const search = params.toString();
      const newUrl =
        window.location.pathname + (search ? `?${search}` : '') + window.location.hash;
      window.history.replaceState(null, '', newUrl);
    }
  }, [setSkin]);

  return (
    <>
      <Outlet />
      {import.meta.env.DEV && <TanStackRouterDevtools position="bottom-right" toggleButtonProps={{ style: { transform: 'translateX(-4rem)' } }} />}
    </>
  );
}
