import { useTranslation } from 'react-i18next';
import { Copy, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Button } from '@/components/common/Button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Modal } from '@/components/common/Modal';
import { QueryState } from '@/components/common/QueryState';
import { Select } from '@/components/common/Select';
import { TextField } from '@/components/common/TextField';
import { Textarea } from '@/components/common/Textarea';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { paramsSummary } from '@/features/encoderTemplates/encoderParams';
import { useEncoderTemplatesPage } from '@/features/encoderTemplates/useEncoderTemplatesPage';
import { useSiteTitle } from '@/features/settings/useSiteTitle';

const th = 'px-3 py-2 text-start text-xs font-medium text-fg-dim whitespace-nowrap';
const iconBtn = 'p-1.5 rounded text-fg-dim hover:text-fg hover:bg-surface-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

/**
 * Settings → Encoder Templates, modern skin: named ffmpeg parameter sets
 * the monitor editor can apply. One table, one editor dialog.
 */
export default function SettingsEncoderTemplatesPage() {
  const { t } = useTranslation();
  const p = useEncoderTemplatesPage();
  useSiteTitle(t('Encoder Templates'));

  if (!p.isAuthenticated) return null;

  return (
    <AppShell title={t('Encoder Templates')}>
      <main className="flex-1 p-6 overflow-auto">
        <RequirePerm feature="system" level="View" fallback="message">
          <div className="mx-auto w-full max-w-[1400px] space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium text-fg">{t('Encoder Templates')}</h2>
                <p className="text-xs text-fg-dim">
                  {t('Curated parameter sets for ffmpeg encoders. Apply one to a monitor\'s Encoder Parameters from the monitor edit page.')}
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <Select
                  size="sm"
                  label={t('Encoder')}
                  value={p.encoderFilter}
                  onChange={(e) => p.setEncoderFilter(e.target.value)}
                >
                  <option value="">{t('All Encoders')}</option>
                  {p.encoderOptions.map((enc) => <option key={enc} value={enc}>{enc}</option>)}
                </Select>
                {p.canEdit && (
                  <Button size="sm" variant="primary" onClick={p.openNew}>
                    <Plus size={14} aria-hidden />
                    {t('Add Template')}
                  </Button>
                )}
              </div>
            </div>

            <div className="rounded border border-border-subtle overflow-hidden">
              <QueryState
                isLoading={p.isLoading}
                isError={p.isError}
                error={p.error}
                onRetry={p.refetch}
                empty={p.templates.length === 0}
                emptyMessage={t('No encoder templates')}
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border-subtle">
                        <th className={th}>{t('Encoder')}</th>
                        <th className={th}>{t('Name')}</th>
                        <th className={th}>{t('Description')}</th>
                        <th className={th}>{t('Params')}</th>
                        {p.canEdit && <th className={`${th} text-end`}>{t('Actions')}</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {p.templates.map((tpl) => {
                        const params = paramsSummary(tpl.params);
                        const label = { name: tpl.name, encoder: tpl.encoder };
                        return (
                          <tr key={tpl.id} className="hover:bg-surface-2 transition-colors">
                            <td className="px-3 py-2 font-mono text-xs text-fg-muted">{tpl.encoder}</td>
                            <td className="px-3 py-2 font-medium text-fg">{tpl.name}</td>
                            <td className="px-3 py-2 text-fg-muted">{tpl.description}</td>
                            <td className="px-3 py-2 font-mono text-xs text-fg-muted" title={params.full}>{params.short}</td>
                            {p.canEdit && (
                              <td className="px-3 py-2">
                                <div className="flex items-center justify-end gap-1">
                                  <button type="button" className={iconBtn} onClick={() => p.openEdit(tpl)}
                                    title={t('Edit')} aria-label={t('Edit {{name}} ({{encoder}})', label)}>
                                    <Pencil size={14} />
                                  </button>
                                  <button type="button" className={iconBtn} onClick={() => p.openCopy(tpl)}
                                    title={t('Copy')} aria-label={t('Copy {{name}} ({{encoder}})', label)}>
                                    <Copy size={14} />
                                  </button>
                                  <button type="button" className="p-1.5 rounded text-fg-dim hover:text-danger hover:bg-danger/10 transition-colors"
                                    onClick={() => p.requestDelete(tpl)}
                                    title={t('Delete')} aria-label={t('Delete {{name}} ({{encoder}})', label)}>
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </QueryState>
            </div>
          </div>
        </RequirePerm>
      </main>

      {p.editor && (
        <Modal
          isOpen
          onClose={p.closeEditor}
          title={p.editor.mode === 'edit' ? t('Edit Encoder Template') : t('New Encoder Template')}
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              p.save();
            }}
          >
            <div className="grid grid-cols-2 gap-4">
              <Select
                label={t('Encoder')}
                value={p.editor.draft.encoder}
                disabled={p.editor.mode === 'edit'}
                onChange={(e) => p.setDraft('encoder', e.target.value)}
              >
                {p.editorEncoders.map((enc) => <option key={enc} value={enc}>{enc}</option>)}
                {!p.editorEncoders.includes(p.editor.draft.encoder) && (
                  <option value={p.editor.draft.encoder}>{p.editor.draft.encoder}</option>
                )}
              </Select>
              <TextField
                label={t('Name')}
                maxLength={64}
                value={p.editor.draft.name}
                onChange={(e) => p.setDraft('name', e.target.value)}
                required
              />
            </div>
            <Textarea
              label={t('Description')}
              rows={2}
              value={p.editor.draft.description}
              onChange={(e) => p.setDraft('description', e.target.value)}
            />
            <Textarea
              label={t('Params')}
              rows={6}
              className="font-mono"
              value={p.editor.draft.params}
              onChange={(e) => p.setDraft('params', e.target.value)}
              hint={p.unknownKeys.length > 0
                ? t('Note: {{keys}} are not recognised options for {{encoder}} and will be ignored at runtime.', {
                  keys: p.unknownKeys.map((k) => `\`${k}\``).join(', '),
                  encoder: `\`${p.editor.draft.encoder}\``,
                })
                : t('One key=value per line.')}
            />
            {p.editorError && (
              <div role="alert" className="rounded border border-danger/30 bg-danger/10 p-2 text-xs text-danger">
                {p.editorError}
              </div>
            )}
            <div className="flex items-center justify-end gap-3">
              <Button onClick={p.closeEditor}>{t('Cancel')}</Button>
              <Button type="submit" variant="primary" disabled={p.isSaving}>
                {p.isSaving && <Loader2 size={14} className="animate-spin" aria-hidden />}
                {t('Save')}
              </Button>
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
