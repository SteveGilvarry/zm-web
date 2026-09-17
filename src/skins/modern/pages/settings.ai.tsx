import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { Plus, Trash2 } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Button } from '@/components/common/Button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Modal } from '@/components/common/Modal';
import { QueryState } from '@/components/common/QueryState';
import { fieldClasses } from '@/components/common/styles';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { AiEditorFields } from '@/features/ai/AiEditorFields';
import { useAiAdminPage } from '@/features/ai/useAiAdminPage';
import { useSiteTitle } from '@/features/settings/useSiteTitle';
import type { AiSection } from '@/skins/types';

const th = 'px-4 py-2 text-start text-xs font-medium text-fg-dim whitespace-nowrap';
const td = 'px-4 py-2 border-t border-border-subtle';
const num = clsx(td, 'font-mono tabular-nums');

const editorClasses = {
  row: 'flex items-center gap-3 py-1',
  label: 'w-36 shrink-0 text-xs text-fg-dim text-end',
  input: clsx(fieldClasses('sm'), 'flex-1'),
  select: clsx(fieldClasses('sm'), 'flex-1'),
  checkbox: '',
};

const SECTIONS: ReadonlyArray<{ id: AiSection; to: string }> = [
  { id: 'datasets', to: '/settings/ai/datasets' },
  { id: 'models', to: '/settings/ai/models' },
  { id: 'classes', to: '/settings/ai/classes' },
];

/**
 * Settings → AI. One page per resource behind a tab strip: datasets, the
 * models trained on them, and the object classes a dataset defines. The
 * tables are the data and nothing else — a class index is a number that
 * lines up, so it is monospace (docs/DESIGN.md).
 */
export default function SettingsAiPage({ section }: { section: AiSection }) {
  const { t } = useTranslation();
  const a = useAiAdminPage(section);
  const label: Record<AiSection, string> = {
    datasets: t('Datasets'),
    models: t('Models'),
    classes: t('Object Classes'),
  };
  useSiteTitle(t('AI'));

  if (!a.isAuthenticated) return null;

  const markCell = (id: number, name: string) => (
    <td className={td}>
      <input
        type="checkbox"
        aria-label={t('Mark {{name}}', { name })}
        checked={a.markedIds.has(id)}
        disabled={!a.canEdit}
        onChange={() => a.toggleMarked(id)}
      />
    </td>
  );
  const nameCell = (name: string, onClick: () => void) => (
    <td className={td}>
      {a.canEdit ? (
        <button type="button" onClick={onClick} className="text-accent hover:underline">
          {name}
        </button>
      ) : name}
    </td>
  );

  return (
    <AppShell title={t('AI')}>
      <main className="flex-1 p-6 overflow-auto">
        <RequirePerm feature="system" level="View" fallback="message">
          <div className="mx-auto w-full max-w-[1200px] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <nav className="flex items-center gap-1" aria-label={t('AI')}>
                {SECTIONS.map((s) => (
                  <Link
                    key={s.id}
                    to={s.to}
                    aria-current={s.id === section ? 'page' : undefined}
                    className={clsx(
                      'px-2.5 py-1 rounded text-sm transition-colors',
                      s.id === section
                        ? 'bg-surface-2 text-fg font-medium'
                        : 'text-fg-dim hover:text-fg',
                    )}
                  >
                    {label[s.id]}
                  </Link>
                ))}
              </nav>

              <div className="flex items-center gap-2">
                {section === 'classes' && (
                  <select
                    aria-label={t('Filter by Dataset')}
                    value={a.datasetFilter == null ? '' : String(a.datasetFilter)}
                    onChange={(e) => a.setDatasetFilter(e.target.value === '' ? null : Number(e.target.value))}
                    className={fieldClasses('sm')}
                  >
                    <option value="">{t('All Datasets')}</option>
                    {a.datasets.map((d) => (
                      <option key={d.id} value={String(d.id)}>{d.name}</option>
                    ))}
                  </select>
                )}
                <RequirePerm feature="system" level="Edit">
                  <Button size="sm" onClick={a.openCreate}>
                    <Plus size={13} aria-hidden />
                    {t('Add')}
                  </Button>
                  <Button size="sm" variant="danger" disabled={a.markedCount === 0} onClick={a.askDelete}>
                    <Trash2 size={13} aria-hidden />
                    {t('Delete')}
                  </Button>
                </RequirePerm>
              </div>
            </div>

            <QueryState
              isLoading={a.isLoading}
              isError={a.isError}
              error={a.error}
              onRetry={a.refetch}
              empty={a.rowCount === 0}
              emptyMessage={t('Nothing here yet')}
            >
              <div className="rounded border border-border-subtle overflow-x-auto">
                <table className="w-full text-sm">
                  {section === 'datasets' && (
                    <>
                      <thead>
                        <tr className="bg-surface-2">
                          <th className={th} />
                          <th className={th}>{t('Name')}</th>
                          <th className={th}>{t('Version')}</th>
                          <th className={th}>{t('Number of Classes')}</th>
                          <th className={th}>{t('Description')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {a.datasets.map((d) => (
                          <tr key={d.id}>
                            {markCell(d.id, d.name)}
                            {nameCell(d.name, () => a.openDataset(d))}
                            <td className={td}>{d.version}</td>
                            <td className={num}>{d.num_classes}</td>
                            <td className={clsx(td, 'text-fg-dim')}>{d.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </>
                  )}

                  {section === 'models' && (
                    <>
                      <thead>
                        <tr className="bg-surface-2">
                          <th className={th} />
                          <th className={th}>{t('Name')}</th>
                          <th className={th}>{t('Framework')}</th>
                          <th className={th}>{t('Version')}</th>
                          <th className={th}>{t('Dataset')}</th>
                          <th className={th}>{t('Model Path')}</th>
                          <th className={th}>{t('Enabled')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {a.models.map((m) => (
                          <tr key={m.id}>
                            {markCell(m.id, m.name)}
                            {nameCell(m.name, () => a.openModel(m))}
                            <td className={td}>{m.framework}</td>
                            <td className={td}>{m.version}</td>
                            <td className={td}>{m.dataset_name ?? a.datasetName(m.dataset_id)}</td>
                            <td className={clsx(td, 'font-mono text-xs text-fg-dim')}>{m.model_path}</td>
                            <td className={td}>{m.enabled === 1 ? t('Yes') : t('No')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </>
                  )}

                  {section === 'classes' && (
                    <>
                      <thead>
                        <tr className="bg-surface-2">
                          <th className={th} />
                          <th className={th}>{t('Class Name')}</th>
                          <th className={th}>{t('Class Index')}</th>
                          <th className={th}>{t('Dataset')}</th>
                          <th className={th}>{t('Description')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {a.classes.map((c) => (
                          <tr key={c.id}>
                            {markCell(c.id, c.class_name)}
                            {nameCell(c.class_name, () => a.openClass(c))}
                            <td className={num}>{c.class_index}</td>
                            <td className={td}>{a.datasetName(c.dataset_id)}</td>
                            <td className={clsx(td, 'text-fg-dim')}>{c.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </>
                  )}
                </table>
              </div>
            </QueryState>
          </div>
        </RequirePerm>
      </main>

      {a.draft && (
        <Modal isOpen onClose={a.closeEditor} title={a.draft.id == null ? t('Add') : t('Edit')}>
          <div className="space-y-1">
            <AiEditorFields
              section={section}
              draft={a.draft}
              datasets={a.datasets}
              onChange={a.setField}
              disabled={a.isSaving}
              classes={editorClasses}
            />
            {a.draftError && <p role="alert" className="text-sm text-danger pt-2">{a.draftError}</p>}
            <div className="flex justify-end gap-2 pt-3">
              <Button size="sm" variant="ghost" onClick={a.closeEditor}>{t('Cancel')}</Button>
              <Button size="sm" onClick={a.save} disabled={!!a.draftError || a.isSaving}>
                {t('Save')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        isOpen={a.confirmingDelete}
        onClose={a.cancelDelete}
        onConfirm={a.confirmDelete}
        title={t('Delete')}
        message={
          section === 'datasets'
            ? t('Delete {{count}} dataset? Their object classes go with them.', { count: a.markedCount })
            : t('Delete {{count}} row? This cannot be undone.', { count: a.markedCount })
        }
        confirmText={t('Delete')}
        variant="danger"
        isLoading={a.isDeleting}
      />
    </AppShell>
  );
}
