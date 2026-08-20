import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import { Trans, useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, ArrowUpDown, Joystick, Loader2, Pencil, Plus, Search, ShieldAlert, Trash2 } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { Modal } from '@/components/common/Modal';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { QueryState } from '@/components/common/QueryState';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { summarizeCapabilities, type Control } from '@/api/controls';
import { ControlEditorFields } from '@/features/controls/ControlEditorFields';
import { controlTabLabel } from '@/features/controls/controlFields';
import { useControlEditor } from '@/features/controls/useControlEditor';
import { usePtzControlsPage, type ControlSortKey } from '@/features/controls/usePtzControlsPage';
import { useSiteTitle } from '@/features/settings/useSiteTitle';

/** Settings → PTZ control profiles — Mission Control. */
export default function SettingsPtzControlsPage() {
  const { t } = useTranslation();
  useSiteTitle(t('PTZ Controls'));
  const p = usePtzControlsPage();

  return (
    <AppShell>
      <div className="p-6 space-y-4">
        <Panel
          title={t('PTZ control profiles')}
          icon={<Joystick size={16} />}
          action={
            <RequirePerm feature="control" level="Edit">
              <button
                type="button"
                onClick={p.openCreate}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan text-void text-xs font-medium hover:bg-cyan/80 transition-colors"
              >
                <Plus size={14} />
                {t('Add profile')}
              </button>
            </RequirePerm>
          }
        >
          <p className="text-xs text-text-muted mb-3">
            <Trans>
              Each row is a PTZ-protocol definition the system can drive. Monitors
              reference one via <code>control_id</code> on the Control tab of the
              monitor editor.
            </Trans>
          </p>

          <div className="relative max-w-sm mb-3">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="search"
              value={p.query}
              onChange={(e) => p.setQuery(e.target.value)}
              placeholder={t('Search name, protocol or type…')}
              aria-label={t('Search control profiles')}
              className="w-full ps-10 pe-4 py-2 bg-panel border border-border-subtle rounded-lg text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-cyan/50"
            />
          </div>

          <QueryState
            isLoading={p.isLoading}
            isError={p.isError}
            error={p.error}
            onRetry={p.refetch}
            empty={p.rows.length === 0}
            emptyMessage={p.query ? t('No control profiles match your search') : t('No PTZ control protocols defined.')}
          >
            <table className="w-full text-sm">
              <thead className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted border-b border-border-subtle">
                <tr>
                  <SortTh k="id" p={p} className="w-12">{t('ID')}</SortTh>
                  <SortTh k="name" p={p}>{t('Name')}</SortTh>
                  <SortTh k="type" p={p}>{t('Type')}</SortTh>
                  <SortTh k="protocol" p={p}>{t('Protocol')}</SortTh>
                  <th className="text-start px-2 py-2">{t('Capabilities')}</th>
                  <th className="text-end px-2 py-2">{t('In use')}</th>
                  <th className="text-end px-2 py-2 w-24">{t('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {p.rows.map(({ control: c, monitors }) => (
                  <tr key={c.id} className="border-b border-border-subtle/40 hover:bg-surface/40">
                    <td className="px-2 py-2 font-mono tabular-nums text-text-muted">{c.id}</td>
                    <td className="px-2 py-2 text-text-primary">
                      <RequirePerm feature="control" level="Edit" fallback={<span>{c.name}</span>}>
                        <button type="button" onClick={() => p.openEdit(c)} className="hover:text-cyan hover:underline text-start">
                          {c.name}
                        </button>
                      </RequirePerm>
                    </td>
                    <td className="px-2 py-2 text-text-muted">{c.type}</td>
                    <td className="px-2 py-2 font-mono text-xs text-text-secondary">{c.protocol ?? '—'}</td>
                    <td className="px-2 py-2 text-text-secondary text-xs">{summarizeCapabilities(c)}</td>
                    <td
                      className="px-2 py-2 text-end font-mono tabular-nums text-text-muted"
                      title={monitors.map((m) => m.name).join(', ') || undefined}
                    >
                      {p.monitorsLoading ? '…' : t('{{count}} monitor', { count: monitors.length })}
                    </td>
                    <td className="px-2 py-2 text-end">
                      <RequirePerm feature="control" level="Edit">
                        <button
                          type="button"
                          onClick={() => p.openEdit(c)}
                          className="p-1 rounded text-text-muted hover:text-cyan hover:bg-cyan/10 transition-colors"
                          aria-label={t('Edit {{name}}', { name: c.name })}
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => p.requestDelete(c)}
                          className="p-1 rounded text-text-muted hover:text-crimson hover:bg-crimson/10 transition-colors"
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
        </Panel>
      </div>

      {p.editorOpen && (
        <Modal
          isOpen
          onClose={p.closeEditor}
          title={p.editing ? t('Control Capability - {{name}}', { name: p.editing.name }) : t('New control profile')}
        >
          {p.editorLoading ? (
            <div className="flex items-center gap-2 text-sm text-text-muted py-6 justify-center">
              <Loader2 size={14} className="animate-spin" /> {t('Loading…')}
            </div>
          ) : p.editorMissing ? (
            <p role="alert" className="text-sm text-crimson">{t('No control profile with id {{id}}.', { id: p.editorTarget })}</p>
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
            <ShieldAlert size={18} className="mt-0.5 shrink-0 text-amber" />
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
          </div>
          <div className="flex justify-end pt-6">
            <button
              type="button"
              onClick={p.cancelDelete}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-panel border border-border-subtle text-text-secondary hover:text-text-primary transition-colors"
            >
              {t('OK')}
            </button>
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
      className={clsx('text-start px-2 py-2', className)}
    >
      <button type="button" onClick={() => p.toggleSort(k)} className="inline-flex items-center gap-1 hover:text-text-primary">
        {children}
        {active ? (p.sortDir === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />) : <ArrowUpDown size={10} className="opacity-40" />}
      </button>
    </th>
  );
}

const EDITOR_CLASSES = {
  row: 'grid grid-cols-[11rem_1fr] items-center gap-3',
  label: 'text-sm text-text-secondary text-end',
  input: 'px-3 py-1.5 bg-panel border border-border-subtle rounded-lg text-text-primary text-sm focus:outline-none focus:border-cyan/50',
  select: 'px-3 py-1.5 bg-panel border border-border-subtle rounded-lg text-text-primary text-sm focus:outline-none focus:border-cyan/50 w-40',
  checkbox: 'w-4 h-4 accent-cyan justify-self-start',
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
              tab.key === e.tab ? 'border-cyan text-cyan' : 'border-transparent text-text-muted hover:text-text-primary',
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
        <p role="alert" className="text-xs text-crimson">{e.validationError}</p>
      )}

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-border-subtle">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-panel border border-border-subtle text-text-secondary hover:text-text-primary transition-colors"
        >
          {t('Cancel')}
        </button>
        <button
          type="submit"
          disabled={e.submitDisabled}
          className={clsx(
            'px-4 py-2 rounded-lg text-sm font-medium bg-cyan text-void hover:bg-cyan/80 transition-colors flex items-center gap-2',
            e.submitDisabled && 'opacity-50 cursor-not-allowed',
          )}
        >
          {e.isSaving && <Loader2 size={14} className="animate-spin" />}
          {t('Save')}
        </button>
      </div>
    </form>
  );
}
