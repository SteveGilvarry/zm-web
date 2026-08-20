import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMonitors } from '@/api/monitors';
import { useAuthStore } from '@/stores/auth';
import type { Monitor } from '@/types';

export const CYCLE_DEFAULT_INTERVAL_S = 10;
export const CYCLE_INTERVAL_OPTIONS = [5, 10, 20, 30, 60] as const;

export interface CyclePageState {
  isAuthenticated: boolean;
  isLoading: boolean;
  isError: boolean;
  /** Monitors in rotation (capturing only). */
  monitors: Monitor[];
  /** The monitor on stage, or undefined when the list is empty. */
  current: Monitor | undefined;
  /** Zero-based position of `current` in `monitors`. */
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

/**
 * Data + rotation state for the Cycle page. Skin-agnostic: both skins render
 * from this one hook and only differ in layout and in what they put on stage
 * (live stream vs refreshing snapshot).
 */
export function useCyclePage(): CyclePageState {
  const { isAuthenticated } = useAuthStore();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['monitors'],
    queryFn: () => getMonitors({ page: 1, page_size: 100 }),
    enabled: isAuthenticated,
  });

  const monitors = useMemo(
    () => (data?.items ?? []).filter((m) => m.capturing !== 'None'),
    [data],
  );

  const [index, setIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [intervalS, setIntervalS] = useState<number>(CYCLE_DEFAULT_INTERVAL_S);
  const [countdown, setCountdown] = useState<number>(CYCLE_DEFAULT_INTERVAL_S);

  // Clamp during render so a shrinking list never needs a corrective effect.
  const safeIndex = monitors.length === 0 ? 0 : index % monitors.length;

  // Only the ticking interval lives in the effect; every countdown reset is
  // done by an event handler, so the effect never sets state synchronously.
  useEffect(() => {
    if (isPaused || monitors.length <= 1) return;
    const id = window.setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          setIndex((i) => (i + 1) % Math.max(monitors.length, 1));
          return intervalS;
        }
        return c - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [isPaused, intervalS, monitors.length]);

  const next = () => {
    if (monitors.length === 0) return;
    setIndex((i) => (i + 1) % monitors.length);
    setCountdown(intervalS);
  };
  const prev = () => {
    if (monitors.length === 0) return;
    setIndex((i) => (i - 1 + monitors.length) % monitors.length);
    setCountdown(intervalS);
  };
  const togglePause = () => {
    setIsPaused((p) => {
      if (p) setCountdown(intervalS); // resuming: start the next tick fresh
      return !p;
    });
  };
  const setInterval = (seconds: number) => {
    setIntervalS(seconds);
    setCountdown(seconds);
  };
  const jumpTo = (i: number) => {
    setIndex(i);
    setCountdown(intervalS);
  };

  return {
    isAuthenticated,
    isLoading,
    isError,
    monitors,
    current: monitors[safeIndex],
    index: safeIndex,
    isPaused,
    intervalS,
    countdown,
    next,
    prev,
    togglePause,
    setInterval,
    jumpTo,
  };
}
