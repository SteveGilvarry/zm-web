import { createFileRoute } from '@tanstack/react-router';
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import {
  HardDrive,
  Search,
  Plus,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';

import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { Panel } from '@/components/common/Panel';
import { Modal } from '@/components/common/Modal';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { getStorageList, createStorage, updateStorage, deleteStorage } from '@/api/storage';
import { useAuthStore } from '@/stores/auth';
import type { ZmStorage } from '@/types';

export const Route = createFileRoute('/settings/storage')({
  component: StoragePage,
});

const storageTypes = ['local', 's3fs'];

function StoragePage() {
  const { isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const pageSize = 25;

  const { data: storageData, isLoading } = useQuery({
    queryKey: ['storage', page, pageSize],
    queryFn: () => getStorageList({ page, page_size: pageSize }),
    enabled: isAuthenticated,
  });

  const storageItems = storageData?.items || [];
  const totalPages = storageData?.last_page || 1;

  const filteredItems = useMemo(() => {
    if (!searchQuery) return storageItems;
    const q = searchQuery.toLowerCase();
    return storageItems.filter(
      (s) => s.name.toLowerCase().includes(q) || s.path.toLowerCase().includes(q)
    );
  }, [storageItems, searchQuery]);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStorage, setEditingStorage] = useState<ZmStorage | null>(null);
  const [formData, setFormData] = useState({ name: '', path: '', type: 'local', enabled: 1 });

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<ZmStorage | null>(null);

  const openCreate = () => {
    setEditingStorage(null);
    setFormData({ name: '', path: '', type: 'local', enabled: 1 });
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

  const createMutation = useMutation({
    mutationFn: createStorage,
    onSuccess: () => {
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['storage'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof updateStorage>[1] }) =>
      updateStorage(id, data),
    onSuccess: () => {
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['storage'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteStorage,
    onSuccess: () => {
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['storage'] });
    },
  });

  const toggleEnabled = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: number }) =>
      updateStorage(id, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storage'] });
    },
  });

  const handleSubmit = () => {
    if (editingStorage) {
      updateMutation.mutate({ id: editingStorage.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-void">
      <Sidebar />
      <div className="ml-56 min-h-screen flex flex-col">
        <Header title="Storage Management" />

        <main className="flex-1 p-6 overflow-auto">
          <Panel
            title="Storage Locations"
            icon={<HardDrive size={18} />}
            noPadding
          >
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="text"
                  placeholder="Search storage..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={clsx(
                    'w-full pl-10 pr-4 py-2',
                    'bg-panel border border-border-subtle rounded-lg',
                    'text-text-primary text-sm placeholder:text-text-muted',
                    'focus:outline-none focus:border-cyan/50',
                    'transition-colors'
                  )}
                />
              </div>
              <button
                onClick={openCreate}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2 rounded-lg',
                  'bg-cyan text-void text-sm font-medium',
                  'hover:bg-cyan/80 transition-colors'
                )}
              >
                <Plus size={16} />
                Add Storage
              </button>
            </div>

            {/* Table */}
            {isLoading ? (
              <div className="p-8 text-center text-text-muted text-sm">Loading storage locations...</div>
            ) : filteredItems.length === 0 ? (
              <div className="p-8 text-center text-text-muted text-sm">
                <HardDrive size={32} className="mx-auto mb-3 opacity-50" />
                <p>No storage locations found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle text-left">
                      <th className="px-4 py-3 font-medium text-text-muted">Name</th>
                      <th className="px-4 py-3 font-medium text-text-muted">Path</th>
                      <th className="px-4 py-3 font-medium text-text-muted">Type</th>
                      <th className="px-4 py-3 font-medium text-text-muted">Enabled</th>
                      <th className="px-4 py-3 font-medium text-text-muted text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {filteredItems.map((storage) => (
                      <tr key={storage.id} className="hover:bg-panel/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-text-primary">{storage.name}</td>
                        <td className="px-4 py-3 font-mono text-xs text-text-secondary">{storage.path}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-0.5 rounded bg-panel text-text-muted">
                            {storage.type}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() =>
                              toggleEnabled.mutate({
                                id: storage.id,
                                enabled: storage.enabled === 1 ? 0 : 1,
                              })
                            }
                            className={clsx(
                              'relative w-10 h-5 rounded-full transition-colors',
                              storage.enabled === 1 ? 'bg-cyan' : 'bg-border'
                            )}
                          >
                            <span
                              className={clsx(
                                'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                                storage.enabled === 1 ? 'left-5.5' : 'left-0.5'
                              )}
                            />
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEdit(storage)}
                              className="p-1.5 rounded text-text-muted hover:text-cyan hover:bg-cyan/10 transition-colors"
                              title="Edit"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(storage)}
                              className="p-1.5 rounded text-text-muted hover:text-crimson hover:bg-crimson/10 transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border-subtle">
                <span className="text-xs text-text-muted">
                  Page {page} of {totalPages} ({storageData?.total || 0} total)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className={clsx(
                      'p-1.5 rounded-lg border transition-colors',
                      page === 1
                        ? 'border-border-subtle text-text-muted cursor-not-allowed'
                        : 'border-border-subtle text-text-primary hover:border-cyan/50'
                    )}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className={clsx(
                      'p-1.5 rounded-lg border transition-colors',
                      page === totalPages
                        ? 'border-border-subtle text-text-muted cursor-not-allowed'
                        : 'border-border-subtle text-text-primary hover:border-cyan/50'
                    )}
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </Panel>
        </main>
      </div>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingStorage ? 'Edit Storage' : 'Add Storage'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
              className={clsx(
                'w-full px-3 py-2',
                'bg-panel border border-border-subtle rounded-lg',
                'text-text-primary text-sm',
                'focus:outline-none focus:border-cyan/50',
                'transition-colors'
              )}
              placeholder="Storage name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Path</label>
            <input
              type="text"
              value={formData.path}
              onChange={(e) => setFormData((f) => ({ ...f, path: e.target.value }))}
              className={clsx(
                'w-full px-3 py-2',
                'bg-panel border border-border-subtle rounded-lg',
                'text-text-primary text-sm font-mono',
                'focus:outline-none focus:border-cyan/50',
                'transition-colors'
              )}
              placeholder="/var/cache/zoneminder"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Type</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData((f) => ({ ...f, type: e.target.value }))}
              className={clsx(
                'w-full px-3 py-2 appearance-none',
                'bg-panel border border-border-subtle rounded-lg',
                'text-text-primary text-sm',
                'focus:outline-none focus:border-cyan/50',
                'transition-colors cursor-pointer'
              )}
            >
              {storageTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-text-secondary">Enabled</label>
            <button
              onClick={() => setFormData((f) => ({ ...f, enabled: f.enabled === 1 ? 0 : 1 }))}
              className={clsx(
                'relative w-10 h-5 rounded-full transition-colors',
                formData.enabled === 1 ? 'bg-cyan' : 'bg-border'
              )}
            >
              <span
                className={clsx(
                  'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                  formData.enabled === 1 ? 'left-5.5' : 'left-0.5'
                )}
              />
            </button>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={() => setModalOpen(false)}
              className={clsx(
                'px-4 py-2 rounded-lg text-sm font-medium',
                'bg-panel border border-border-subtle',
                'text-text-secondary hover:text-text-primary',
                'transition-colors'
              )}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSaving || !formData.name || !formData.path}
              className={clsx(
                'px-4 py-2 rounded-lg text-sm font-medium',
                'bg-cyan text-void',
                'hover:bg-cyan/80 transition-colors',
                'flex items-center gap-2',
                (isSaving || !formData.name || !formData.path) && 'opacity-50 cursor-not-allowed'
              )}
            >
              {isSaving && <Loader2 size={14} className="animate-spin" />}
              {editingStorage ? 'Save Changes' : 'Create Storage'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Delete Storage"
        message={`Are you sure you want to delete storage "${deleteTarget?.name}"? This cannot be undone.`}
        confirmText="Delete"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />

      {/* Background */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute inset-0 bg-grid opacity-20" />
      </div>
    </div>
  );
}
