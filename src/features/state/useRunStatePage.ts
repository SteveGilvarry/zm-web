import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth';
import { getMonitors } from '@/api/monitors';
import {
  listStates,
  createState,
  deleteState,
  applyState,
  changeDaemonState,
  composeDefinition,
  type State,
  type DaemonAction,
} from '@/api/states';

/** Reserved synthetic names from the legacy modal that aren't real saved rows. */
const RESERVED_STATE_NAMES = new Set(['start', 'stop', 'restart']);
/** Default seed row created by ZoneMinder install; safe to apply but never delete. */
const PROTECTED_STATE_NAMES = new Set(['default']);

export function isProtectedState(name: string): boolean {
  return PROTECTED_STATE_NAMES.has(name.toLowerCase());
}

/**
 * Run-state management. Surfaces the named-state presets stored in
 * `States` and the three daemon supervisor actions (start / stop / restart),
 * which together replace the legacy `?view=state` modal triggered from the
 * RUNNING badge. The header SystemRunningToggle keeps handling the binary
 * start/stop for everyday use.
 */
export function useRunStatePage() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const qc = useQueryClient();

  const statesQ = useQuery({
    queryKey: ['states'],
    queryFn: () => listStates({ page: 1, page_size: 200 }),
    enabled: isAuthenticated,
  });
  const monitorsQ = useQuery({
    queryKey: ['monitors', 'for-state-snapshot'],
    queryFn: () => getMonitors({ page: 1, page_size: 1000 }),
    enabled: isAuthenticated,
  });

  const states: State[] = (statesQ.data?.items ?? []).filter(
    (s) => !RESERVED_STATE_NAMES.has(s.name.toLowerCase()),
  );
  const monitors = monitorsQ.data?.items ?? [];

  const invalidateStates = () => {
    qc.invalidateQueries({ queryKey: ['states'] });
    qc.invalidateQueries({ queryKey: ['systemStatus'] });
  };

  const applyMutation = useMutation({
    mutationFn: (name: string) => applyState(name),
    onSuccess: invalidateStates,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteState(id),
    onSuccess: invalidateStates,
  });

  const changeMutation = useMutation({
    mutationFn: (action: DaemonAction) => changeDaemonState(action),
    onSuccess: invalidateStates,
  });

  const saveCurrentMutation = useMutation({
    mutationFn: (name: string) =>
      createState({
        name,
        definition: composeDefinition(monitors),
        is_active: 0,
      }),
    onSuccess: () => {
      invalidateStates();
      setNewStateName('');
    },
  });

  // Confirm dialog state
  const [applyTarget, setApplyTarget] = useState<State | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<State | null>(null);
  const [daemonTarget, setDaemonTarget] = useState<DaemonAction | null>(null);

  const [newStateName, setNewStateName] = useState('');

  const handleSaveCurrent = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = newStateName.trim();
    if (!trimmed) return;
    if (RESERVED_STATE_NAMES.has(trimmed.toLowerCase())) {
      window.alert(t('"{{name}}" is a reserved name. Choose another.', { name: trimmed }));
      return;
    }
    saveCurrentMutation.mutate(trimmed);
  };

  const confirmApply = () => {
    if (applyTarget) {
      applyMutation.mutate(applyTarget.name);
      setApplyTarget(null);
    }
  };
  const confirmDelete = () => {
    if (deleteTarget) {
      deleteMutation.mutate(deleteTarget.id);
      setDeleteTarget(null);
    }
  };
  const confirmDaemon = () => {
    if (daemonTarget) {
      changeMutation.mutate(daemonTarget);
      setDaemonTarget(null);
    }
  };

  const busy =
    applyMutation.isPending ||
    deleteMutation.isPending ||
    changeMutation.isPending ||
    saveCurrentMutation.isPending;

  return {
    isAuthenticated,
    // lists
    states,
    statesLoading: statesQ.isLoading,
    statesError: statesQ.isError ? (statesQ.error as Error) : null,
    monitors,
    monitorsLoading: monitorsQ.isLoading,
    busy,
    // daemon supervisor — every action goes through the confirm dialog,
    // like legacy's state modal (X-7).
    daemonTarget,
    setDaemonTarget,
    confirmDaemon,
    daemonPending: changeMutation.isPending,
    daemonSuccess: changeMutation.isSuccess && !changeMutation.isPending,
    daemonMessage: changeMutation.data?.message,
    daemonError: changeMutation.isError ? (changeMutation.error as Error) : null,
    // apply
    applyTarget,
    setApplyTarget,
    confirmApply,
    applyPending: applyMutation.isPending,
    // delete
    deleteTarget,
    setDeleteTarget,
    confirmDelete,
    deletePending: deleteMutation.isPending,
    // save current
    newStateName,
    setNewStateName,
    handleSaveCurrent,
    savePending: saveCurrentMutation.isPending,
    saveError: saveCurrentMutation.isError ? (saveCurrentMutation.error as Error) : null,
  };
}
