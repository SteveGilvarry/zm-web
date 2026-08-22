import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMonitors } from '@/api/monitors';
import { useAuthStore } from '@/stores/auth';
import { useRouteSearch, searchInt } from '@/features/monitors/useRouteSearch';
import { displayDimensions } from '@/features/monitors/orientation';
import { DEFAULT_STAGE_SIZE, stageStyle, type StageSize } from '@/features/monitors/watchStage';
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
  setInterval: (seconds: number) => void;
  jumpTo: (index: number) => void;
}

export interface CycleRotationOptions {
  /** Start on this monitor (legacy `?mid=`) once it appears in the list. */
  startMonitorId?: number;
}

/**
 * The rotation itself: position, timer, transport. Pure of data fetching so
 * the Watch page can host a cycle sidebar over its own monitor list.
 */
export function useCycleRotation(monitors: Monitor[], options: CycleRotationOptions = {}): CycleRotationState {
  const [index, setIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [intervalS, setIntervalS] = useState<number>(CYCLE_DEFAULT_INTERVAL_S);
  const [countdown, setCountdown] = useState<number>(CYCLE_DEFAULT_INTERVAL_S);
  // The requested start monitor wins until the operator moves off it.
  const [pendingStart, setPendingStart] = useState<number | undefined>(options.startMonitorId);

  const len = monitors.length;
  const startIdx = pendingStart != null ? monitors.findIndex((m) => m.id === pendingStart) : -1;
  // Clamp during render so a shrinking list never needs a corrective effect.
  const safeIndex = len === 0 ? 0 : startIdx >= 0 ? startIdx : index % len;
  // The timer reads the live position through a ref so it never advances
  // from a stale closure (the start monitor is resolved during render).
  const safeIndexRef = useRef(safeIndex);
  useEffect(() => {
    safeIndexRef.current = safeIndex;
  });

  useEffect(() => {
    if (isPaused || len <= 1) return;
    const id = window.setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          setPendingStart(undefined);
          setIndex((safeIndexRef.current + 1) % Math.max(len, 1));
          return intervalS;
        }
        return c - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [isPaused, intervalS, len]);

  const move = (to: number) => {
    if (len === 0) return;
    setPendingStart(undefined);
    setIndex(((to % len) + len) % len);
    setCountdown(intervalS);
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
    setInterval: (seconds) => { setIntervalS(seconds); setCountdown(seconds); },
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
}

/** The monitor list the Cycle page rotates over, shared by both skins. */
export function useCycleMonitors() {
  const { isAuthenticated } = useAuthStore();
  const q = useQuery({
    queryKey: ['monitors'],
    queryFn: () => getMonitors({ page: 1, page_size: 100 }),
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  });
  const allMonitors = useMemo(() => q.data?.items ?? [], [q.data?.items]);
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

  const rotation = useCycleRotation(monitors, { startMonitorId });
  const [viewMode, setViewMode] = useState<CycleViewMode>('stream');
  const [size, setSize] = useState<StageSize>(DEFAULT_STAGE_SIZE);

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
      setWidth: (width) => setSize((s) => ({ ...s, width })),
      setHeight: (height) => setSize((s) => ({ ...s, height })),
      setScale: (scale) => setSize((s) => ({ ...s, scale })),
      style: stageStyle(size, rotation.current ? displayDimensions(rotation.current) : { width: 16, height: 9 }),
    },
  };
}
