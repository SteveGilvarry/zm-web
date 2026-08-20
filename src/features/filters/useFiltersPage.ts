import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth';
import { getMonitors } from '@/api/monitors';
import {
  listFilters, createFilter, updateFilter, deleteFilter,
  parseFilterQuery, serializeFilterQuery,
  type Filter as FilterModel, type FilterQuery, type FilterActions, type FilterOptions,
} from '@/api/filters';
import type { Monitor } from '@/types';

export interface FiltersPageState {
  isAuthenticated: boolean;
  filters: FilterModel[];
  monitors: Monitor[];

  selectedId: number | null;
  selectedFilter: FilterModel | null;
  /** Load a filter into the editor, or `null` to start a new one. */
  startEditing: (f: FilterModel | null) => void;

  draftName: string;
  setDraftName: (v: string) => void;
  draftQuery: FilterQuery;
  setDraftQuery: (q: FilterQuery) => void;
  draftAutoArchive: boolean;
  toggleAutoArchive: () => void;
  draftAutoDelete: boolean;
  toggleAutoDelete: () => void;
  draftInterval: number;
  setDraftInterval: (v: number) => void;
  draftActions: FilterActions;
  setDraftActions: Dispatch<SetStateAction<FilterActions>>;
  draftOptions: FilterOptions;
  setDraftOptions: Dispatch<SetStateAction<FilterOptions>>;

  /** Serialised query JSON as it would be sent to the backend. */
  composeQueryJson: () => string;
  canSave: boolean;
  /** True when any auto-* action is on — drives the "only fires after save" note. */
  anyActionOn: boolean;

  create: () => void;
  createPending: boolean;
  save: () => void;
  savePending: boolean;
  remove: (id: number) => void;
}

/**
 * Saved-filter list + editor draft for the Filters page. Skin-agnostic.
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
  const filters = useMemo(() => filtersQ.data?.items ?? [], [filtersQ.data]);
  const monitors = monitorsQ.data?.items ?? [];

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftQuery, setDraftQuery] = useState<FilterQuery>({ rules: [] });
  const [draftAutoArchive, setDraftAutoArchive] = useState(false);
  const [draftAutoDelete, setDraftAutoDelete] = useState(false);
  const [draftInterval, setDraftInterval] = useState(0);
  // Extended auto-* actions and filter-options surface (P19). Backend's
  // FilterResponse only carries auto_archive / auto_delete / execute_interval
  // / email_format as first-class columns, so the remaining flags ride in
  // query_json.actions and query_json.options. See src/api/filters.ts.
  const [draftActions, setDraftActions] = useState<FilterActions>({});
  const [draftOptions, setDraftOptions] = useState<FilterOptions>({});

  // Load draft from selected filter; reset to empty when nothing's selected.
  const selectedFilter = useMemo(
    () => filters.find((f) => f.id === selectedId) ?? null,
    [filters, selectedId],
  );

  const startEditing = (f: FilterModel | null) => {
    if (f) {
      const q = parseFilterQuery(f.query_json);
      setSelectedId(f.id);
      setDraftName(f.name);
      setDraftQuery(q);
      setDraftAutoArchive(f.auto_archive === 1);
      setDraftAutoDelete(f.auto_delete === 1);
      setDraftInterval(f.execute_interval ?? 0);
      setDraftActions(q.actions ?? {});
      setDraftOptions(q.options ?? {});
    } else {
      setSelectedId(null);
      setDraftName('');
      setDraftQuery({ rules: [] });
      setDraftAutoArchive(false);
      setDraftAutoDelete(false);
      setDraftInterval(0);
      setDraftActions({});
      setDraftOptions({});
    }
  };

  /**
   * Compose the serialised query JSON. We always re-attach `actions` and
   * `options` from the dedicated state so they round-trip via query_json
   * even though the backend doesn't model them as columns.
   */
  const composeQueryJson = (): string => {
    const q: FilterQuery = {
      ...draftQuery,
      actions: {
        ...draftActions,
        auto_archive: draftAutoArchive,
        auto_delete: draftAutoDelete,
      },
      options: draftOptions,
    };
    return serializeFilterQuery(q);
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: ['filters'] });

  const createMutation = useMutation({
    mutationFn: () =>
      createFilter({
        name: draftName.trim(),
        query_json: composeQueryJson(),
        execute_interval: draftInterval,
        email_format: draftActions.email_format ?? null,
      }),
    onSuccess: (f) => {
      invalidate();
      setSelectedId(f.id);
    },
  });
  const updateMutation = useMutation({
    mutationFn: () => {
      if (!selectedId) throw new Error('no filter selected');
      return updateFilter(selectedId, {
        name: draftName.trim(),
        query: composeQueryJson(),
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

  const canSave = draftName.trim().length > 0;
  const anyActionOn = !!(draftAutoArchive || draftAutoDelete || draftActions.auto_video
    || draftActions.auto_email || draftActions.auto_message
    || draftActions.auto_execute || draftActions.auto_copy
    || draftActions.auto_move);

  return {
    isAuthenticated,
    filters,
    monitors,

    selectedId,
    selectedFilter,
    startEditing,

    draftName,
    setDraftName,
    draftQuery,
    setDraftQuery,
    draftAutoArchive,
    toggleAutoArchive: () => setDraftAutoArchive((v) => !v),
    draftAutoDelete,
    toggleAutoDelete: () => setDraftAutoDelete((v) => !v),
    draftInterval,
    setDraftInterval,
    draftActions,
    setDraftActions,
    draftOptions,
    setDraftOptions,

    composeQueryJson,
    canSave,
    anyActionOn,

    create: () => createMutation.mutate(),
    createPending: createMutation.isPending,
    save: () => updateMutation.mutate(),
    savePending: updateMutation.isPending,
    remove: (id: number) => deleteMutation.mutate(id),
  };
}
