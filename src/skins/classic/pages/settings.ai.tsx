import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';

import { AppShell } from '@/skins/AppShell';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Modal } from '@/components/common/Modal';
import { QueryState } from '@/components/common/QueryState';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { AiEditorFields } from '@/features/ai/AiEditorFields';
import { useAiAdminPage } from '@/features/ai/useAiAdminPage';
import { useOptionsTabs } from '@/features/settings/useOptionsTabs';
import { useSiteTitle } from '@/features/settings/useSiteTitle';
import type { AiSection } from '@/skins/types';
import { OptionsRail } from '../components/settings/OptionsRail';
import {
  ClassicButton, ClassicTable, ClassicToolbar, YesNo,
  classicInput, classicLink, classicTd, classicTh,
} from '../components/settings/primitives';

const editorClasses = {
  row: 'flex items-center gap-3 py-1',
  label: 'w-40 shrink-0 text-sm text-zinc-700 text-end',
  input: clsx(classicInput, 'flex-1'),
  select: clsx(classicInput, 'flex-1'),
  checkbox: '',
};

function sectionTitle(t: (s: string) => string, section: AiSection): string {
  if (section === 'datasets') return t('AI Datasets');
  if (section === 'models') return t('AI Models');
  return t('AI Classes');
}

/**
 * Options → AI Datasets / AI Models / AI Classes — classic skin, legacy
 * `_options_ai_datasets.php`, `_options_ai_models.php`,
 * `_options_ai_classes.php`: the Mark column, the same columns in the same
 * order, [Add New …] and [Delete], and the classes tab's Filter by Dataset.
 *
 * Legacy's Add and row-edit links are inert (`disabled`, `href="#"`); the
 * API supports the writes, so here they work.
 */
export default function ClassicSettingsAiPage({ section }: { section: AiSection }) {
  const { t } = useTranslation();
  const a = useAiAdminPage(section);
  const tabs = useOptionsTabs();
  const title = sectionTitle(t, section);
  useSiteTitle(title);

  if (!a.isAuthenticated) return null;

  const markTh = (
    <th className={clsx(classicTh, 'w-8')}>
      <input
        type="checkbox"
        aria-label={t('Select all')}
        checked={a.allMarked}
        disabled={!a.canEdit}
        onChange={a.toggleAllMarked}
      />
    </th>
  );
  const markTd = (id: number, label: string) => (
    <td className={classicTd}>
      <input
        type="checkbox"
        aria-label={t('Mark {{name}}', { name: label })}
        checked={a.markedIds.has(id)}
        disabled={!a.canEdit}
        onChange={() => a.toggleMarked(id)}
      />
    </td>
  );
  const rowLink = (label: string, onClick: () => void) =>
    a.canEdit
      ? <button type="button" onClick={onClick} className={classicLink}>{label || '—'}</button>
      : <>{label}</>;

  return (
    <AppShell title={title}>
      <main className="flex-1 p-4 overflow-auto bg-zinc-50">
        <div className="max-w-screen-2xl mx-auto space-y-4">
          <h1 className="text-xl text-zinc-800 font-semibold">{t('Options')}</h1>
          <div className="flex items-start gap-4">
            <OptionsRail tabs={tabs} active={`ai_${section}`} />
            <div className="flex-1 min-w-0 space-y-3">
              <RequirePerm feature="system" level="View" fallback="message">
                <ClassicToolbar
                  end={
                    section === 'classes' ? (
                      <label className="flex items-center gap-2 text-sm text-zinc-700">
                        {t('Filter by Dataset')}
                        <select
                          value={a.datasetFilter == null ? '' : String(a.datasetFilter)}
                          onChange={(e) => a.setDatasetFilter(e.target.value === '' ? null : Number(e.target.value))}
                          className={classicInput}
                        >
                          <option value="">{t('All Datasets')}</option>
                          {a.datasets.map((d) => (
                            <option key={d.id} value={String(d.id)}>{d.name}</option>
                          ))}
                        </select>
                      </label>
                    ) : undefined
                  }
                >
                  <RequirePerm feature="system" level="Edit">
                    <ClassicButton tone="primary" onClick={a.openCreate}>
                      {section === 'datasets' ? t('Add New Dataset')
                        : section === 'models' ? t('Add New Model') : t('Add New Class')}
                    </ClassicButton>
                    <ClassicButton tone="danger" disabled={a.markedCount === 0} onClick={a.askDelete}>
                      {t('Delete')}
                    </ClassicButton>
                  </RequirePerm>
                </ClassicToolbar>

                <QueryState
                  isLoading={a.isLoading}
                  isError={a.isError}
                  error={a.error}
                  onRetry={a.refetch}
                  empty={a.rowCount === 0}
                  emptyMessage={t('No matching records found')}
                >
                  <ClassicTable>
                    {section === 'datasets' && (
                      <>
                        <thead>
                          <tr>
                            {markTh}
                            <th className={classicTh}>{t('Id')}</th>
                            <th className={classicTh}>{t('Name')}</th>
                            <th className={classicTh}>{t('Version')}</th>
                            <th className={classicTh}>{t('Number of Classes')}</th>
                            <th className={classicTh}>{t('Description')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {a.datasets.map((d) => (
                            <tr key={d.id}>
                              {markTd(d.id, d.name)}
                              <td className={classicTd}>{d.id}</td>
                              <td className={classicTd}>{rowLink(d.name, () => a.openDataset(d))}</td>
                              <td className={classicTd}>{d.version}</td>
                              <td className={clsx(classicTd, 'font-mono tabular-nums')}>{d.num_classes}</td>
                              <td className={classicTd}>{d.description}</td>
                            </tr>
                          ))}
                        </tbody>
                      </>
                    )}

                    {section === 'models' && (
                      <>
                        <thead>
                          <tr>
                            {markTh}
                            <th className={classicTh}>{t('Id')}</th>
                            <th className={classicTh}>{t('Name')}</th>
                            <th className={classicTh}>{t('Framework')}</th>
                            <th className={classicTh}>{t('Version')}</th>
                            <th className={classicTh}>{t('Dataset')}</th>
                            <th className={classicTh}>{t('Model Path')}</th>
                            <th className={classicTh}>{t('Enabled')}</th>
                            <th className={classicTh}>{t('Description')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {a.models.map((m) => (
                            <tr key={m.id}>
                              {markTd(m.id, m.name)}
                              <td className={classicTd}>{m.id}</td>
                              <td className={classicTd}>{rowLink(m.name, () => a.openModel(m))}</td>
                              <td className={classicTd}>{m.framework}</td>
                              <td className={classicTd}>{m.version}</td>
                              <td className={classicTd}>{m.dataset_name ?? a.datasetName(m.dataset_id)}</td>
                              <td className={clsx(classicTd, 'font-mono text-xs')}>{m.model_path}</td>
                              <td className={classicTd}><YesNo value={m.enabled} /></td>
                              <td className={classicTd}>{m.description}</td>
                            </tr>
                          ))}
                        </tbody>
                      </>
                    )}

                    {section === 'classes' && (
                      <>
                        <thead>
                          <tr>
                            {markTh}
                            <th className={classicTh}>{t('Id')}</th>
                            <th className={classicTh}>{t('Dataset')}</th>
                            <th className={classicTh}>{t('Class Name')}</th>
                            <th className={classicTh}>{t('Class Index')}</th>
                            <th className={classicTh}>{t('Description')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {a.classes.map((c) => (
                            <tr key={c.id}>
                              {markTd(c.id, c.class_name)}
                              <td className={classicTd}>{c.id}</td>
                              <td className={classicTd}>{a.datasetName(c.dataset_id)}</td>
                              <td className={classicTd}>{rowLink(c.class_name, () => a.openClass(c))}</td>
                              <td className={clsx(classicTd, 'font-mono tabular-nums')}>{c.class_index}</td>
                              <td className={classicTd}>{c.description}</td>
                            </tr>
                          ))}
                        </tbody>
                      </>
                    )}
                  </ClassicTable>
                </QueryState>
              </RequirePerm>
            </div>
          </div>
        </div>
      </main>

      {a.draft && (
        <Modal
          isOpen
          onClose={a.closeEditor}
          title={a.draft.id == null ? t('Add') : t('Edit')}
        >
          <div className="space-y-1">
            <AiEditorFields
              section={section}
              draft={a.draft}
              datasets={a.datasets}
              onChange={a.setField}
              disabled={a.isSaving}
              classes={editorClasses}
            />
            {a.draftError && (
              <p role="alert" className="text-sm text-[#a94442] pt-2">{a.draftError}</p>
            )}
            <div className="flex justify-end gap-2 pt-3">
              <ClassicButton onClick={a.closeEditor}>{t('Cancel')}</ClassicButton>
              <ClassicButton tone="primary" onClick={a.save} disabled={!!a.draftError || a.isSaving}>
                {t('Save')}
              </ClassicButton>
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
