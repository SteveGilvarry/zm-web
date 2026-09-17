import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getMonitors } from '@/api/monitors';
import { useAuthStore } from '@/stores/auth';
import { getEvents } from '@/api/events';
import { listTags, type Tag } from '@/api/tags';
import { fitRange, type EventSpan } from './fitRange';
import { eventEndMs, DEFAULT_REVIEW_FILTERS, type ReviewEventFilters } from './useReviewEvents';
import { useRouteSearch, searchInt, searchString } from '@/features/monitors/useRouteSearch';
import { useMonitorFilterStore } from '@/stores/monitorFilter';
import { applyMontageSort, useMontageSort } from './useMontageSort';
import { useMontageStore } from '@/stores/montage';
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

/**
 * Legacy's Notes select (`includes/Filter.php`): the substrings ZoneMinder
 * offers for a LIKE match against an event's notes. Values are matched as
 * written; the label is what the operator reads.
 */
export function useReviewNotesOptions(): Array<{ value: string; label: string }> {
  const { t } = useTranslation();
  return useMemo(() => [
    { value: 'Motion', label: t('Motion') },
    { value: 'ONVIF', label: t('ONVIF') },
    { value: 'Linked', label: t('Linked') },
    { value: 'detected', label: t('Any Object') },
    { value: 'aplr', label: t('Any license plate') },
    { value: 'person', label: t('person') },
    { value: 'boat', label: t('boat') },
    { value: 'bus', label: t('bus') },
    { value: 'car', label: t('car') },
    { value: 'truck', label: t('truck') },
    { value: 'vehicle', label: t('vehicle') },
  ], [t]);
}

/** English-only snapshot of the Notes options, for callers that need the ids. */
export const REVIEW_NOTES_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'Motion', label: 'Motion' },
  { value: 'ONVIF', label: 'ONVIF' },
  { value: 'Linked', label: 'Linked' },
  { value: 'detected', label: 'Any Object' },
  { value: 'aplr', label: 'Any license plate' },
  { value: 'person', label: 'person' },
  { value: 'boat', label: 'boat' },
  { value: 'bus', label: 'bus' },
  { value: 'car', label: 'car' },
  { value: 'truck', label: 'truck' },
  { value: 'vehicle', label: 'vehicle' },
];

/**
 * Legacy's speed slider (`montagereview.php:254`): 13 steps, `0` meaning
 * paused — the playhead then moves only by scrubbing. Browsers cap
 * `playbackRate` near 16, so the last two steps run the clock faster than
 * any cell can play and the cells step by seeking (`playbackRateFor`).
 */
export const REVIEW_SPEEDS = [0, 0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 5, 10, 20, 50];

/** Slider position of a speed; the nearest step for anything off-list. */
export function reviewSpeedIndex(speed: number): number {
  let best = 0;
  for (let i = 1; i < REVIEW_SPEEDS.length; i++) {
    if (Math.abs(REVIEW_SPEEDS[i] - speed) < Math.abs(REVIEW_SPEEDS[best] - speed)) best = i;
  }
  return best;
}

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

/**
 * Legacy `&z<id>=1.4`: per-monitor zoom scales carried on the URL
 * (`montagereview.php`). Keys that are not `z<positive int>` are ignored.
 */
export function parseZoomParams(search: Record<string, unknown>): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [key, raw] of Object.entries(search)) {
    const m = /^z(\d+)$/.exec(key);
    if (!m) continue;
    const scale = Number(raw);
    if (!Number.isFinite(scale) || scale <= 0) continue;
    out[Number(m[1])] = scale;
  }
  return out;
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
  fitToEvents: () => void;
  isFittingEvents: boolean;
  /** Set when Fit found nothing to fit; cleared on the next range change. */
  fitEventsEmpty: boolean;
  isLive: boolean;
  clock: ReviewClock;
  /** Legacy scale slider 0.1–1.0 (cell size relative to the camera). */
  scale: number;
  setScale: (s: number) => void;
  /**
   * Legacy Fit (`montagereview.js` `setFit`): pack the cells into what is
   * left of the viewport instead of sizing them from the Scale slider.
   */
  fit: boolean;
  setFit: (fit: boolean) => void;
  /** Per-monitor zoom scale (legacy `&z<id>=`); 1 unless zoomed. */
  monitorZoom: Record<number, number>;
  /** Multiply one monitor's zoom (legacy corner click: 1.15 / 1÷1.15). */
  zoomMonitor: (monitorId: number, factor: number) => void;
  /** Every monitor, for the filter bar. */
  allMonitors: Monitor[];
  setFilteredMonitors: (monitors: Monitor[]) => void;
  /** Filter-bar survivors that are capturing — the chip row. */
  enabled: Monitor[];
  selectedIds: Set<number>;
  /** Enabled monitors whose chip is on — the grid. */
  selectedMonitors: Monitor[];
  toggleMonitor: (id: number) => void;
  /** Legacy Archived / Tags / Notes event filters. */
  filters: ReviewEventFilters;
  setFilters: (patch: Partial<ReviewEventFilters>) => void;
  /** Tags to choose from, for the Tags select. */
  tags: Tag[];
}

export function useMontageReviewPage(): MontageReviewPageState {
  const { isAuthenticated } = useAuthStore();
  const qc = useQueryClient();
  const search = useRouteSearch();
  const urlMonitorId = searchInt(search, 'monitor_id');
  const urlMin = parseLegacyTime(searchString(search, 'min_time'));
  const urlMax = parseLegacyTime(searchString(search, 'max_time'));
  const hasUrlRange = !!(urlMin && urlMax && urlMax > urlMin);
  // Legacy `&current=`: where the playhead starts. On its own it also picks
  // the window — half an hour each side (`montagereview.php:97-101`).
  const urlCurrent = parseLegacyTime(searchString(search, 'current'));
  const urlLive = searchString(search, 'live');

  const [preset, setPresetState] = useState<ReviewRangePreset>(
    urlLive != null && urlLive !== '0' ? 'live' : hasUrlRange || urlCurrent ? 'custom' : '24h',
  );
  // A URL monitor preselects just that monitor; otherwise all once loaded.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    () => new Set(urlMonitorId != null ? [urlMonitorId] : []),
  );
  // Legacy `&scale=` (0.1–1.0; anything above 1.1 falls back to 1).
  const [scale, setScale] = useState(() => {
    const raw = Number(searchString(search, 'scale'));
    return Number.isFinite(raw) && raw >= 0.1 && raw <= 1 ? raw : 1;
  });
  // Legacy `&z<id>=`: per-monitor zoom, stepped ±15 % by a corner click.
  const [monitorZoom, setMonitorZoom] = useState<Record<number, number>>(() => parseZoomParams(search));
  const zoomMonitor = (monitorId: number, factor: number) =>
    setMonitorZoom((prev) => {
      const next = Math.min(8, Math.max(0.25, (prev[monitorId] ?? 1) * factor));
      return { ...prev, [monitorId]: next };
    });
  const { reviewFit: fit, setReviewFit: setFit } = useMontageStore();

  // Legacy carries fit mode on the URL (`&fit=0|1`); it wins over the
  // persisted preference, once, on mount.
  useEffect(() => {
    const raw = search.fit;
    if (raw == null || raw === '') return;
    setFit(raw === '1' || raw === 1 || raw === true || raw === 'true');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Legacy `&speed=`: the slider's opening position, ahead of the cookie.
  const setStoredSpeed = useMontageStore((st) => st.setReviewSpeed);
  useEffect(() => {
    const raw = Number(searchString(search, 'speed'));
    if (Number.isFinite(raw) && raw >= 0) setStoredSpeed(raw);
    // URL values are read once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [filters, setFiltersState] = useState<ReviewEventFilters>(DEFAULT_REVIEW_FILTERS);
  const setFilters = (patch: Partial<ReviewEventFilters>) =>
    setFiltersState((prev) => ({ ...prev, ...patch }));
  const isLive = preset === 'live';

  // Initial range: the URL's, a window around `current`, else the last 24 h.
  const initialRange = useMemo(
    () => (hasUrlRange
      ? { start: urlMin!, end: urlMax! }
      : urlCurrent
        ? { start: new Date(urlCurrent.getTime() - 1800_000), end: new Date(urlCurrent.getTime() + 1800_000) }
        : presetToRange('24h', new Date())),
    // URL values are read once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const clock = useReviewClock(initialRange.start, initialRange.end);

  // `&current=` places the playhead once the clock exists.
  useEffect(() => {
    if (urlCurrent) clock.setCurrentTime(urlCurrent);
    // URL values are read once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const [isFittingEvents, setIsFittingEvents] = useState(false);
  const [fitEventsEmpty, setFitEmpty] = useState(false);
  const fitToEvents = () => {
    if (isFittingEvents || selectedMonitors.length === 0) return;
    setIsFittingEvents(true);
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
      .finally(() => setIsFittingEvents(false));
  };

  // Fetch monitors (only enabled / capturing ones make sense for review).
  const monitorsQ = useQuery({
    queryKey: ['monitors'],
    queryFn: () => getMonitors({ page: 1, page_size: 100 }),
    enabled: isAuthenticated,
  });
  const allMonitors: Monitor[] = monitorsQ.data?.items ?? [];

  const tagsQ = useQuery({
    queryKey: ['tags'],
    queryFn: () => listTags({ page: 1, page_size: 200 }),
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  // Shared <MonitorFilterBar/> output. Layered on top of the per-monitor
  // chip toggles further down — so the chip row only offers monitors that
  // survive the filter bar's group/source/etc. selections.
  const [filteredMonitors, setFilteredMonitors] = useState<Monitor[] | null>(null);
  // Legacy orders the wall by the `MontageSort<groupIds>` user preference.
  const groupIds = useMonitorFilterStore((st) => st.groupIds);
  const sortValue = useMontageSort(groupIds);
  const enabled = applyMontageSort(
    (filteredMonitors ?? allMonitors).filter((m) => m.capturing !== 'None'),
    sortValue,
  );

  // Default selection: all enabled monitors (once they load), unless the
  // URL named one. Seeded during render, keyed on how many monitors were in
  // play last time, so the first paint already shows the full wall and
  // clearing the selection by hand is not undone on the next render.
  const [seededAt, setSeededAt] = useState(0);
  if (selectedIds.size === 0 && enabled.length > 0 && seededAt !== enabled.length) {
    setSeededAt(enabled.length);
    setSelectedIds(new Set(enabled.map((m) => m.id)));
  }

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
    fitToEvents,
    isFittingEvents,
    fitEventsEmpty,
    isLive,
    clock,
    scale,
    setScale,
    fit,
    setFit,
    monitorZoom,
    zoomMonitor,
    allMonitors,
    setFilteredMonitors,
    enabled,
    selectedIds,
    selectedMonitors,
    toggleMonitor,
    filters,
    setFilters,
    tags: tagsQ.data?.items ?? [],
  };
}
