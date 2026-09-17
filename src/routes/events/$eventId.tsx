import { createFileRoute } from '@tanstack/react-router';
import { SkinPage } from '@/skins/SkinPage';
import { parseEventNavSearch } from '@/features/events/eventsSearch';

export const Route = createFileRoute('/events/$eventId')({
  component: EventDetailRoute,
  validateSearch: parseEventNavSearch,
});

function EventDetailRoute() {
  const { eventId } = Route.useParams();
  return <SkinPage page="events.detail" eventId={parseInt(eventId, 10)} />;
}
