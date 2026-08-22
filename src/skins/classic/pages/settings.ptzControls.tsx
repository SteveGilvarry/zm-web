import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { useRouter } from '@tanstack/react-router';

import { AppShell } from '@/skins/AppShell';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Modal } from '@/components/common/Modal';
import { QueryState } from '@/components/common/QueryState';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { usePerms } from '@/features/auth/usePerms';
import type { Control } from '@/api/controls';
import { ControlEditorFields } from '@/features/controls/ControlEditorFields';
import { controlTabLabel, presetsCell } from '@/features/controls/controlFields';
import { useControlEditor } from '@/features/controls/useControlEditor';
import { usePtzControlsPage } from '@/features/controls/usePtzControlsPage';
import { useOptionsTabs } from '@/features/settings/useOptionsTabs';
import { useSiteTitle } from '@/features/settings/useSiteTitle';
import { OptionsRail } from '../components/settings/OptionsRail';
import {
  ClassicButton, ClassicSearch, ClassicSortTh, ClassicTable, ClassicToolbar, YesNo,
  classicInput, classicLink, classicTd, classicTh,
} from '../components/settings/primitives';

/**
 * Options → Control — classic skin. Legacy `?view=options&tab=control`
 * bootstrap-table (mark column, Id, Name, Type, Protocol, capability
 * Yes/No columns, presets) and, with `?id=`, the `?view=controlcap` pill
 * form in its place.
 */
export default function ClassicSettingsPtzControlsPage() {
  const { t } = useTranslation();
  const p = usePtzControlsPage();
  const tabs = useOptionsTabs();
  const router = useRouter();
  const { can } = usePerms();
  useSiteTitle(t('Control'));
  const canEdit = can('control', 'Edit');

  return (
    <AppShell title={t('Control')}>
      <main className="flex-1 p-4 overflow-auto bg-zinc-50">
        <div className="max-w-screen-2xl mx-auto space-y-4">
          <h1 className="text-xl text-zinc-800 font-semibold">{t('Options')}</h1>
          <div className="flex items-start gap-4">
            <OptionsRail tabs={tabs} active="control" />
            <div className="flex-1 min-w-0 space-y-3">
              {p.editorOpen ? (
                <ClassicControlEditor p={p} />
              ) : (
                <>
                  <ClassicToolbar
                    end={<ClassicSearch value={p.query} onChange={p.setQuery} placeholder={t('Search')} />}
                  >
                    <ClassicButton onClick={() => router.history.back()} aria-label={t('Back')} title={t('Back')}>←</ClassicButton>
                    <ClassicButton onClick={p.refetch} aria-label={t('Refresh')} title={t('Refresh')}>⟳</ClassicButton>
                    <RequirePerm feature="control" level="Edit">
                      <ClassicButton tone="primary" onClick={p.openCreate}>{t('Add')}</ClassicButton>
                      <ClassicButton
                        disabled={p.selectedRows.length !== 1}
                        onClick={() => p.selectedRows[0] && p.openEdit(p.selectedRows[0].control)}
                      >
                        {t('Edit')}
                      </ClassicButton>
                      <ClassicButton
                        tone="danger"
                        disabled={p.selectedRows.length === 0}
                        onClick={() => p.requestDelete(p.selectedRows.map((r) => r.control))}
                      >
                        {t('Delete')}
                      </ClassicButton>
                    </RequirePerm>
                  </ClassicToolbar>

                  <QueryState
                    isLoading={p.isLoading}
                    isError={p.isError}
                    error={p.error}
                    onRetry={p.refetch}
                    empty={p.rows.length === 0}
                    emptyMessage={t('No matching records found')}
                  >
                    <ClassicTable>
                      <thead>
                        <tr>
                          {canEdit && (
                            <th className={clsx(classicTh, 'w-8')}>
                              <input
                                type="checkbox"
                                aria-label={t('Select all')}
                                checked={p.rows.length > 0 && p.selectedIds.size === p.rows.length}
                                onChange={p.toggleAll}
                              />
                            </th>
                          )}
                          <ClassicSortTh active={p.sortKey === 'id'} dir={p.sortDir} onClick={() => p.toggleSort('id')}>{t('Id')}</ClassicSortTh>
                          <ClassicSortTh active={p.sortKey === 'name'} dir={p.sortDir} onClick={() => p.toggleSort('name')}>{t('Name')}</ClassicSortTh>
                          <ClassicSortTh active={p.sortKey === 'type'} dir={p.sortDir} onClick={() => p.toggleSort('type')}>{t('Type')}</ClassicSortTh>
                          <ClassicSortTh active={p.sortKey === 'protocol'} dir={p.sortDir} onClick={() => p.toggleSort('protocol')}>{t('Protocol')}</ClassicSortTh>
                          <th className={clsx(classicTh, 'text-center')}>{t('Can Move')}</th>
                          <th className={clsx(classicTh, 'text-center')}>{t('Can Zoom')}</th>
                          <th className={clsx(classicTh, 'text-center')}>{t('Can Focus')}</th>
                          <th className={clsx(classicTh, 'text-center')}>{t('Can Iris')}</th>
                          <th className={clsx(classicTh, 'text-center')}>{t('Can White Bal.')}</th>
                          <th className={clsx(classicTh, 'text-center')}>{t('Has Presets')}</th>
                          <th className={clsx(classicTh, 'text-end')}>{t('Monitors')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.rows.map(({ control: c, monitors }) => (
                          <tr key={c.id}>
                            {canEdit && (
                              <td className={classicTd}>
                                <input
                                  type="checkbox"
                                  aria-label={t('Mark {{name}}', { name: c.name })}
                                  checked={p.selectedIds.has(c.id)}
                                  onChange={() => p.toggleSelected(c.id)}
                                />
                              </td>
                            )}
                            <td className={clsx(classicTd, 'font-mono text-xs text-zinc-500')}>{c.id}</td>
                            <td className={classicTd}>
                              {canEdit ? (
                                <button type="button" onClick={() => p.openEdit(c)} className={classicLink}>{c.name}</button>
                              ) : c.name}
                            </td>
                            <td className={classicTd}>{c.type}</td>
                            <td className={clsx(classicTd, 'font-mono text-xs')}>{c.protocol ?? ''}</td>
                            <td className={clsx(classicTd, 'text-center')}><YesNo value={c.can_move} /></td>
                            <td className={clsx(classicTd, 'text-center')}><YesNo value={c.can_zoom} /></td>
                            <td className={clsx(classicTd, 'text-center')}><YesNo value={c.can_focus} /></td>
                            <td className={clsx(classicTd, 'text-center')}><YesNo value={c.can_iris} /></td>
                            <td className={clsx(classicTd, 'text-center')}><YesNo value={c.can_white} /></td>
                            <td className={clsx(classicTd, 'text-center font-mono text-xs')}>{presetsCell(c)}</td>
                            <td
                              className={clsx(classicTd, 'text-end font-mono text-xs tabular-nums')}
                              title={monitors.map((m) => m.name).join(', ') || undefined}
                            >
                              {p.monitorsLoading ? '…' : monitors.length}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </ClassicTable>
                  </QueryState>
                  <p className="text-xs text-zinc-600">
                    {t('Showing {{count}} of {{total}} rows', { count: p.rows.length, total: p.total })}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </main>

      {p.pendingDelete.length > 0 && p.deleteBlocked ? (
        <Modal isOpen onClose={p.cancelDelete} title={t('Cannot delete')}>
          <div className="text-sm text-text-secondary space-y-2">
            <p>{t('These monitors still use the profile. Point them at another control first.')}</p>
            <ul className="list-disc ps-5 text-xs">
              {p.deleteBlockers.map(({ control, monitor }) => (
                <li key={`${control.id}-${monitor.id}`}>
                  <span className="font-mono">#{monitor.id}</span> {monitor.name}
                  {p.pendingDelete.length > 1 && <span className="text-text-muted"> — {control.name}</span>}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex justify-end pt-6">
            <ClassicButton onClick={p.cancelDelete}>{t('OK')}</ClassicButton>
          </div>
        </Modal>
      ) : (
        <ConfirmDialog
          isOpen={p.pendingDelete.length > 0}
          onClose={p.cancelDelete}
          onConfirm={p.confirmDelete}
          title={t('Confirm delete')}
          message={
            p.pendingDelete.length === 1
              ? t('Delete "{{name}}"? No monitor references it.', { name: p.pendingDelete[0]?.name })
              : t('Delete {{count}} control profile? No monitor references them.', { count: p.pendingDelete.length })
          }
          confirmText={t('Delete')}
          variant="danger"
          isLoading={p.isDeleting}
        />
      )}
    </AppShell>
  );
}

const EDITOR_CLASSES = {
  row: 'contents',
  label: 'text-end pe-3 py-1 text-sm text-zinc-800 font-semibold',
  input: clsx(classicInput, 'w-64'),
  select: clsx(classicInput, 'w-40'),
  checkbox: 'w-4 h-4 justify-self-start self-center',
};

/** The legacy `controlcap` page: vertical pill list, one field table per tab, Save / Cancel. */
function ClassicControlEditor({ p }: { p: ReturnType<typeof usePtzControlsPage> }) {
  const { t } = useTranslation();
  if (p.editorLoading) {
    return <p className="text-sm text-zinc-500">{t('Loading…')}</p>;
  }
  if (p.editorMissing) {
    return (
      <div className="space-y-2">
        <p role="alert" className="text-sm text-red-700">{t('No control profile with id {{id}}.', { id: p.editorTarget })}</p>
        <ClassicButton onClick={p.closeEditor}>{t('Back')}</ClassicButton>
      </div>
    );
  }
  return (
    <RequirePerm feature="control" level="Edit" fallback="message">
      <ClassicControlForm key={p.editing?.id ?? 'new'} editing={p.editing} onSaved={p.onSaved} onCancel={p.closeEditor} />
    </RequirePerm>
  );
}

function ClassicControlForm({
  editing, onSaved, onCancel,
}: { editing: Control | null; onSaved: (c: Control) => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const e = useControlEditor(editing, onSaved);
  const activeTab = e.tabs.find((tab) => tab.key === e.tab) ?? e.tabs[0];

  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault();
        e.submit();
      }}
      className="bg-white rounded-sm border border-zinc-300"
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-300">
        <ClassicButton onClick={onCancel} aria-label={t('Back')} title={t('Back')}>←</ClassicButton>
        <h2 className="flex-1 text-center text-base font-semibold text-zinc-800">
          {editing ? t('Control Capability - {{name}}', { name: editing.name }) : t('New Control Capability')}
        </h2>
      </div>
      <div className="flex items-stretch">
        <ul role="tablist" aria-orientation="vertical" aria-label={t('Control profile sections')} className="w-36 shrink-0 border-e border-zinc-200 py-1">
          {e.tabs.map((tab) => (
            <li key={tab.key}>
              <button
                type="button"
                role="tab"
                aria-selected={tab.key === e.tab}
                onClick={() => e.setTab(tab.key)}
                className={clsx(
                  'block w-full text-center px-3 py-1.5 text-sm rounded-sm mx-1 my-0.5 w-[calc(100%-0.5rem)]',
                  tab.key === e.tab ? 'bg-[#337ab7] text-white' : 'text-[#337ab7] hover:bg-zinc-100',
                )}
              >
                {controlTabLabel(t, tab.key)}
              </button>
            </li>
          ))}
        </ul>
        <div role="tabpanel" className="flex-1 p-4">
          <div className="grid grid-cols-[12rem_1fr] gap-y-1 items-center max-w-2xl">
            <ControlEditorFields
              fields={activeTab.fields}
              values={e.values}
              onChange={e.setField}
              onToggle={e.toggleFlag}
              classes={EDITOR_CLASSES}
              idPrefix="cctl"
            />
          </div>
          {e.validationError && e.dirty && (
            <p role="alert" className="mt-3 text-xs text-red-700">{e.validationError}</p>
          )}
          <div className="flex items-center justify-end gap-2 mt-6">
            <ClassicButton tone="primary" type="submit" disabled={e.submitDisabled}>
              {e.isSaving ? t('Saving…') : t('Save')}
            </ClassicButton>
            <ClassicButton tone="primary" onClick={onCancel}>{t('Cancel')}</ClassicButton>
          </div>
        </div>
      </div>
    </form>
  );
}
