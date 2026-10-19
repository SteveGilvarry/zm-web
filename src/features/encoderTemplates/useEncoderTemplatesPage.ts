import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  createEncoderTemplate,
  deleteEncoderTemplate,
  listEncoderTemplates,
  updateEncoderTemplate,
  type EncoderTemplate,
  type EncoderTemplateInput,
} from '@/api/encoderTemplates';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/components/common/toastStore';
import { usePerms } from '@/features/auth/usePerms';
import { ENCODERS, lintParams, orderTemplates, parseParams } from './encoderParams';

export const ENCODER_TEMPLATES_KEY = ['encoder-templates'] as const;

export interface TemplateDraft {
  encoder: string;
  name: string;
  description: string;
  params: string;
}

export interface TemplateEditor {
  /** `copy` opens a saved template as a new one, its encoder unlocked. */
  mode: 'new' | 'edit' | 'copy';
  /** The row being edited; absent for new and copy. */
  id?: number;
  draft: TemplateDraft;
}

const toDraft = (tpl: EncoderTemplate): TemplateDraft => ({
  encoder: tpl.encoder,
  name: tpl.name,
  description: tpl.description ?? '',
  params: tpl.params,
});

const toInput = (d: TemplateDraft): EncoderTemplateInput => ({
  encoder: d.encoder,
  name: d.name.trim(),
  description: d.description.trim() === '' ? null : d.description,
  params: d.params,
});

/**
 * Options → Encoder Templates (`_options_encoderTemplates.php` and
 * `options-encoder-templates.js`): the table filtered by encoder, and one
 * modal for Add, Edit and Copy that flags option names the encoder will
 * ignore. Everything that writes needs System Edit, as legacy disables it.
 */
export function useEncoderTemplatesPage() {
  const { t } = useTranslation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { can } = usePerms();
  const canEdit = can('system', 'Edit');
  const toast = useToast();
  const queryClient = useQueryClient();

  const listQ = useQuery({
    queryKey: ENCODER_TEMPLATES_KEY,
    queryFn: listEncoderTemplates,
    enabled: isAuthenticated,
  });
  const all = useMemo(() => orderTemplates(listQ.data ?? []), [listQ.data]);

  const [encoderFilter, setEncoderFilter] = useState('');
  const templates = encoderFilter ? all.filter((tpl) => tpl.encoder === encoderFilter) : all;
  /** The filter offers the fixed list plus any other encoder the rows use. */
  const encoderOptions = useMemo(
    () => [...ENCODERS, ...[...new Set(all.map((tpl) => tpl.encoder))].filter((e) => !ENCODERS.includes(e))],
    [all],
  );

  /* ----- Editor modal ----------------------------------------------------- */

  const [editor, setEditor] = useState<TemplateEditor | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const open = (next: TemplateEditor) => {
    setEditorError(null);
    setEditor(next);
  };
  const setDraft = <K extends keyof TemplateDraft>(key: K, value: TemplateDraft[K]) =>
    setEditor((e) => (e ? { ...e, draft: { ...e.draft, [key]: value } } : e));

  const unknownKeys = editor ? lintParams(parseParams(editor.draft.params), editor.draft.encoder) : [];

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ENCODER_TEMPLATES_KEY });

  const saveMutation = useMutation({
    mutationFn: (e: TemplateEditor) =>
      e.mode === 'edit' && e.id != null
        ? updateEncoderTemplate(e.id, toInput(e.draft))
        : createEncoderTemplate(toInput(e.draft)),
    onSuccess: () => {
      toast.success(t('Encoder template saved'));
      setEditor(null);
      invalidate();
    },
    onError: (err: Error) => setEditorError(err.message),
  });

  const save = () => {
    if (!editor) return;
    if (!editor.draft.name.trim()) {
      setEditorError(t('Name is required'));
      return;
    }
    saveMutation.mutate(editor);
  };

  /* ----- Delete ------------------------------------------------------------ */

  const [deleteTarget, setDeleteTarget] = useState<EncoderTemplate | null>(null);
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteEncoderTemplate(id),
    onSuccess: () => toast.success(t('Encoder template deleted')),
    onError: (err) => toast.apiError(err),
    onSettled: () => {
      setDeleteTarget(null);
      invalidate();
    },
  });

  return {
    isAuthenticated,
    canEdit,
    isLoading: listQ.isLoading,
    isError: listQ.isError,
    error: listQ.error,
    refetch: () => void listQ.refetch(),
    templates,
    encoderFilter,
    setEncoderFilter,
    encoderOptions,
    /** Encoders the modal offers: legacy's fixed list. */
    editorEncoders: ENCODERS,

    editor,
    editorError,
    unknownKeys,
    setDraft,
    openNew: () => open({ mode: 'new', draft: { encoder: ENCODERS[0], name: '', description: '', params: '' } }),
    openEdit: (tpl: EncoderTemplate) => open({ mode: 'edit', id: tpl.id, draft: toDraft(tpl) }),
    // Legacy's Copy opens the edit modal, clears the id, appends " Copy" to
    // the name and unlocks the encoder; Save then creates a new row.
    openCopy: (tpl: EncoderTemplate) => open({ mode: 'copy', draft: { ...toDraft(tpl), name: `${tpl.name} Copy` } }),
    closeEditor: () => setEditor(null),
    save,
    isSaving: saveMutation.isPending,

    deleteTarget,
    requestDelete: (tpl: EncoderTemplate) => setDeleteTarget(tpl),
    cancelDelete: () => setDeleteTarget(null),
    confirmDelete: () => {
      if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
    },
    isDeleting: deleteMutation.isPending,
  };
}
