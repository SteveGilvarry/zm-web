import { createFileRoute } from '@tanstack/react-router';
import { SkinPage } from '@/skins/SkinPage';

/**
 * Legacy `?view=montagereview&MonitorId=&minTime=&maxTime=`: preselect one
 * monitor and open on a custom range. Times are whatever the legacy UI put
 * in the URL (`YYYY-MM-DD HH:MM:SS` or ISO); the hook parses them.
 */
interface MontageReviewSearchParams {
  monitor_id?: number;
  min_time?: string;
  max_time?: string;
}

export const Route = createFileRoute('/montagereview/')({
  component: () => <SkinPage page="montagereview" />,
  validateSearch: (search: Record<string, unknown>): MontageReviewSearchParams => ({
    monitor_id: toInt(search.monitor_id),
    min_time: toStr(search.min_time),
    max_time: toStr(search.max_time),
  }),
});

function toInt(v: unknown): number | undefined {
  const n = Number(v);
  return v != null && v !== '' && Number.isInteger(n) && n > 0 ? n : undefined;
}
function toStr(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined;
}
