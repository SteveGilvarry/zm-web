import { createFileRoute } from '@tanstack/react-router';
import { EventStatsRoute } from '@/features/nav/routeComponents';

export interface EventStatsSearchParams {
  /** Frame number within the event; without it the max-score frame opens. */
  fid?: number;
}

/**
 * Legacy `?view=stats&eid=&fid=`. Trailing underscore keeps it standalone:
 * `$eventId.tsx` renders no <Outlet/>.
 */
export const Route = createFileRoute('/events/$eventId_/stats')({
  component: EventStatsRoute,
  validateSearch: (search: Record<string, unknown>): EventStatsSearchParams => {
    const v = search.fid;
    const n = typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : NaN;
    return { fid: Number.isInteger(n) && n > 0 ? n : undefined };
  },
});
