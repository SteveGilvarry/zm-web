import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/components/common/toastStore';
import { getMonitors } from '@/api/monitors';
import {
  listStates,
  createState,
  updateState,
  deleteState,
  applyState,
  changeDaemonState,
  composeDefinition,
  parseDefinition,
  type State,
  type DaemonAction,
} from '@/api/states';

/** One monitor's line in a state's definition, with its current name. */
export interface DefinitionRow {
  id: number;
  name: string;
  /** False when the definition names a monitor that no longer exists. */
  known: boolean;
  capturing: string;
  analysing: string;
  recording: string;
}

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
  const toast = useToast();

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
    onSuccess: (_res, name) => {
      toast.success(t('State "{{name}}" applied', { name }));
      invalidateStates();
    },
    onError: (err) => toast.apiError(err),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteState(id),
    onSuccess: () => {
      toast.success(t('State deleted'));
      invalidateStates();
    },
    onError: (err) => toast.apiError(err),
  });

  const changeMutation = useMutation({
    mutationFn: (action: DaemonAction) => changeDaemonState(action),
    onSuccess: invalidateStates,
    onError: (err) => toast.apiError(err),
  });

  const saveCurrentMutation = useMutation({
    mutationFn: (name: string) =>
      createState({
        name,
        definition: composeDefinition(monitors),
        is_active: 0,
      }),
    onSuccess: (saved) => {
      toast.success(t('State "{{name}}" saved', { name: saved.name }));
      invalidateStates();
      setNewStateName('');
    },
    onError: (err) => toast.apiError(err),
  });

  // Rename (legacy's state modal lets you overwrite a name; `PATCH /states/{id}`).
  const [renameTarget, setRenameTarget] = useState<State | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => updateState(id, { name }),
    onSuccess: (saved) => {
      toast.success(t('State renamed to "{{name}}"', { name: saved.name }));
      setRenameTarget(null);
      invalidateStates();
    },
    onError: (err) => toast.apiError(err),
  });
  const startRename = (s: State) => {
    setRenameTarget(s);
    setRenameValue(s.name);
  };
  const commitRename = () => {
    if (!renameTarget) return;
    const name = renameValue.trim();
    if (!name || name === renameTarget.name) {
      setRenameTarget(null);
      return;
    }
    if (RESERVED_STATE_NAMES.has(name.toLowerCase())) {
      toast.error(t('"{{name}}" is a reserved name. Choose another.', { name }));
      return;
    }
    renameMutation.mutate({ id: renameTarget.id, name });
  };

  // Per-monitor preview of a definition (`Id:Capturing:Analysing:Recording`).
  const [previewId, setPreviewId] = useState<number | null>(null);
  const monitorNames = new Map(monitors.map((m) => [m.id, m.name]));
  const definitionRows = (s: State): DefinitionRow[] =>
    parseDefinition(s.definition).map((row) => ({
      ...row,
      name: monitorNames.get(row.id) ?? t('Monitor {{id}}', { id: row.id }),
      known: monitorNames.has(row.id),
    }));

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
      toast.error(t('"{{name}}" is a reserved name. Choose another.', { name: trimmed }));
      return;
    }
    if (states.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error(t('A state named "{{name}}" already exists.', { name: trimmed }));
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
    renameMutation.isPending ||
    saveCurrentMutation.isPending;

  return {
    isAuthenticated,
    // lists
    states,
    statesLoading: statesQ.isLoading,
    statesError: statesQ.isError ? (statesQ.error as Error) : null,
    statesIsError: statesQ.isError,
    statesRawError: statesQ.error,
    refetchStates: () => void statesQ.refetch(),
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
    // rename
    renameTarget,
    renameValue,
    setRenameValue,
    startRename,
    cancelRename: () => setRenameTarget(null),
    commitRename,
    renamePending: renameMutation.isPending,
    // definition preview
    previewId,
    togglePreview: (id: number) => setPreviewId((cur) => (cur === id ? null : id)),
    definitionRows,
    // save current
    newStateName,
    setNewStateName,
    handleSaveCurrent,
    savePending: saveCurrentMutation.isPending,
    saveError: saveCurrentMutation.isError ? (saveCurrentMutation.error as Error) : null,
  };
}
