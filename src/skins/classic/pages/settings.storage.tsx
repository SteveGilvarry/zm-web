import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';

import { AppShell } from '@/skins/AppShell';
import { Modal } from '@/components/common/Modal';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { QueryState } from '@/components/common/QueryState';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { usePerms } from '@/features/auth/usePerms';
import { STORAGE_SCHEMES, STORAGE_TYPES, useStoragePage } from '@/features/storage/useStoragePage';
import { useOptionsTabs } from '@/features/settings/useOptionsTabs';
import { useSiteTitle } from '@/features/settings/useSiteTitle';
import { OptionsRail } from '../components/settings/OptionsRail';
import {
  ClassicButton, ClassicSearch, ClassicTable, ClassicToolbar, classicLink, classicTd, classicTh,
} from '../components/settings/primitives';

const input = 'w-full px-2 py-1 text-sm bg-panel border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50';

/** Options → Storage — classic skin: the legacy storage table. */
export default function ClassicSettingsStoragePage() {
  const { t } = useTranslation();
  const st = useStoragePage();
  const tabs = useOptionsTabs();
  const { can } = usePerms();
  useSiteTitle(t('Storage'));

  if (!st.isAuthenticated) return null;
  const { formData, editingStorage, deleteTarget } = st;
  const canEdit = can('system', 'Edit');

  return (
    <AppShell title={t('Storage')}>
      <main className="flex-1 p-4 overflow-auto bg-zinc-50">
        <div className="max-w-screen-2xl mx-auto space-y-4">
          <h1 className="text-xl text-zinc-800 font-semibold">{t('Options')}</h1>
          <div className="flex items-start gap-4">
            <OptionsRail tabs={tabs} active="storage" />
            <div className="flex-1 min-w-0 space-y-3">
              <ClassicToolbar end={<ClassicSearch value={st.searchQuery} onChange={st.setSearchQuery} placeholder={t('Search')} />}>
                <RequirePerm feature="system" level="Edit">
                  <ClassicButton tone="primary" onClick={st.openCreate}>{t('Add New Storage')}</ClassicButton>
                </RequirePerm>
              </ClassicToolbar>
              {st.listError && (
                <p role="alert" className="text-xs text-red-700">{t('Update failed: {{message}}', { message: st.listError })}</p>
              )}
              <QueryState
                isLoading={st.isLoading}
                isError={st.isError}
                error={st.error}
                onRetry={st.refetch}
                empty={st.filteredItems.length === 0}
                emptyMessage={t('No matching records found')}
              >
                <ClassicTable>
                  <thead>
                    <tr>
                      <th className={classicTh}>{t('Name')}</th>
                      <th className={classicTh}>{t('Path')}</th>
                      <th className={classicTh}>{t('Type')}</th>
                      <th className={classicTh}>{t('Enabled')}</th>
                      <th className={classicTh}>{t('Events')}</th>
                      <th className={clsx(classicTh, 'text-end')}>{t('Actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {st.filteredItems.map((storage) => (
                      <tr key={storage.id}>
                        <td className={classicTd}>
                          {canEdit ? (
                            <button type="button" onClick={() => st.openEdit(storage)} className={classicLink}>
                              {storage.name}
                            </button>
                          ) : storage.name}
                        </td>
                        <td className={clsx(classicTd, 'font-mono text-xs')}>{storage.path}</td>
                        <td className={clsx(classicTd, 'text-xs')}>{storage.type}</td>
                        <td className={classicTd}>
                          {canEdit ? (
                            <input
                              type="checkbox"
                              checked={storage.enabled === 1}
                              onChange={() => st.toggleEnabled(storage)}
                              aria-label={storage.enabled === 1 ? t('Disable {{name}}', { name: storage.name }) : t('Enable {{name}}', { name: storage.name })}
                            />
                          ) : (storage.enabled === 1 ? t('Yes') : t('No'))}
                        </td>
                        <td className={clsx(classicTd, 'text-xs')}>
                          <Link
                            to="/events"
                            className={classicLink}
                            title={t('Filtering the events list by storage area is not supported by this zm_api build yet (zm-api#24); this opens the full list.')}
                          >
                            {t('Events')}
                          </Link>
                        </td>
                        <td className={clsx(classicTd, 'text-end whitespace-nowrap')}>
                          <RequirePerm feature="system" level="Edit">
                            <ClassicButton onClick={() => st.openEdit(storage)} aria-label={t('Edit {{name}}', { name: storage.name })}>{t('Edit')}</ClassicButton>{' '}
                            <ClassicButton
                              onClick={() => st.setDeleteTarget(storage)}
                              disabled={st.isProtected(storage)}
                              title={st.isProtected(storage) ? t('The Default storage area cannot be deleted') : undefined}
                              aria-label={t('Delete {{name}}', { name: storage.name })}
                            >
                              {t('Delete')}
                            </ClassicButton>
                          </RequirePerm>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </ClassicTable>
              </QueryState>
              {st.totalPages > 1 && (
                <div className="flex items-center justify-between text-xs text-zinc-600">
                  <span>{t('Page {{page}} of {{total}} ({{count}} total)', { page: st.page, total: st.totalPages, count: st.total })}</span>
                  <span className="flex items-center gap-2">
                    <ClassicButton onClick={st.prevPage} disabled={st.page === 1}>{t('Prev')}</ClassicButton>
                    <ClassicButton onClick={st.nextPage} disabled={st.page === st.totalPages}>{t('Next')}</ClassicButton>
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <Modal isOpen={st.modalOpen} onClose={st.closeModal} title={editingStorage ? t('Edit Storage') : t('Add Storage')}>
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 items-center text-sm">
          <label htmlFor="cst-name" className="text-text-secondary">{t('Name')}</label>
          <input id="cst-name" value={formData.name} onChange={(e) => st.setField('name', e.target.value)} className={input} placeholder={t('Storage name')} />
          <label htmlFor="cst-path" className="text-text-secondary">{t('Path')}</label>
          <input id="cst-path" value={formData.path} onChange={(e) => st.setField('path', e.target.value)} className={clsx(input, 'font-mono')} placeholder="/var/cache/zoneminder" />
          <label htmlFor="cst-type" className="text-text-secondary">{t('Type')}</label>
          <select id="cst-type" value={formData.type} onChange={(e) => st.setField('type', e.target.value)} className={input}>
            {STORAGE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <label htmlFor="cst-scheme" className="text-text-secondary">{t('Scheme')}</label>
          <select id="cst-scheme" value={formData.scheme} onChange={(e) => st.setField('scheme', e.target.value)} className={input}>
            {editingStorage && <option value="">{t('(keep current)')}</option>}
            {STORAGE_SCHEMES.map((scheme) => <option key={scheme} value={scheme}>{scheme}</option>)}
          </select>
          <label htmlFor="cst-server" className="text-text-secondary">{t('Server')}</label>
          <select
            id="cst-server"
            value={formData.server_id ?? ''}
            onChange={(e) => st.setField('server_id', e.target.value === '' ? null : Number(e.target.value))}
            className={input}
          >
            <option value="">{t('Any / local')}</option>
            {st.servers.map((srv) => <option key={srv.id} value={srv.id}>{srv.name}</option>)}
          </select>
          <label htmlFor="cst-url" className="text-text-secondary">{t('URL')}</label>
          <input id="cst-url" value={formData.url} onChange={(e) => st.setField('url', e.target.value)} className={clsx(input, 'font-mono')} placeholder={t('s3://bucket/prefix (optional)')} />
          <label htmlFor="cst-enabled" className="text-text-secondary">{t('Enabled')}</label>
          <input id="cst-enabled" type="checkbox" checked={formData.enabled === 1} onChange={st.toggleFormEnabled} className="justify-self-start" />
        </div>
        <p className="mt-3 text-[11px] text-text-muted leading-relaxed">
          {editingStorage
            ? t('Scheme, Server and URL are saved, but this zm_api build does not return them, so the current values cannot be shown here. Leave Scheme on "keep current" unless you mean to change it.')
            : t('Scheme, Server and URL are saved, but this zm_api build does not return them, so the list will not display them.')}
        </p>
        {st.saveError && <p role="alert" className="mt-2 text-xs text-crimson">{t('Save failed: {{message}}', { message: st.saveError })}</p>}
        <div className="flex items-center justify-end gap-2 pt-4">
          <button type="button" onClick={st.closeModal} className="px-3 py-1.5 text-xs rounded border border-border-subtle text-text-muted hover:bg-surface">{t('Cancel')}</button>
          <button type="button" onClick={st.submitForm} disabled={st.submitDisabled} className="px-3 py-1.5 text-xs rounded border border-cyan/50 bg-cyan/15 text-cyan hover:bg-cyan/25 disabled:opacity-50">
            {editingStorage ? t('Save Changes') : t('Create Storage')}
          </button>
        </div>
      </Modal>

      {deleteTarget && st.deleteBlocked ? (
        <Modal isOpen onClose={st.clearDeleteTarget} title={t('Delete Storage')}>
          <p className="text-sm text-text-secondary">
            {t('"{{name}}" still holds {{count}} event. Move or delete those events before removing the storage area.', {
              name: deleteTarget.name, count: st.deleteUsage.count ?? 0,
            })}
          </p>
          <div className="flex justify-end pt-6">
            <button type="button" onClick={st.clearDeleteTarget} className="px-3 py-1.5 text-xs rounded border border-border-subtle text-text-muted hover:bg-surface">{t('OK')}</button>
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
