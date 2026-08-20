import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth';
import { getMonitors } from '@/api/monitors';
import { getStorageList } from '@/api/storage';
import {
  listFilters, createFilter, updateFilter, deleteFilter,
  parseFilterQuery, serializeFilterQuery, FILTER_FLAG_DEFAULTS,
  type Filter as FilterModel, type FilterColumns, type FilterQuery,
} from '@/api/filters';
import type { Monitor, ZmStorage } from '@/types';

/** A `query_json` the editor refused to interpret (and will never overwrite). */
export interface UnreadableQuery {
  raw: string;
  reason: string;
}

export interface FiltersPageState {
  isAuthenticated: boolean;
  filters: FilterModel[];
  monitors: Monitor[];
  storage: ZmStorage[];

  selectedId: number | null;
  selectedFilter: FilterModel | null;
  /** Load a filter into the editor, or `null` to start a new one. */
  startEditing: (f: FilterModel | null) => void;

  draftName: string;
  setDraftName: (v: string) => void;
  /** Terms + sort/limit/skip_locked. `null` while the loaded query is unreadable. */
  draftQuery: FilterQuery | null;
  setDraftQuery: (q: FilterQuery) => void;
  unreadable: UnreadableQuery | null;
  /** Action / option columns exactly as they will be sent. */
  draftColumns: FilterColumns;
  setColumn: <K extends keyof FilterColumns>(key: K, value: FilterColumns[K]) => void;
  toggleFlag: (key: FlagKey) => void;

  /** Serialised query JSON as it would be sent (empty when unreadable). */
  composeQueryJson: () => string;
  canSave: boolean;
  /** Any auto-* action on — drives the "only fires once saved" note. */
  anyActionOn: boolean;
  /** Auto-delete is on and there are no conditions: would delete every event. */
  deleteEverythingRisk: boolean;

  create: () => void;
  createPending: boolean;
  save: () => void;
  savePending: boolean;
  saveError: Error | null;
  remove: (id: number) => void;
}

export type FlagKey =
  | 'auto_archive' | 'auto_unarchive' | 'auto_video' | 'auto_upload' | 'auto_email'
  | 'auto_message' | 'auto_execute' | 'auto_delete' | 'auto_copy' | 'auto_move'
  | 'update_disk_space' | 'background' | 'concurrent' | 'lock_rows';

export const ACTION_FLAGS: FlagKey[] = [
  'auto_archive', 'auto_unarchive', 'update_disk_space', 'auto_video', 'auto_upload',
  'auto_email', 'auto_message', 'auto_execute', 'auto_delete', 'auto_copy', 'auto_move',
];

export const EMPTY_QUERY: FilterQuery = {
  terms: [],
  sort_field: 'StartDateTime',
  sort_asc: '0',
  limit: '0',
  skip_locked: '0',
};

/** Pick the column set off a filter row, filling anything the backend omitted. */
export function columnsOf(f: FilterModel): FilterColumns {
  const out: Record<string, unknown> = { ...FILTER_FLAG_DEFAULTS };
  const row = f as unknown as Record<string, unknown>;
  for (const key of Object.keys(FILTER_FLAG_DEFAULTS)) {
    if (row[key] !== undefined) out[key] = row[key];
  }
  out.user_id = f.user_id ?? null;
  return out as unknown as FilterColumns;
}

/**
 * Saved-filter list + editor draft for the Filters page. Skin-agnostic.
 *
 * The draft mirrors the backend row: columns are sent as columns and
 * `query_json` is ZoneMinder's `terms` document. A filter whose `query_json`
 * we cannot parse is shown raw and cannot be saved.
 */
export function useFiltersPage(): FiltersPageState {
  const { isAuthenticated } = useAuthStore();
  const qc = useQueryClient();

  const filtersQ = useQuery({
    queryKey: ['filters'],
    queryFn: () => listFilters({ page: 1, page_size: 200 }),
    enabled: isAuthenticated,
  });
  const monitorsQ = useQuery({
    queryKey: ['monitors'],
    queryFn: () => getMonitors({ page: 1, page_size: 200 }),
    enabled: isAuthenticated,
  });
  const storageQ = useQuery({
    queryKey: ['storage'],
    queryFn: () => getStorageList({ page: 1, page_size: 200 }),
    enabled: isAuthenticated,
  });
  const filters = useMemo(() => filtersQ.data?.items ?? [], [filtersQ.data]);
  const monitors = monitorsQ.data?.items ?? [];
  const storage = storageQ.data?.items ?? [];

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftQuery, setDraftQuery] = useState<FilterQuery | null>(EMPTY_QUERY);
  const [unreadable, setUnreadable] = useState<UnreadableQuery | null>(null);
  const [draftColumns, setDraftColumns] = useState<FilterColumns>({ ...FILTER_FLAG_DEFAULTS });

  const selectedFilter = useMemo(
    () => filters.find((f) => f.id === selectedId) ?? null,
    [filters, selectedId],
  );

  const startEditing = (f: FilterModel | null) => {
    if (f) {
      const parsed = parseFilterQuery(f.query_json);
      setSelectedId(f.id);
      setDraftName(f.name);
      if (parsed.ok) {
        setDraftQuery(parsed.query);
        setUnreadable(null);
      } else {
        setDraftQuery(null);
        setUnreadable({ raw: parsed.raw, reason: parsed.reason });
      }
      setDraftColumns(columnsOf(f));
    } else {
      setSelectedId(null);
      setDraftName('');
      setDraftQuery(EMPTY_QUERY);
      setUnreadable(null);
      setDraftColumns({ ...FILTER_FLAG_DEFAULTS });
    }
  };

  const composeQueryJson = () => (draftQuery ? serializeFilterQuery(draftQuery) : '');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['filters'] });

  const createMutation = useMutation({
    mutationFn: () =>
      createFilter({
        name: draftName.trim(),
        query_json: composeQueryJson(),
        ...draftColumns,
      }),
    onSuccess: (f) => {
      invalidate();
      setSelectedId(f.id);
    },
  });
  const updateMutation = useMutation({
    mutationFn: () => {
      if (!selectedId) throw new Error('no filter selected');
      if (!draftQuery) throw new Error('query_json is unreadable; refusing to overwrite it');
      return updateFilter(selectedId, {
        name: draftName.trim(),
        query_json: serializeFilterQuery(draftQuery),
        ...draftColumns,
      });
    },
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteFilter(id),
    onSuccess: () => {
      invalidate();
      startEditing(null);
    },
  });

  const canSave = draftName.trim().length > 0 && draftQuery != null;
  const anyActionOn = ACTION_FLAGS.some((k) => draftColumns[k] === 1);
  const deleteEverythingRisk = draftColumns.auto_delete === 1 && (draftQuery?.terms.length ?? 0) === 0;

  return {
    isAuthenticated,
    filters,
    monitors,
    storage,

    selectedId,
    selectedFilter,
    startEditing,

    draftName,
    setDraftName,
    draftQuery,
    setDraftQuery: (q) => setDraftQuery(q),
    unreadable,
    draftColumns,
    setColumn: (key, value) => setDraftColumns((c) => ({ ...c, [key]: value })),
    toggleFlag: (key) => setDraftColumns((c) => ({ ...c, [key]: c[key] === 1 ? 0 : 1 })),

    composeQueryJson,
    canSave,
    anyActionOn,
    deleteEverythingRisk,

    create: () => createMutation.mutate(),
    createPending: createMutation.isPending,
    save: () => updateMutation.mutate(),
    savePending: updateMutation.isPending,
    saveError: updateMutation.error ?? createMutation.error,
    remove: (id: number) => deleteMutation.mutate(id),
  };
}
