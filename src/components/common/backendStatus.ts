import { create } from 'zustand';
import type { QueryClient } from '@tanstack/react-query';
import { isBackendUnreachable } from '@/api/client';

interface BackendStatusState {
  /** True while the last API failure looked like "server down" and nothing
   *  has succeeded since. */
  unreachable: boolean;
  since: number | null;
  failures: number;
  markUnreachable: () => void;
  markReachable: () => void;
}

export const useBackendStatus = create<BackendStatusState>()((set) => ({
  unreachable: false,
  since: null,
  failures: 0,
  markUnreachable: () =>
    set((s) => ({
      unreachable: true,
      since: s.since ?? Date.now(),
      failures: s.failures + 1,
    })),
  markReachable: () => set({ unreachable: false, since: null, failures: 0 }),
}));

/**
 * Drive the backend-status store from the query and mutation caches: any
 * network error or 5xx flips it to unreachable, the next success clears it.
 * Returns an unsubscribe function.
 */
export function attachBackendStatus(queryClient: QueryClient): () => void {
  const { markUnreachable, markReachable } = useBackendStatus.getState();
  const onResult = (action: { type: string; error?: unknown } | undefined) => {
    if (!action) return;
    if (action.type === 'error') {
      if (isBackendUnreachable(action.error)) markUnreachable();
    } else if (action.type === 'success') {
      if (useBackendStatus.getState().unreachable) markReachable();
    }
  };
  const unsubQueries = queryClient.getQueryCache().subscribe((event) => {
    if (event.type === 'updated') onResult(event.action);
  });
  const unsubMutations = queryClient.getMutationCache().subscribe((event) => {
    if (event.type === 'updated') onResult(event.action);
  });
  return () => {
    unsubQueries();
    unsubMutations();
  };
}
