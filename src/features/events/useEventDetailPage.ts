import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type RefObject } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  getEvent,
  getEvents,
  getEventInfo,
  getEventStreamUrl,
  getEventThumbnailUrl,
  deleteEvent,
  updateEvent,
  type EventQueryParams,
  type EventUpdatePayload,
  type EventVideoInfo,
} from '@/api/events';
import { listEventData, type EventDataRow } from '@/api/eventData';
import { getMonitor } from '@/api/monitors';
import { getStorageList } from '@/api/storage';
import { useEventVideo } from '@/hooks/useEventVideo';
import { useToast } from '@/components/common/toastStore';
import { useAuthStore } from '@/stores/auth';
import {
  useEventPlaybackStore, scaleToMaxWidth, isPlaybackScale, PLAYBACK_RATES,
  type PlaybackCodec, type PlaybackScale,
} from '@/stores/eventPlayback';
import { isOrientationRotated, getOrientationStyle, getOrientationFillStyle } from '@/types';
import type { Monitor, ZmEvent } from '@/types';
import { toLocalDatetime } from '@/features/reports/datetime';
import { useEventHotkeys } from './useEventHotkeys';
import type { TagChipsApi } from './TagChips';
import { notesFromSearch, monitorIdsFromSearch, toApiTimestamp, toZmDateTime, type EventNavSearch } from './eventsSearch';

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function getCauseColor(cause: string): string {
  const lowerCause = cause.toLowerCase();
  if (lowerCause.includes('motion')) return 'bg-amber/20 text-amber border-amber/30';
  if (lowerCause.includes('alarm')) return 'bg-crimson/20 text-crimson border-crimson/30';
  if (lowerCause.includes('continuous')) return 'bg-cyan/20 text-cyan border-cyan/30';
  return 'bg-text-muted/20 text-text-secondary border-text-muted/30';
}

/* ------------------------------------------------------------------------ */
/*  Prev / next                                                             */
/* ------------------------------------------------------------------------ */

type EventRef = Pick<ZmEvent, 'id' | 'start_date_time'>;

/**
 * A wait as `HH:MM:SS`, the shape legacy's "… to next event." countdown
 * prints between two events in `all` replay mode.
 */
export function formatGap(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const parts = [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60];
  return parts.map((n) => String(n).padStart(2, '0')).join(':');
}

function startMs(e: EventRef): number {
  return e.start_date_time ? Date.parse(e.start_date_time) : NaN;
}

/** Chronological order with id as the tie-break, so equal starts still form a line. */
function isAfter(a: EventRef, b: EventRef): boolean {
  const da = startMs(a);
  const db = startMs(b);
  if (da !== db) return da > db;
  return a.id > b.id;
}

/**
 * The event that comes right after `current`, given events with
 * `start_date_time >= current.start` in ascending order (the current event
 * itself and any same-second siblings included).
 */
export function pickNextEvent(current: EventRef, ascending: EventRef[]): number | null {
  if (!current.start_date_time) return null;
  const hit = ascending.find((e) => e.id !== current.id && isAfter(e, current));
  return hit ? hit.id : null;
}

/**
 * The event right before `current`, given ascending events that start at or
 * after the anchor (the newest event that had *ended* by `current.start`).
 * The last one that still precedes `current` wins; that catches events on
 * other monitors that began after the anchor but were still running when
 * `current` started — which the `end_time` bound alone would skip.
 */
export function pickPrevEvent(current: EventRef, ascendingFromAnchor: EventRef[]): number | null {
  if (!current.start_date_time) return null;
  let best: EventRef | null = null;
  for (const e of ascendingFromAnchor) {
    if (e.id === current.id || !isAfter(current, e)) continue;
    if (!best || isAfter(e, best)) best = e;
  }
  return best ? best.id : null;
}

/* ------------------------------------------------------------------------ */
/*  Page state                                                              */
/* ------------------------------------------------------------------------ */

type PlaybackStore = ReturnType<typeof useEventPlaybackStore.getState>;

export interface EventEditDraft {
  name: string;
  cause: string;
  notes: string;
}

export interface EventDetailPageState {
  isAuthenticated: boolean;
  eventLoading: boolean;
  eventError: Error | null;
  event: ZmEvent | undefined;
  monitor: Monitor | undefined;
  videoInfo: EventVideoInfo | undefined;
  /** `/storage` row name for `event.storage_id`; id 0 is ZoneMinder's implicit default store. */
  storageName: string | null;
  /** Rows from `/event-data?event_id=`: detector / trigger payloads per frame. */
  eventData: EventDataRow[];

  videoRef: RefObject<HTMLVideoElement | null>;
  /** The player frame: what goes fullscreen, so the overlays go with it. */
  playerRef: RefObject<HTMLDivElement | null>;
  playbackMode: ReturnType<typeof useEventVideo>['mode'];
  playbackError: ReturnType<typeof useEventVideo>['error'];
  isPlaying: boolean;
  isMuted: boolean;
  currentTime: number;
  duration: number;
  setCurrentTime: (t: number) => void;
  setDuration: (d: number) => void;
  setIsPlaying: (p: boolean) => void;

  replayMode: PlaybackStore['replayMode'];
  setReplayMode: PlaybackStore['setReplayMode'];
  /** Player scale for this event's monitor (legacy `zmEventScale<mid>`). */
  scale: PlaybackScale;
  setScale: (scale: PlaybackScale) => void;
  showZones: boolean;
  setShowZones: (v: boolean) => void;
  showStats: boolean;
  setShowStats: (v: boolean) => void;
  /** CSS max-width for the player frame, derived from `scale`. */
  playerMaxWidth: ReturnType<typeof scaleToMaxWidth>;
  /** The same cap in pixels, for the layout that measures rather than styles. */
  playerMaxWidthPx: number | undefined;
  /**
   * Playback rate, one of `PLAYBACK_RATES`: negative steps `currentTime`
   * back on a 500 ms timer (legacy `streamFastRev`), 0 is Stop, positive is
   * the <video>'s `playbackRate`.
   */
  rate: number;
  setRate: (rate: number) => void;
  rateOptions: readonly number[];
  /** Forced container (legacy `&codec=`); `auto` follows the backend. */
  codec: PlaybackCodec;
  setCodec: (codec: PlaybackCodec) => void;
  /** Rewind / Fast Forward: one step down / up the rate list (legacy `streamFastRev` / `streamFastFwd`). */
  scanBack: () => void;
  scanForward: () => void;
  /** Rewind / Fast Forward apply while the transport is moving (playing or rewinding). */
  canScan: boolean;
  /** Step Back / Step Forward: ±(Length / Frames) seconds (legacy `spf`). */
  stepBack: () => void;
  stepForward: () => void;
  /** Stepping is a paused-only control, as in legacy. */
  canStep: boolean;
  /** Seconds per frame, 0 when the event has no frame count to divide by. */
  secondsPerFrame: number;

  prevEventId: number | null;
  nextEventId: number | null;
  /** Monitor Prev/Next are confined to, or null for every monitor. */
  navMonitorId: number | null;
  navPrev: () => void;
  navNext: () => void;
  /** Legacy's "No more events" overlay: Next had nowhere to go. */
  noMoreEvents: boolean;
  /** `HH:MM:SS` left of the real gap before the next event (`all` replay). */
  gapCountdown: string | null;

  /**
   * Hand to `TagChips` so ↓ / Ctrl+↓ and the tag-and-move buttons can reach
   * the editor. Null while the operator has no Edit rights on events.
   */
  tagApiRef: RefObject<TagChipsApi | null>;
  /** Legacy `tagAndPrev` / `tagAndNext`: apply the first free tag, then move. */
  tagAndPrev: () => void;
  tagAndNext: () => void;

  handleVideoEnded: () => void;
  handlePlayPause: () => void;
  handleToggleMute: () => void;
  handleToggleFullscreen: () => void;
  handleSeek: (e: ChangeEvent<HTMLInputElement>) => void;
  seekTo: (t: number) => void;

  /** Archive / unarchive (PATCH `archived`). */
  toggleArchived: () => void;
  archivePending: boolean;
  archiveError: string | null;

  /** Name / cause / notes editor. */
  editOpen: boolean;
  openEdit: () => void;
  closeEdit: () => void;
  saveEdit: (draft: EventEditDraft) => void;
  savePending: boolean;
  saveError: string | null;

  /**
   * Delete flow: confirm dialog (skipped on a shift-click), then DELETE and
   * on to the next event — or "No more events" when this was the last one.
   */
  deleteOpen: boolean;
  requestDelete: (shiftKey?: boolean) => void;
  /** False for an archived event: ZoneMinder will not delete one. */
  canDelete: boolean;
  /** Why Delete is unavailable, for the button's tooltip. */
  deleteBlockedReason: string | null;
  cancelDelete: () => void;
  confirmDelete: () => void;
  deletePending: boolean;
  deleteError: string | null;

  /** `/montagereview` search params framing this event (legacy "Montage Review" button). */
  reviewSearch: { monitor_id: number; min_time: string; max_time: string } | null;

  /** Derived presentation values; all undefined/empty until `event` loads. */
  startTime: Date | null;
  endTime: Date | null;
  downloadUrl: string;
  /**
   * `default_video` — the stored file's name. Null when the event has no
   * video file, which is when legacy hides the Download button entirely.
   */
  downloadFileName: string | null;
  thumbnailUrl: string;
  videoContainerW: number;
  videoContainerH: number;
  useSwappedRotation: boolean;
  videoElementStyle: CSSProperties | undefined;
  codecHint: string;
}

function errorMessage(e: unknown): string | null {
  if (!e) return null;
  return e instanceof Error ? e.message : String(e);
}

/**
 * Data + playback state for the event detail page. Skin-agnostic: owns the
 * queries, the <video> element ref, the keyboard shortcuts and every
 * handler; pages only lay out.
 */
export function useEventDetailPage(id: number): EventDetailPageState {
  const { t } = useTranslation();
  const { isAuthenticated, accessToken } = useAuthStore();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();

  const {
    replayMode, setReplayMode,
    scaleByMonitor, setScale: setMonitorScale,
    showZones, setShowZones,
    showStats, setShowStats,
    rate, setRate,
    codec, setCodec,
    navScope,
  } = useEventPlaybackStore();

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  // Precise duration from the <video> loadedmetadata event; 0 until it fires.
  const [metaDuration, setMetaDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);

  // Track fullscreen so the rotated-video styling can switch between the
  // event-shaped container fit (inline) and the 16:9-screen fit (fullscreen).
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Fetch event details
  const { data: event, isLoading: eventLoading, error: eventError } = useQuery({
    queryKey: ['event', id],
    queryFn: () => getEvent(id),
    enabled: isAuthenticated && !isNaN(id),
  });

  // Fetch monitor details
  const { data: monitor } = useQuery({
    queryKey: ['monitor', event?.monitor_id],
    queryFn: () => getMonitor(event!.monitor_id),
    enabled: isAuthenticated && !!event?.monitor_id,
  });

  // Storage name. The list is tiny and rarely changes; share the cache with
  // the Storage settings page.
  const { data: storageData } = useQuery({
    queryKey: ['storage'],
    queryFn: () => getStorageList({ page: 1, page_size: 100 }),
    enabled: isAuthenticated && !!event,
    staleTime: 5 * 60_000,
  });
  const storageName = useMemo(() => {
    if (!event) return null;
    const row = storageData?.items.find((s) => s.id === event.storage_id);
    if (row) return row.name;
    // ZoneMinder's Storage id 0 is the implicit ZM_DIR_EVENTS store, which
    // the legacy UI also labels "Default".
    if (event.storage_id === 0) return t('Default');
    return null;
  }, [event, storageData, t]);

  // Event_Data rows (object labels, plate reads, zmtrigger payloads).
  const { data: eventDataPage } = useQuery({
    queryKey: ['eventData', id],
    queryFn: () => listEventData({ event_id: id, page: 1, page_size: 200 }),
    enabled: isAuthenticated && !!event,
  });
  const eventData = useMemo(() => eventDataPage?.items ?? [], [eventDataPage]);

  // Probe playback metadata so we can branch direct-MP4 vs HLS and detect an
  // unsupported codec before touching the <video> element.
  const { data: videoInfo } = useQuery({
    queryKey: ['eventInfo', id],
    queryFn: () => getEventInfo(id),
    enabled: isAuthenticated && !isNaN(id),
  });

  // Attach the correct source (direct/HLS) to the shared <video> element.
  const { mode: playbackMode, error: playbackError } = useEventVideo(
    videoRef,
    id,
    videoInfo,
    codec,
  );

  // Seed the scrubber length from /info up front; the precise duration from
  // loadedmetadata takes over once playback starts. For an unsupported codec
  // metadata never arrives, so this keeps the timeline labelled correctly.
  const duration = metaDuration > 0 ? metaDuration : (videoInfo?.duration_seconds || 0);

  // A rate left at Stop or a reverse speed makes no sense for a page that
  // starts playing forward (legacy only applies positive rates on load).
  useEffect(() => {
    const store = useEventPlaybackStore.getState();
    if (store.rate <= 0) store.setRate(1);
  }, [id]);

  // Playback rate: applied whenever it changes and again after each source
  // attach (some browsers reset the rate when `src` is swapped). Browsers
  // cannot play an mp4 backwards, so a reverse rate freezes the element and
  // steps `currentTime` back by half the speed every 500 ms, as legacy does.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (rate > 0) {
      el.playbackRate = rate;
      return;
    }
    if (rate === 0) {
      el.pause();
      return;
    }
    const step = -rate / 2;
    const timer = setInterval(() => {
      if (el.currentTime <= 0) {
        clearInterval(timer);
        el.pause();
        setRate(0);
        return;
      }
      el.playbackRate = 0;
      el.currentTime = Math.max(0, el.currentTime - step);
    }, 500);
    return () => {
      clearInterval(timer);
      el.playbackRate = 1;
    };
  }, [rate, playbackMode, metaDuration, setRate]);
  const rewinding = rate < 0;
  const canScan = isPlaying || rewinding;

  const scanForward = () => {
    // Coming out of a rewind lands on 1x first (legacy `stopFastRev`), so
    // the step goes to 2x.
    const i = PLAYBACK_RATES.indexOf(rewinding ? 1 : rate);
    setRate(PLAYBACK_RATES[Math.min(i + 1, PLAYBACK_RATES.length - 1)]);
  };
  const scanBack = () => {
    // The first press starts a 1x rewind; each one after goes a step faster.
    if (!rewinding) {
      setRate(-1);
      return;
    }
    const i = PLAYBACK_RATES.indexOf(rate);
    setRate(PLAYBACK_RATES[Math.max(i - 1, 0)]);
  };

  // ----- Prev / next event navigation -----------------------------------
  //
  // Three sources, most specific first (legacy carries the same thing as
  // `filterQuery` + `sortQuery` on every event link, and `ajax/status.php`'s
  // `getNearEvents` walks that set):
  //
  //  1. an explicit id list, from the list's "View" action;
  //  2. the list's own page + sort + filters, carried in this URL;
  //  3. otherwise, neighbours by time within the monitor scope.
  const listSearch: EventNavSearch = useSearch({ from: '/events/$eventId' });
  const urlMonitorIds = monitorIdsFromSearch(listSearch);
  /** The list filters this URL carries, as `/events` query params. */
  const urlFilters: EventQueryParams = useMemo(() => ({
    // Several monitors can only be listed through `/filters/preview`, which
    // has no ordering guarantee to walk; those fall back to "all monitors".
    monitor_id: urlMonitorIds.length === 1 ? urlMonitorIds[0] : undefined,
    archived: listSearch.archived,
    cause: listSearch.cause || undefined,
    // The list's Notes box is a multi-select; `/events` takes one substring,
    // so a multi-type list narrows Prev/Next by its first type only.
    notes: notesFromSearch(listSearch)[0],
    name: listSearch.q || undefined,
    tag_id: listSearch.tag != null ? String(listSearch.tag) : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [urlMonitorIds.join(','), listSearch.archived, listSearch.cause, listSearch.notes, listSearch.q, listSearch.tag]);

  // Page + sort is what makes a URL a *list position*; without both there is
  // nothing to take a row above/below from.
  const listCtx = listSearch.page != null && listSearch.sort
    ? {
      page: listSearch.page,
      pageSize: listSearch.page_size ?? 25,
      sort: listSearch.sort,
      dir: listSearch.dir ?? 'asc',
    }
    : null;

  const explicitIds = navScope?.ids?.length ? navScope.ids : null;
  const idsIndex = explicitIds ? explicitIds.indexOf(id) : -1;
  const idsActive = idsIndex >= 0;

  const listPageParams = (page: number): EventQueryParams => ({
    ...urlFilters,
    start_time: listSearch.start ? toApiTimestamp(listSearch.start) : undefined,
    end_time: listSearch.end ? toApiTimestamp(listSearch.end) : undefined,
    sort: listCtx!.sort,
    direction: listCtx!.dir,
    page,
    page_size: listCtx!.pageSize,
  });
  const listKey = ['eventListNav', urlFilters, listSearch.start, listSearch.end, listCtx] as const;

  const { data: listPage } = useQuery({
    queryKey: [...listKey, listCtx?.page],
    queryFn: () => getEvents(listPageParams(listCtx!.page)),
    enabled: isAuthenticated && !!listCtx && !idsActive,
  });
  const listRows = listPage?.items ?? [];
  const listIndex = listRows.findIndex((e) => e.id === id);
  // Only reach for the neighbouring page when this row sits on an edge.
  const wantPageBefore = !!listCtx && listIndex === 0 && listCtx.page > 1;
  const wantPageAfter = !!listCtx && listIndex >= 0
    && listIndex === listRows.length - 1 && (listPage?.last_page ?? 1) > listCtx.page;

  const { data: pageBefore } = useQuery({
    queryKey: [...listKey, 'before'],
    queryFn: () => getEvents(listPageParams(listCtx!.page - 1)),
    enabled: isAuthenticated && wantPageBefore,
  });
  const { data: pageAfter } = useQuery({
    queryKey: [...listKey, 'after'],
    queryFn: () => getEvents(listPageParams(listCtx!.page + 1)),
    enabled: isAuthenticated && wantPageAfter,
  });

  // The list run this event sits in, one page either side when needed.
  const listWindow = useMemo(
    () => [...(pageBefore?.items ?? []), ...listRows, ...(pageAfter?.items ?? [])],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageBefore, pageAfter, listPage],
  );
  const windowIndex = listWindow.findIndex((e) => e.id === id);
  const listResolved = !!listCtx && windowIndex >= 0;
  // `getNearEvents` forces Id / StartDateTime sorts to ASC, so Prev is always
  // timewise earlier however the list itself was ordered; for every other
  // column it keeps the list's own direction.
  const listReversed = listCtx?.dir === 'desc'
    && (listCtx.sort === 'start_time' || listCtx.sort === 'id');
  const rowBefore = windowIndex > 0 ? listWindow[windowIndex - 1] : null;
  const rowAfter = windowIndex >= 0 ? (listWindow[windowIndex + 1] ?? null) : null;
  const listPrev = listReversed ? rowAfter : rowBefore;
  const listNext = listReversed ? rowBefore : rowAfter;

  // Scope for the time-based fallback: the monitor this URL is filtered to,
  // the one the events list was filtered to, every monitor when it was
  // unfiltered, or — before the list has been visited — the event's own
  // monitor. The timestamp goes back to the backend verbatim, so the dev
  // box's server-local-stamped-Z values and the fixed build's true UTC both
  // stay self-consistent.
  const navMonitorId: number | null = urlMonitorIds.length === 1
    ? urlMonitorIds[0]
    : listCtx || navScope !== null
      ? (navScope?.monitorId ?? null)
      : (event?.monitor_id ?? null);
  const scopeMonitor = navMonitorId ?? undefined;
  const startAt = event?.start_date_time ?? null;
  // The fallback only runs when neither of the two better sources answered.
  const fallbackActive = !idsActive && (!listCtx || (listPage !== undefined && windowIndex < 0));

  const { data: nextPage } = useQuery({
    queryKey: ['eventNext', id, scopeMonitor, startAt, urlFilters],
    queryFn: () => getEvents({
      ...urlFilters,
      monitor_id: scopeMonitor,
      sort: 'start_time',
      direction: 'asc',
      start_time: startAt!,
      page_size: 10,
    }),
    enabled: isAuthenticated && !!event && !!startAt && fallbackActive,
  });

  // `end_time` bounds end_date_time, so this anchor is the newest event that
  // had finished by the time the current one began.
  const { data: prevAnchorPage } = useQuery({
    queryKey: ['eventPrevAnchor', id, scopeMonitor, startAt, urlFilters],
    queryFn: () => getEvents({
      ...urlFilters,
      monitor_id: scopeMonitor,
      sort: 'start_time',
      direction: 'desc',
      end_time: startAt!,
      page_size: 1,
    }),
    enabled: isAuthenticated && !!event && !!startAt && fallbackActive,
  });
  const anchor = prevAnchorPage?.items[0] ?? null;
  const anchorStart = anchor?.start_date_time ?? null;

  const { data: prevPage } = useQuery({
    queryKey: ['eventPrev', id, scopeMonitor, anchorStart, urlFilters],
    queryFn: () => getEvents({
      ...urlFilters,
      monitor_id: scopeMonitor,
      sort: 'start_time',
      direction: 'asc',
      start_time: anchorStart!,
      page_size: 50,
    }),
    enabled: isAuthenticated && !!event && !!anchorStart && fallbackActive,
  });

  const nextNeighbour = useMemo<EventRef | null>(() => {
    if (idsActive) {
      const at = explicitIds![idsIndex + 1];
      return at != null ? { id: at, start_date_time: null } : null;
    }
    if (listResolved) return listNext;
    if (!event || !nextPage) return null;
    const hit = pickNextEvent(event, nextPage.items);
    return hit != null ? (nextPage.items.find((e) => e.id === hit) ?? { id: hit, start_date_time: null }) : null;
     
  }, [idsActive, explicitIds, idsIndex, listResolved, listNext, event, nextPage]);

  const prevNeighbourId = useMemo(() => {
    if (idsActive) return idsIndex > 0 ? explicitIds![idsIndex - 1] : null;
    if (listResolved) return listPrev?.id ?? null;
    if (!event || !anchor) return null;
    // The anchor is itself a valid earlier event, so it stays a candidate in
    // case the 50-row window from it does not reach the current event.
    return pickPrevEvent(event, [anchor, ...(prevPage?.items ?? [])]);
     
  }, [idsActive, explicitIds, idsIndex, listResolved, listPrev, event, anchor, prevPage]);

  const nextEventId = nextNeighbour?.id ?? null;
  const prevEventId = prevNeighbourId;
  /** The next event's own start, for the `all` replay gap. */
  const nextEventStart = nextNeighbour?.start_date_time ?? null;

  const goTo = (eventId: number | null) => {
    if (eventId != null) {
      navigate({
        to: '/events/$eventId',
        params: { eventId: String(eventId) },
        search: listSearch,
      });
    }
  };
  const navPrev = () => goTo(prevEventId);
  const navNext = () => goTo(nextEventId);

  // ----- End of playback ---------------------------------------------------
  //
  // "No more events" is legacy's overlay when Next has nowhere to go —
  // after the last event of a replay run, and after deleting the last one.
  const [noMoreEvents, setNoMoreEvents] = useState(false);
  // `all` waits the real gap between this event's end and the next one's
  // start, counting it down over the player (legacy `vjsReplay`).
  const [gapCountdown, setGapCountdown] = useState<string | null>(null);
  const gapTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopGap = () => {
    if (gapTimer.current) clearInterval(gapTimer.current);
    gapTimer.current = null;
    setGapCountdown(null);
  };
  useEffect(() => {
    setNoMoreEvents(false);
    return stopGap;
  }, [id]);

  const handleVideoEnded = () => {
    setIsPlaying(false);
    if (replayMode === 'none') return;
    if (replayMode === 'single') {
      videoRef.current?.play();
      return;
    }
    if (nextEventId == null) {
      setNoMoreEvents(true);
      return;
    }
    if (replayMode === 'gapless') {
      goTo(nextEventId);
      return;
    }
    // `all`: no end stamp, no known next start, or a next event that began
    // before this one finished — all go straight on, as legacy does.
    const endMs = event?.end_date_time ? Date.parse(event.end_date_time) : NaN;
    const nextMs = nextEventStart ? Date.parse(nextEventStart) : NaN;
    if (!Number.isFinite(endMs) || !Number.isFinite(nextMs) || nextMs <= endMs) {
      goTo(nextEventId);
      return;
    }
    const target = Date.now() + (nextMs - endMs);
    setGapCountdown(formatGap(nextMs - endMs));
    gapTimer.current = setInterval(() => {
      const remaining = target - Date.now();
      if (remaining <= 0) {
        stopGap();
        goTo(nextEventId);
        return;
      }
      setGapCountdown(formatGap(remaining));
    }, 1000);
  };

  // ----- Mutations ---------------------------------------------------------

  const invalidateEvent = () => {
    queryClient.invalidateQueries({ queryKey: ['event', id] });
    queryClient.invalidateQueries({ queryKey: ['events'] });
    queryClient.invalidateQueries({ queryKey: ['recentEvents'] });
  };

  const patchMutation = useMutation({
    mutationFn: (payload: EventUpdatePayload) => updateEvent(id, payload),
    onSuccess: invalidateEvent,
    onError: toast.apiError,
  });
  const archiveMutation = useMutation({
    mutationFn: (archived: boolean) => updateEvent(id, { archived }),
    onSuccess: invalidateEvent,
    onError: toast.apiError,
  });
  // Legacy deletes, then plays the next event (`streamNext(true)`); with no
  // next event it stays put and shows "No more events" over the player.
  const deleteMutation = useMutation({
    mutationFn: () => deleteEvent(id),
    onError: toast.apiError,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['recentEvents'] });
      setDeleteOpen(false);
      if (nextEventId != null) {
        queryClient.removeQueries({ queryKey: ['event', id] });
        goTo(nextEventId);
      } else {
        videoRef.current?.pause();
        setNoMoreEvents(true);
      }
    },
  });

  // ZoneMinder refuses to delete an archived event — unarchive it first.
  const canDelete = !!event && event.archived !== 1;
  const deleteBlockedReason = event && event.archived === 1
    ? t('You cannot delete an archived event.')
    : null;
  /** Shift+click deletes without the confirmation, as legacy does. */
  const requestDelete = (shiftKey = false) => {
    if (!canDelete) return;
    deleteMutation.reset();
    if (shiftKey) deleteMutation.mutate();
    else setDeleteOpen(true);
  };

  const saveEdit = (draft: EventEditDraft) => {
    patchMutation.mutate(
      {
        name: draft.name.trim(),
        cause: draft.cause.trim() || null,
        notes: draft.notes.trim() || null,
      },
      { onSuccess: () => setEditOpen(false) },
    );
  };

  // ----- Player handlers ---------------------------------------------------

  const handlePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        // Pausing out of a rewind lands back on 1x (legacy `pauseClicked`).
        if (rewinding) setRate(1);
        videoRef.current.pause();
      } else {
        // Play from Stop or a rewind means forward at 1x (legacy `playClicked`).
        if (rate <= 0) setRate(1);
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleToggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  };

  const handleToggleFullscreen = () => {
    // Fullscreen the frame, not the <video>: the controls, the zones overlay
    // and the pinch-zoom transform all live in the frame, and fullscreening
    // the video alone would drop them for the browser's own control bar.
    const target = playerRef.current ?? videoRef.current;
    if (target) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        target.requestFullscreen();
      }
    }
  };

  const handleSeek = (e: ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const seekTo = (t: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = t;
      setCurrentTime(t);
    }
  };

  // Frame stepping: ±(Length / Frames) seconds, legacy's `spf`. The buttons
  // only apply while the transport is stopped (legacy `streamPause` enables
  // slowFwd/slowRev and `streamPlay` marks them unavailable).
  const frameCount = Number(event?.frames) || 0;
  const eventLength = Number(event?.length) || 0;
  const secondsPerFrame = frameCount > 0 && eventLength > 0
    ? Math.round((eventLength / frameCount) * 1e6) / 1e6
    : 0;
  const canStep = !isPlaying && !rewinding && secondsPerFrame > 0;
  const stepForward = () => {
    const el = videoRef.current;
    if (el && secondsPerFrame > 0) seekTo(el.currentTime + secondsPerFrame);
  };
  const stepBack = () => {
    const el = videoRef.current;
    if (el && secondsPerFrame > 0) seekTo(Math.max(0, el.currentTime - secondsPerFrame));
  };

  // A run started from the list's View button plays on arrival (legacy `play=1`),
  // once per event and only after a source is actually attached.
  const autoplayedFor = useRef<number | null>(null);
  useEffect(() => {
    if (!navScope?.autoplay || autoplayedFor.current === id) return;
    if (playbackMode !== 'direct' && playbackMode !== 'hls') return;
    // The element only exists once the event has loaded; until then there is
    // nothing to start, and this must not count as the one attempt.
    const el = videoRef.current;
    if (!el) return;
    autoplayedFor.current = id;
    el.play();
  }, [navScope?.autoplay, playbackMode, id, event?.id]);

  // ----- Tags --------------------------------------------------------------

  const tagApiRef = useRef<TagChipsApi | null>(null);
  const tagAndPrev = () => {
    tagApiRef.current?.addFirst();
    navPrev();
  };
  const tagAndNext = () => {
    tagApiRef.current?.addFirst();
    navNext();
  };

  // ----- Keyboard ----------------------------------------------------------
  // Off while a dialog is open so Space / Delete cannot act behind it.
  useEventHotkeys(
    {
      ArrowLeft: navPrev,
      ArrowRight: navNext,
      ' ': handlePlayPause,
      Delete: (e) => requestDelete(e.shiftKey),
      ArrowDown: () => tagApiRef.current?.focus(),
      'Ctrl+ArrowDown': () => tagApiRef.current?.addFirst(),
    },
    !!event && !editOpen && !deleteOpen,
  );

  // ----- Derived presentation ---------------------------------------------

  const startTime = event?.start_date_time ? new Date(event.start_date_time) : null;
  const endTime = event?.end_date_time ? new Date(event.end_date_time) : null;
  const reviewSearch = useMemo(() => {
    if (!event || !startTime) return null;
    const pad = 5 * 60_000;
    const end = endTime ?? new Date(startTime.getTime() + (Number(event.length) || 0) * 1000);
    return {
      monitor_id: event.monitor_id,
      min_time: toZmDateTime(toLocalDatetime(new Date(startTime.getTime() - pad))),
      max_time: toZmDateTime(toLocalDatetime(new Date(end.getTime() + pad))),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id, event?.monitor_id, event?.start_date_time, event?.end_date_time, event?.length]);
  // The hook owns the <video> source; this URL is only used for download (the
  // Range-supported progressive MP4 endpoint).
  const downloadUrl = event ? getEventStreamUrl(event.id, accessToken || undefined) : '';
  const thumbnailUrl = event ? getEventThumbnailUrl(event.id, accessToken || undefined) : '';

  // What the decoder actually produced, which is not always what the event
  // payload's width/height say — see `decodedUpright` below.
  const [decoded, setDecoded] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const note = () => {
      if (el.videoWidth > 0 && el.videoHeight > 0) {
        setDecoded((prev) =>
          prev && prev.w === el.videoWidth && prev.h === el.videoHeight
            ? prev
            : { w: el.videoWidth, h: el.videoHeight },
        );
      }
    };
    note();
    el.addEventListener('loadedmetadata', note);
    // A source swap (direct mp4 → HLS fallback) changes the frame size
    // without another `loadedmetadata` in every browser.
    el.addEventListener('resize', note);
    return () => {
      el.removeEventListener('loadedmetadata', note);
      el.removeEventListener('resize', note);
    };
  }, [event?.id]);

  // Container takes the camera's declared (post-rotation) aspect so a
  // portrait camera gets a portrait box. The stored mp4 SHOULD carry a
  // rotation side-data tag, but in practice the HLS path served by zm-api
  // strips it and Safari historically ignores it even when present, so
  // the dashboard applies its own swap-dimensions transform — same
  // strategy as live streaming via StreamCell.
  const effW = event?.width  || 16;
  const effH = event?.height || 9;
  const videoContainerW = isFullscreen ? 16 : effW;
  const videoContainerH = isFullscreen ? 9  : effH;
  // Browsers disagree about the mp4's rotation tag. Chromium presents a
  // Rotate90 recording already upright — `videoWidth`/`videoHeight` come back
  // portrait — while Safari has historically ignored the tag and hands us the
  // landscape frame. Rotating on top of a frame the decoder already rotated
  // is exactly what leaves playback lying on its side, so trust what was
  // decoded and fall back to the event's orientation only until metadata
  // lands. (The stills are a separate matter: the thumbnail JPEG is stored
  // unrotated, so it still needs the CSS transform.)
  const decodedUpright =
    decoded != null &&
    decoded.w !== decoded.h &&
    decoded.w < decoded.h === effW < effH;
  const orientationRotates = event ? isOrientationRotated(event.orientation) : false;
  const useSwappedRotation = orientationRotates && !decodedUpright;
  const videoElementStyle: CSSProperties | undefined = !event
    ? undefined
    : useSwappedRotation
      ? getOrientationFillStyle(event.orientation)
      : orientationRotates
        // Already upright out of the decoder: any transform here would undo
        // that. Flips are not covered by the rotation tag, but a camera is
        // either rotated or flipped, never both, so there is nothing to add.
        ? undefined
        : getOrientationStyle(event.orientation);

  // Source codec hint — prefer the codec the backend detected from the actual
  // stream (/info), falling back to the default_video filename when /info
  // hasn't loaded or reports "Unknown".
  const codecHint =
    videoInfo?.video_codec && videoInfo.video_codec !== 'Unknown'
      ? videoInfo.video_codec
      : event?.default_video?.trim()
        ? event.default_video
        : t('Unknown');

  // Scale is remembered per monitor (legacy `zmEventScale<mid>` cookie) and
  // seeded from the monitor's own default; it becomes a max-width on the
  // player frame, so Auto and Fit to width leave the frame at column width.
  const monitorDefaultScale: PlaybackScale =
    isPlaybackScale(monitor?.default_scale) ? monitor.default_scale : '0';
  const scale: PlaybackScale =
    (event ? scaleByMonitor[event.monitor_id] : undefined) ?? monitorDefaultScale;
  const setScale = (next: PlaybackScale) => {
    if (event) setMonitorScale(event.monitor_id, next);
  };
  const playerMaxWidth = event ? scaleToMaxWidth(scale, effW, effH) : undefined;
  const playerMaxWidthPx = playerMaxWidth ? parseInt(playerMaxWidth, 10) : undefined;

  return {
    isAuthenticated,
    eventLoading,
    eventError: (eventError as Error | null) ?? null,
    event,
    monitor,
    videoInfo,
    storageName,
    eventData,

    videoRef,
    playerRef,
    playbackMode,
    playbackError,
    isPlaying,
    isMuted,
    currentTime,
    duration,
    setCurrentTime,
    setDuration: setMetaDuration,
    setIsPlaying,

    replayMode,
    setReplayMode,
    scale,
    setScale,
    showZones,
    setShowZones,
    showStats,
    setShowStats,
    playerMaxWidth,
    playerMaxWidthPx,
    rate,
    setRate,
    rateOptions: PLAYBACK_RATES,
    codec,
    setCodec,
    scanBack,
    scanForward,
    canScan,
    stepBack,
    stepForward,
    canStep,
    secondsPerFrame,

    prevEventId,
    nextEventId,
    navMonitorId,
    navPrev,
    navNext,
    noMoreEvents,
    gapCountdown,

    tagApiRef,
    tagAndPrev,
    tagAndNext,

    handleVideoEnded,
    handlePlayPause,
    handleToggleMute,
    handleToggleFullscreen,
    handleSeek,
    seekTo,

    toggleArchived: () => { if (event) archiveMutation.mutate(event.archived !== 1); },
    archivePending: archiveMutation.isPending,
    archiveError: errorMessage(archiveMutation.error),

    editOpen,
    openEdit: () => { patchMutation.reset(); setEditOpen(true); },
    closeEdit: () => setEditOpen(false),
    saveEdit,
    savePending: patchMutation.isPending,
    saveError: errorMessage(patchMutation.error),

    deleteOpen,
    requestDelete,
    canDelete,
    deleteBlockedReason,
    cancelDelete: () => setDeleteOpen(false),
    confirmDelete: () => deleteMutation.mutate(),
    deletePending: deleteMutation.isPending,
    deleteError: errorMessage(deleteMutation.error),

    reviewSearch,
    startTime,
    endTime,
    downloadUrl,
    downloadFileName: event?.default_video?.trim() || null,
    thumbnailUrl,
    videoContainerW,
    videoContainerH,
    useSwappedRotation,
    videoElementStyle,
    codecHint,
  };
}
