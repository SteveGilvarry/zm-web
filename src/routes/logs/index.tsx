import { createFileRoute } from '@tanstack/react-router';
import { SkinPage } from '@/skins/SkinPage';
import { isLogMinLevel } from '@/api/logs';
import type { LogsSearchParams } from '@/features/logs/useLogsPage';

export const Route = createFileRoute('/logs/')({
  component: () => <SkinPage page="logs" />,
  validateSearch: (search: Record<string, unknown>): LogsSearchParams => ({
    component: typeof search.component === 'string' ? search.component : undefined,
    // Severity threshold by name ("this level or worse"); anything else is
    // dropped rather than sent on to a 400.
    min_level: isLogMinLevel(search.min_level) ? search.min_level : undefined,
    server_id: typeof search.server_id === 'number' ? search.server_id
      : typeof search.server_id === 'string' && search.server_id !== '' ? Number(search.server_id)
      : undefined,
    q: typeof search.q === 'string' ? search.q : undefined,
    start: typeof search.start === 'string' ? search.start : undefined,
    end: typeof search.end === 'string' ? search.end : undefined,
    sort: search.sort === 'asc' ? 'asc' : undefined,
    page: typeof search.page === 'number' ? search.page
      : typeof search.page === 'string' && search.page !== '' ? Number(search.page)
      : undefined,
  }),
});
