import { createRootRoute, redirect } from '@tanstack/react-router';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import { planRootNavigation } from '@/features/nav/rootNavigation';
import { RootComponent } from '@/features/nav/routeComponents';

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
      sessionExpired: useAuthStore.getState().sessionExpired,
    });
    if (plan.skin) useUiStore.getState().setSkin(plan.skin);
    if (plan.href) throw redirect({ href: plan.href, replace: true });
  },
  component: RootComponent,
});

