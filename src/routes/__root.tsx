import { createRootRoute, Outlet, redirect, useNavigate, useLocation } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import { planRootNavigation } from '@/features/nav/rootNavigation';
import { redirectParamFor } from '@/features/auth/redirect';

export const Route = createRootRoute({
  /**
   * Runs before any child route loads, on every navigation:
   *  - `?skin=` is applied and stripped,
   *  - legacy `index.php?view=…` URLs are rewritten to dashboard routes,
   *  - anything but `/login` requires a session (bounce with `?redirect=`).
   * Doing this here, not in an effect, means a protected page is never
   * painted for an anonymous visitor, and legacy bookmarks resolve before
   * the 404 component can see them.
   */
  beforeLoad: ({ location }) => {
    const plan = planRootNavigation({
      pathname: location.pathname,
      searchString: location.searchStr,
      isAuthenticated: useAuthStore.getState().isAuthenticated,
    });
    if (plan.skin) useUiStore.getState().setSkin(plan.skin);
    if (plan.href) throw redirect({ href: plan.href, replace: true });
  },
  component: RootComponent,
});

function RootComponent() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const navigate = useNavigate();
  const location = useLocation();

  // `beforeLoad` guards navigations; this covers the session ending while
  // the operator sits on a page (refresh token rejected, logout elsewhere).
  useEffect(() => {
    if (!isAuthenticated && location.pathname !== '/login') {
      void navigate({
        to: '/login',
        search: { redirect: redirectParamFor(location.pathname, location.searchStr) },
        replace: true,
      });
    }
  }, [isAuthenticated, location.pathname, location.searchStr, navigate]);

  return (
    <>
      <Outlet />
      {import.meta.env.DEV && <TanStackRouterDevtools position="bottom-right" toggleButtonProps={{ style: { transform: 'translateX(-4rem)' } }} />}
    </>
  );
}
