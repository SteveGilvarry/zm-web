import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';

import { getEvent } from '@/api/events';
import { listFrames, type Frame } from '@/api/frames';
import { useZmConfig } from '@/features/config/useZmConfig';
import type { EventFramesSearchParams } from '@/routes/events/$eventId_.frames';
import { useAuthStore } from '@/stores/auth';
import type { ZmEvent } from '@/types';

export const FRAMES_PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200] as const;

export interface EventFramesPageState {
  isAuthenticated: boolean;
  event: ZmEvent | undefined;
  frames: Frame[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  pageSizeOptions: readonly number[];
  setPage: (n: number) => void;
  setPageSize: (n: number) => void;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
  /** Highest score on the current page; scales the inline score bars. */
  maxScore: number;
}

/**
 * Legacy `?view=frames&eid=`: the per-frame table for one event. The URL
 * carries `page` / `page_size`; the page-size default follows the same
 * `ZM_WEB_EVENTS_PER_PAGE` row the events list uses.
 */
export function useEventFramesPage(eventId: number): EventFramesPageState {
  const { isAuthenticated } = useAuthStore();
  const search = useSearch({ from: '/events/$eventId_/frames' });
  const navigate = useNavigate({ from: '/events/$eventId/frames' });
  const defaultPageSize = useZmConfig('ZM_WEB_EVENTS_PER_PAGE', 25);

  const page = search.page ?? 1;
  const pageSize = search.page_size ?? defaultPageSize;

  const setSearch = (patch: EventFramesSearchParams) => {
    navigate({
      search: (prev) => {
        const next: EventFramesSearchParams = { ...prev, ...patch };
        (Object.keys(next) as (keyof EventFramesSearchParams)[]).forEach((k) => {
          if (next[k] === undefined) delete next[k];
        });
        return next;
      },
      replace: true,
    });
  };

  const eventQuery = useQuery({
    queryKey: ['event', eventId],
    queryFn: () => getEvent(eventId),
    enabled: isAuthenticated,
  });

  const framesQuery = useQuery({
    queryKey: ['frames', eventId, page, pageSize],
    queryFn: () => listFrames({ event_id: eventId, page, page_size: pageSize }),
    enabled: isAuthenticated,
  });

  const frames = framesQuery.data?.items ?? [];
  const total = framesQuery.data?.total ?? 0;
  const totalPages = Math.max(1, framesQuery.data?.last_page ?? Math.ceil(total / pageSize));
  const maxScore = frames.reduce((m, f) => Math.max(m, f.score), 0);

  return {
    isAuthenticated,
    event: eventQuery.data,
    frames,
    total,
    page,
    pageSize,
    totalPages,
    pageSizeOptions: FRAMES_PAGE_SIZE_OPTIONS,
    // Page 1 is the default, so leave it out of the URL.
    setPage: (n) => setSearch({ page: n > 1 ? n : undefined }),
    setPageSize: (n) => setSearch({ page_size: n, page: undefined }),
    isLoading: framesQuery.isLoading,
    isError: framesQuery.isError,
    error: framesQuery.error,
    refetch: () => { void framesQuery.refetch(); },
    maxScore,
  };
}
