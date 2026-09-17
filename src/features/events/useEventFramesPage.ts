import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';

import { getEvent } from '@/api/events';
import { getAllFramesForEvent, listFrames, type Frame } from '@/api/frames';
import { downloadCsv } from '@/features/logs/csv';
import { useZmConfig } from '@/features/config/useZmConfig';
import type { EventFramesSearchParams } from '@/routes/events/$eventId_.frames';
import { useAuthStore } from '@/stores/auth';
import type { ZmEvent } from '@/types';
import {
  FRAMES_COLUMNS, FRAMES_DEFAULT_HIDDEN, filterFrames, framesToCsv, sortFrames,
  type FramesColumnKey, type FramesSortKey, type SortDir,
} from './framesTable';

/** `0` is legacy's "All": every frame of the event on one page. */
export const FRAMES_ALL_PAGE_SIZE = 0;
export const FRAMES_PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200, FRAMES_ALL_PAGE_SIZE] as const;

export interface EventFramesPageState {
  isAuthenticated: boolean;
  event: ZmEvent | undefined;
  /** The rows to render: the fetched page, searched and sorted. */
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

  /** Search box over the visible columns (client-side: `/frames` has none). */
  query: string;
  setQuery: (q: string) => void;
  /** Sort column and direction; clicking the active column flips it. */
  sort: FramesSortKey | null;
  dir: SortDir;
  toggleSort: (key: FramesSortKey) => void;
  /** Column chooser state. */
  hiddenColumns: FramesColumnKey[];
  isVisible: (key: FramesColumnKey) => boolean;
  visibleColumns: FramesColumnKey[];
  toggleColumn: (key: FramesColumnKey) => void;
  resetColumns: () => void;
  /** Export the rows on screen as CSV. */
  exportCsv: () => void;
}

/**
 * Legacy `?view=frames&eid=`: the per-frame table for one event. The URL
 * carries `page` / `page_size`; the page-size default follows the same
 * `ZM_WEB_EVENTS_PER_PAGE` row the events list uses.
 *
 * Sorting, searching, the column chooser and the CSV export are all client
 * side over the fetched rows, because `/frames` accepts only
 * `event_id`/`page`/`page_size` — with the page size set to All that is the
 * whole event, which is what legacy's bootstrap-table does too.
 */
export function useEventFramesPage(eventId: number): EventFramesPageState {
  const { isAuthenticated } = useAuthStore();
  const search = useSearch({ from: '/events/$eventId_/frames' });
  const navigate = useNavigate({ from: '/events/$eventId/frames' });
  const defaultPageSize = useZmConfig('ZM_WEB_EVENTS_PER_PAGE', 25);

  const page = search.page ?? 1;
  const pageSize = search.page_size ?? defaultPageSize;
  const showAll = pageSize === FRAMES_ALL_PAGE_SIZE;

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<FramesSortKey | null>(null);
  const [dir, setDir] = useState<SortDir>('asc');
  const [hiddenColumns, setHiddenColumns] = useState<FramesColumnKey[]>([...FRAMES_DEFAULT_HIDDEN]);

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
    queryKey: ['frames', eventId, showAll ? 'all' : page, pageSize],
    queryFn: async () => {
      if (showAll) {
        const items = await getAllFramesForEvent(eventId);
        return { items, total: items.length, per_page: items.length, current_page: 1, last_page: 1 };
      }
      return listFrames({ event_id: eventId, page, page_size: pageSize });
    },
    enabled: isAuthenticated,
  });

  const fetched = useMemo(() => framesQuery.data?.items ?? [], [framesQuery.data]);
  const total = framesQuery.data?.total ?? 0;
  const totalPages = showAll
    ? 1
    : Math.max(1, framesQuery.data?.last_page ?? Math.ceil(total / Math.max(pageSize, 1)));

  const visibleColumns = useMemo(
    () => FRAMES_COLUMNS.map((c) => c.key).filter((k) => !hiddenColumns.includes(k)),
    [hiddenColumns],
  );

  const frames = useMemo(
    () => sortFrames(filterFrames(fetched, query, visibleColumns), sort, dir),
    [fetched, query, visibleColumns, sort, dir],
  );
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

    query,
    setQuery,
    sort,
    dir,
    toggleSort: (key) => {
      if (key === sort) {
        setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSort(key);
        setDir('asc');
      }
    },
    hiddenColumns,
    isVisible: (key) => !hiddenColumns.includes(key),
    visibleColumns,
    toggleColumn: (key) => setHiddenColumns((prev) => (
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )),
    resetColumns: () => setHiddenColumns([...FRAMES_DEFAULT_HIDDEN]),
    exportCsv: () => downloadCsv(`event-${eventId}-frames.csv`, framesToCsv(frames, visibleColumns)),
  };
}
