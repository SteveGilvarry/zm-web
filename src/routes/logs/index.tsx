import { createFileRoute } from '@tanstack/react-router';
import { SkinPage } from '@/skins/SkinPage';
import type { LogsSearchParams } from '@/features/logs/useLogsPage';

export const Route = createFileRoute('/logs/')({
  component: () => <SkinPage page="logs" />,
  validateSearch: (search: Record<string, unknown>): LogsSearchParams => ({
    component: typeof search.component === 'string' ? search.component : undefined,
    level: typeof search.level === 'number' ? search.level
      : typeof search.level === 'string' && search.level !== '' ? Number(search.level)
      : undefined,
    server_id: typeof search.server_id === 'number' ? search.server_id
      : typeof search.server_id === 'string' && search.server_id !== '' ? Number(search.server_id)
      : undefined,
    q: typeof search.q === 'string' ? search.q : undefined,
    start: typeof search.start === 'string' ? search.start : undefined,
    end: typeof search.end === 'string' ? search.end : undefined,
    page: typeof search.page === 'number' ? search.page
      : typeof search.page === 'string' && search.page !== '' ? Number(search.page)
      : undefined,
  }),
});
