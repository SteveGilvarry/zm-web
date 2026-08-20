import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getStorageList, createStorage, updateStorage, deleteStorage } from '@/api/storage';
import { useAuthStore } from '@/stores/auth';
import type { ZmStorage } from '@/types';

export const STORAGE_TYPES = ['local', 's3fs'];
export const STORAGE_PAGE_SIZE = 25;

export interface StorageFormData {
  name: string;
  path: string;
  type: string;
  enabled: number;
}

const EMPTY_FORM: StorageFormData = { name: '', path: '', type: 'local', enabled: 1 };

/**
 * Data + state for Settings → Storage: paged list with client-side search,
 * create/edit modal, enable toggle and delete-with-confirm.
 */
export function useStoragePage() {
  const { isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: storageData, isLoading } = useQuery({
    queryKey: ['storage', page, STORAGE_PAGE_SIZE],
    queryFn: () => getStorageList({ page, page_size: STORAGE_PAGE_SIZE }),
    enabled: isAuthenticated,
  });

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

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStorage, setEditingStorage] = useState<ZmStorage | null>(null);
  const [formData, setFormData] = useState<StorageFormData>(EMPTY_FORM);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<ZmStorage | null>(null);

  const openCreate = () => {
    setEditingStorage(null);
    setFormData(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (storage: ZmStorage) => {
    setEditingStorage(storage);
    setFormData({
      name: storage.name,
      path: storage.path,
      type: storage.type,
      enabled: storage.enabled,
    });
    setModalOpen(true);
  };

  const closeModal = () => setModalOpen(false);

  const invalidateStorage = () => queryClient.invalidateQueries({ queryKey: ['storage'] });

  const createMutation = useMutation({
    mutationFn: createStorage,
    onSuccess: () => {
      setModalOpen(false);
      invalidateStorage();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof updateStorage>[1] }) =>
      updateStorage(id, data),
    onSuccess: () => {
      setModalOpen(false);
      invalidateStorage();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteStorage,
    onSuccess: () => {
      setDeleteTarget(null);
      invalidateStorage();
    },
  });

  const toggleEnabledMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: number }) =>
      updateStorage(id, { enabled }),
    onSuccess: () => {
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
    if (editingStorage) {
      updateMutation.mutate({ id: editingStorage.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const confirmDelete = () => {
    if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const submitDisabled = isSaving || !formData.name || !formData.path;

  const prevPage = () => setPage((p) => Math.max(1, p - 1));
  const nextPage = () => setPage((p) => Math.min(totalPages, p + 1));

  return {
    isAuthenticated,
    isLoading,
    filteredItems,
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
    submitDisabled,
    deleteTarget,
    setDeleteTarget,
    confirmDelete,
    isDeleting: deleteMutation.isPending,
    toggleEnabled,
  };
}
