import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clearLogs, listLogs, type LogEntry } from '@/api/logs';

/** Rows per page, as legacy's panel is configured on the filter view. */
export const FILTER_LOG_PAGE_SIZE = 10;

/**
 * The component a filter's own log rows carry. zmfilter.pl calls
 * `logInit(id => 'zmfilter_N')`, so both the background daemon and Execute
 * write under it (filter.php:394-397).
 */
export function filterLogComponent(filterId: number): string {
  return `zmfilter_${filterId}`;
}

export interface FilterLogState {
  logs: LogEntry[];
  total: number;
  page: number;
  lastPage: number;
  setPage: (p: number) => void;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  refetch: () => void;
  /** Delete this filter's log rows (System edit). */
  clear: () => void;
  clearPending: boolean;
}

/**
 * Data for the filter log panel, new in 1.39.41: the selected filter's
 * `zmfilter_<Id>` rows, newest first, ten to a page (legacy
 * `getLogPanelHTML(['components' => ['zmfilter_N'], 'page_size' => 10])`).
 */
export function useFilterLog(filterId: number, opts: { enabled: boolean }): FilterLogState {
  const qc = useQueryClient();
  const component = filterLogComponent(filterId);
  const [pageState, setPageState] = useState({ filterId, page: 1 });
  // A different filter starts on its first page.
  const page = pageState.filterId === filterId ? pageState.page : 1;

  const q = useQuery({
    queryKey: ['logs', 'filter', component, page],
    queryFn: () => listLogs({ component, page, page_size: FILTER_LOG_PAGE_SIZE, sort: 'desc' }),
    enabled: opts.enabled,
  });

  const clearMutation = useMutation({
    mutationFn: () => clearLogs({ component }),
    onSuccess: () => {
      setPageState({ filterId, page: 1 });
      qc.invalidateQueries({ queryKey: ['logs'] });
    },
  });

  return {
    logs: q.data?.items ?? [],
    total: q.data?.total ?? 0,
    page,
    lastPage: Math.max(1, q.data?.last_page ?? 1),
    setPage: (p) => setPageState({ filterId, page: Math.max(1, p) }),
    isLoading: q.isLoading,
    isFetching: q.isFetching,
    error: (q.error as Error | null) ?? (clearMutation.error as Error | null) ?? null,
    refetch: () => { q.refetch(); },
    clear: () => clearMutation.mutate(),
    clearPending: clearMutation.isPending,
  };
}
