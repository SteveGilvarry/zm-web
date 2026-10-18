import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useZmConfig } from '@/features/config/useZmConfig';
import { useWatchPrefsStore } from '@/stores/watchPrefs';
import type { Monitor } from '@/types';
import { useCycleRotation, CYCLE_DEFAULT_INTERVAL_S, type CycleRotationState } from './useCyclePage';

/** watch.php:340-360 — 5 s, 10 s, 30 s, 1 min, 2 min, 5 min. */
export const WATCH_CYCLE_PERIODS = [5, 10, 30, 60, 120, 300] as const;

/**
 * Legacy adds `ZM_WEB_REFRESH_CYCLE` to the list when it is not already one
 * of the six, appended at the end as PHP appends to the array.
 */
export function watchCyclePeriods(refreshCycleS: number): number[] {
  const base = [...WATCH_CYCLE_PERIODS];
  if (refreshCycleS > 0 && !base.includes(refreshCycleS as (typeof WATCH_CYCLE_PERIODS)[number])) {
    return [...base, refreshCycleS];
  }
  return base;
}

export interface WatchCycleState extends CycleRotationState {
  /** Values for the period select, in legacy order. */
  periods: number[];
}

export interface WatchCycleOptions {
  /** Legacy `cycle=true`: the rotation starts running on load. */
  autoStart?: boolean;
  /** The stream is playing; the countdown waits for it otherwise. */
  playing?: boolean;
  /** The stream failed for good; skip to the next monitor. */
  failed?: boolean;
}

/**
 * The watch page's cycle sidebar (`#cycleButtons`). The rotation walks the
 * monitor list and the page follows it by navigating, which is how the URL
 * keeps pointing at what is on screen — legacy swaps the stream in place
 * because it has no routes.
 *
 * Legacy `watch.js:1110` only starts the cycle when the page was opened with
 * `cycle=true`; showing the sidebar does not start it. The countdown ticks
 * only while the stream plays (so a stopped stream, a hidden tab or the idle
 * prompt all hold it), a click on a monitor pill stops it (`handleClick` →
 * `cycleStop`), and the period is remembered (`zmCyclePeriod`).
 */
export function useWatchCycle(
  monitorId: number,
  monitors: Monitor[],
  enabled: boolean,
  options: WatchCycleOptions = {},
): WatchCycleState {
  const navigate = useNavigate();
  const refreshCycleS = useZmConfig('ZM_WEB_REFRESH_CYCLE', CYCLE_DEFAULT_INTERVAL_S);
  const savedPeriodS = useWatchPrefsStore((s) => s.cyclePeriodS);
  const savePeriod = useWatchPrefsStore((s) => s.setCyclePeriod);
  const rotation = useCycleRotation(enabled ? monitors : [], {
    startMonitorId: monitorId,
    defaultIntervalS: savedPeriodS ?? refreshCycleS,
    startPaused: !options.autoStart,
    canTick: options.playing ?? true,
    skip: options.failed ?? false,
  });

  // The page moved without the rotation (modern's prev/next links, a pill
  // in another tab of history): follow it rather than navigating back.
  const [syncedId, setSyncedId] = useState(monitorId);
  if (syncedId !== monitorId) {
    setSyncedId(monitorId);
    const at = monitors.findIndex((m) => m.id === monitorId);
    if (enabled && at >= 0 && at !== rotation.index) rotation.jumpTo(at);
  }

  const currentId = rotation.current?.id;
  useEffect(() => {
    if (!enabled || currentId == null || currentId === monitorId) return;
    void navigate({ to: '/monitors/$monitorId', params: { monitorId: String(currentId) } });
  }, [enabled, currentId, monitorId, navigate]);

  return {
    ...rotation,
    setInterval: (seconds) => {
      savePeriod(seconds);
      rotation.setInterval(seconds);
    },
    // A pill click is the operator choosing a camera: the rotation stops.
    jumpTo: (index) => {
      rotation.pause();
      rotation.jumpTo(index);
    },
    periods: watchCyclePeriods(refreshCycleS),
  };
}
