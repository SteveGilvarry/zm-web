import { createFileRoute } from '@tanstack/react-router';
import { SkinPage } from '@/skins/SkinPage';
import { parseEventsSearch } from '@/features/events/eventsSearch';

export const Route = createFileRoute('/events/')({
  component: () => <SkinPage page="events.list" />,
  validateSearch: parseEventsSearch,
});
