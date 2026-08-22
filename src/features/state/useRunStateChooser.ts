import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth';
import {
  applyState,
  changeDaemonState,
  listStates,
  type DaemonAction,
  type State,
} from '@/api/states';

const DAEMON_ACTIONS: ReadonlySet<string> = new Set(['start', 'stop', 'restart']);

/** A choice in the chooser: a supervisor action or a saved state's name. */
export type RunStateChoice = DaemonAction | string;

export function isDaemonAction(choice: string): choice is DaemonAction {
  return DAEMON_ACTIONS.has(choice.toLowerCase());
}

/**
 * The legacy `?view=state` modal: one select holding Start / Stop / Restart
 * plus every saved state, an Apply button, and a confirm before anything
 * runs. Backs the header RUNNING badge (`SystemRunningToggle`) in both skins.
 *
 * Queries only run while `open`, so an idle header costs nothing.
 */
export function useRunStateChooser(open: boolean) {
  const { isAuthenticated } = useAuthStore();
  const qc = useQueryClient();
  const [choice, setChoice] = useState<RunStateChoice>('');
  const [confirming, setConfirming] = useState(false);

  const statesQ = useQuery({
    queryKey: ['states'],
    queryFn: () => listStates({ page: 1, page_size: 200 }),
    enabled: open && isAuthenticated,
  });
  const states: State[] = (statesQ.data?.items ?? []).filter((s) => !isDaemonAction(s.name));

  const mutation = useMutation({
    mutationFn: (c: RunStateChoice) =>
      isDaemonAction(c) ? changeDaemonState(c.toLowerCase() as DaemonAction) : applyState(c),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['systemStatus'] });
      qc.invalidateQueries({ queryKey: ['states'] });
      qc.invalidateQueries({ queryKey: ['monitors'] });
    },
    onSettled: () => setConfirming(false),
  });

  const reset = () => {
    setChoice('');
    setConfirming(false);
    mutation.reset();
  };

  return {
    choice,
    setChoice,
    states,
    statesLoading: statesQ.isLoading,
    /** Step 1: Apply pressed — show the confirm. */
    requestApply: () => { if (choice) setConfirming(true); },
    confirming,
    cancelConfirm: () => setConfirming(false),
    /** Step 2: confirmed — run it. */
    confirmApply: () => { if (choice) mutation.mutate(choice); },
    pending: mutation.isPending,
    succeeded: mutation.isSuccess,
    error: mutation.isError ? (mutation.error as Error) : null,
    reset,
  };
}
