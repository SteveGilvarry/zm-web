import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
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

import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { Modal } from '@/components/common/Modal';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { STORAGE_TYPES, useStoragePage } from '@/features/storage/useStoragePage';
import { useDocumentTitle } from '../layouts/useDocumentTitle';

/** Settings → Storage — Mission Control. */
export default function SettingsStoragePage() {
  const { t } = useTranslation();
  const st = useStoragePage();
  useDocumentTitle(t('Storage'));
  const { filteredItems, page, totalPages, formData, editingStorage, deleteTarget } = st;

  if (!st.isAuthenticated) return null;

  return (
    <AppShell title={t('Storage Management')}>
      <main className="flex-1 p-6 overflow-auto">
          <Panel
            title={t('Storage Locations')}
            icon={<HardDrive size={18} />}
            noPadding
          >
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="text"
                  placeholder={t('Search storage...')}
                  value={st.searchQuery}
                  onChange={(e) => st.setSearchQuery(e.target.value)}
                  className={clsx(
                    'w-full ps-10 pe-4 py-2',
                    'bg-panel border border-border-subtle rounded-lg',
                    'text-text-primary text-sm placeholder:text-text-muted',
                    'focus:outline-none focus:border-cyan/50',
                    'transition-colors'
                  )}
                />
              </div>
              <button
                onClick={st.openCreate}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2 rounded-lg',
                  'bg-cyan text-void text-sm font-medium',
                  'hover:bg-cyan/80 transition-colors'
                )}
              >
                <Plus size={16} />
                {t('Add Storage')}
              </button>
            </div>

            {/* Table */}
            {st.isLoading ? (
              <div className="p-8 text-center text-text-muted text-sm">{t('Loading storage locations...')}</div>
            ) : filteredItems.length === 0 ? (
              <div className="p-8 text-center text-text-muted text-sm">
                <HardDrive size={32} className="mx-auto mb-3 opacity-50" />
                <p>{t('No storage locations found')}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle text-start">
                      <th className="px-4 py-3 font-medium text-text-muted">{t('Name')}</th>
                      <th className="px-4 py-3 font-medium text-text-muted">{t('Path')}</th>
                      <th className="px-4 py-3 font-medium text-text-muted">{t('Type')}</th>
                      <th className="px-4 py-3 font-medium text-text-muted">{t('Enabled')}</th>
                      <th className="px-4 py-3 font-medium text-text-muted text-end">{t('Actions')}</th>
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
                            onClick={() => st.toggleEnabled(storage)}
                            role="switch"
                            aria-checked={storage.enabled === 1}
                            aria-label={storage.enabled === 1 ? t('Disable {{name}}', { name: storage.name }) : t('Enable {{name}}', { name: storage.name })}
                            className={clsx(
                              'relative w-10 h-5 rounded-full transition-colors',
                              storage.enabled === 1 ? 'bg-cyan' : 'bg-border'
                            )}
                          >
                            <span
                              className={clsx(
                                'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                                storage.enabled === 1 ? 'start-5.5' : 'start-0.5'
                              )}
                            />
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => st.openEdit(storage)}
                              className="p-1.5 rounded text-text-muted hover:text-cyan hover:bg-cyan/10 transition-colors"
                              title={t('Edit')}
                              aria-label={t('Edit {{name}}', { name: storage.name })}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => st.setDeleteTarget(storage)}
                              className="p-1.5 rounded text-text-muted hover:text-crimson hover:bg-crimson/10 transition-colors"
                              title={t('Delete')}
                              aria-label={t('Delete {{name}}', { name: storage.name })}
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
                  {t('Page {{page}} of {{total}} ({{count}} total)', { page, total: totalPages, count: st.total })}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={st.prevPage}
                    disabled={page === 1}
                    aria-label={t('Previous page')}
                    className={clsx(
                      'p-1.5 rounded-lg border transition-colors',
                      page === 1
                        ? 'border-border-subtle text-text-muted cursor-not-allowed'
                        : 'border-border-subtle text-text-primary hover:border-cyan/50'
                    )}
                  >
                    <ChevronLeft size={14} className="rtl:-scale-x-100" />
                  </button>
                  <button
                    onClick={st.nextPage}
                    disabled={page === totalPages}
                    aria-label={t('Next page')}
                    className={clsx(
                      'p-1.5 rounded-lg border transition-colors',
                      page === totalPages
                        ? 'border-border-subtle text-text-muted cursor-not-allowed'
                        : 'border-border-subtle text-text-primary hover:border-cyan/50'
                    )}
                  >
                    <ChevronRight size={14} className="rtl:-scale-x-100" />
                  </button>
                </div>
              </div>
            )}
          </Panel>
      </main>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={st.modalOpen}
        onClose={st.closeModal}
        title={editingStorage ? t('Edit Storage') : t('Add Storage')}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">{t('Name')}</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => st.setField('name', e.target.value)}
              className={clsx(
                'w-full px-3 py-2',
                'bg-panel border border-border-subtle rounded-lg',
                'text-text-primary text-sm',
                'focus:outline-none focus:border-cyan/50',
                'transition-colors'
              )}
              placeholder={t('Storage name')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">{t('Path')}</label>
            <input
              type="text"
              value={formData.path}
              onChange={(e) => st.setField('path', e.target.value)}
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
            <label className="block text-sm font-medium text-text-secondary mb-1.5">{t('Type')}</label>
            <select
              value={formData.type}
              onChange={(e) => st.setField('type', e.target.value)}
              className={clsx(
                'w-full px-3 py-2 appearance-none',
                'bg-panel border border-border-subtle rounded-lg',
                'text-text-primary text-sm',
                'focus:outline-none focus:border-cyan/50',
                'transition-colors cursor-pointer'
              )}
            >
              {STORAGE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-text-secondary">{t('Enabled')}</label>
            <button
              onClick={st.toggleFormEnabled}
              role="switch"
              aria-checked={formData.enabled === 1}
              aria-label={t('Enabled')}
              className={clsx(
                'relative w-10 h-5 rounded-full transition-colors',
                formData.enabled === 1 ? 'bg-cyan' : 'bg-border'
              )}
            >
              <span
                className={clsx(
                  'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                  formData.enabled === 1 ? 'start-5.5' : 'start-0.5'
                )}
              />
            </button>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={st.closeModal}
              className={clsx(
                'px-4 py-2 rounded-lg text-sm font-medium',
                'bg-panel border border-border-subtle',
                'text-text-secondary hover:text-text-primary',
                'transition-colors'
              )}
            >
              {t('Cancel')}
            </button>
            <button
              onClick={st.submitForm}
              disabled={st.submitDisabled}
              className={clsx(
                'px-4 py-2 rounded-lg text-sm font-medium',
                'bg-cyan text-void',
                'hover:bg-cyan/80 transition-colors',
                'flex items-center gap-2',
                st.submitDisabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              {st.isSaving && <Loader2 size={14} className="animate-spin" />}
              {editingStorage ? t('Save Changes') : t('Create Storage')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => st.setDeleteTarget(null)}
        onConfirm={st.confirmDelete}
        title={t('Delete Storage')}
        message={t('Are you sure you want to delete storage "{{name}}"? This cannot be undone.', { name: deleteTarget?.name })}
        confirmText={t('Delete')}
        variant="danger"
        isLoading={st.isDeleting}
      />
    </AppShell>
  );
}
