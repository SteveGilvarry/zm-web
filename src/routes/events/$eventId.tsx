import { createFileRoute } from '@tanstack/react-router';
import { EventDetailRoute } from '@/features/nav/routeComponents';

export const Route = createFileRoute('/events/$eventId')({
  component: EventDetailRoute,
});
