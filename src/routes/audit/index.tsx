import { createFileRoute } from '@tanstack/react-router';
import { SkinPage } from '@/skins/SkinPage';

export interface AuditSearchParams {
  /** Window bounds as `YYYY-MM-DDTHH:MM:SS` local wall clock (legacy `minTime` / `maxTime`). */
  min_time?: string;
  max_time?: string;
}

export const Route = createFileRoute('/audit/')({
  component: () => <SkinPage page="audit" />,
  validateSearch: (search: Record<string, unknown>): AuditSearchParams => ({
    min_time: typeof search.min_time === 'string' && search.min_time !== '' ? search.min_time : undefined,
    max_time: typeof search.max_time === 'string' && search.max_time !== '' ? search.max_time : undefined,
  }),
});
