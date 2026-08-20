import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getMonitors } from '@/api/monitors';
import { useAuthStore } from '@/stores/auth';
import { useMontageStore } from '@/stores/montage';
import {
  bannerLayout,
  gridLayout,
  leaf,
  leafCount,
  leafMonitors,
  pipLayout,
  removeAt,
  setMonitorAt,
  splitAt,
  type LayoutNode,
  type Path,
} from './mosaic';
import type { Monitor, StreamProtocol } from '@/types';

/* ------------------------------------------------------------------------ */
/*  Preset layouts                                                          */
/* ------------------------------------------------------------------------ */

export interface MontagePreset {
  id: string;
  label: string;
  build: (monitorIds: number[]) => LayoutNode;
  /** Number of monitors a preset visually expects; layouts gracefully
   *  pad with null leaves when fewer are available. */
  size: number;
}

/** Layout presets with labels in the active language — use this to render. */
export function useMontagePresets(): MontagePreset[] {
  const { t } = useTranslation();
  return useMemo(() => [
    { id: '1x1',     label: t('1×1'),     size: 1, build: (m) => gridLayout(1, 1, m) },
    { id: '2x2',     label: t('2×2'),     size: 4, build: (m) => gridLayout(2, 2, m) },
    { id: '3x3',     label: t('3×3'),     size: 9, build: (m) => gridLayout(3, 3, m) },
    { id: '4x4',     label: t('4×4'),     size: 16, build: (m) => gridLayout(4, 4, m) },
    { id: 'banner',  label: t('Banner'),  size: 4, build: bannerLayout },
    { id: 'pip',     label: t('PIP'),     size: 4, build: pipLayout },
  ], [t]);
}

/**
 * English-only snapshot of the presets (ids + builders). Kept for callers
 * that only need the structure; anything rendering a label should call
 * `useMontagePresets()`.
 */
export const MONTAGE_PRESETS: MontagePreset[] = [
  { id: '1x1',     label: '1×1',     size: 1, build: (m) => gridLayout(1, 1, m) },
  { id: '2x2',     label: '2×2',     size: 4, build: (m) => gridLayout(2, 2, m) },
  { id: '3x3',     label: '3×3',     size: 9, build: (m) => gridLayout(3, 3, m) },
  { id: '4x4',     label: '4×4',     size: 16, build: (m) => gridLayout(4, 4, m) },
  { id: 'banner',  label: 'Banner',  size: 4, build: bannerLayout },
  { id: 'pip',     label: 'PIP',     size: 4, build: pipLayout },
];

/* ------------------------------------------------------------------------ */
/*  Mosaic editor (modern layout)                                           */
/* ------------------------------------------------------------------------ */

export interface MontagePageState {
  isAuthenticated: boolean;
  tree: LayoutNode;
  setTree: (next: LayoutNode | ((prev: LayoutNode) => LayoutNode)) => void;
  protocol: StreamProtocol;
  monitors: Monitor[];
  enabledMonitors: Monitor[];
  monitorById: Map<number, Monitor>;
  /** Ids that survive the shared MonitorFilterBar. */
  filteredIds: Set<number>;
  setFilteredMonitors: (monitors: Monitor[]) => void;
  /** Bumped to remount every StreamCell (Restart / protocol switch). */
  streamGeneration: number;
  cellsOnScreen: number;
  /** Attach to the mosaic viewport; fullscreen targets it. */
  gridRef: RefObject<HTMLDivElement | null>;
  /** Cell awaiting a monitor pick, or null. */
  picking: Path | null;
  split: (path: Path, direction: 'row' | 'column') => void;
  close: (path: Path) => void;
  applyPreset: (preset: MontagePreset) => void;
  restartAll: () => void;
  changeProtocol: (next: 'webrtc' | 'hls') => void;
  toggleFullscreen: () => void;
  chooseMonitor: (path: Path) => void;
  pickMonitor: (monitorId: number) => void;
  cancelPick: () => void;
}

export function useMontagePage(): MontagePageState {
  const { isAuthenticated } = useAuthStore();
  const gridRef = useRef<HTMLDivElement>(null);

  const { tree, protocol, setTree, setProtocol } = useMontageStore();

  // Generation counter — bumped to force every StreamCell to unmount and
  // remount, used by the Restart button and protocol switching to acquire
  // streams fresh.
  const [streamGeneration, setStreamGeneration] = useState(0);

  const { data: monitorsData } = useQuery({
    queryKey: ['monitors'],
    queryFn: () => getMonitors({ page: 1, page_size: 50 }),
    enabled: isAuthenticated,
    refetchInterval: 30_000,
  });
  // react-query keeps `items` identity across unchanged refetches (structural
  // sharing), so memoising on it gives the hydration effect a stable dep.
  const monitors: Monitor[] = useMemo(() => monitorsData?.items ?? [], [monitorsData?.items]);
  const enabledMonitors = useMemo(
    () => monitors.filter((m) => m.capturing !== 'None'),
    [monitors],
  );
  const monitorById = new Map(monitors.map((m) => [m.id, m]));

  // Filter chip result — the subset of monitors that survive the shared
  // MonitorFilterBar. Cells whose monitor falls outside this set render a
  // muted "filtered" placeholder so the mosaic layout itself is unchanged
  // (we don't want a chip selection to disrupt a saved arrangement).
  const [filteredMonitors, setFilteredMonitors] = useState<Monitor[]>(monitors);
  const filteredIds = useMemo(
    () => new Set(filteredMonitors.map((m) => m.id)),
    [filteredMonitors],
  );

  // First-time hydration: if the persisted tree has no monitors assigned,
  // seed it with as many available monitors as the tree has cells.
  useEffect(() => {
    const currentLeaves = leafMonitors(tree);
    const anyAssigned = currentLeaves.some((id) => id != null);
    if (anyAssigned) return;
    if (enabledMonitors.length === 0) return;

    // Replace each null leaf in order with the next available monitor.
    const ids = enabledMonitors.map((m) => m.id);
    let idx = 0;
    const filled = mapLeaves(tree, () => {
      const next = ids[idx];
      idx += 1;
      return next != null ? leaf(next) : leaf(null);
    });
    setTree(filled);
  }, [enabledMonitors, tree, setTree]);

  /* ----- Layout edit handlers ------------------------------------- */

  const split = useCallback(
    (path: Path, direction: 'row' | 'column') => {
      // Pick a monitor not already on screen, if any.
      const onScreen = new Set(leafMonitors(tree).filter((v): v is number => v != null));
      const next = enabledMonitors.find((m) => !onScreen.has(m.id));
      setTree((prev) => splitAt(prev, path, direction, next?.id ?? null));
    },
    [tree, enabledMonitors, setTree],
  );

  const close = useCallback(
    (path: Path) => setTree((prev) => removeAt(prev, path)),
    [setTree],
  );

  const applyPreset = (preset: MontagePreset) => {
    // Reuse currently-shown monitors first; pad with unused enabled
    // monitors; pad the rest with null.
    const onScreen = leafMonitors(tree).filter((v): v is number => v != null);
    const unused = enabledMonitors
      .map((m) => m.id)
      .filter((id) => !onScreen.includes(id));
    const seed = [...onScreen, ...unused].slice(0, preset.size);
    setTree(preset.build(seed));
  };

  const restartAll = () => setStreamGeneration((g) => g + 1);

  const changeProtocol = (next: 'webrtc' | 'hls') => {
    if (next === protocol) return;
    setProtocol(next);
    setStreamGeneration((g) => g + 1);
  };

  const toggleFullscreen = useCallback(() => {
    if (!gridRef.current) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else gridRef.current.requestFullscreen().catch(() => {});
  }, []);

  /* ----- Monitor picker for a vacant cell ------------------------- */
  const [picking, setPicking] = useState<Path | null>(null);
  const chooseMonitor = (path: Path) => setPicking(path);
  const pickMonitor = (mid: number) => {
    if (!picking) return;
    setTree((prev) => setMonitorAt(prev, picking, mid));
    setPicking(null);
  };

  return {
    isAuthenticated,
    tree,
    setTree,
    protocol,
    monitors,
    enabledMonitors,
    monitorById,
    filteredIds,
    setFilteredMonitors,
    streamGeneration,
    cellsOnScreen: leafCount(tree),
    gridRef,
    picking,
    split,
    close,
    applyPreset,
    restartAll,
    changeProtocol,
    toggleFullscreen,
    chooseMonitor,
    pickMonitor,
    cancelPick: () => setPicking(null),
  };
}

/* ------------------------------------------------------------------------ */
/*  Flat wall (classic layout) — capturing monitors only, no mosaic         */
/* ------------------------------------------------------------------------ */

export interface MontageWallPageState {
  isAuthenticated: boolean;
  /** Every monitor, for the filter bar. */
  monitors: Monitor[];
  /** Capturing monitors that also survive the filter bar. */
  visibleMonitors: Monitor[];
  setFilteredMonitors: (monitors: Monitor[]) => void;
}

/**
 * Legacy ZM only shows capturing monitors on the wall; this intersects that
 * gate with the shared filter bar's selection.
 */
export function useMontageWallPage(): MontageWallPageState {
  const { isAuthenticated } = useAuthStore();
  const { data: monitorsData } = useQuery({
    queryKey: ['monitors'],
    queryFn: () => getMonitors({ page: 1, page_size: 50 }),
    enabled: isAuthenticated,
    refetchInterval: 30_000,
  });
  // Stabilise the reference: react-query returns a new `items` array
  // identity on each render even when the rows are unchanged, so wrap in
  // useMemo keyed on the array reference to keep downstream memoisation
  // useful.
  const monitors: Monitor[] = useMemo(
    () => monitorsData?.items ?? [],
    [monitorsData?.items],
  );
  // Legacy ZM only shows capturing monitors on the wall.
  const capturingMonitors = useMemo(
    () => monitors.filter((m) => m.capturing !== 'None'),
    [monitors],
  );
  const [filteredMonitors, setFilteredMonitors] = useState<Monitor[]>(monitors);
  // Intersect "capturing" (legacy gate) with the filter-bar selection so the
  // grid never shows a disabled cam, but operator chip filters still apply.
  const visibleMonitors = useMemo(() => {
    const ids = new Set(filteredMonitors.map((m) => m.id));
    return capturingMonitors.filter((m) => ids.has(m.id));
  }, [capturingMonitors, filteredMonitors]);

  return { isAuthenticated, monitors, visibleMonitors, setFilteredMonitors };
}

/* ------------------------------------------------------------------------ */
/*  Tree helpers                                                            */
/* ------------------------------------------------------------------------ */

/** Walk the tree and replace each leaf with the result of `f`. */
function mapLeaves(node: LayoutNode, f: (l: LayoutNode & { type: 'leaf' }) => LayoutNode): LayoutNode {
  if (node.type === 'leaf') return f(node);
  return {
    ...node,
    children: node.children.map((c) => mapLeaves(c, f)),
  };
}
