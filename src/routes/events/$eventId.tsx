import { createFileRoute } from '@tanstack/react-router';
import { EventDetailRoute } from '@/features/nav/routeComponents';
import { parseEventNavSearch } from '@/features/events/eventsSearch';

export const Route = createFileRoute('/events/$eventId')({
  component: EventDetailRoute,
  validateSearch: parseEventNavSearch,
});
