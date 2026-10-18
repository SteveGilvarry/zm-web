import { createFileRoute } from '@tanstack/react-router';
import { MonitorWatchRoute } from '@/features/nav/routeComponents';

/**
 * `?edit=true` — legacy `?view=monitor&mid=` — opens the editor on load.
 * `?cycle=true` — legacy watch's `cycle=true` — shows the cycle sidebar and
 * starts the rotation.
 */
interface WatchSearchParams {
  edit?: boolean;
  cycle?: boolean;
}

const flag = (v: unknown): true | undefined =>
  v === true || v === 'true' || v === 1 || v === '1' ? true : undefined;

export const Route = createFileRoute('/monitors/$monitorId')({
  component: MonitorWatchRoute,
  validateSearch: (search: Record<string, unknown>): WatchSearchParams => ({
    edit: flag(search.edit),
    cycle: flag(search.cycle),
  }),
});
