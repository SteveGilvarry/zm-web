import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getEvents } from '@/api/events';
import { previewFilter, type FilterQuery } from '@/api/filters';
import type { Monitor, ZmEvent } from '@/types';
import { evaluateFilter, unevaluableAttrs } from './evaluate';
import { termsToAst } from './toAst';

export const PREVIEW_PAGE_SIZE = 50;
/** Candidate window for the client path (most recent events). */
export const CLIENT_PREVIEW_WINDOW = 500;

export interface FilterPreviewState {
  /**
   * `server`: `POST /filters/preview` ran the terms (exact, paginated, ACL).
   * `client`: the terms include something the preview AST cannot model, so
   *           the most recent {@link CLIENT_PREVIEW_WINDOW} events were
   *           evaluated in the browser (best effort).
   */
  mode: 'server' | 'client';
  items: ZmEvent[];
  total: number;
  page: number;
  lastPage: number;
  setPage: (p: number) => void;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  /** Why the server path was not used (client mode only). */
  reasons: string[];
  /** Server-mode caveats (e.g. sort field not available). */
  notes: string[];
  /** Attributes the client evaluator had to treat as matching. */
  unevaluable: string[];
  /** Size of the candidate window in client mode. */
  windowSize: number;
}

/**
 * Decides how "List matches" is computed. Server preview is used whenever
 * every term maps to the backend AST (see `toAst.ts` for the verified
 * constraints); otherwise we fall back to the client evaluator.
 */
export function useFilterPreview(
  query: FilterQuery,
  opts: { monitors: Monitor[]; enabled: boolean },
): FilterPreviewState {
  const astRes = useMemo(() => termsToAst(query), [query]);
  const astKey = astRes.ok ? JSON.stringify(astRes.ast) : null;

  // Reset to page 1 whenever the effective AST changes (derived during
  // render — no effect needed).
  const [pageState, setPageState] = useState<{ key: string | null; page: number }>({ key: astKey, page: 1 });
  const page = pageState.key === astKey ? pageState.page : 1;
  if (pageState.key !== astKey) setPageState({ key: astKey, page: 1 });
  const setPage = (p: number) => setPageState({ key: astKey, page: Math.max(1, p) });

  const serverQ = useQuery({
    queryKey: ['filters', 'preview', astKey, page],
    queryFn: () => previewFilter(astRes.ok ? astRes.ast : { where: { match: 'all', rules: [] } }, {
      page, page_size: PREVIEW_PAGE_SIZE,
    }),
    enabled: opts.enabled && astRes.ok,
  });

  const clientQ = useQuery({
    queryKey: ['events', 'filterPreview', CLIENT_PREVIEW_WINDOW],
    queryFn: () => getEvents({ page: 1, page_size: CLIENT_PREVIEW_WINDOW }),
    enabled: opts.enabled && !astRes.ok,
  });

  const clientMatches = useMemo(
    () => (astRes.ok ? [] : evaluateFilter(query, clientQ.data?.items ?? [], { monitors: opts.monitors })),
    [astRes.ok, query, clientQ.data, opts.monitors],
  );

  if (astRes.ok) {
    return {
      mode: 'server',
      items: serverQ.data?.items ?? [],
      total: serverQ.data?.total ?? 0,
      page,
      lastPage: serverQ.data?.last_page ?? 1,
      setPage,
      isLoading: serverQ.isLoading,
      isFetching: serverQ.isFetching,
      error: serverQ.error,
      reasons: [],
      notes: astRes.notes,
      unevaluable: [],
      windowSize: 0,
    };
  }
  return {
    mode: 'client',
    items: clientMatches,
    total: clientMatches.length,
    page: 1,
    lastPage: 1,
    setPage: () => {},
    isLoading: clientQ.isLoading,
    isFetching: clientQ.isFetching,
    error: clientQ.error,
    reasons: astRes.reasons,
    notes: [],
    unevaluable: unevaluableAttrs(query),
    windowSize: clientQ.data?.items.length ?? 0,
  };
}
