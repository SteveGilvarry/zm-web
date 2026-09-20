import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useZmConfig } from '@/features/config/useZmConfig';
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

/**
 * The watch page's cycle sidebar (`#cycleButtons`). The rotation walks the
 * monitor list and the page follows it by navigating, which is how the URL
 * keeps pointing at what is on screen — legacy swaps the stream in place
 * because it has no routes.
 *
 * The rotation runs while the sidebar is open and stops with it, as legacy
 * does: `watch.js:1110` starts the cycle when the sidebar is shown and pauses
 * it otherwise.
 */
export function useWatchCycle(
  monitorId: number,
  monitors: Monitor[],
  enabled: boolean,
): WatchCycleState {
  const navigate = useNavigate();
  const refreshCycleS = useZmConfig('ZM_WEB_REFRESH_CYCLE', CYCLE_DEFAULT_INTERVAL_S);
  const rotation = useCycleRotation(enabled ? monitors : [], {
    startMonitorId: monitorId,
    defaultIntervalS: refreshCycleS,
  });

  const currentId = rotation.current?.id;
  useEffect(() => {
    if (!enabled || currentId == null || currentId === monitorId) return;
    void navigate({ to: '/monitors/$monitorId', params: { monitorId: String(currentId) } });
  }, [enabled, currentId, monitorId, navigate]);

  return { ...rotation, periods: watchCyclePeriods(refreshCycleS) };
}
