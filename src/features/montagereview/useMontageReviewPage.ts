import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getMonitors } from '@/api/monitors';
import { useAuthStore } from '@/stores/auth';
import { getEvents } from '@/api/events';
import { fitRange, type EventSpan } from './fitRange';
import { eventEndMs } from './useReviewEvents';
import { useRouteSearch, searchInt, searchString } from '@/features/monitors/useRouteSearch';
import { useReviewClock, type ReviewClock } from './useReviewClock';
import type { Monitor } from '@/types';

export type ReviewRangePreset = '1h' | '8h' | '24h' | 'all' | 'live' | 'custom';

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

/** Playback multipliers; browsers cap `playbackRate` around 16. */
export const REVIEW_SPEEDS = [0.25, 0.5, 1, 2, 4, 8, 16];

export function presetToRange(preset: ReviewRangePreset, now: Date): { start: Date; end: Date } {
  const ms = (h: number) => h * 60 * 60 * 1000;
  switch (preset) {
    case '1h':  return { start: new Date(now.getTime() - ms(1)),    end: now };
    case '8h':  return { start: new Date(now.getTime() - ms(8)),    end: now };
    case '24h': return { start: new Date(now.getTime() - ms(24)),   end: now };
    case 'all': return { start: new Date(now.getTime() - ms(24 * 30)), end: now }; // last 30 days as "all"
    case 'live': return { start: now, end: new Date(now.getTime() + ms(1)) };
    case 'custom': return { start: new Date(now.getTime() - ms(1)), end: now };
  }
}

/** Columns for a review grid of `count` cells. */
export function reviewGridColumns(count: number): number {
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  return 4;
}

/**
 * Legacy `minTime` / `maxTime` (`YYYY-MM-DD HH:MM:SS`, server-local) or ISO.
 * Returns null for anything unparsable.
 */
export function parseLegacyTime(value: string | undefined): Date | null {
  if (!value) return null;
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(value) ? value.replace(' ', 'T') : value;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Slide the window by `fraction` of its width (negative = earlier). */
export function panRange(start: Date, end: Date, fraction: number): { start: Date; end: Date } {
  const span = end.getTime() - start.getTime();
  const delta = span * fraction;
  return { start: new Date(start.getTime() + delta), end: new Date(end.getTime() + delta) };
}

/** Scale the window by `factor` around `around` (in: factor < 1, out: factor > 1). */
export function zoomRange(start: Date, end: Date, factor: number, around: Date): { start: Date; end: Date } {
  const a = around.getTime();
  const s = a - (a - start.getTime()) * factor;
  const e = a + (end.getTime() - a) * factor;
  // Never collapse below one minute.
  if (e - s < 60_000) return { start, end };
  return { start: new Date(s), end: new Date(e) };
}

export interface MontageReviewPageState {
  isAuthenticated: boolean;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
  preset: ReviewRangePreset;
  setPreset: (preset: ReviewRangePreset) => void;
  /** Legacy Date Time >= / <= inputs; switches the preset to `custom`. */
  setCustomRange: (start: Date, end: Date) => void;
  pan: (fraction: number) => void;
  zoom: (factor: number) => void;
  /** Legacy "Fit": shrink the window onto the events that exist. */
  fit: () => void;
  isFitting: boolean;
  /** Set when Fit found nothing to fit; cleared on the next range change. */
  fitEmpty: boolean;
  isLive: boolean;
  clock: ReviewClock;
  /** Legacy scale slider 0.1–1.0 (cell size relative to the camera). */
  scale: number;
  setScale: (s: number) => void;
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
  const qc = useQueryClient();
  const search = useRouteSearch();
  const urlMonitorId = searchInt(search, 'monitor_id');
  const urlMin = parseLegacyTime(searchString(search, 'min_time'));
  const urlMax = parseLegacyTime(searchString(search, 'max_time'));
  const hasUrlRange = !!(urlMin && urlMax && urlMax > urlMin);

  const [preset, setPresetState] = useState<ReviewRangePreset>(hasUrlRange ? 'custom' : '24h');
  // A URL monitor preselects just that monitor; otherwise all once loaded.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    () => new Set(urlMonitorId != null ? [urlMonitorId] : []),
  );
  const [scale, setScale] = useState(1);
  const isLive = preset === 'live';

  // Initial range: the URL's, else the last 24 h.
  const initialRange = useMemo(
    () => (hasUrlRange ? { start: urlMin!, end: urlMax! } : presetToRange('24h', new Date())),
    // URL values are read once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const clock = useReviewClock(initialRange.start, initialRange.end);

  // Both in one call: a separate `setCurrentTime` would clamp the playhead
  // against the range it is replacing.
  const applyRange = (start: Date, end: Date) => clock.setRange(start, end, start);

  const setPreset = (next: ReviewRangePreset) => {
    setPresetState(next);
    if (next === 'custom') return;
    const range = presetToRange(next, new Date());
    applyRange(range.start, range.end);
    if (next === 'live') clock.pause();
  };

  const setCustomRange = (start: Date, end: Date) => {
    if (!(end > start)) return;
    setPresetState('custom');
    applyRange(start, end);
  };

  const pan = (fraction: number) => {
    const r = panRange(clock.rangeStart, clock.rangeEnd, fraction);
    setPresetState('custom');
    clock.setRange(r.start, r.end);
  };
  const zoom = (factor: number) => {
    const r = zoomRange(clock.rangeStart, clock.rangeEnd, factor, clock.currentTime);
    setPresetState('custom');
    clock.setRange(r.start, r.end);
  };

  // Fit. The tracks fetch their own events per monitor, so rather than hold a
  // second copy here we ask the API for each selected monitor's first and
  // last event — two tiny requests per monitor, and only when Fit is clicked.
  const [isFitting, setIsFitting] = useState(false);
  const [fitEmpty, setFitEmpty] = useState(false);
  const fit = () => {
    if (isFitting || selectedMonitors.length === 0) return;
    setIsFitting(true);
    setFitEmpty(false);
    const edge = (monitorId: number, direction: 'asc' | 'desc') =>
      qc.fetchQuery({
        queryKey: ['reviewEdge', monitorId, direction],
        queryFn: () => getEvents({ monitor_id: monitorId, page: 1, page_size: 1, sort: 'start_time', direction }),
        staleTime: 30_000,
      });
    void Promise.all(
      selectedMonitors.flatMap((m) => [edge(m.id, 'asc'), edge(m.id, 'desc')]),
    )
      .then((pages) => {
        const nowMs = Date.now();
        const spans: EventSpan[] = [];
        for (const page of pages) {
          for (const event of page.items ?? []) {
            const startMs = Date.parse(event.start_date_time ?? '');
            const endMs = eventEndMs(event, nowMs);
            if (!Number.isNaN(startMs) && endMs != null) spans.push({ startMs, endMs });
          }
        }
        const range = fitRange(spans);
        if (!range) {
          setFitEmpty(true);
          return;
        }
        setPresetState('custom');
        applyRange(range.start, range.end);
      })
      .catch(() => setFitEmpty(true))
      .finally(() => setIsFitting(false));
  };

  // Fetch monitors (only enabled / capturing ones make sense for review).
  const monitorsQ = useQuery({
    queryKey: ['monitors'],
    queryFn: () => getMonitors({ page: 1, page_size: 100 }),
    enabled: isAuthenticated,
  });
  const allMonitors: Monitor[] = monitorsQ.data?.items ?? [];

  // Shared <MonitorFilterBar/> output. Layered on top of the per-monitor
  // chip toggles further down — so the chip row only offers monitors that
  // survive the filter bar's group/source/etc. selections.
  const [filteredMonitors, setFilteredMonitors] = useState<Monitor[] | null>(null);
  const enabled = (filteredMonitors ?? allMonitors).filter((m) => m.capturing !== 'None');

  // Default selection: all enabled monitors (once they load), unless the
  // URL named one.
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
    isLoading: monitorsQ.isLoading,
    isError: monitorsQ.isError,
    error: monitorsQ.error,
    refetch: () => { void monitorsQ.refetch(); },
    preset,
    setPreset,
    setCustomRange,
    pan,
    zoom,
    fit,
    isFitting,
    fitEmpty,
    isLive,
    clock,
    scale,
    setScale,
    allMonitors,
    setFilteredMonitors,
    enabled,
    selectedIds,
    selectedMonitors,
    toggleMonitor,
  };
}
