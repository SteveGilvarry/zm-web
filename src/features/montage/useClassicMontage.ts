import { useMemo, useState, type CSSProperties } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  createMontageLayout,
  deleteMontageLayout,
  listMontageLayouts,
  type MontageLayout,
} from '@/api/montageLayouts';
import { useAuthStore } from '@/stores/auth';
import { useMontageStore, type MontageStatusPosition } from '@/stores/montage';
import { useToast } from '@/components/common/toastStore';
import { displayDimensions } from '@/features/monitors/orientation';
import { DEFAULT_STAGE_SIZE, stageStyle, type StageSize } from '@/features/monitors/watchStage';
import type { Monitor, StreamProtocol } from '@/types';
import { MONTAGE_PRESETS, autoColumns, DEFAULT_PRESET_ID } from './classicPresets';
import { parsePositions, serialisePositions } from './layoutFormat';
import { gridLayout, leafMonitors } from './mosaic';

const QUERY_KEY = ['montageLayouts'] as const;

export interface ClassicLayoutOption {
  /** `preset:<id>` or `saved:<id>`. */
  value: string;
  label: string;
}

export interface ClassicMontageState {
  layoutId: string;
  setLayoutId: (id: string) => void;
  /** Presets first (Auto, 1 Wide … 48 Wide), then saved layouts by name. */
  layoutOptions: ClassicLayoutOption[];
  /** Saved layouts only (the Delete button's target). */
  isSavedLayout: boolean;
  columns: number;
  /** Monitors in display order (a saved layout fixes the order). */
  monitors: Monitor[];
  /** Legacy "Edit Layout": cells can be dragged to reorder. */
  editMode: boolean;
  beginEdit: () => void;
  cancelEdit: () => void;
  reorder: (fromId: number, toId: number) => void;
  /** Save the current arrangement under a name (prompts). */
  save: () => void;
  remove: () => void;
  busy: boolean;
  statusPosition: MontageStatusPosition;
  setStatusPosition: (p: MontageStatusPosition) => void;
  protocol: StreamProtocol;
  setProtocol: (p: StreamProtocol) => void;
  stage: {
    size: StageSize;
    setWidth: (v: string) => void;
    setHeight: (v: string) => void;
    setScale: (v: string) => void;
    /** Style for one cell of `monitor`. */
    styleFor: (monitor: Monitor) => CSSProperties;
  };
}

/** `1 Wide` … `48 Wide` → its column count; anything else → null. */
export function presetColumnsFromName(name: string): number | null {
  const m = /^(\d+)\s+Wide$/i.exec(name.trim());
  return m ? Number(m[1]) : null;
}

/**
 * Legacy montage.php controls over the classic flat grid: the Layout select
 * (presets + saved rows, shared with legacy through `layoutFormat.ts`),
 * Edit / Save / Delete layout, monitor-status position, and Width / Height /
 * Scale for the cells.
 */
export function useClassicMontage(visibleMonitors: Monitor[]): ClassicMontageState {
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuthStore();
  const toast = useToast();
  const qc = useQueryClient();
  const { protocol, setProtocol, statusPosition, setStatusPosition } = useMontageStore();

  const [layoutId, setLayoutIdState] = useState(`preset:${DEFAULT_PRESET_ID}`);
  const [editMode, setEditMode] = useState(false);
  const [draftOrder, setDraftOrder] = useState<number[] | null>(null);
  const [size, setSize] = useState<StageSize>(DEFAULT_STAGE_SIZE);

  const layoutsQ = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => listMontageLayouts({ page: 1, page_size: 200 }),
    enabled: isAuthenticated,
  });
  const saved = useMemo(() => {
    const rows = layoutsQ.data?.items ?? [];
    return rows
      .map((l) => ({ ...l, parsed: parsePositions(l.positions) }))
      .filter((l): l is MontageLayout & { parsed: NonNullable<ReturnType<typeof parsePositions>> } => l.parsed != null)
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  }, [layoutsQ.data]);

  const layoutOptions: ClassicLayoutOption[] = [
    ...MONTAGE_PRESETS.map((p) => ({
      value: `preset:${p.id}`,
      label: p.columns == null ? t('Auto') : t('{{n}} Wide', { n: p.columns }),
    })),
    ...saved.map((l) => ({ value: `saved:${l.id}`, label: l.name })),
  ];

  const activeSaved = layoutId.startsWith('saved:')
    ? saved.find((l) => `saved:${l.id}` === layoutId)
    : undefined;
  const preset = MONTAGE_PRESETS.find((p) => `preset:${p.id}` === layoutId);

  // A saved layout fixes the order; the monitors it names come first, the
  // rest (new cameras) follow. Presets keep the filter order.
  const monitors = useMemo(() => {
    const byId = new Map(visibleMonitors.map((m) => [m.id, m]));
    const order = draftOrder
      ?? (activeSaved ? leafMonitors(activeSaved.parsed.tree).filter((id): id is number => id != null) : null);
    if (!order) return visibleMonitors;
    const picked = order.map((id) => byId.get(id)).filter((m): m is Monitor => !!m);
    const rest = visibleMonitors.filter((m) => !order.includes(m.id));
    return [...picked, ...rest];
  }, [visibleMonitors, draftOrder, activeSaved]);

  const columns = preset
    ? (preset.columns ?? autoColumns(monitors.length))
    : (activeSaved ? (presetColumnsFromName(activeSaved.name) ?? autoColumns(monitors.length)) : autoColumns(monitors.length));

  const invalidate = () => qc.invalidateQueries({ queryKey: QUERY_KEY });
  const createMutation = useMutation({
    mutationFn: (name: string) => {
      const ids = monitors.map((m) => m.id);
      const rows = Math.max(1, Math.ceil(ids.length / columns));
      return createMontageLayout({
        name,
        positions: serialisePositions(gridLayout(columns, rows, ids), statusPosition),
        user_id: user?.uid ?? 0,
      });
    },
    onSuccess: (created) => {
      invalidate();
      setLayoutIdState(`saved:${created.id}`);
      setDraftOrder(null);
      setEditMode(false);
      toast.success(t('Layout "{{name}}" saved', { name: created.name }));
    },
    onError: toast.apiError,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteMontageLayout(id),
    onSuccess: () => {
      invalidate();
      setLayoutIdState(`preset:${DEFAULT_PRESET_ID}`);
      toast.success(t('Layout deleted'));
    },
    onError: toast.apiError,
  });

  const setLayoutId = (id: string) => {
    setLayoutIdState(id);
    setDraftOrder(null);
    setEditMode(false);
  };

  const reorder = (fromId: number, toId: number) => {
    if (fromId === toId) return;
    const order = monitors.map((m) => m.id);
    const from = order.indexOf(fromId);
    const to = order.indexOf(toId);
    if (from < 0 || to < 0) return;
    const next = order.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setDraftOrder(next);
  };

  const save = () => {
    const name = window.prompt(t('Layout name'), activeSaved?.name ?? '');
    if (!name || !name.trim()) return;
    createMutation.mutate(name.trim());
  };
  const remove = () => {
    if (!activeSaved) return;
    if (window.confirm(t('Delete layout "{{name}}"?', { name: activeSaved.name }))) {
      deleteMutation.mutate(activeSaved.id);
    }
  };

  return {
    layoutId,
    setLayoutId,
    layoutOptions,
    isSavedLayout: !!activeSaved,
    columns,
    monitors,
    editMode,
    beginEdit: () => setEditMode(true),
    cancelEdit: () => { setEditMode(false); setDraftOrder(null); },
    reorder,
    save,
    remove,
    busy: createMutation.isPending || deleteMutation.isPending,
    statusPosition,
    setStatusPosition,
    protocol,
    setProtocol,
    stage: {
      size,
      setWidth: (width) => setSize((s) => ({ ...s, width })),
      setHeight: (height) => setSize((s) => ({ ...s, height })),
      setScale: (scale) => setSize((s) => ({ ...s, scale })),
      styleFor: (m) => stageStyle(size, displayDimensions(m)),
    },
  };
}
