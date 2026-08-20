import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getMonitors } from '@/api/monitors';
import { useAuthStore } from '@/stores/auth';
import { useReviewClock, type ReviewClock } from './useReviewClock';
import type { Monitor } from '@/types';

export type ReviewRangePreset = '1h' | '8h' | '24h' | 'all' | 'live';

export interface ReviewRangePresetOption {
  value: ReviewRangePreset;
  label: string;
  icon: 'cal' | 'live';
}

/** Range presets with labels in the active language — use this to render. */
export function useReviewRangePresets(): ReviewRangePresetOption[] {
  const { t } = useTranslation();
  return useMemo(() => [
    { value: '1h',  label: t('1 hour'),     icon: 'cal' },
    { value: '8h',  label: t('8 hours'),    icon: 'cal' },
    { value: '24h', label: t('24 hours'),   icon: 'cal' },
    { value: 'all', label: t('All events'), icon: 'cal' },
    { value: 'live', label: t('Live'),      icon: 'live' },
  ], [t]);
}

/**
 * English-only snapshot of the presets (values + order). Kept for callers
 * that only need the ids; anything rendering a label should call
 * `useReviewRangePresets()`.
 */
export const REVIEW_RANGE_PRESETS: ReviewRangePresetOption[] = [
  { value: '1h',  label: '1 hour',     icon: 'cal' },
  { value: '8h',  label: '8 hours',    icon: 'cal' },
  { value: '24h', label: '24 hours',   icon: 'cal' },
  { value: 'all', label: 'All events', icon: 'cal' },
  { value: 'live', label: 'Live',      icon: 'live' },
];

export const REVIEW_SPEEDS = [0.5, 1, 2, 4];

export function presetToRange(preset: ReviewRangePreset, now: Date): { start: Date; end: Date } {
  const ms = (h: number) => h * 60 * 60 * 1000;
  switch (preset) {
    case '1h':  return { start: new Date(now.getTime() - ms(1)),    end: now };
    case '8h':  return { start: new Date(now.getTime() - ms(8)),    end: now };
    case '24h': return { start: new Date(now.getTime() - ms(24)),   end: now };
    case 'all': return { start: new Date(now.getTime() - ms(24 * 30)), end: now }; // last 30 days as "all"
    case 'live': return { start: now, end: new Date(now.getTime() + ms(1)) };
  }
}

/** Columns for a review grid of `count` cells. */
export function reviewGridColumns(count: number): number {
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  return 4;
}

export interface MontageReviewPageState {
  isAuthenticated: boolean;
  preset: ReviewRangePreset;
  setPreset: (preset: ReviewRangePreset) => void;
  isLive: boolean;
  clock: ReviewClock;
  /** Every monitor, for the filter bar. */
  allMonitors: Monitor[];
  setFilteredMonitors: (monitors: Monitor[]) => void;
  /** Filter-bar survivors that are capturing — the chip row. */
  enabled: Monitor[];
  selectedIds: Set<number>;
  /** Enabled monitors whose chip is on — the grid. */
  selectedMonitors: Monitor[];
  toggleMonitor: (id: number) => void;
}

export function useMontageReviewPage(): MontageReviewPageState {
  const { isAuthenticated } = useAuthStore();
  const [preset, setPreset] = useState<ReviewRangePreset>('24h');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const isLive = preset === 'live';

  // Initial range
  const initialRange = useMemo(() => presetToRange('24h', new Date()), []);
  const clock = useReviewClock(initialRange.start, initialRange.end);

  // When the preset changes, recompute the range against "now" and reset the
  // playhead to the start of the new range.
  useEffect(() => {
    const range = presetToRange(preset, new Date());
    clock.setRange(range.start, range.end);
    clock.setCurrentTime(range.start);
    if (preset === 'live') clock.pause();
    // intentionally only react to preset
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  // Fetch monitors (only enabled / capturing ones make sense for review).
  const { data: monitorsData } = useQuery({
    queryKey: ['monitors'],
    queryFn: () => getMonitors({ page: 1, page_size: 100 }),
    enabled: isAuthenticated,
  });
  const allMonitors: Monitor[] = monitorsData?.items ?? [];

  // Shared <MonitorFilterBar/> output. Layered on top of the per-monitor
  // chip toggles further down — so the chip row only offers monitors that
  // survive the filter bar's group/source/etc. selections.
  const [filteredMonitors, setFilteredMonitors] = useState<Monitor[]>(allMonitors);
  const enabled = filteredMonitors.filter((m) => m.capturing !== 'None');

  // Default selection: all enabled monitors (once they load).
  useEffect(() => {
    if (selectedIds.size === 0 && enabled.length > 0) {
      setSelectedIds(new Set(enabled.map((m) => m.id)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled.length]);

  const selectedMonitors = enabled.filter((m) => selectedIds.has(m.id));

  const toggleMonitor = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return {
    isAuthenticated,
    preset,
    setPreset,
    isLive,
    clock,
    allMonitors,
    setFilteredMonitors,
    enabled,
    selectedIds,
    selectedMonitors,
    toggleMonitor,
  };
}
