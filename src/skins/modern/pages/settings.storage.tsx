import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import {
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
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { Select } from '@/components/common/Select';
import { TextField } from '@/components/common/TextField';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { QueryState } from '@/components/common/QueryState';
import { fieldClasses } from '@/components/common/styles';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { usePerms } from '@/features/auth/usePerms';
import { STORAGE_SCHEMES, STORAGE_TYPES, useStoragePage } from '@/features/storage/useStoragePage';
import { formatBytes } from '@/lib/format';
import { useSiteTitle } from '@/features/settings/useSiteTitle';

const th = 'px-4 py-2 text-start text-xs font-medium text-fg-dim whitespace-nowrap';
const iconBtn = 'p-1.5 rounded text-fg-dim hover:text-fg hover:bg-surface-2 transition-colors';
const pagerBtn = 'p-1.5 rounded border border-border-subtle transition-colors';

/**
 * Settings → Storage — the modern skin.
 *
 * A text heading over one bordered table: the only borders on the page are
 * the ones separating rows of data (docs/DESIGN.md).
 */
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
        <div className="mx-auto w-full max-w-[1280px] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-fg">{t('Storage Locations')}</h2>
            <div className="flex items-center gap-3">
              <div className="relative w-56">
                <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-faint" aria-hidden />
                <input
                  type="text"
                  placeholder={t('Search storage...')}
                  value={st.searchQuery}
                  onChange={(e) => st.setSearchQuery(e.target.value)}
                  className={clsx(fieldClasses('sm'), 'ps-8')}
                />
              </div>
              <RequirePerm feature="system" level="Edit">
                <Button variant="primary" size="sm" onClick={st.openCreate}>
                  <Plus size={14} aria-hidden />
                  {t('Add Storage')}
                </Button>
              </RequirePerm>
            </div>
          </div>

          {st.listError && (
            <p role="alert" className="text-xs text-danger">
              {t('Update failed: {{message}}', { message: st.listError })}
            </p>
          )}

          <div className="rounded border border-border-subtle overflow-hidden">
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
                    <tr className="border-b border-border-subtle">
                      <th className={th}>{t('Id')}</th>
                      <th className={th}>{t('Name')}</th>
                      <th className={th}>{t('Path')}</th>
                      <th className={th}>{t('Type')}</th>
                      <th className={th}>{t('Scheme')}</th>
                      <th className={th}>{t('Server')}</th>
                      <th className={th}>{t('Disk space')}</th>
                      <th className={th}>{t('Enabled')}</th>
                      <th className={th}>{t('Events')}</th>
                      <th className={clsx(th, 'text-end')}>{t('Actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {rows.map(({ storage, serverId, serverName, diskPercent }) => (
                      <tr key={storage.id} className="hover:bg-surface-2 transition-colors">
                        <td className="px-4 py-2 font-mono tabular-nums text-xs text-fg-dim">{storage.id}</td>
                        <td className="px-4 py-2 font-medium text-fg">{storage.name}</td>
                        <td className="px-4 py-2 font-mono text-xs text-fg-muted">{storage.path}</td>
                        <td className="px-4 py-2 text-xs text-fg-muted">{storage.type}</td>
                        <td className="px-4 py-2 text-xs text-fg-muted">{storage.scheme || '—'}</td>
                        <td className="px-4 py-2 text-xs text-fg-muted">
                          {serverName ?? (serverId === null ? t('Local') : t('Server {{id}}', { id: serverId }))}
                        </td>
                        <td className="px-4 py-2">
                          {storage.disk_space == null ? (
                            <span className="text-fg-dim" title={t('zmaudit has not cached a size for this storage area yet.')}>
                              &mdash;
                            </span>
                          ) : (
                            <div className="min-w-28 max-w-40">
                              <span className="font-mono tabular-nums text-xs text-fg-muted">
                                {formatBytes(storage.disk_space)}
                              </span>
                              <div
                                role="progressbar"
                                aria-valuenow={diskPercent ?? 0}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-label={t('{{size}} of events on this storage area, as last cached by zmaudit. The bar compares it with the largest storage area listed, not with the size of the disk.', { size: formatBytes(storage.disk_space) })}
                                title={t('{{size}} of events on this storage area, as last cached by zmaudit. The bar compares it with the largest storage area listed, not with the size of the disk.', { size: formatBytes(storage.disk_space) })}
                                className="mt-1 h-1.5 rounded-full bg-border overflow-hidden"
                              >
                                <div className="h-full rounded-full bg-fg-dim" style={{ width: `${diskPercent ?? 0}%` }} />
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <button
                            onClick={() => st.toggleEnabled(storage)}
                            role="switch"
                            aria-checked={storage.enabled === 1}
                            aria-label={storage.enabled === 1 ? t('Disable {{name}}', { name: storage.name }) : t('Enable {{name}}', { name: storage.name })}
                            disabled={!canEdit}
                            className={clsx(
                              'relative w-10 h-5 rounded-full transition-colors',
                              storage.enabled === 1 ? 'bg-accent' : 'bg-border',
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
                        <td className="px-4 py-2">
                          <Link
                            to="/events"
                            className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                            title={t('The events list cannot be pre-filtered by storage area yet; this opens the full list.')}
                          >
                            <Film size={12} aria-hidden />
                            {t('Events')}
                          </Link>
                        </td>
                        <td className="px-4 py-2">
                          <RequirePerm feature="system" level="Edit">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => st.openEdit(storage)}
                                className={iconBtn}
                                title={t('Edit')}
                                aria-label={t('Edit {{name}}', { name: storage.name })}
                              >
                                <Pencil size={14} />
                              </button>
                              {st.isProtected(storage) ? (
                                <button
                                  disabled
                                  className="p-1.5 rounded text-fg-faint cursor-not-allowed"
                                  title={t('The Default storage area cannot be deleted')}
                                  aria-label={t('Delete {{name}}', { name: storage.name })}
                                >
                                  <Trash2 size={14} />
                                </button>
                              ) : (
                                <button
                                  onClick={() => st.setDeleteTarget(storage)}
                                  className="p-1.5 rounded text-fg-dim hover:text-danger hover:bg-danger/10 transition-colors"
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

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-2 border-t border-border-subtle">
                <span className="text-xs text-fg-dim tabular-nums">
                  {t('Page {{page}} of {{total}} ({{count}} total)', { page, total: totalPages, count: st.total })}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={st.prevPage}
                    disabled={page === 1}
                    aria-label={t('Previous page')}
                    className={clsx(pagerBtn, page === 1 ? 'text-fg-faint cursor-not-allowed' : 'text-fg hover:border-border')}
                  >
                    <ChevronLeft size={14} className="rtl:-scale-x-100" />
                  </button>
                  <button
                    onClick={st.nextPage}
                    disabled={page === totalPages}
                    aria-label={t('Next page')}
                    className={clsx(pagerBtn, page === totalPages ? 'text-fg-faint cursor-not-allowed' : 'text-fg hover:border-border')}
                  >
                    <ChevronRight size={14} className="rtl:-scale-x-100" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={st.modalOpen}
        onClose={st.closeModal}
        title={editingStorage ? t('Edit Storage') : t('Add Storage')}
      >
        <div className="space-y-4">
          <TextField
            label={t('Name')}
            type="text"
            value={formData.name}
            onChange={(e) => st.setField('name', e.target.value)}
            placeholder={t('Storage name')}
          />

          <TextField
            label={t('Path')}
            type="text"
            value={formData.path}
            onChange={(e) => st.setField('path', e.target.value)}
            placeholder="/var/cache/zoneminder"
          />

          <Select
            label={t('Type')}
            value={formData.type}
            onChange={(e) => st.setField('type', e.target.value)}
          >
            {STORAGE_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </Select>

          <div className="grid grid-cols-2 gap-4">
            <Select
              id="storage-scheme"
              label={t('Scheme')}
              value={formData.scheme}
              onChange={(e) => st.setField('scheme', e.target.value)}
            >
              {STORAGE_SCHEMES.map((scheme) => (
                <option key={scheme} value={scheme}>{scheme}</option>
              ))}
            </Select>
            <Select
              id="storage-server"
              label={t('Server')}
              value={formData.server_id ?? ''}
              onChange={(e) => st.setField('server_id', e.target.value === '' ? null : Number(e.target.value))}
            >
              <option value="">{t('Any / local')}</option>
              {st.servers.map((srv) => (
                <option key={srv.id} value={srv.id}>{srv.name}</option>
              ))}
            </Select>
          </div>

          <TextField
            id="storage-url"
            label={t('URL')}
            type="text"
            value={formData.url}
            onChange={(e) => st.setField('url', e.target.value)}
            placeholder={t('s3://bucket/prefix (optional)')}
          />

          <div className="flex items-center justify-between">
            <span className="text-sm text-fg-muted">{t('Enabled')}</span>
            <button
              onClick={st.toggleFormEnabled}
              role="switch"
              aria-checked={formData.enabled === 1}
              aria-label={t('Enabled')}
              className={clsx(
                'relative w-10 h-5 rounded-full transition-colors',
                formData.enabled === 1 ? 'bg-accent' : 'bg-border'
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
              <span className="text-sm text-fg-muted">{t('Auto-delete')}</span>
              <span className="text-end">
                <span className="text-sm text-fg">
                  {editingStorage.do_delete === 1 ? t('Yes') : t('No')}
                </span>
                <span className="flex items-start gap-1.5 text-xs text-fg-dim leading-relaxed">
                  <Info size={12} className="mt-0.5 shrink-0" aria-hidden />
                  {t('Set by ZoneMinder; the API cannot change it yet.')}
                </span>
              </span>
            </div>
          )}

          {st.saveError && (
            <p role="alert" className="text-xs text-danger">
              {t('Save failed: {{message}}', { message: st.saveError })}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button onClick={st.closeModal}>{t('Cancel')}</Button>
            <Button variant="primary" onClick={st.submitForm} disabled={st.submitDisabled}>
              {st.isSaving && <Loader2 size={14} className="animate-spin" />}
              {editingStorage ? t('Save Changes') : t('Create Storage')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete — blocked while events still live there */}
      {deleteTarget && st.deleteBlocked ? (
        <Modal isOpen onClose={st.clearDeleteTarget} title={t('Delete Storage')}>
          <div className="flex items-start gap-3">
            <ShieldAlert size={18} className="mt-0.5 shrink-0 text-warn" aria-hidden />
            <p className="text-sm text-fg-muted">
              {t('"{{name}}" still holds {{count}} event. Move or delete those events before removing the storage area.', {
                name: deleteTarget.name, count: st.deleteUsage.count ?? 0,
              })}
            </p>
          </div>
          <div className="flex justify-end pt-6">
            <Button onClick={st.clearDeleteTarget}>{t('OK')}</Button>
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
