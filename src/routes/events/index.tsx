import { createFileRoute } from '@tanstack/react-router';
import { SkinPage } from '@/skins/SkinPage';

interface EventsSearchParams {
  monitor_id?: number;
  cause?: string;
  archived?: boolean;
}

export const Route = createFileRoute('/events/')({
  component: () => <SkinPage page="events.list" />,
  validateSearch: (search: Record<string, unknown>): EventsSearchParams => ({
    monitor_id: search.monitor_id as number | undefined,
    cause: search.cause as string | undefined,
    archived: search.archived as boolean | undefined,
  }),
});
