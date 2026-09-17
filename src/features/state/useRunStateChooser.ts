import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth';
import { getMonitors } from '@/api/monitors';
import {
  applyState,
  changeDaemonState,
  composeDefinition,
  createState,
  deleteState,
  listStates,
  updateState,
  type DaemonAction,
  type State,
} from '@/api/states';

const DAEMON_ACTIONS: ReadonlySet<string> = new Set(['start', 'stop', 'restart']);

/** A choice in the chooser: a supervisor action or a saved state's name. */
export type RunStateChoice = DaemonAction | string;

/** Which confirm step, if any, is standing between the operator and the backend. */
export type RunStateConfirm = 'apply' | 'delete' | null;

export function isDaemonAction(choice: string): choice is DaemonAction {
  return DAEMON_ACTIONS.has(choice.toLowerCase());
}

/**
 * `default` is ZoneMinder's built-in run state: legacy greys out Delete for it
 * (`web/skins/classic/js/skin.js:1099`) because the console falls back to it.
 */
export function isDeletableState(choice: string): boolean {
  return choice !== '' && !isDaemonAction(choice) && choice.toLowerCase() !== 'default';
}

/**
 * The legacy `?view=state` modal: one select holding Start / Stop / Restart
 * plus every saved state, an Apply button, a New State box with Save, a
 * Delete button, and a confirm before anything destructive runs. Backs the
 * header RUNNING badge (`SystemRunningToggle`) in both skins.
 *
 * Queries only run while `open`, so an idle header costs nothing.
 */
export function useRunStateChooser(open: boolean) {
  const { isAuthenticated } = useAuthStore();
  const qc = useQueryClient();
  const [choice, setChoice] = useState<RunStateChoice>('');
  const [newName, setNewName] = useState('');
  const [confirming, setConfirming] = useState<RunStateConfirm>(null);

  const statesQ = useQuery({
    queryKey: ['states'],
    queryFn: () => listStates({ page: 1, page_size: 200 }),
    enabled: open && isAuthenticated,
  });
  const allStates: State[] = statesQ.data?.items ?? [];
  const states: State[] = allStates.filter((s) => !isDaemonAction(s.name));

  // Save snapshots every monitor's Capturing/Analysing/Recording, so the
  // list has to be on hand before Save can compose a Definition.
  const monitorsQ = useQuery({
    queryKey: ['monitors', 'stateSnapshot'],
    queryFn: () => getMonitors({ page: 1, page_size: 1000 }),
    enabled: open && isAuthenticated,
  });

  const mutation = useMutation({
    mutationFn: (c: RunStateChoice) =>
      isDaemonAction(c) ? changeDaemonState(c.toLowerCase() as DaemonAction) : applyState(c),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['systemStatus'] });
      qc.invalidateQueries({ queryKey: ['states'] });
      qc.invalidateQueries({ queryKey: ['monitors'] });
    },
    onSettled: () => setConfirming(null),
  });

  // Legacy takes the New State box when it has text, otherwise the selected
  // state name (`includes/actions/state.php:40`). A daemon verb is not a
  // state name, so it never becomes one here.
  const saveName = newName.trim() || (isDaemonAction(choice) ? '' : choice.trim());

  const saveMutation = useMutation({
    mutationFn: async () => {
      const definition = composeDefinition(
        (monitorsQ.data?.items ?? []).map((m) => ({
          id: m.id,
          capturing: m.capturing,
          analysing: m.analysing,
          recording: m.recording,
        })),
      );
      // Legacy is `REPLACE INTO States SET Name=?, Definition=?` — same name
      // overwrites the definition rather than adding a second row.
      const existing = allStates.find((s) => s.name === saveName);
      if (existing) return updateState(existing.id, { definition });
      return createState({ name: saveName, definition, is_active: 0 });
    },
    onSuccess: () => {
      setNewName('');
      qc.invalidateQueries({ queryKey: ['states'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const target = allStates.find((s) => s.name === choice);
      if (!target) return;
      await deleteState(target.id);
    },
    onSuccess: () => {
      setChoice('');
      qc.invalidateQueries({ queryKey: ['states'] });
    },
    onSettled: () => setConfirming(null),
  });

  const reset = () => {
    setChoice('');
    setNewName('');
    setConfirming(null);
    mutation.reset();
    saveMutation.reset();
    deleteMutation.reset();
  };

  const firstError = mutation.error ?? saveMutation.error ?? deleteMutation.error;

  const canDelete = isDeletableState(choice) && allStates.some((s) => s.name === choice);

  return {
    choice,
    setChoice,
    newName,
    setNewName,
    states,
    statesLoading: statesQ.isLoading,
    /** Step 1: Apply pressed — show the confirm. */
    requestApply: () => { if (choice) setConfirming('apply'); },
    confirming,
    cancelConfirm: () => setConfirming(null),
    /** Step 2: confirmed — run it. */
    confirmApply: () => { if (choice) mutation.mutate(choice); },
    /** Save has no confirm in legacy — it overwrites by name and reloads. */
    canSave: saveName !== '' && !monitorsQ.isLoading,
    saveName,
    save: () => { if (saveName) saveMutation.mutate(); },
    saving: saveMutation.isPending,
    saved: saveMutation.isSuccess,
    canDelete,
    requestDelete: () => { if (canDelete) setConfirming('delete'); },
    confirmDelete: () => { if (canDelete) deleteMutation.mutate(); },
    deleting: deleteMutation.isPending,
    pending: mutation.isPending,
    succeeded: mutation.isSuccess,
    error: firstError ? (firstError as Error) : null,
    reset,
  };
}
