import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getStorageList, createStorage, updateStorage, deleteStorage, STORAGE_SCHEMES } from '@/api/storage';
import { listServers } from '@/api/servers';
import { previewFilter } from '@/api/filters';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/components/common/toastStore';
import type { ZmStorage } from '@/types';

export const STORAGE_TYPES = ['local', 's3fs'];
export { STORAGE_SCHEMES };
export const STORAGE_PAGE_SIZE = 25;

export interface StorageFormData {
  name: string;
  path: string;
  type: string;
  enabled: number;
  scheme: string;
  server_id: number | null;
  url: string;
}

/** One list row plus everything the skins would otherwise derive themselves. */
export interface StorageRow {
  storage: ZmStorage;
  /** `server_id`, with ZoneMinder's "no specific server" 0 folded into null. */
  serverId: number | null;
  /** Name from `/servers` for `serverId`, or null when it resolves to nothing. */
  serverName: string | null;
  /**
   * `disk_space` as a share (0-100) of the largest figure in the list. The API
   * gives bytes on the store and no filesystem total, so this is a comparison
   * between the listed stores — never a percentage of the disk. Null when the
   * backend has no cached figure for the row.
   */
  diskPercent: number | null;
}

/** ZoneMinder stores "any server" as 0; the picker and the list treat it as none. */
function normalizeServerId(id: number | null | undefined): number | null {
  return id === 0 || id === undefined ? null : id;
}

const EMPTY_FORM: StorageFormData = {
  name: '', path: '', type: 'local', enabled: 1, scheme: 'Medium', server_id: null, url: '',
};

/** The install-time row ZoneMinder itself falls back to; never deletable here. */
export function isProtectedStorage(storage: Pick<ZmStorage, 'name'>): boolean {
  return storage.name.trim().toLowerCase() === 'default';
}

/** Request payload: blanks become null so the backend does not store ''. */
export function toStoragePayload(form: StorageFormData) {
  return {
    name: form.name,
    path: form.path,
    type: form.type,
    enabled: form.enabled,
    scheme: form.scheme || null,
    server_id: form.server_id,
    url: form.url.trim() || null,
  };
}

/**
 * Data + state for Settings → Storage: paged list with client-side search,
 * create/edit modal, enable toggle and delete-with-confirm.
 */
export function useStoragePage() {
  const { isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');

  const storageQ = useQuery({
    queryKey: ['storage', page, STORAGE_PAGE_SIZE],
    queryFn: () => getStorageList({ page, page_size: STORAGE_PAGE_SIZE }),
    enabled: isAuthenticated,
  });
  const { data: storageData, isLoading } = storageQ;

  const serversQ = useQuery({
    queryKey: ['servers'],
    queryFn: () => listServers({ page: 1, page_size: 200 }),
    enabled: isAuthenticated,
  });
  const servers = useMemo(() => serversQ.data?.items ?? [], [serversQ.data]);

  const storageItems = useMemo(() => storageData?.items ?? [], [storageData]);
  const totalPages = storageData?.last_page || 1;
  const total = storageData?.total || 0;

  const filteredItems = useMemo(() => {
    if (!searchQuery) return storageItems;
    const q = searchQuery.toLowerCase();
    return storageItems.filter(
      (s) => s.name.toLowerCase().includes(q) || s.path.toLowerCase().includes(q),
    );
  }, [storageItems, searchQuery]);

  const rows = useMemo<StorageRow[]>(() => {
    const largest = Math.max(0, ...filteredItems.map((s) => s.disk_space ?? 0));
    return filteredItems.map((storage) => {
      const serverId = normalizeServerId(storage.server_id);
      return {
        storage,
        serverId,
        serverName: servers.find((srv) => srv.id === serverId)?.name ?? null,
        diskPercent:
          storage.disk_space == null || largest <= 0
            ? null
            : Math.round((storage.disk_space / largest) * 100),
      };
    });
  }, [filteredItems, servers]);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStorage, setEditingStorage] = useState<ZmStorage | null>(null);
  const [formData, setFormData] = useState<StorageFormData>(EMPTY_FORM);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<ZmStorage | null>(null);

  const openCreate = () => {
    createMutation.reset();
    updateMutation.reset();
    setEditingStorage(null);
    setFormData(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (storage: ZmStorage) => {
    createMutation.reset();
    updateMutation.reset();
    setEditingStorage(storage);
    setFormData({
      name: storage.name,
      path: storage.path,
      type: storage.type,
      enabled: storage.enabled,
      scheme: storage.scheme || EMPTY_FORM.scheme,
      server_id: normalizeServerId(storage.server_id),
      url: storage.url ?? '',
    });
    setModalOpen(true);
  };

  // Delete guard: how many events still live on the target (legacy counted
  // them with a Storage join; here `/filters/preview` on `storage_id`).
  const usageQ = useQuery({
    queryKey: ['storage-usage', deleteTarget?.id],
    queryFn: () =>
      previewFilter(
        { where: { field: 'storage_id', op: 'eq', value: deleteTarget!.id }, limit: null },
        { page: 1, page_size: 1 },
      ),
    enabled: isAuthenticated && deleteTarget !== null,
    staleTime: 0,
  });
  const deleteUsage = {
    count: usageQ.data?.total ?? null,
    loading: deleteTarget !== null && usageQ.isLoading,
    error: usageQ.error?.message ?? null,
  };
  const deleteBlocked = (deleteUsage.count ?? 0) > 0;

  const closeModal = () => setModalOpen(false);

  const invalidateStorage = () => queryClient.invalidateQueries({ queryKey: ['storage'] });

  const createMutation = useMutation({
    mutationFn: createStorage,
    onSuccess: () => {
      setModalOpen(false);
      invalidateStorage();
    },
    onError: (err) => toast.apiError(err),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof updateStorage>[1] }) =>
      updateStorage(id, data),
    onSuccess: () => {
      setModalOpen(false);
      invalidateStorage();
    },
    onError: (err) => toast.apiError(err),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteStorage,
    onSuccess: () => {
      setDeleteTarget(null);
      invalidateStorage();
    },
    onError: (err) => toast.apiError(err),
  });

  const toggleEnabledMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: number }) =>
      updateStorage(id, { enabled }),
    onSuccess: () => {
      invalidateStorage();
    },
    onError: (err) => {
      toast.apiError(err);
      invalidateStorage();
    },
  });

  const toggleEnabled = (storage: ZmStorage) =>
    toggleEnabledMutation.mutate({ id: storage.id, enabled: storage.enabled === 1 ? 0 : 1 });

  const setField = <K extends keyof StorageFormData>(key: K, value: StorageFormData[K]) =>
    setFormData((f) => ({ ...f, [key]: value }));

  const toggleFormEnabled = () =>
    setFormData((f) => ({ ...f, enabled: f.enabled === 1 ? 0 : 1 }));

  const submitForm = () => {
    const payload = toStoragePayload(formData);
    if (editingStorage) {
      updateMutation.mutate({ id: editingStorage.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const requestDelete = (storage: ZmStorage) => {
    if (isProtectedStorage(storage)) return;
    setDeleteTarget(storage);
  };

  const confirmDelete = () => {
    if (deleteTarget && !deleteBlocked && !deleteUsage.loading) deleteMutation.mutate(deleteTarget.id);
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;
  /** Message from the last failed create/update, for the modal. */
  const saveError = (editingStorage ? updateMutation.error : createMutation.error)?.message ?? null;
  /** Message from the last failed toggle/delete, for the list. */
  const listError = toggleEnabledMutation.error?.message ?? deleteMutation.error?.message ?? null;
  const submitDisabled = isSaving || !formData.name || !formData.path;

  const prevPage = () => setPage((p) => Math.max(1, p - 1));
  const nextPage = () => setPage((p) => Math.min(totalPages, p + 1));

  return {
    isAuthenticated,
    isLoading,
    isError: storageQ.isError,
    error: storageQ.error,
    refetch: () => void storageQ.refetch(),
    rows,
    searchQuery,
    setSearchQuery,
    page,
    totalPages,
    total,
    prevPage,
    nextPage,
    modalOpen,
    editingStorage,
    formData,
    setField,
    toggleFormEnabled,
    openCreate,
    openEdit,
    closeModal,
    submitForm,
    isSaving,
    saveError,
    listError,
    submitDisabled,
    servers,
    deleteTarget,
    setDeleteTarget: requestDelete,
    clearDeleteTarget: () => setDeleteTarget(null),
    deleteUsage,
    deleteBlocked,
    confirmDelete,
    isDeleting: deleteMutation.isPending,
    toggleEnabled,
    isProtected: isProtectedStorage,
  };
}
