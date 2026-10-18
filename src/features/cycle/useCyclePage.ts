import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAllMonitors } from '@/api/monitors';
import { useAuthStore } from '@/stores/auth';
import { useRouteSearch, searchInt } from '@/features/monitors/useRouteSearch';
import { displayDimensions } from '@/features/monitors/orientation';
import { stageStyle, type StageSize } from '@/features/monitors/watchStage';
import { useMontageStore } from '@/stores/montage';
import { useZmConfig } from '@/features/config/useZmConfig';
import type { Monitor } from '@/types';

export const CYCLE_DEFAULT_INTERVAL_S = 10;
export const CYCLE_INTERVAL_OPTIONS = [5, 10, 20, 30, 60] as const;

/** Legacy `?mode=stream|still`. */
export type CycleViewMode = 'stream' | 'stills';

export interface CycleRotationState {
  /** The monitor on stage, or undefined when the list is empty. */
  current: Monitor | undefined;
  /** Zero-based position of `current` in the rotation. */
  index: number;
  isPaused: boolean;
  intervalS: number;
  /** Seconds until the next auto-advance. */
  countdown: number;
  next: () => void;
  prev: () => void;
  togglePause: () => void;
  /** Stop the rotation (no-op when already paused). */
  pause: () => void;
  setInterval: (seconds: number) => void;
  jumpTo: (index: number) => void;
}

export interface CycleRotationOptions {
  /** Start on this monitor (legacy `?mid=`) once it appears in the list. */
  startMonitorId?: number;
  /**
   * Seconds per monitor before the operator touches the control — legacy
   * `ZM_WEB_REFRESH_CYCLE`. Arrives asynchronously with the config table, so
   * it is a *default*: an operator override outlives it.
   */
  defaultIntervalS?: number;
  /** Start paused (the watch sidebar does unless the page has `cycle=true`). */
  startPaused?: boolean;
  /**
   * The countdown only runs while this is true. The watch sidebar passes
   * "the stream is playing", as legacy's `nextCycleView` only counts down
   * once the player has frames (`readyState >= 2`).
   */
  canTick?: boolean;
  /**
   * Move on now: the stream gave up (legacy skips a monitor whose player hit
   * its error limit). Only acts while the rotation is running.
   */
  skip?: boolean;
  /**
   * Behave like legacy cycle.js, where every move is a page load
   * (`window.location.replace`): Prev, Next and a nav-pill resume a paused
   * cycle, and a filter change starts again from the first monitor.
   * Without it a pause survives a manual step and the monitor on stage
   * stays put while it survives the filter.
   */
  reloadOnMove?: boolean;
}

/**
 * The rotation itself: position, timer, transport. Pure of data fetching so
 * the Watch page can host a cycle sidebar over its own monitor list.
 */
export function useCycleRotation(monitors: Monitor[], options: CycleRotationOptions = {}): CycleRotationState {
  const reloadOnMove = options.reloadOnMove ?? false;
  const [index, setIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(options.startPaused ?? false);
  const canTick = options.canTick ?? true;
  const skip = options.skip ?? false;
  const defaultIntervalS = options.defaultIntervalS ?? CYCLE_DEFAULT_INTERVAL_S;
  // The operator's choice wins over the configured default for the session.
  const [overrideIntervalS, setOverrideIntervalS] = useState<number | null>(null);
  const intervalS = overrideIntervalS ?? defaultIntervalS;
  const [countdown, setCountdown] = useState<number>(intervalS);
  // The config lands a render or two after mount; restart the countdown on it
  // during render rather than from an effect (no double paint).
  const [countdownFor, setCountdownFor] = useState<number>(intervalS);
  if (countdownFor !== intervalS) {
    setCountdownFor(intervalS);
    setCountdown(intervalS);
  }
  // The requested start monitor wins until the operator moves off it.
  const [pendingStart, setPendingStart] = useState<number | undefined>(options.startMonitorId);

  const len = monitors.length;
  const startIdx = pendingStart != null ? monitors.findIndex((m) => m.id === pendingStart) : -1;

  // The rotation list changed (the filter row, a monitor added or gone).
  // Index arithmetic alone would put an arbitrary camera on stage, so follow
  // the one that was showing, or start over from the first. Adjusted during
  // render from the previous list kept in state (no corrective effect).
  const ids = monitors.map((m) => m.id);
  const idsKey = ids.join(',');
  const [prevIds, setPrevIds] = useState<number[]>(ids);
  if (prevIds.join(',') !== idsKey) {
    setPrevIds(ids);
    const startSurvives = pendingStart != null && ids.includes(pendingStart);
    // An emptied list (the Watch sidebar closing) keeps its place for when
    // the monitors come back.
    if (prevIds.length > 0 && ids.length > 0 && !startSurvives) {
      const prevStart = pendingStart != null ? prevIds.indexOf(pendingStart) : -1;
      const shownId = prevIds[prevStart >= 0 ? prevStart : index % prevIds.length];
      const kept = reloadOnMove ? -1 : ids.indexOf(shownId);
      setPendingStart(undefined);
      setIndex(kept >= 0 ? kept : 0);
      if (kept < 0) setCountdown(intervalS);
      if (reloadOnMove) setIsPaused(false);
    }
  }
  // Clamp during render so a shrinking list never needs a corrective effect.
  const safeIndex = len === 0 ? 0 : startIdx >= 0 ? startIdx : index % len;
  // The timer reads the live position through a ref so it never advances
  // from a stale closure (the start monitor is resolved during render).
  const safeIndexRef = useRef(safeIndex);
  useEffect(() => {
    safeIndexRef.current = safeIndex;
  });

  const skipRef = useRef(skip);
  useEffect(() => {
    skipRef.current = skip;
  });

  useEffect(() => {
    if (isPaused || len <= 1 || !(canTick || skip)) return;
    const id = window.setInterval(() => {
      setCountdown((c) => {
        if (c <= 1 || skipRef.current) {
          setPendingStart(undefined);
          setIndex((safeIndexRef.current + 1) % Math.max(len, 1));
          return intervalS;
        }
        return c - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [isPaused, intervalS, len, canTick, skip]);

  const move = (to: number) => {
    if (len === 0) return;
    setPendingStart(undefined);
    setIndex(((to % len) + len) % len);
    setCountdown(intervalS);
    if (reloadOnMove) setIsPaused(false);
  };

  return {
    current: monitors[safeIndex],
    index: safeIndex,
    isPaused,
    intervalS,
    countdown,
    next: () => move(safeIndex + 1),
    prev: () => move(safeIndex - 1),
    togglePause: () => {
      setIsPaused((p) => {
        if (p) setCountdown(intervalS); // resuming: start the next tick fresh
        return !p;
      });
    },
    pause: () => setIsPaused(true),
    setInterval: (seconds) => { setOverrideIntervalS(seconds); setCountdown(seconds); },
    jumpTo: move,
  };
}

export interface CyclePageOptions {
  /**
   * Rotation source supplied by the caller (e.g. a classic filter row's
   * survivors). When omitted the hook rotates over `setFilteredMonitors`'s
   * list, or every monitor.
   */
  monitors?: Monitor[];
  /** See `CycleRotationOptions.reloadOnMove` (the classic skin). */
  reloadOnMove?: boolean;
  /**
   * Height left for the stage, measured by the page. With Width, Height and
   * Scale all on auto the stage then fits the window as legacy
   * `scaleToFit` does, instead of only the column's width.
   */
  availableHeightPx?: number;
}

/** The monitor list the Cycle page rotates over, shared by both skins. */
export function useCycleMonitors() {
  const { isAuthenticated } = useAuthStore();
  const q = useQuery({
    queryKey: ['monitors', 'all'],
    queryFn: () => getAllMonitors(),
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  });
  const allMonitors = useMemo(() => q.data ?? [], [q.data]);
  return {
    allMonitors,
    isLoading: q.isLoading,
    isError: q.isError,
    error: q.error as unknown,
    refetch: () => { void q.refetch(); },
  };
}

export interface CyclePageState extends CycleRotationState {
  isAuthenticated: boolean;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
  /** Every monitor, for a filter bar. */
  allMonitors: Monitor[];
  /** Filter-bar output; defaults to every monitor. */
  setFilteredMonitors: (monitors: Monitor[]) => void;
  /** Monitors in rotation (capturing ∩ filtered). */
  monitors: Monitor[];
  viewMode: CycleViewMode;
  setViewMode: (mode: CycleViewMode) => void;
  stage: {
    size: StageSize;
    setWidth: (v: string) => void;
    setHeight: (v: string) => void;
    setScale: (v: string) => void;
    /** Style for the current monitor's stage box. */
    style: CSSProperties;
  };
}

/**
 * The stage box. Everything on auto with a measured height is legacy
 * `scaleToFit`: as tall as the window allows, unless that is wider than the
 * column, then as wide as the column. Any explicit choice is `stageStyle`'s.
 */
export function cycleStageStyle(
  size: StageSize,
  dims: { width: number; height: number },
  availableHeightPx?: number,
): CSSProperties {
  const fitWindow = size.width === 'auto' && size.height === 'auto' && size.scale === '0';
  if (!fitWindow || !availableHeightPx || availableHeightPx <= 0 || dims.width <= 0 || dims.height <= 0) {
    return stageStyle(size, dims, availableHeightPx);
  }
  // The width the height allows; `max-width` clamps it to the column and the
  // aspect ratio derives the height from whichever width wins.
  const byHeight = Math.floor((availableHeightPx * dims.width) / dims.height);
  return {
    aspectRatio: `${dims.width} / ${dims.height}`,
    width: `${byHeight}px`,
    maxWidth: '100%',
  };
}

/**
 * Data + rotation state for the Cycle page. Skin-agnostic: both skins render
 * from this one hook and only differ in layout and in what they put on stage
 * (live stream vs refreshing snapshot). Honours `?monitor_id=`.
 */
export function useCyclePage(options: CyclePageOptions = {}): CyclePageState {
  const { isAuthenticated } = useAuthStore();
  const search = useRouteSearch();
  const startMonitorId = searchInt(search, 'monitor_id');

  const q = useCycleMonitors();
  const allMonitors = q.allMonitors;
  const [filtered, setFilteredMonitors] = useState<Monitor[] | null>(null);
  const source = options.monitors ?? filtered;
  const monitors = useMemo(() => {
    const ids = source ? new Set(source.map((m) => m.id)) : null;
    return allMonitors.filter((m) => m.capturing !== 'None' && (!ids || ids.has(m.id)));
  }, [allMonitors, source]);

  // Legacy `ZM_WEB_REFRESH_CYCLE` — seconds each monitor holds the stage.
  const configIntervalS = useZmConfig('ZM_WEB_REFRESH_CYCLE', CYCLE_DEFAULT_INTERVAL_S);
  const rotation = useCycleRotation(monitors, {
    startMonitorId, defaultIntervalS: configIntervalS, reloadOnMove: options.reloadOnMove,
  });
  const [viewMode, setViewMode] = useState<CycleViewMode>('stream');
  const size = useMontageStore((s) => s.cycleStage);
  const setSize = useMontageStore((s) => s.setCycleStage);

  return {
    ...rotation,
    isAuthenticated,
    isLoading: q.isLoading,
    isError: q.isError,
    error: q.error,
    refetch: q.refetch,
    allMonitors,
    setFilteredMonitors,
    monitors,
    viewMode,
    setViewMode,
    stage: {
      size,
      // Legacy cycle.js: `changeSize` puts Scale back to Auto, `changeScale`
      // puts Width and Height back to auto. Reads the live store, not this
      // render's `size`, so two setters fired in one batch do not clobber
      // each other.
      setWidth: (width) => setSize({ ...useMontageStore.getState().cycleStage, width, scale: '0' }),
      setHeight: (height) => setSize({ ...useMontageStore.getState().cycleStage, height, scale: '0' }),
      setScale: (scale) => setSize({ width: 'auto', height: 'auto', scale }),
      style: cycleStageStyle(
        size,
        rotation.current ? displayDimensions(rotation.current) : { width: 16, height: 9 },
        options.availableHeightPx,
      ),
    },
  };
}
