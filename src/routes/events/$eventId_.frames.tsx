import { createFileRoute } from '@tanstack/react-router';
import { SkinPage } from '@/skins/SkinPage';

export interface EventFramesSearchParams {
  page?: number;
  page_size?: number;
}

function toPositiveInt(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : NaN;
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/**
 * Legacy `?view=frames&eid=`. Trailing underscore keeps it a standalone
 * route: `$eventId.tsx` renders no <Outlet/>, so nesting would show the
 * event player instead of the frames table.
 */
export const Route = createFileRoute('/events/$eventId_/frames')({
  component: EventFramesRoute,
  validateSearch: (search: Record<string, unknown>): EventFramesSearchParams => ({
    page: toPositiveInt(search.page),
    page_size: toPositiveInt(search.page_size),
  }),
});

function EventFramesRoute() {
  const { eventId } = Route.useParams();
  return <SkinPage page="events.frames" eventId={parseInt(eventId, 10)} />;
}
