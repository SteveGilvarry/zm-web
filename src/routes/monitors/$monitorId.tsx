import { createFileRoute } from '@tanstack/react-router';
import { MonitorWatchRoute } from '@/features/nav/routeComponents';

/**
 * `?edit=true` — legacy `?view=monitor&mid=` — opens the editor on load;
 * `?tab=` (legacy `&tab=`) picks its tab.
 * `?cycle=true` — legacy watch's `cycle=true` — shows the cycle sidebar and
 * starts the rotation.
 */
interface WatchSearchParams {
  edit?: boolean;
  tab?: string;
  cycle?: boolean;
}

const flag = (v: unknown): true | undefined =>
  v === true || v === 'true' || v === 1 || v === '1' ? true : undefined;

export const Route = createFileRoute('/monitors/$monitorId')({
  component: MonitorWatchRoute,
  validateSearch: (search: Record<string, unknown>): WatchSearchParams => ({
    edit: flag(search.edit),
    tab: typeof search.tab === 'string' && /^[a-z]+$/.test(search.tab) ? search.tab : undefined,
    cycle: flag(search.cycle),
  }),
});
