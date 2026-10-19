import { useQueries } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth';
import type { Monitor, ZmEvent } from '@/types';
import { fetchReviewEvents, reviewFilterQueries, type ReviewEventFilters } from './useReviewEvents';

/**
 * Every event the review window shows, across the monitors on screen, oldest
 * first. Same query keys as the cells and the timeline, so this reads their
 * cache rather than asking again.
 */
export function useWindowEvents(
  monitors: readonly Monitor[],
  rangeStart: Date,
  rangeEnd: Date,
  filters: ReviewEventFilters,
  enabled: boolean,
): { events: ZmEvent[]; isLoading: boolean } {
  const { isAuthenticated } = useAuthStore();
  const startISO = rangeStart.toISOString();
  const endISO = rangeEnd.toISOString();
  const results = useQueries({
    queries: monitors.map((m) => ({
      queryKey: ['reviewEvents', m.id, startISO, endISO, reviewFilterQueries(filters)],
      queryFn: () => fetchReviewEvents(m.id, startISO, endISO, filters),
      enabled: enabled && isAuthenticated,
      staleTime: 30_000,
    })),
  });
  const events = results
    .flatMap((r) => r.data ?? [])
    .sort((a, b) => Date.parse(a.start_date_time ?? '') - Date.parse(b.start_date_time ?? '') || a.id - b.id);
  return { events, isLoading: results.some((r) => r.isLoading) };
}
