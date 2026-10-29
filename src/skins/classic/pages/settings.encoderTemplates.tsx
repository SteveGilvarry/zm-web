import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';

import { AppShell } from '@/skins/AppShell';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Modal } from '@/components/common/Modal';
import { QueryState } from '@/components/common/QueryState';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { paramsSummary } from '@/features/encoderTemplates/encoderParams';
import { useEncoderTemplatesPage } from '@/features/encoderTemplates/useEncoderTemplatesPage';
import { useOptionsTabs } from '@/features/settings/useOptionsTabs';
import { useSiteTitle } from '@/features/settings/useSiteTitle';
import { OptionsRail } from '../components/settings/OptionsRail';
import { ClassicButton, ClassicTable, classicInput, classicTd, classicTh } from '../components/settings/primitives';

/**
 * Options → Encoder Templates, classic skin (`_options_encoderTemplates.php`):
 * heading and blurb, Filter by Encoder, [Add New Template], then Id /
 * Encoder / Name / Params / Actions with Edit, Copy and Delete per row.
 */
export default function ClassicEncoderTemplatesPage() {
  const { t } = useTranslation();
  const p = useEncoderTemplatesPage();
  const tabs = useOptionsTabs();
  useSiteTitle(t('Encoder Templates'));

  if (!p.isAuthenticated) return null;

  return (
    <AppShell title={t('Encoder Templates')}>
      <main className="flex-1 p-4 overflow-auto bg-zinc-50">
        <div className="max-w-screen-2xl mx-auto space-y-4">
          <h1 className="text-xl text-zinc-800 font-semibold">{t('Options')}</h1>
          <div className="flex items-start gap-4">
            <OptionsRail tabs={tabs} active="encoderTemplates" />
            <div className="flex-1 min-w-0 space-y-3">
              <RequirePerm feature="system" level="View" fallback="message">
                <h2 className="text-lg text-zinc-800 font-semibold">{t('Encoder Templates')}</h2>
                <p className="text-sm text-zinc-700">
                  {t('Curated parameter sets for ffmpeg encoders. Apply one to a monitor\'s Encoder Parameters from the monitor edit page.')}
                </p>
                <div className="flex items-center gap-2 text-sm text-zinc-800">
                  <label htmlFor="encoderFilter">{t('Filter by Encoder')}</label>
                  <select
                    id="encoderFilter"
                    value={p.encoderFilter}
                    onChange={(e) => p.setEncoderFilter(e.target.value)}
                    className={classicInput}
                  >
                    <option value="">{t('All Encoders')}</option>
                    {p.encoderOptions.map((enc) => <option key={enc} value={enc}>{enc}</option>)}
                  </select>
                </div>
                <div>
                  <ClassicButton tone="primary" disabled={!p.canEdit} onClick={p.openNew}>
                    {t('Add New Template')}
                  </ClassicButton>
                </div>

                <QueryState
                  isLoading={p.isLoading}
                  isError={p.isError}
                  error={p.error}
                  onRetry={p.refetch}
                  empty={p.templates.length === 0}
                  emptyMessage={t('No matching records found')}
                >
                  <ClassicTable>
                    <thead>
                      <tr>
                        <th className={classicTh}>{t('Id')}</th>
                        <th className={classicTh}>{t('Encoder')}</th>
                        <th className={classicTh}>{t('Name')}</th>
                        <th className={classicTh}>{t('Params')}</th>
                        <th className={classicTh}>{t('Actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.templates.map((tpl) => {
                        const params = paramsSummary(tpl.params);
                        return (
                          <tr key={tpl.id}>
                            <td className={clsx(classicTd, 'tabular-nums')}>{tpl.id}</td>
                            <td className={classicTd}>{tpl.encoder}</td>
                            <td className={classicTd}>{tpl.name}</td>
                            <td className={clsx(classicTd, 'font-mono text-xs')} title={params.full}>{params.short}</td>
                            <td className={clsx(classicTd, 'whitespace-nowrap')}>
                              <span className="inline-flex gap-1">
                                <ClassicButton
                                  disabled={!p.canEdit}
                                  onClick={() => p.openEdit(tpl)}
                                  aria-label={t('Edit {{name}} ({{encoder}})', { name: tpl.name, encoder: tpl.encoder })}
                                >
                                  {t('Edit')}
                                </ClassicButton>
                                <ClassicButton
                                  disabled={!p.canEdit}
                                  onClick={() => p.openCopy(tpl)}
                                  aria-label={t('Copy {{name}} ({{encoder}})', { name: tpl.name, encoder: tpl.encoder })}
                                >
                                  {t('Copy')}
                                </ClassicButton>
                                <ClassicButton
                                  disabled={!p.canEdit}
                                  onClick={() => p.requestDelete(tpl)}
                                  aria-label={t('Delete {{name}} ({{encoder}})', { name: tpl.name, encoder: tpl.encoder })}
                                >
                                  {t('Delete')}
                                </ClassicButton>
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </ClassicTable>
                </QueryState>
              </RequirePerm>
            </div>
          </div>
        </div>
      </main>

      {p.editor && (
        <Modal
          isOpen
          onClose={p.closeEditor}
          title={p.editor.mode === 'edit' ? t('Edit Encoder Template') : t('New Encoder Template')}
        >
          <form
            className="space-y-3 text-sm text-zinc-800"
            onSubmit={(e) => {
              e.preventDefault();
              p.save();
            }}
          >
            {p.editorError && (
              <div role="alert" className="px-3 py-2 border border-[#f5c6cb] bg-[#f8d7da] text-[#721c24] rounded-sm whitespace-pre-line">
                {p.editorError}
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label htmlFor="EtEncoder">{t('Encoder')}</label>
              <select
                id="EtEncoder"
                value={p.editor.draft.encoder}
                disabled={p.editor.mode === 'edit'}
                onChange={(e) => p.setDraft('encoder', e.target.value)}
                className={classicInput}
              >
                {p.editorEncoders.map((enc) => <option key={enc} value={enc}>{enc}</option>)}
                {!p.editorEncoders.includes(p.editor.draft.encoder) && (
                  <option value={p.editor.draft.encoder}>{p.editor.draft.encoder}</option>
                )}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="EtName">{t('Name')}</label>
              <input
                id="EtName"
                type="text"
                maxLength={64}
                value={p.editor.draft.name}
                onChange={(e) => p.setDraft('name', e.target.value)}
                className={classicInput}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="EtDescription">{t('Description')}</label>
              <textarea
                id="EtDescription"
                rows={2}
                value={p.editor.draft.description}
                onChange={(e) => p.setDraft('description', e.target.value)}
                className={classicInput}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="EtParams">{t('Params')}</label>
              <textarea
                id="EtParams"
                rows={6}
                value={p.editor.draft.params}
                onChange={(e) => p.setDraft('params', e.target.value)}
                className={clsx(classicInput, 'font-mono')}
                aria-describedby={p.unknownKeys.length > 0 ? 'EtParamsDiagnostics' : undefined}
              />
              {p.unknownKeys.length > 0 && (
                <p id="EtParamsDiagnostics" role="status" className="text-xs text-[#856404]">
                  {t('Note: {{keys}} are not recognised options for {{encoder}} and will be ignored at runtime.', {
                    keys: p.unknownKeys.map((k) => `\`${k}\``).join(', '),
                    encoder: `\`${p.editor.draft.encoder}\``,
                  })}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <ClassicButton onClick={p.closeEditor}>{t('Cancel')}</ClassicButton>
              <ClassicButton type="submit" tone="primary" disabled={p.isSaving}>{t('Save')}</ClassicButton>
            </div>
          </form>
        </Modal>
      )}

      <ConfirmDialog
        isOpen={p.deleteTarget !== null}
        onClose={p.cancelDelete}
        onConfirm={p.confirmDelete}
        title={t('Delete')}
        message={t("Delete template '{{name}}' for {{encoder}}?", {
          name: p.deleteTarget?.name ?? '',
          encoder: p.deleteTarget?.encoder ?? '',
        })}
        confirmText={t('Delete')}
        variant="danger"
        isLoading={p.isDeleting}
      />
    </AppShell>
  );
}
