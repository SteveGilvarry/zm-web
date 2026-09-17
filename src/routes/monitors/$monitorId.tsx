import { createFileRoute } from '@tanstack/react-router';
import { MonitorWatchRoute } from '@/features/nav/routeComponents';

/** `?edit=true` — legacy `?view=monitor&mid=` — opens the editor on load. */
interface WatchSearchParams {
  edit?: boolean;
}

export const Route = createFileRoute('/monitors/$monitorId')({
  component: MonitorWatchRoute,
  validateSearch: (search: Record<string, unknown>): WatchSearchParams => ({
    edit: search.edit === true || search.edit === 'true' || search.edit === 1 || search.edit === '1' ? true : undefined,
  }),
});
