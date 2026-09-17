import { Outlet, useNavigate, useLocation, useParams } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth';
import { redirectParamFor } from '@/features/auth/redirect';
import { SkinPage } from '@/skins/SkinPage';

/**
 * The components that `src/routes/**` mount.
 *
 * They live here rather than beside their routes because a route module has
 * to `export const Route`, and Fast Refresh (enforced by
 * `react-refresh/only-export-components`) wants a module to export components
 * or non-components, never both. Params come from `useParams({ from })`, which
 * is the same lookup `Route.useParams()` does.
 */

export function RootComponent() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const navigate = useNavigate();
  const location = useLocation();

  // `beforeLoad` guards navigations; this covers the session ending while
  // the operator sits on a page (refresh token rejected, logout elsewhere).
  useEffect(() => {
    if (!isAuthenticated && location.pathname !== '/login') {
      const expired = useAuthStore.getState().sessionExpired;
      void navigate({
        to: '/login',
        search: {
          redirect: redirectParamFor(location.pathname, location.searchStr),
          ...(expired ? { reason: 'expired' as const } : {}),
        },
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

export function EventDetailRoute() {
  const { eventId } = useParams({ from: '/events/$eventId' });
  return <SkinPage page="events.detail" eventId={parseInt(eventId, 10)} />;
}

export function EventFramesRoute() {
  const { eventId } = useParams({ from: '/events/$eventId_/frames' });
  return <SkinPage page="events.frames" eventId={parseInt(eventId, 10)} />;
}

export function MonitorWatchRoute() {
  const { monitorId } = useParams({ from: '/monitors/$monitorId' });
  return <SkinPage page="monitors.watch" monitorId={Number(monitorId)} />;
}

export function MonitorZonesRoute() {
  const { monitorId } = useParams({ from: '/monitors/$monitorId_/zones' });
  return <SkinPage page="monitors.zones" monitorId={Number(monitorId)} />;
}

export function ReportDetailRoute() {
  const { reportId } = useParams({ from: '/reports/$reportId' });
  return <SkinPage page="reports.detail" reportId={parseInt(reportId, 10)} />;
}
