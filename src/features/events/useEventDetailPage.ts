import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type RefObject } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  getEvent,
  getEvents,
  getEventInfo,
  getEventStreamUrl,
  getEventThumbnailUrl,
  deleteEvent,
  updateEvent,
  type EventUpdatePayload,
  type EventVideoInfo,
} from '@/api/events';
import { listEventData, type EventDataRow } from '@/api/eventData';
import { getMonitor } from '@/api/monitors';
import { getStorageList } from '@/api/storage';
import { useEventVideo } from '@/hooks/useEventVideo';
import { useAuthStore } from '@/stores/auth';
import { useEventPlaybackStore, scaleToMaxWidth, PLAYBACK_RATES } from '@/stores/eventPlayback';
import { isOrientationRotated, getOrientationStyle, getOrientationFillStyle } from '@/types';
import type { Monitor, ZmEvent } from '@/types';
import { useEventHotkeys } from './useEventHotkeys';

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
  scale: PlaybackStore['scale'];
  setScale: PlaybackStore['setScale'];
  showZones: boolean;
  setShowZones: (v: boolean) => void;
  showStats: boolean;
  setShowStats: (v: boolean) => void;
  /** CSS max-width for the player frame, derived from `scale`. */
  playerMaxWidth: ReturnType<typeof scaleToMaxWidth>;
  /** Playback speed (0.25× … 16×), applied to the <video>. */
  rate: number;
  setRate: (rate: number) => void;
  rateOptions: readonly number[];

  prevEventId: number | null;
  nextEventId: number | null;
  /** Monitor Prev/Next are confined to, or null for every monitor. */
  navMonitorId: number | null;
  navPrev: () => void;
  navNext: () => void;

  handleVideoEnded: () => void;
  handlePlayPause: () => void;
  handleToggleMute: () => void;
  handleToggleFullscreen: () => void;
  handleSeek: (e: ChangeEvent<HTMLInputElement>) => void;
  handleSkip: (seconds: number) => void;
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

  /** Delete flow: confirm dialog, then DELETE and router navigation to the list. */
  deleteOpen: boolean;
  requestDelete: () => void;
  cancelDelete: () => void;
  confirmDelete: () => void;
  deletePending: boolean;
  deleteError: string | null;

  /** Derived presentation values; all undefined/empty until `event` loads. */
  startTime: Date | null;
  endTime: Date | null;
  downloadUrl: string;
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

  const {
    replayMode, setReplayMode,
    scale, setScale,
    showZones, setShowZones,
    showStats, setShowStats,
    rate, setRate,
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
  );

  // Seed the scrubber length from /info up front; the precise duration from
  // loadedmetadata takes over once playback starts. For an unsupported codec
  // metadata never arrives, so this keeps the timeline labelled correctly.
  const duration = metaDuration > 0 ? metaDuration : (videoInfo?.duration_seconds || 0);

  // Playback speed: applied whenever it changes and again after each source
  // attach (some browsers reset the rate when `src` is swapped).
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = rate;
  }, [rate, playbackMode, metaDuration]);

  // ----- Prev / next event navigation -----------------------------------
  //
  // Neighbours are looked up by time, bounded at the current event's own
  // start, so they work for any event on a monitor with thousands of them
  // (the old page-1-of-100-by-id approach only covered the oldest hundred).
  // Scope: the monitor the events list was filtered to, every monitor when
  // it was unfiltered, or — before the list has been visited — the event's
  // own monitor. The timestamp goes back to the backend verbatim, so the
  // dev box's server-local-stamped-Z values and the fixed build's true UTC
  // both stay self-consistent.
  const navMonitorId: number | null =
    navScope === null ? (event?.monitor_id ?? null) : navScope.monitorId;
  const scopeMonitor = navMonitorId ?? undefined;
  const startAt = event?.start_date_time ?? null;

  const { data: nextPage } = useQuery({
    queryKey: ['eventNext', id, scopeMonitor, startAt],
    queryFn: () => getEvents({
      monitor_id: scopeMonitor,
      sort: 'start_time',
      direction: 'asc',
      start_time: startAt!,
      page_size: 10,
    }),
    enabled: isAuthenticated && !!event && !!startAt,
  });

  // `end_time` bounds end_date_time, so this anchor is the newest event that
  // had finished by the time the current one began.
  const { data: prevAnchorPage } = useQuery({
    queryKey: ['eventPrevAnchor', id, scopeMonitor, startAt],
    queryFn: () => getEvents({
      monitor_id: scopeMonitor,
      sort: 'start_time',
      direction: 'desc',
      end_time: startAt!,
      page_size: 1,
    }),
    enabled: isAuthenticated && !!event && !!startAt,
  });
  const anchor = prevAnchorPage?.items[0] ?? null;
  const anchorStart = anchor?.start_date_time ?? null;

  const { data: prevPage } = useQuery({
    queryKey: ['eventPrev', id, scopeMonitor, anchorStart],
    queryFn: () => getEvents({
      monitor_id: scopeMonitor,
      sort: 'start_time',
      direction: 'asc',
      start_time: anchorStart!,
      page_size: 50,
    }),
    enabled: isAuthenticated && !!event && !!anchorStart,
  });

  const nextEventId = useMemo(
    () => (event && nextPage ? pickNextEvent(event, nextPage.items) : null),
    [event, nextPage],
  );
  const prevEventId = useMemo(() => {
    if (!event || !anchor) return null;
    // The anchor is itself a valid earlier event, so it stays a candidate in
    // case the 50-row window from it does not reach the current event.
    return pickPrevEvent(event, [anchor, ...(prevPage?.items ?? [])]);
  }, [event, anchor, prevPage]);

  const goTo = (eventId: number | null) => {
    if (eventId != null) {
      navigate({ to: '/events/$eventId', params: { eventId: String(eventId) } });
    }
  };
  const navPrev = () => goTo(prevEventId);
  const navNext = () => goTo(nextEventId);

  // When playback ends, apply the replay-mode policy. `single` does nothing
  // (the video just stops); `all` and `gapless` navigate to the next event
  // (only difference: gapless skips the intra-load delay — we honour it by
  // navigating immediately on `ended`, vs `all` which we also do but
  // future-proofed for a real delay if we want one).
  const handleVideoEnded = () => {
    setIsPlaying(false);
    if ((replayMode === 'all' || replayMode === 'gapless') && nextEventId != null) {
      goTo(nextEventId);
    }
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
  });
  const archiveMutation = useMutation({
    mutationFn: (archived: boolean) => updateEvent(id, { archived }),
    onSuccess: invalidateEvent,
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteEvent(id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['event', id] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['recentEvents'] });
      setDeleteOpen(false);
      navigate({ to: '/events' });
    },
  });

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
        videoRef.current.pause();
      } else {
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
    if (videoRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        videoRef.current.requestFullscreen();
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

  const handleSkip = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(
        0,
        Math.min(duration, videoRef.current.currentTime + seconds)
      );
    }
  };

  const seekTo = (t: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = t;
      setCurrentTime(t);
    }
  };

  // ----- Keyboard ----------------------------------------------------------
  // Off while a dialog is open so Space / Delete cannot act behind it.
  useEventHotkeys(
    {
      ArrowLeft: navPrev,
      ArrowRight: navNext,
      ' ': handlePlayPause,
      Delete: () => setDeleteOpen(true),
    },
    !!event && !editOpen && !deleteOpen,
  );

  // ----- Derived presentation ---------------------------------------------

  const startTime = event?.start_date_time ? new Date(event.start_date_time) : null;
  const endTime = event?.end_date_time ? new Date(event.end_date_time) : null;
  // The hook owns the <video> source; this URL is only used for download (the
  // Range-supported progressive MP4 endpoint).
  const downloadUrl = event ? getEventStreamUrl(event.id, accessToken || undefined) : '';
  const thumbnailUrl = event ? getEventThumbnailUrl(event.id, accessToken || undefined) : '';

  // Container takes the camera's declared (post-rotation) aspect so a
  // portrait camera gets a portrait box. The stored mp4 SHOULD carry a
  // rotation side-data tag, but in practice the HLS path served by zm_api
  // strips it and Safari historically ignores it even when present, so
  // the dashboard applies its own swap-dimensions transform — same
  // strategy as live streaming via StreamCell.
  const effW = event?.width  || 16;
  const effH = event?.height || 9;
  const videoContainerW = isFullscreen ? 16 : effW;
  const videoContainerH = isFullscreen ? 9  : effH;
  const useSwappedRotation = event ? isOrientationRotated(event.orientation) : false;
  const videoElementStyle: CSSProperties | undefined = !event
    ? undefined
    : useSwappedRotation
      ? getOrientationFillStyle(event.orientation)
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

  // Scale → max-width style on the video frame container. `auto` leaves
  // the container at column-width.
  const playerMaxWidth = scaleToMaxWidth(scale);

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
    rate,
    setRate,
    rateOptions: PLAYBACK_RATES,

    prevEventId,
    nextEventId,
    navMonitorId,
    navPrev,
    navNext,

    handleVideoEnded,
    handlePlayPause,
    handleToggleMute,
    handleToggleFullscreen,
    handleSeek,
    handleSkip,
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
    requestDelete: () => { deleteMutation.reset(); setDeleteOpen(true); },
    cancelDelete: () => setDeleteOpen(false),
    confirmDelete: () => deleteMutation.mutate(),
    deletePending: deleteMutation.isPending,
    deleteError: errorMessage(deleteMutation.error),

    startTime,
    endTime,
    downloadUrl,
    thumbnailUrl,
    videoContainerW,
    videoContainerH,
    useSwappedRotation,
    videoElementStyle,
    codecHint,
  };
}
