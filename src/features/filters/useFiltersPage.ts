import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/components/common/toastStore';
import { usePerms } from '@/features/auth/usePerms';
import { useMe } from '@/features/auth/useMe';
import { useZmConfig } from '@/features/config/useZmConfig';
import { getMonitors } from '@/api/monitors';
import { getStorageList } from '@/api/storage';
import { getUsers } from '@/api/users';
import {
  listFilters, createFilter, updateFilter, deleteFilter,
  parseFilterQuery, serializeFilterQuery, FILTER_FLAG_DEFAULTS,
  type Filter as FilterModel, type FilterColumns, type FilterQuery, type FilterTerm,
} from '@/api/filters';
import type { Monitor, User, ZmStorage } from '@/types';
import { normaliseTerms } from './terms';
import { termsToAst, type AstResult } from './toAst';
import { buildTermTree } from './tree';
import { validateDraft } from './validate';
import { reviewSearchFromQuery, type ReviewSearch } from './reviewLink';

/** A `query_json` the editor refused to interpret (and will never overwrite). */
export interface UnreadableQuery {
  raw: string;
  reason: string;
}

export interface FiltersPageState {
  isAuthenticated: boolean;
  /** Events Edit — legacy gates Save / Delete / Execute on it. */
  canEdit: boolean;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  filters: FilterModel[];
  monitors: Monitor[];
  storage: ZmStorage[];
  /** For "User to run filter as" (empty when the caller may not list users). */
  users: User[];

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

  /** `ZM_WEB_ID_ON_FILTER` — prefix the chooser's options with the filter id. */
  idOnFilter: boolean;
  /** Option gating, straight off the `ZM_OPT_*` config rows. */
  features: FilterFeatures;
  /** The signed-in operator's id, or null when `/me` has not answered. */
  currentUserId: number | null;
  /** Who the filter runs as: the draft column, defaulting to the operator. */
  draftUserId: number | null;

  /** Serialised query JSON as it would be sent (empty when unreadable). */
  composeQueryJson: () => string;
  /**
   * Legacy `canWeEdit`: System edit, or you own the filter, or it is new.
   * Anyone may build a filter; only those three may save over a stored one.
   */
  canWeEdit: boolean;
  canSave: boolean;
  canDelete: boolean;
  /** Brackets in the draft's terms open and close evenly. */
  balanced: boolean;
  /** Any auto-* action on — drives the "only fires once saved" note. */
  anyActionOn: boolean;
  /** Auto-delete is on and there are no conditions: would delete every event. */
  deleteEverythingRisk: boolean;

  create: () => void;
  createPending: boolean;
  save: () => void;
  savePending: boolean;
  saveError: Error | null;
  /** Legacy "Save As": a copy under another name. */
  saveAs: (name: string) => void;
  /** Legacy "Reset": back to the saved row (or a blank form). */
  reset: () => void;
  remove: (id: number) => void;
  /** Validate first, then save (or raise a confirm / notice). */
  requestSave: () => void;
  requestSaveAs: (name: string) => void;
  requestDelete: (f: FilterModel) => void;
  /** The pending question, for `<ConfirmDialog>`; null when nothing is asked. */
  confirm: PendingConfirm | null;
  /** Legacy "Debug": the backend's AST for the saved row, or ours for the draft. */
  debug: { source: 'backend' | 'draft'; ast: AstResult | null; backendAst: unknown } | null;
  /** Legacy "View Matches": Montage Review framed by the draft's terms. */
  reviewSearch: ReviewSearch;
}

/** Which optional ZoneMinder subsystems are switched on for this install. */
export interface FilterFeatures {
  video: boolean;
  upload: boolean;
  email: boolean;
  message: boolean;
  /** Only `canEdit('System')` may set the command a filter shells out to. */
  executeCmd: boolean;
}

/** A question the page has to put to the operator before it can go ahead. */
export interface PendingConfirm {
  title: string;
  message: string;
  confirmText: string;
  variant: 'danger' | 'warning';
  accept: () => void;
  cancel: () => void;
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

/** `?terms=` from the Events list: a JSON array of ZoneMinder terms, or nothing usable. */
export function termsFromSearch(raw: string | undefined): FilterTerm[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const ok = parsed.every((t) => t && typeof t === 'object' && typeof (t as FilterTerm).attr === 'string');
    return ok ? normaliseTerms(parsed as FilterTerm[]) : null;
  } catch {
    return null;
  }
}

/**
 * Saved-filter list + editor draft for the Filters page. Skin-agnostic.
 *
 * The draft mirrors the backend row: columns are sent as columns and
 * `query_json` is ZoneMinder's `terms` document. A filter whose `query_json`
 * we cannot parse is shown raw and cannot be saved. `?id=` opens a saved
 * filter; `?terms=` seeds a new one (the Events list's "Filter" button).
 */
export function useFiltersPage(): FiltersPageState {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const { can } = usePerms();
  const canEdit = can('events', 'Edit');
  const canEditSystem = can('system', 'Edit');
  const canListUsers = can('system', 'View');
  const qc = useQueryClient();
  const toast = useToast();
  const search = useSearch({ from: '/filters/' }) as { id?: number; terms?: string };
  const navigate = useNavigate({ from: '/filters/' });

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
  const usersQ = useQuery({
    queryKey: ['users'],
    queryFn: () => getUsers({ page: 1, page_size: 100 }),
    enabled: isAuthenticated && canListUsers,
    staleTime: 5 * 60_000,
  });
  const me = useMe();
  const claimedUid = useAuthStore((st) => st.user?.uid ?? null);
  const currentUserId = me.data?.id ?? claimedUid ?? null;

  // Legacy sorts the chooser by lower(Name) and gates the optional actions
  // on the same `ZM_OPT_*` rows the PHP form reads.
  const filters = useMemo(
    () => [...(filtersQ.data?.items ?? [])]
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())),
    [filtersQ.data],
  );
  const idOnFilter = useZmConfig('ZM_WEB_ID_ON_FILTER', false);
  const features: FilterFeatures = {
    // ZoneMinder ships with ZM_OPT_FFMPEG on; the other three default off.
    video: useZmConfig('ZM_OPT_FFMPEG', true),
    upload: useZmConfig('ZM_OPT_UPLOAD', false),
    email: useZmConfig('ZM_OPT_EMAIL', false),
    message: useZmConfig('ZM_OPT_MESSAGE', false),
    executeCmd: canEditSystem,
  };
  const monitors = monitorsQ.data?.items ?? [];
  const storage = storageQ.data?.items ?? [];
  const users = usersQ.data?.items ?? [];

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftQuery, setDraftQuery] = useState<FilterQuery | null>(() => {
    const seeded = termsFromSearch(search.terms);
    return seeded ? { ...EMPTY_QUERY, terms: seeded } : EMPTY_QUERY;
  });
  const [unreadable, setUnreadable] = useState<UnreadableQuery | null>(null);
  const [draftColumns, setDraftColumns] = useState<FilterColumns>({ ...FILTER_FLAG_DEFAULTS });
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);

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

  // `?id=` — open that filter once the list has arrived (and again when the
  // URL changes to another id); the URL is the source of truth for selection.
  // Synced during render, the React-sanctioned way to derive state from props.
  const [appliedId, setAppliedId] = useState<number | null>(null);
  const wantedId = search.id ?? null;
  if (wantedId !== appliedId) {
    if (wantedId == null) {
      setAppliedId(null);
    } else {
      const f = filters.find((x) => x.id === wantedId);
      if (f) { // list not loaded yet, or an unknown id: leave the form alone
        setAppliedId(wantedId);
        startEditing(f);
      }
    }
  }

  const select = (f: FilterModel | null) => {
    startEditing(f);
    setAppliedId(f?.id ?? null);
    navigate({ search: () => (f ? { id: f.id } : {}), replace: true });
  };

  const composeQueryJson = () => (draftQuery ? serializeFilterQuery(draftQuery) : '');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['filters'] });

  const createMutation = useMutation({
    mutationFn: (name: string) =>
      createFilter({
        name: name.trim(),
        query_json: composeQueryJson(),
        ...draftColumns,
        user_id: draftUserId,
      }),
    onSuccess: (f) => {
      invalidate();
      setSelectedId(f.id);
      setDraftName(f.name);
      setAppliedId(f.id);
      navigate({ search: () => ({ id: f.id }), replace: true });
      toast.success(t('Filter "{{name}}" saved', { name: f.name }));
    },
    onError: toast.apiError,
  });
  const updateMutation = useMutation({
    mutationFn: () => {
      if (!selectedId) throw new Error('no filter selected');
      if (!draftQuery) throw new Error('query_json is unreadable; refusing to overwrite it');
      return updateFilter(selectedId, {
        name: draftName.trim(),
        query_json: serializeFilterQuery(draftQuery),
        ...draftColumns,
        user_id: draftUserId,
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success(t('Filter "{{name}}" saved', { name: draftName.trim() }));
    },
    onError: toast.apiError,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteFilter(id),
    onSuccess: () => {
      invalidate();
      select(null);
    },
    onError: toast.apiError,
  });

  const draftUserId = draftColumns.user_id ?? currentUserId;
  const canWeEdit = canEditSystem
    || selectedFilter == null
    || (currentUserId != null && selectedFilter.user_id === currentUserId);
  const canSave = canEdit && canWeEdit && draftName.trim().length > 0 && draftQuery != null;
  const canDelete = canEdit && canWeEdit && selectedId != null;
  const balanced = buildTermTree(draftQuery?.terms ?? []).balanced;
  const anyActionOn = ACTION_FLAGS.some((k) => draftColumns[k] === 1);
  const deleteEverythingRisk = draftColumns.auto_delete === 1 && (draftQuery?.terms.length ?? 0) === 0;

  const debug = useMemo(() => {
    if (!draftQuery && !selectedFilter) return null;
    if (selectedFilter?.filter) return { source: 'backend' as const, ast: null, backendAst: selectedFilter.filter };
    return { source: 'draft' as const, ast: draftQuery ? termsToAst(draftQuery) : null, backendAst: null };
  }, [draftQuery, selectedFilter]);

  /**
   * Legacy `validateForm()`: a hard error stops the save, a confirm asks
   * first, and a notice is shown but does not stand in the way.
   */
  const guard = (go: () => void) => {
    const { errors, confirms, notices } = validateDraft(draftQuery, draftColumns, t);
    if (errors.length > 0) {
      toast.error(errors[0]);
      return;
    }
    for (const n of notices) toast.info(n);
    if (confirms.length > 0) {
      setConfirm({
        title: t('Save this filter?'),
        message: confirms[0],
        confirmText: t('Save anyway'),
        variant: 'warning',
        accept: () => { setConfirm(null); go(); },
        cancel: () => setConfirm(null),
      });
      return;
    }
    go();
  };

  const requestDelete = (f: FilterModel) => setConfirm({
    title: t('Delete filter'),
    message: t('Delete the filter "{{name}}"? This cannot be undone.', { name: f.name }),
    confirmText: t('Delete'),
    variant: 'danger',
    accept: () => { setConfirm(null); deleteMutation.mutate(f.id); },
    cancel: () => setConfirm(null),
  });

  const reviewSearch = useMemo(() => (draftQuery ? reviewSearchFromQuery(draftQuery) : {}), [draftQuery]);

  return {
    isAuthenticated,
    canEdit,
    isLoading: filtersQ.isLoading,
    isError: filtersQ.isError,
    error: (filtersQ.error as Error | null) ?? null,
    refetch: () => { filtersQ.refetch(); },
    filters,
    monitors,
    storage,
    users,

    selectedId,
    selectedFilter,
    startEditing: select,

    draftName,
    setDraftName,
    draftQuery,
    setDraftQuery: (q) => setDraftQuery(q),
    unreadable,
    draftColumns,
    setColumn: (key, value) => setDraftColumns((c) => ({ ...c, [key]: value })),
    toggleFlag: (key) => setDraftColumns((c) => ({ ...c, [key]: c[key] === 1 ? 0 : 1 })),

    idOnFilter,
    features,
    currentUserId,
    draftUserId,

    composeQueryJson,
    canWeEdit,
    canSave,
    canDelete,
    balanced,
    anyActionOn,
    deleteEverythingRisk,

    create: () => createMutation.mutate(draftName),
    createPending: createMutation.isPending,
    save: () => updateMutation.mutate(),
    savePending: updateMutation.isPending,
    saveError: ((updateMutation.error ?? createMutation.error) as Error | null) ?? null,
    saveAs: (name: string) => { if (name.trim()) createMutation.mutate(name); },
    reset: () => startEditing(selectedFilter),
    remove: (id: number) => deleteMutation.mutate(id),
    requestSave: () => guard(() => { if (selectedId) updateMutation.mutate(); else createMutation.mutate(draftName); }),
    requestSaveAs: (name: string) => { if (name.trim()) guard(() => createMutation.mutate(name)); },
    requestDelete,
    confirm,
    debug,
    reviewSearch,
  };
}
