import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import {
  createAiDataset, createAiModel, createAiObjectClass,
  deleteAiDataset, deleteAiModel, deleteAiObjectClass,
  listAiDatasets, listAiModels, listAiObjectClasses,
  updateAiDataset, updateAiModel, updateAiObjectClass,
  type AiDataset, type AiFramework, type AiModel, type AiObjectClass,
} from '@/api/ai';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/components/common/toastStore';
import { usePerms } from '@/features/auth/usePerms';
import type { AiSection } from '@/skins/types';

/** One page covers any install: COCO alone is 80 classes, a few datasets more. */
const PAGE_SIZE = 500;

/**
 * The editor's form state. One flat draft for all three resources — the
 * three tables overlap (name, version, description) and a section only ever
 * renders its own fields, so three near-identical drafts would buy nothing.
 * Everything is a string because it comes from an input; `save` converts.
 */
export interface AiDraft {
  /** `null` while creating. */
  id: number | null;
  name: string;
  version: string;
  description: string;
  numClasses: string;
  framework: string;
  modelPath: string;
  datasetId: string;
  enabled: boolean;
  className: string;
  classIndex: string;
}

const EMPTY_DRAFT: AiDraft = {
  id: null,
  name: '',
  version: '',
  description: '',
  numClasses: '0',
  framework: 'ONNX',
  modelPath: '',
  datasetId: '',
  enabled: true,
  className: '',
  classIndex: '0',
};

/** `''` is how the form says "not set"; the API wants `null`. */
const orNull = (v: string): string | null => (v.trim() === '' ? null : v.trim());

/**
 * Options → AI Datasets / AI Models / AI Classes, legacy `_options_ai_*.php`.
 *
 * Those three legacy tabs are read-only in 1.39 — their [Add New …] buttons
 * ship `disabled` and the row links go to `#`. zm-api serves full CRUD on
 * `/ai/datasets`, `/ai/models` and `/ai/object-classes`, so the dashboard
 * wires the editors up rather than reproducing dead buttons.
 *
 * Datasets are loaded for every section: models and classes both name their
 * dataset, and the class list filters by it (legacy's "Filter by Dataset"
 * select) — which the backend does server-side via `?dataset_id=`.
 */
export function useAiAdminPage(section: AiSection) {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const { can } = usePerms();
  const queryClient = useQueryClient();
  const toast = useToast();

  const canEdit = can('system', 'Edit');

  /** Legacy's dataset filter on the classes tab; `null` is "All Datasets". */
  const [datasetFilter, setDatasetFilter] = useState<number | null>(null);

  const datasetsQ = useQuery({
    queryKey: ['ai', 'datasets'],
    queryFn: () => listAiDatasets({ page: 1, page_size: PAGE_SIZE }),
    enabled: isAuthenticated,
  });
  const modelsQ = useQuery({
    queryKey: ['ai', 'models'],
    queryFn: () => listAiModels({ page: 1, page_size: PAGE_SIZE }),
    enabled: isAuthenticated && section === 'models',
  });
  const classesQ = useQuery({
    queryKey: ['ai', 'classes', datasetFilter],
    queryFn: () =>
      listAiObjectClasses({ page: 1, page_size: PAGE_SIZE, dataset_id: datasetFilter ?? undefined }),
    enabled: isAuthenticated && section === 'classes',
  });

  const activeQ = section === 'datasets' ? datasetsQ : section === 'models' ? modelsQ : classesQ;

  const datasets: AiDataset[] = useMemo(
    () => [...(datasetsQ.data?.items ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [datasetsQ.data],
  );
  const models: AiModel[] = useMemo(
    () => [...(modelsQ.data?.items ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [modelsQ.data],
  );
  const datasetNames = useMemo(
    () => new Map(datasets.map((d) => [d.id, d.name])),
    [datasets],
  );
  const datasetName = (id: number | null | undefined) =>
    (id == null ? undefined : datasetNames.get(id)) ?? '';
  // Legacy orders the class list by dataset name, then class index.
  const classes: AiObjectClass[] = useMemo(
    () =>
      [...(classesQ.data?.items ?? [])].sort(
        (a, b) =>
          (datasetNames.get(a.dataset_id) ?? '').localeCompare(datasetNames.get(b.dataset_id) ?? '')
          || a.class_index - b.class_index,
      ),
    [classesQ.data, datasetNames],
  );

  const rowCount =
    section === 'datasets' ? datasets.length : section === 'models' ? models.length : classes.length;

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['ai'] });

  /* ----- Mark + delete (legacy's Mark column and one Delete button) ------- */

  const [markedIds, setMarkedIds] = useState<ReadonlySet<number>>(new Set());
  const toggleMarked = (id: number) =>
    setMarkedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const visibleIds =
    section === 'datasets' ? datasets.map((d) => d.id)
      : section === 'models' ? models.map((m) => m.id)
        : classes.map((c) => c.id);
  const allMarked = visibleIds.length > 0 && visibleIds.every((id) => markedIds.has(id));
  const toggleAllMarked = () => setMarkedIds(allMarked ? new Set() : new Set(visibleIds));

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const deleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const remove =
        section === 'datasets' ? deleteAiDataset
          : section === 'models' ? deleteAiModel
            : deleteAiObjectClass;
      for (const id of ids) await remove(id);
      return ids.length;
    },
    onSuccess: (count) => {
      toast.success(t('{{count}} row deleted', { count }));
      setMarkedIds(new Set());
    },
    onError: (err) => toast.apiError(err),
    onSettled: () => {
      setConfirmingDelete(false);
      invalidate();
    },
  });

  /* ----- Editor ----------------------------------------------------------- */

  const [draft, setDraft] = useState<AiDraft | null>(null);
  const setField = <K extends keyof AiDraft>(key: K, value: AiDraft[K]) =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  const openCreate = () =>
    setDraft({
      ...EMPTY_DRAFT,
      datasetId: datasetFilter != null ? String(datasetFilter) : String(datasets[0]?.id ?? ''),
    });
  const openDataset = (row: AiDataset) =>
    setDraft({
      ...EMPTY_DRAFT,
      id: row.id,
      name: row.name,
      version: row.version ?? '',
      description: row.description ?? '',
      numClasses: String(row.num_classes),
    });
  const openModel = (row: AiModel) =>
    setDraft({
      ...EMPTY_DRAFT,
      id: row.id,
      name: row.name,
      version: row.version ?? '',
      description: row.description ?? '',
      framework: row.framework,
      modelPath: row.model_path ?? '',
      datasetId: row.dataset_id != null ? String(row.dataset_id) : '',
      enabled: row.enabled === 1,
    });
  const openClass = (row: AiObjectClass) =>
    setDraft({
      ...EMPTY_DRAFT,
      id: row.id,
      description: row.description ?? '',
      datasetId: String(row.dataset_id),
      className: row.class_name,
      classIndex: String(row.class_index),
    });
  const closeEditor = () => setDraft(null);

  /** Empty when the draft is saveable, otherwise the reason. */
  const draftError = useMemo(() => {
    if (!draft) return null;
    if (section === 'classes') {
      if (!draft.className.trim()) return t('Class Name is required');
      if (!draft.datasetId) return t('Dataset is required');
      if (!Number.isInteger(Number(draft.classIndex))) return t('Class Index must be a whole number');
      return null;
    }
    if (!draft.name.trim()) return t('Name is required');
    if (section === 'datasets' && !Number.isInteger(Number(draft.numClasses))) {
      return t('Number of Classes must be a whole number');
    }
    return null;
  }, [draft, section, t]);

  const saveMutation = useMutation({
    mutationFn: async (d: AiDraft) => {
      if (section === 'datasets') {
        const body = {
          name: d.name.trim(),
          num_classes: Number(d.numClasses) || 0,
          version: orNull(d.version),
          description: orNull(d.description),
        };
        return d.id == null ? createAiDataset(body) : updateAiDataset(d.id, body);
      }
      if (section === 'models') {
        const body = {
          name: d.name.trim(),
          framework: (d.framework || null) as AiFramework | null,
          version: orNull(d.version),
          description: orNull(d.description),
          model_path: orNull(d.modelPath),
          dataset_id: d.datasetId === '' ? null : Number(d.datasetId),
          enabled: d.enabled ? 1 : 0,
        };
        return d.id == null ? createAiModel(body) : updateAiModel(d.id, body);
      }
      const body = {
        dataset_id: Number(d.datasetId),
        class_name: d.className.trim(),
        class_index: Number(d.classIndex) || 0,
        description: orNull(d.description),
      };
      return d.id == null ? createAiObjectClass(body) : updateAiObjectClass(d.id, body);
    },
    onSuccess: () => {
      toast.success(t('Saved'));
      setDraft(null);
    },
    onError: (err) => toast.apiError(err),
    onSettled: invalidate,
  });

  return {
    section,
    isAuthenticated,
    isLoading: activeQ.isLoading,
    isError: activeQ.isError,
    error: activeQ.error as Error | null,
    refetch: () => void activeQ.refetch(),
    canEdit,

    datasets,
    models,
    classes,
    datasetName,
    rowCount,

    datasetFilter,
    setDatasetFilter: (id: number | null) => {
      setDatasetFilter(id);
      setMarkedIds(new Set());
    },

    markedIds,
    markedCount: markedIds.size,
    toggleMarked,
    toggleAllMarked,
    allMarked,
    confirmingDelete,
    askDelete: () => setConfirmingDelete(true),
    cancelDelete: () => setConfirmingDelete(false),
    confirmDelete: () => deleteMutation.mutate([...markedIds]),
    isDeleting: deleteMutation.isPending,

    draft,
    setField,
    openCreate,
    openDataset,
    openModel,
    openClass,
    closeEditor,
    draftError,
    save: () => {
      if (draft && !draftError) saveMutation.mutate(draft);
    },
    isSaving: saveMutation.isPending,
  };
}
