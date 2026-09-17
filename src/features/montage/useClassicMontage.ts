import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
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
import { stageStyle, type StageSize } from '@/features/monitors/watchStage';
import type { Monitor, StreamProtocol } from '@/types';
import { usePerms } from '@/features/auth/usePerms';
import { MONTAGE_PRESETS, autoColumns, DEFAULT_PRESET_ID } from './classicPresets';
import { alignItems, measureItems, presetItems, reorderItems, resizeItem } from './gridItems';
import { parsePositions, serialiseGridStackPositions, type GridStackItem } from './layoutFormat';
import { aspectRatioFor, averageRatio } from './ratio';

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
  /**
   * Tile geometry on legacy's 48-column canvas (`Positions.gridStack`), or
   * null while a preset is showing and nothing is being edited — then the
   * wall is the plain `columns`-wide grid.
   */
  items: GridStackItem[] | null;
  /** Legacy "Edit Layout": cells can be dragged to reorder and resized. */
  editMode: boolean;
  beginEdit: () => void;
  cancelEdit: () => void;
  reorder: (fromId: number, toId: number) => void;
  /** Set one tile's width in grid columns (1–48) — legacy's resize handles. */
  resizeTile: (monitorId: number, columns: number) => void;
  /** The wall element, so Save can measure the tiles the way legacy does. */
  gridRef: (el: HTMLDivElement | null) => void;
  /**
   * Legacy's inline Name field: seeded from the layout being edited, saved
   * with `save()`. Empty means "keep the current layout's name".
   */
  saveName: string;
  setSaveName: (name: string) => void;
  /** Why the last save was refused (preset name, someone else's layout). */
  saveError: string | null;
  /** Save the current arrangement under `saveName`. */
  save: () => void;
  remove: () => void;
  /** Legacy gates Delete on System Edit; Save is open to any user. */
  canDelete: boolean;
  busy: boolean;
  statusPosition: MontageStatusPosition;
  setStatusPosition: (p: MontageStatusPosition) => void;
  /** Legacy `zmMontageShowZones`: draw zone polygons over the live tiles. */
  showZones: boolean;
  setShowZones: (show: boolean) => void;
  /** Legacy Ratio select: one choice for every tile. */
  ratio: string;
  setRatio: (ratio: string) => void;
  /** That tile's Ratio (its own override, else the global one). */
  ratioFor: (monitorId: number) => string;
  setRatioFor: (monitorId: number, ratio: string) => void;
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

/** Legacy `isPresetLayout`: the built-in names nobody may overwrite. */
export function isPresetLayoutName(name: string): boolean {
  const wanted = name.trim().toLowerCase();
  return MONTAGE_PRESETS.some((p) => p.label.toLowerCase() === wanted);
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
  const { can } = usePerms();
  const {
    protocol, setProtocol, statusPosition, setStatusPosition,
    classicLayoutId, setClassicLayoutId, showZones, setShowZones,
    montageStage: size, setMontageStage: setSize,
    montageRatio, setMontageRatio, montageRatioById, setMontageRatioFor,
  } = useMontageStore();

  const [editMode, setEditMode] = useState(false);
  const [draftItems, setDraftItems] = useState<GridStackItem[] | null>(null);
  const gridEl = useRef<HTMLDivElement | null>(null);
  const gridRef = useCallback((el: HTMLDivElement | null) => { gridEl.current = el; }, []);
  const [saveName, setSaveName] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

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

  const activeSaved = classicLayoutId.startsWith('saved:')
    ? saved.find((l) => `saved:${l.id}` === classicLayoutId)
    : undefined;
  // A persisted saved layout can be deleted from another tab or another
  // session; once the list has loaded without it, fall back to Auto.
  const layoutId = classicLayoutId.startsWith('saved:') && layoutsQ.isSuccess && !activeSaved
    ? `preset:${DEFAULT_PRESET_ID}`
    : classicLayoutId;
  const preset = MONTAGE_PRESETS.find((p) => `preset:${p.id}` === layoutId);

  // A saved layout carries its own Ratio choices (legacy `monitorRatio`).
  const savedRatios = activeSaved?.parsed.monitorRatio;
  const appliedRatiosFor = useRef<string | null>(null);
  useEffect(() => {
    if (appliedRatiosFor.current === layoutId) return;
    appliedRatiosFor.current = layoutId;
    if (savedRatios) useMontageStore.getState().setMontageRatios(savedRatios);
  }, [layoutId, savedRatios]);

  // A saved layout fixes the order; the monitors it names come first, the
  // rest (new cameras) follow. Presets keep the filter order.
  const monitors = useMemo(() => {
    const byId = new Map(visibleMonitors.map((m) => [m.id, m]));
    const source = draftItems ?? activeSaved?.parsed.items;
    if (!source) return visibleMonitors;
    const order = source.map((i) => Number(i.id));
    const picked = order.map((id) => byId.get(id)).filter((m): m is Monitor => !!m);
    const rest = visibleMonitors.filter((m) => !order.includes(m.id));
    return [...picked, ...rest];
  }, [visibleMonitors, draftItems, activeSaved]);

  const columns = preset
    ? (preset.columns ?? autoColumns(monitors.length))
    : (activeSaved ? (presetColumnsFromName(activeSaved.name) ?? autoColumns(monitors.length)) : autoColumns(monitors.length));

  // Tile geometry, legacy's `Positions.gridStack`. A saved layout keeps the
  // widths (and the gaps) it was saved with; a preset only needs one while
  // it is being edited, since Edit Layout resizes tiles column by column.
  const savedItems = activeSaved?.parsed.items;
  const items = useMemo(() => {
    const ids = monitors.map((m) => m.id);
    if (draftItems) return alignItems(draftItems, ids, columns);
    if (savedItems) return alignItems(savedItems, ids, columns);
    return presetItems(ids, columns);
  }, [draftItems, savedItems, monitors, columns]);

  // Legacy's `auto` ratio is the preset nearest the mean of what is on screen.
  const avgRatio = useMemo(
    () => averageRatio(monitors.map((m) => displayDimensions(m))),
    [monitors],
  );

  const invalidate = () => qc.invalidateQueries({ queryKey: QUERY_KEY });
  const createMutation = useMutation({
    mutationFn: (name: string) => {
      const ratios: Record<number, string> = {};
      for (const m of monitors) ratios[m.id] = montageRatioById[m.id] ?? montageRatio;
      // y/h come off the rendered wall in 4 px rows, as gridstack's
      // `sizeToContent` would have measured them.
      const saved = measureItems(gridEl.current, items);
      return createMontageLayout({
        name,
        positions: serialiseGridStackPositions(saved, statusPosition, ratios),
        user_id: user?.uid ?? 0,
      });
    },
    onSuccess: (created) => {
      invalidate();
      setClassicLayoutId(`saved:${created.id}`);
      setDraftItems(null);
      setEditMode(false);
      setSaveName('');
      setSaveError(null);
      toast.success(t('Layout "{{name}}" saved', { name: created.name }));
    },
    onError: toast.apiError,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteMontageLayout(id),
    onSuccess: () => {
      invalidate();
      setClassicLayoutId(`preset:${DEFAULT_PRESET_ID}`);
      toast.success(t('Layout deleted'));
    },
    onError: toast.apiError,
  });

  const setLayoutId = (id: string) => {
    setClassicLayoutId(id);
    setDraftItems(null);
    setEditMode(false);
    setSaveError(null);
  };

  const reorder = (fromId: number, toId: number) => {
    const next = reorderItems(items, fromId, toId);
    if (next !== items) setDraftItems(next);
  };

  const resizeTile = (monitorId: number, width: number) => {
    const next = resizeItem(items, monitorId, width);
    if (next !== items) setDraftItems(next);
  };

  // Legacy `save_layout`: any user may save their own layout. What is
  // refused is a preset name, and renaming-in-place someone else's layout
  // without System Edit.
  const save = () => {
    const typed = saveName.trim();
    const name = typed || activeSaved?.name || '';
    if (!name) {
      setSaveError(t('Please give the layout a name.'));
      return;
    }
    if (isPresetLayoutName(name)) {
      setSaveError(t('You cannot use that name. It conflicts with the built in layouts.'));
      return;
    }
    if (!typed && activeSaved && user?.uid != null && activeSaved.user_id !== user.uid && !can('system', 'Edit')) {
      setSaveError(t("You cannot edit someone else's layouts. Please give the layout a new name."));
      return;
    }
    setSaveError(null);
    createMutation.mutate(name);
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
    // Presets lay out on the plain column grid until Edit Layout starts.
    items: activeSaved || draftItems || editMode ? items : null,
    editMode,
    beginEdit: () => {
      setEditMode(true);
      setSaveName(activeSaved?.name ?? '');
      setSaveError(null);
    },
    cancelEdit: () => {
      setEditMode(false);
      setDraftItems(null);
      setSaveName('');
      setSaveError(null);
    },
    reorder,
    resizeTile,
    gridRef,
    saveName,
    setSaveName: (name: string) => { setSaveName(name); setSaveError(null); },
    saveError,
    save,
    remove,
    canDelete: can('system', 'Edit'),
    busy: createMutation.isPending || deleteMutation.isPending,
    statusPosition,
    setStatusPosition,
    showZones,
    setShowZones,
    ratio: montageRatio,
    setRatio: setMontageRatio,
    ratioFor: (monitorId: number) => montageRatioById[monitorId] ?? montageRatio,
    setRatioFor: setMontageRatioFor,
    protocol,
    setProtocol,
    stage: {
      size,
      // Read the live store rather than this render's `size` so two setters
      // fired in one batch (Width then Height) do not clobber each other.
      setWidth: (width) => setSize({ ...useMontageStore.getState().montageStage, width }),
      setHeight: (height) => setSize({ ...useMontageStore.getState().montageStage, height }),
      setScale: (scale) => setSize({ ...useMontageStore.getState().montageStage, scale }),
      // The Ratio select shapes the tile; Width/Height/Scale still size it.
      styleFor: (m) => {
        const dims = displayDimensions(m);
        const aspectRatio = aspectRatioFor(montageRatioById[m.id] ?? montageRatio, dims, avgRatio);
        return { ...stageStyle(size, dims), ...(aspectRatio ? { aspectRatio } : {}) };
      },
    },
  };
}
