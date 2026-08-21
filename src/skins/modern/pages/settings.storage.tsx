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
  Info,
  ShieldAlert,
  Film,
} from 'lucide-react';

import { Link } from '@tanstack/react-router';
import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { Modal } from '@/components/common/Modal';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { QueryState } from '@/components/common/QueryState';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { usePerms } from '@/features/auth/usePerms';
import { STORAGE_SCHEMES, STORAGE_TYPES, useStoragePage } from '@/features/storage/useStoragePage';
import { formatBytes } from '@/lib/format';
import { useSiteTitle } from '@/features/settings/useSiteTitle';

/** Settings → Storage — Mission Control. */
export default function SettingsStoragePage() {
  const { t } = useTranslation();
  const st = useStoragePage();
  const { can } = usePerms();
  useSiteTitle(t('Storage'));
  const { rows, page, totalPages, formData, editingStorage, deleteTarget } = st;
  const canEdit = can('system', 'Edit');

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
              <RequirePerm feature="system" level="Edit">
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
              </RequirePerm>
            </div>

            {st.listError && (
              <p role="alert" className="px-4 py-2 text-xs text-crimson border-b border-border-subtle">
                {t('Update failed: {{message}}', { message: st.listError })}
              </p>
            )}

            {/* Table */}
            <QueryState
              isLoading={st.isLoading}
              isError={st.isError}
              error={st.error}
              onRetry={st.refetch}
              empty={rows.length === 0}
              emptyMessage={t('No storage locations found')}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle text-start">
                      <th className="px-4 py-3 font-medium text-text-muted">{t('Id')}</th>
                      <th className="px-4 py-3 font-medium text-text-muted">{t('Name')}</th>
                      <th className="px-4 py-3 font-medium text-text-muted">{t('Path')}</th>
                      <th className="px-4 py-3 font-medium text-text-muted">{t('Type')}</th>
                      <th className="px-4 py-3 font-medium text-text-muted">{t('Scheme')}</th>
                      <th className="px-4 py-3 font-medium text-text-muted">{t('Server')}</th>
                      <th className="px-4 py-3 font-medium text-text-muted">{t('Disk space')}</th>
                      <th className="px-4 py-3 font-medium text-text-muted">{t('Enabled')}</th>
                      <th className="px-4 py-3 font-medium text-text-muted">{t('Events')}</th>
                      <th className="px-4 py-3 font-medium text-text-muted text-end">{t('Actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {rows.map(({ storage, serverId, serverName, diskPercent }) => (
                      <tr key={storage.id} className="hover:bg-panel/50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-text-muted">{storage.id}</td>
                        <td className="px-4 py-3 font-medium text-text-primary">{storage.name}</td>
                        <td className="px-4 py-3 font-mono text-xs text-text-secondary">{storage.path}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-0.5 rounded bg-panel text-text-muted">
                            {storage.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-text-secondary">{storage.scheme || '\u2014'}</td>
                        <td className="px-4 py-3 text-xs text-text-secondary">
                          {serverName ?? (serverId === null ? t('Local') : t('Server {{id}}', { id: serverId }))}
                        </td>
                        <td className="px-4 py-3">
                          {storage.disk_space == null ? (
                            <span className="text-text-muted" title={t('zmaudit has not cached a size for this storage area yet.')}>
                              &mdash;
                            </span>
                          ) : (
                            <div className="min-w-28 max-w-40">
                              <span className="font-mono text-xs text-text-secondary">
                                {formatBytes(storage.disk_space)}
                              </span>
                              <div
                                role="progressbar"
                                aria-valuenow={diskPercent ?? 0}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-label={t('{{size}} of events on this storage area, as last cached by zmaudit. The bar compares it with the largest storage area listed, not with the size of the disk.', { size: formatBytes(storage.disk_space) })}
                                title={t('{{size}} of events on this storage area, as last cached by zmaudit. The bar compares it with the largest storage area listed, not with the size of the disk.', { size: formatBytes(storage.disk_space) })}
                                className="mt-1 h-1.5 rounded-full bg-panel overflow-hidden"
                              >
                                <div className="h-full rounded-full bg-cyan" style={{ width: `${diskPercent ?? 0}%` }} />
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => st.toggleEnabled(storage)}
                            role="switch"
                            aria-checked={storage.enabled === 1}
                            aria-label={storage.enabled === 1 ? t('Disable {{name}}', { name: storage.name }) : t('Enable {{name}}', { name: storage.name })}
                            disabled={!canEdit}
                            className={clsx(
                              'relative w-10 h-5 rounded-full transition-colors',
                              storage.enabled === 1 ? 'bg-cyan' : 'bg-border',
                              !canEdit && 'opacity-60 cursor-not-allowed',
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
                          <Link
                            to="/events"
                            className="inline-flex items-center gap-1 text-xs text-cyan hover:underline"
                            title={t('The events list cannot be pre-filtered by storage area yet; this opens the full list.')}
                          >
                            <Film size={12} />
                            {t('Events')}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <RequirePerm feature="system" level="Edit">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => st.openEdit(storage)}
                              className="p-1.5 rounded text-text-muted hover:text-cyan hover:bg-cyan/10 transition-colors"
                              title={t('Edit')}
                              aria-label={t('Edit {{name}}', { name: storage.name })}
                            >
                              <Pencil size={14} />
                            </button>
                            {st.isProtected(storage) ? (
                              <button
                                disabled
                                className="p-1.5 rounded text-text-dim cursor-not-allowed"
                                title={t('The Default storage area cannot be deleted')}
                                aria-label={t('Delete {{name}}', { name: storage.name })}
                              >
                                <Trash2 size={14} />
                              </button>
                            ) : (
                              <button
                                onClick={() => st.setDeleteTarget(storage)}
                                className="p-1.5 rounded text-text-muted hover:text-crimson hover:bg-crimson/10 transition-colors"
                                title={t('Delete')}
                                aria-label={t('Delete {{name}}', { name: storage.name })}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                          </RequirePerm>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </QueryState>

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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="storage-scheme" className="block text-sm font-medium text-text-secondary mb-1.5">{t('Scheme')}</label>
              <select
                id="storage-scheme"
                value={formData.scheme}
                onChange={(e) => st.setField('scheme', e.target.value)}
                className={clsx(
                  'w-full px-3 py-2 appearance-none',
                  'bg-panel border border-border-subtle rounded-lg',
                  'text-text-primary text-sm',
                  'focus:outline-none focus:border-cyan/50',
                  'transition-colors cursor-pointer'
                )}
              >
                {STORAGE_SCHEMES.map((scheme) => (
                  <option key={scheme} value={scheme}>{scheme}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="storage-server" className="block text-sm font-medium text-text-secondary mb-1.5">{t('Server')}</label>
              <select
                id="storage-server"
                value={formData.server_id ?? ''}
                onChange={(e) => st.setField('server_id', e.target.value === '' ? null : Number(e.target.value))}
                className={clsx(
                  'w-full px-3 py-2 appearance-none',
                  'bg-panel border border-border-subtle rounded-lg',
                  'text-text-primary text-sm',
                  'focus:outline-none focus:border-cyan/50',
                  'transition-colors cursor-pointer'
                )}
              >
                <option value="">{t('Any / local')}</option>
                {st.servers.map((srv) => (
                  <option key={srv.id} value={srv.id}>{srv.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="storage-url" className="block text-sm font-medium text-text-secondary mb-1.5">{t('URL')}</label>
            <input
              id="storage-url"
              type="text"
              value={formData.url}
              onChange={(e) => st.setField('url', e.target.value)}
              className={clsx(
                'w-full px-3 py-2',
                'bg-panel border border-border-subtle rounded-lg',
                'text-text-primary text-sm font-mono',
                'focus:outline-none focus:border-cyan/50',
                'transition-colors'
              )}
              placeholder={t('s3://bucket/prefix (optional)')}
            />
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

          {/* DoDelete is in StorageResponse but in neither write schema — read-only. */}
          {editingStorage && (
            <div className="flex items-start justify-between gap-4">
              <span className="text-sm font-medium text-text-secondary">{t('Auto-delete')}</span>
              <span className="text-end">
                <span className="text-sm text-text-primary">
                  {editingStorage.do_delete === 1 ? t('Yes') : t('No')}
                </span>
                <span className="flex items-start gap-1.5 text-[11px] text-text-muted leading-relaxed">
                  <Info size={12} className="mt-0.5 shrink-0 text-cyan" />
                  {t('Set by ZoneMinder; the API cannot change it yet.')}
                </span>
              </span>
            </div>
          )}

          {st.saveError && (
            <p role="alert" className="text-xs text-crimson">
              {t('Save failed: {{message}}', { message: st.saveError })}
            </p>
          )}

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

      {/* Delete — blocked while events still live there */}
      {deleteTarget && st.deleteBlocked ? (
        <Modal isOpen onClose={st.clearDeleteTarget} title={t('Delete Storage')}>
          <div className="flex items-start gap-3">
            <ShieldAlert size={18} className="mt-0.5 shrink-0 text-amber" />
            <p className="text-sm text-text-secondary">
              {t('"{{name}}" still holds {{count}} event. Move or delete those events before removing the storage area.', {
                name: deleteTarget.name, count: st.deleteUsage.count ?? 0,
              })}
            </p>
          </div>
          <div className="flex justify-end pt-6">
            <button
              onClick={st.clearDeleteTarget}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-panel border border-border-subtle text-text-secondary hover:text-text-primary transition-colors"
            >
              {t('OK')}
            </button>
          </div>
        </Modal>
      ) : (
        <ConfirmDialog
          isOpen={!!deleteTarget}
          onClose={st.clearDeleteTarget}
          onConfirm={st.confirmDelete}
          title={t('Delete Storage')}
          message={
            st.deleteUsage.loading
              ? t('Counting events on "{{name}}"…', { name: deleteTarget?.name })
              : st.deleteUsage.error
                ? t('Could not count events on "{{name}}" ({{message}}). Delete anyway? This cannot be undone.', { name: deleteTarget?.name, message: st.deleteUsage.error })
                : t('No events reference "{{name}}". Delete it? This cannot be undone.', { name: deleteTarget?.name })
          }
          confirmText={t('Delete')}
          variant="danger"
          isLoading={st.isDeleting || st.deleteUsage.loading}
        />
      )}
    </AppShell>
  );
}
