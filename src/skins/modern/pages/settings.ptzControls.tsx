import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import { Trans, useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2, Pencil, Plus, Search, ShieldAlert, Trash2 } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { QueryState } from '@/components/common/QueryState';
import { fieldClasses } from '@/components/common/styles';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { summarizeCapabilities, type Control } from '@/api/controls';
import { ControlEditorFields } from '@/features/controls/ControlEditorFields';
import { controlTabLabel } from '@/features/controls/controlFields';
import { useControlEditor } from '@/features/controls/useControlEditor';
import { usePtzControlsPage, type ControlSortKey } from '@/features/controls/usePtzControlsPage';
import { useSiteTitle } from '@/features/settings/useSiteTitle';

const th = 'px-2 py-2 text-start text-xs font-medium text-fg-dim whitespace-nowrap';
const iconBtn = 'p-1 rounded text-fg-dim hover:text-fg hover:bg-surface-2 transition-colors';

/** Settings → PTZ control profiles — the modern skin. */
export default function SettingsPtzControlsPage() {
  const { t } = useTranslation();
  useSiteTitle(t('PTZ Controls'));
  const p = usePtzControlsPage();

  return (
    <AppShell>
      <main className="flex-1 p-6 overflow-auto">
        <div className="mx-auto w-full max-w-5xl space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-sm font-medium text-fg">{t('PTZ control profiles')}</h2>
              <p className="max-w-prose text-xs text-fg-dim">
                <Trans>
                  Each row is a PTZ-protocol definition the system can drive. Monitors
                  reference one via <code>control_id</code> on the Control tab of the
                  monitor editor.
                </Trans>
              </p>
            </div>
            <RequirePerm feature="control" level="Edit">
              <Button variant="primary" size="sm" onClick={p.openCreate}>
                <Plus size={14} aria-hidden />
                {t('Add profile')}
              </Button>
            </RequirePerm>
          </div>

          <div className="relative max-w-xs">
            <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-faint" aria-hidden />
            <input
              type="search"
              value={p.query}
              onChange={(e) => p.setQuery(e.target.value)}
              placeholder={t('Search name, protocol or type…')}
              aria-label={t('Search control profiles')}
              className={clsx(fieldClasses('sm'), 'ps-8')}
            />
          </div>

          <div className="rounded border border-border-subtle overflow-hidden">
            <QueryState
              isLoading={p.isLoading}
              isError={p.isError}
              error={p.error}
              onRetry={p.refetch}
              empty={p.rows.length === 0}
              emptyMessage={p.query ? t('No control profiles match your search') : t('No PTZ control protocols defined.')}
            >
              <table className="w-full text-sm">
                <thead className="border-b border-border-subtle">
                  <tr>
                    <SortTh k="id" p={p} className="w-12">{t('ID')}</SortTh>
                    <SortTh k="name" p={p}>{t('Name')}</SortTh>
                    <SortTh k="type" p={p}>{t('Type')}</SortTh>
                    <SortTh k="protocol" p={p}>{t('Protocol')}</SortTh>
                    <th className={th}>{t('Capabilities')}</th>
                    <th className={clsx(th, 'text-end')}>{t('In use')}</th>
                    <th className={clsx(th, 'text-end w-24')}>{t('Actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {p.rows.map(({ control: c, monitors }) => (
                    <tr key={c.id} className="hover:bg-surface-2">
                      <td className="px-2 py-2 font-mono tabular-nums text-xs text-fg-dim">{c.id}</td>
                      <td className="px-2 py-2 text-fg">
                        <RequirePerm feature="control" level="Edit" fallback={<span>{c.name}</span>}>
                          <button type="button" onClick={() => p.openEdit(c)} className="text-start hover:text-accent hover:underline">
                            {c.name}
                          </button>
                        </RequirePerm>
                      </td>
                      <td className="px-2 py-2 text-fg-muted">{c.type}</td>
                      <td className="px-2 py-2 font-mono text-xs text-fg-muted">{c.protocol ?? '—'}</td>
                      <td className="px-2 py-2 text-xs text-fg-muted">{summarizeCapabilities(c)}</td>
                      <td
                        className="px-2 py-2 text-end tabular-nums text-xs text-fg-muted"
                        title={monitors.map((m) => m.name).join(', ') || undefined}
                      >
                        {p.monitorsLoading ? '…' : t('{{count}} monitor', { count: monitors.length })}
                      </td>
                      <td className="px-2 py-2 text-end">
                        <RequirePerm feature="control" level="Edit">
                          <button
                            type="button"
                            onClick={() => p.openEdit(c)}
                            className={iconBtn}
                            aria-label={t('Edit {{name}}', { name: c.name })}
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => p.requestDelete(c)}
                            className="p-1 rounded text-fg-dim hover:text-danger hover:bg-danger/10 transition-colors"
                            aria-label={t('Delete {{name}}', { name: c.name })}
                          >
                            <Trash2 size={12} />
                          </button>
                        </RequirePerm>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </QueryState>
          </div>
        </div>
      </main>

      {p.editorOpen && (
        <Modal
          isOpen
          onClose={p.closeEditor}
          title={p.editing ? t('Control Capability - {{name}}', { name: p.editing.name }) : t('New control profile')}
        >
          {p.editorLoading ? (
            <div className="flex items-center gap-2 text-sm text-fg-dim py-6 justify-center">
              <Loader2 size={14} className="animate-spin" /> {t('Loading…')}
            </div>
          ) : p.editorMissing ? (
            <p role="alert" className="text-sm text-danger">{t('No control profile with id {{id}}.', { id: p.editorTarget })}</p>
          ) : (
            <RequirePerm feature="control" level="Edit" fallback="message">
              <ControlEditor key={p.editing?.id ?? 'new'} editing={p.editing} onSaved={p.onSaved} onCancel={p.closeEditor} />
            </RequirePerm>
          )}
        </Modal>
      )}

      {p.pendingDelete.length > 0 && p.deleteBlocked ? (
        <Modal isOpen onClose={p.cancelDelete} title={t('Cannot delete')}>
          <div className="flex items-start gap-3">
            <ShieldAlert size={18} className="mt-0.5 shrink-0 text-warn" aria-hidden />
            <div className="text-sm text-fg-muted space-y-2">
              <p>{t('These monitors still use the profile. Point them at another control first.')}</p>
              <ul className="list-disc ps-5 text-xs">
                {p.deleteBlockers.map(({ control, monitor }) => (
                  <li key={`${control.id}-${monitor.id}`}>
                    <span className="font-mono tabular-nums">#{monitor.id}</span> {monitor.name}
                    {p.pendingDelete.length > 1 && <span className="text-fg-dim"> — {control.name}</span>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="flex justify-end pt-6">
            <Button onClick={p.cancelDelete}>{t('OK')}</Button>
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

function SortTh({
  k, p, children, className,
}: { k: ControlSortKey; p: ReturnType<typeof usePtzControlsPage>; children: ReactNode; className?: string }) {
  const active = p.sortKey === k;
  return (
    <th
      aria-sort={active ? (p.sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={clsx(th, className)}
    >
      <button type="button" onClick={() => p.toggleSort(k)} className="inline-flex items-center gap-1 hover:text-fg">
        {children}
        {active ? (p.sortDir === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />) : <ArrowUpDown size={10} className="opacity-40" />}
      </button>
    </th>
  );
}

const EDITOR_CLASSES = {
  row: 'grid grid-cols-[11rem_1fr] items-center gap-3',
  label: 'text-sm text-fg-muted text-end',
  input: 'px-3 py-1.5 bg-surface border border-border-subtle rounded text-fg text-sm focus:outline-none focus:border-accent transition-colors',
  select: 'px-3 py-1.5 bg-surface border border-border-subtle rounded text-fg text-sm focus:outline-none focus:border-accent transition-colors w-40',
  checkbox: 'w-4 h-4 accent-accent justify-self-start',
};

function ControlEditor({
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
      className="space-y-4"
    >
      <div role="tablist" aria-label={t('Control profile sections')} className="flex flex-wrap gap-1 border-b border-border-subtle -mx-5 px-5">
        {e.tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={tab.key === e.tab}
            onClick={() => e.setTab(tab.key)}
            className={clsx(
              'px-3 py-1.5 text-xs border-b-2 -mb-px transition-colors',
              tab.key === e.tab ? 'border-accent text-accent' : 'border-transparent text-fg-dim hover:text-fg',
            )}
          >
            {controlTabLabel(t, tab.key)}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="space-y-2 max-h-[55vh] overflow-y-auto pe-1">
        <ControlEditorFields
          fields={activeTab.fields}
          values={e.values}
          onChange={e.setField}
          onToggle={e.toggleFlag}
          classes={EDITOR_CLASSES}
          idPrefix="mctl"
        />
      </div>

      {e.validationError && e.dirty && (
        <p role="alert" className="text-xs text-danger">{e.validationError}</p>
      )}

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-border-subtle">
        <Button onClick={onCancel}>{t('Cancel')}</Button>
        <Button type="submit" variant="primary" disabled={e.submitDisabled}>
          {e.isSaving && <Loader2 size={14} className="animate-spin" />}
          {t('Save')}
        </Button>
      </div>
    </form>
  );
}
