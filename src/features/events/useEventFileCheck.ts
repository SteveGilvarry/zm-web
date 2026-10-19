import { useQuery } from '@tanstack/react-query';
import { getEventAudit } from '@/api/reports';
import type { ZmEvent } from '@/types';

/**
 * The audit window that covers exactly this event: its own start to its end
 * (or start plus length while it is still recording), on its monitor.
 */
export function eventAuditWindow(event: ZmEvent): { start: string; end: string; monitor_id: number } | null {
  if (!event.start_date_time) return null;
  const startMs = Date.parse(event.start_date_time);
  if (Number.isNaN(startMs)) return null;
  const endMs = event.end_date_time
    ? Date.parse(event.end_date_time)
    : startMs + Math.max(0, Number(event.length) || 0) * 1000;
  const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
  return { start: iso(startMs), end: iso(Number.isNaN(endMs) ? startMs : Math.max(startMs, endMs)), monitor_id: event.monitor_id };
}

/**
 * Legacy's "Event was not found at <path>" check (`event.php:207`, a
 * `file_exists` on the event directory). zm-api answers it through the event
 * audit: one request over the event's own window, and the event is missing
 * when the audit lists it under `missing_files`. Returns the path to quote,
 * or null when the files are there (or the check could not run).
 */
export function useEventFileCheck(event: ZmEvent | null | undefined): { missingPath: string | null } {
  const range = event ? eventAuditWindow(event) : null;
  const q = useQuery({
    queryKey: ['eventAudit', 'event', event?.id, range],
    queryFn: () => getEventAudit(range ?? undefined),
    enabled: !!event && !!range,
    staleTime: 60_000,
    retry: false,
  });
  if (!event || !q.data) return { missingPath: null };
  const missing = q.data.monitors.some(
    (m) => m.monitor_id === event.monitor_id && m.missing_files.includes(event.id),
  );
  return { missingPath: missing ? (event.path ?? String(event.id)) : null };
}
