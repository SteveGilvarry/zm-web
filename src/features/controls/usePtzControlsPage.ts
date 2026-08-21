import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { listControls, getControl, deleteControl, type Control } from '@/api/controls';
import { isDeleted } from '@/types';
import { getMonitors } from '@/api/monitors';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/components/common/toastStore';
import type { Monitor } from '@/types';

export type ControlSortKey = 'id' | 'name' | 'type' | 'protocol';
export type SortDir = 'asc' | 'desc';

export interface ControlRow {
  control: Control;
  /** Monitors whose `control_id` points at this profile. */
  monitors: Pick<Monitor, 'id' | 'name'>[];
}

/** `?id=new` opens the create form, `?id=<n>` the edit form; absent = list. */
export type ControlEditorTarget = number | 'new' | null;

function parseEditorTarget(raw: unknown): ControlEditorTarget {
  if (raw === 'new') return 'new';
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * PTZ control-protocol catalogue (legacy Options → Control). List with
 * sort + search, editor target in `?id=`, delete guarded by the monitors
 * still referencing the row (legacy `controlcaps.php` refuses the same way).
 */
export function usePtzControlsPage() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { id?: unknown };
  const editorTarget = parseEditorTarget(search.id);

  const controlsQ = useQuery({
    queryKey: ['controls'],
    queryFn: () => listControls({ page: 1, page_size: 200 }),
    enabled: isAuthenticated,
  });
  const monitorsQ = useQuery({
    queryKey: ['monitors', 'for-controls'],
    queryFn: () => getMonitors({ page: 1, page_size: 1000 }),
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  const controls = useMemo(() => controlsQ.data?.items ?? [], [controlsQ.data]);

  // A deep link to a row the 200-row page missed still opens.
  const listed = typeof editorTarget === 'number' ? controls.find((c) => c.id === editorTarget) ?? null : null;
  const singleQ = useQuery({
    queryKey: ['controls', editorTarget],
    queryFn: () => getControl(editorTarget as number),
    enabled: isAuthenticated && typeof editorTarget === 'number' && !listed && controlsQ.isSuccess,
  });
  const editing: Control | null = typeof editorTarget === 'number' ? listed ?? singleQ.data ?? null : null;
  const editorOpen = editorTarget !== null;
  const editorLoading = editorTarget !== null && editorTarget !== 'new' && !editing && (controlsQ.isLoading || singleQ.isLoading);
  const editorMissing = typeof editorTarget === 'number' && !editing && !editorLoading;

  const monitorsByControl = useMemo(() => {
    const out = new Map<number, Pick<Monitor, 'id' | 'name'>[]>();
    for (const m of monitorsQ.data?.items ?? []) {
      if (m.control_id == null || isDeleted(m)) continue;
      const bucket = out.get(m.control_id) ?? [];
      bucket.push({ id: m.id, name: m.name });
      out.set(m.control_id, bucket);
    }
    return out;
  }, [monitorsQ.data]);

  const [sortKey, setSortKey] = useState<ControlSortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [query, setQuery] = useState('');

  const rows: ControlRow[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? controls.filter((c) =>
        c.name.toLowerCase().includes(q)
        || (c.protocol ?? '').toLowerCase().includes(q)
        || c.type.toLowerCase().includes(q))
      : controls;
    const dir = sortDir === 'asc' ? 1 : -1;
    const sorted = [...filtered].sort((a, b) => {
      if (sortKey === 'id') return (a.id - b.id) * dir;
      const av = (a[sortKey] ?? '').toString().toLowerCase();
      const bv = (b[sortKey] ?? '').toString().toLowerCase();
      return av.localeCompare(bv) * dir || (a.id - b.id);
    });
    return sorted.map((control) => ({ control, monitors: monitorsByControl.get(control.id) ?? [] }));
  }, [controls, query, sortKey, sortDir, monitorsByControl]);

  const toggleSort = (key: ControlSortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  /* ----- Editor target in the URL ---------------------------------------- */

  const setEditorTarget = (target: ControlEditorTarget) =>
    void navigate({
      to: '/settings/ptz-controls',
      search: (prev: Record<string, unknown>) => {
        const next = { ...prev };
        if (target === null) delete next.id;
        else next.id = target;
        return next;
      },
      replace: target === null,
    });

  /* ----- Selection (legacy mark checkboxes) ------------------------------- */

  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(new Set());
  const toggleSelected = (id: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelectedIds((prev) => (prev.size === rows.length && rows.length > 0 ? new Set() : new Set(rows.map((r) => r.control.id))));
  const selectedRows = rows.filter((r) => selectedIds.has(r.control.id));

  /* ----- Delete ------------------------------------------------------------ */

  const [pendingDelete, setPendingDelete] = useState<Control[]>([]);
  const deleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      for (const id of ids) await deleteControl(id);
      return ids.length;
    },
    onSuccess: (count) => {
      toast.success(t('{{count}} control profile deleted', { count }));
      setSelectedIds(new Set());
      void qc.invalidateQueries({ queryKey: ['controls'] });
    },
    onError: (err) => {
      toast.apiError(err);
      void qc.invalidateQueries({ queryKey: ['controls'] });
    },
    onSettled: () => setPendingDelete([]),
  });

  /** Monitors blocking the pending delete, with the profile they reference. */
  const deleteBlockers = pendingDelete.flatMap((c) =>
    (monitorsByControl.get(c.id) ?? []).map((m) => ({ control: c, monitor: m })));
  const deleteBlocked = deleteBlockers.length > 0;

  const requestDelete = (targets: Control | Control[]) =>
    setPendingDelete(Array.isArray(targets) ? targets : [targets]);
  const confirmDelete = () => {
    if (pendingDelete.length === 0 || deleteBlocked) return;
    deleteMutation.mutate(pendingDelete.map((c) => c.id));
  };

  return {
    isLoading: controlsQ.isLoading,
    isError: controlsQ.isError,
    error: controlsQ.error,
    refetch: () => void controlsQ.refetch(),
    controls,
    rows,
    total: controls.length,
    monitorsLoading: monitorsQ.isLoading,

    query,
    setQuery,
    sortKey,
    sortDir,
    toggleSort,

    selectedIds,
    selectedRows,
    toggleSelected,
    toggleAll,
    clearSelection: () => setSelectedIds(new Set()),

    editorOpen,
    editorTarget,
    editing,
    editorLoading,
    editorMissing,
    openCreate: () => setEditorTarget('new'),
    openEdit: (c: Control) => setEditorTarget(c.id),
    closeEditor: () => setEditorTarget(null),
    onSaved: () => {
      void qc.invalidateQueries({ queryKey: ['controls'] });
      setEditorTarget(null);
    },

    pendingDelete,
    deleteBlockers,
    deleteBlocked,
    requestDelete,
    cancelDelete: () => setPendingDelete([]),
    confirmDelete,
    isDeleting: deleteMutation.isPending,
  };
}
