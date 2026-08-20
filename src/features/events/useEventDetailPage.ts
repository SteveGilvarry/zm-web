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
  type EventVideoInfo,
} from '@/api/events';
import { getMonitor } from '@/api/monitors';
import { useEventVideo } from '@/hooks/useEventVideo';
import { useAuthStore } from '@/stores/auth';
import { useEventPlaybackStore, scaleToMaxWidth } from '@/stores/eventPlayback';
import { isOrientationRotated, getOrientationStyle, getOrientationFillStyle } from '@/types';
import type { Monitor, ZmEvent } from '@/types';

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

type PlaybackStore = ReturnType<typeof useEventPlaybackStore.getState>;

export interface EventDetailPageState {
  isAuthenticated: boolean;
  eventLoading: boolean;
  event: ZmEvent | undefined;
  monitor: Monitor | undefined;
  videoInfo: EventVideoInfo | undefined;

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

  prevEventId: number | null;
  nextEventId: number | null;
  navPrev: () => void;
  navNext: () => void;

  handleVideoEnded: () => void;
  handlePlayPause: () => void;
  handleToggleMute: () => void;
  handleToggleFullscreen: () => void;
  handleSeek: (e: ChangeEvent<HTMLInputElement>) => void;
  handleSkip: (seconds: number) => void;
  seekTo: (t: number) => void;

  deleteEvent: () => void;
  deletePending: boolean;

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

/**
 * Data + playback state for the event detail page. Skin-agnostic: owns the
 * queries, the <video> element ref and every handler; pages only lay out.
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
  } = useEventPlaybackStore();

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  // Precise duration from the <video> loadedmetadata event; 0 until it fires.
  const [metaDuration, setMetaDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Track fullscreen so the rotated-video styling can switch between the
  // event-shaped container fit (inline) and the 16:9-screen fit (fullscreen).
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Fetch event details
  const { data: event, isLoading: eventLoading } = useQuery({
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

  // ----- Prev / next event navigation -----------------------------------
  //
  // Pull a page of events from the same monitor (or all monitors if the
  // current event has no monitor_id) sorted by id ascending. We then find
  // the current id's index and use index±1 to get the adjacent ids.
  //
  // page_size=100 means we cover ~100 events around the current one; for a
  // typical operator clicking through recent events this is plenty without
  // putting heavy load on the backend.
  const { data: neighborhood } = useQuery({
    queryKey: ['eventNeighborhood', event?.monitor_id ?? null, id],
    queryFn: () => getEvents({
      monitor_id: event?.monitor_id,
      sort: 'id',
      direction: 'asc',
      page_size: 100,
    }),
    enabled: isAuthenticated && !!event,
  });

  const { prevEventId, nextEventId } = useMemo(() => {
    if (!neighborhood?.items?.length) return { prevEventId: null, nextEventId: null };
    const items = neighborhood.items;
    const idx = items.findIndex((e) => e.id === id);
    if (idx === -1) return { prevEventId: null, nextEventId: null };
    return {
      prevEventId: idx > 0 ? items[idx - 1].id : null,
      nextEventId: idx < items.length - 1 ? items[idx + 1].id : null,
    };
  }, [neighborhood, id]);

  // When playback ends, apply the replay-mode policy. `single` does nothing
  // (the video just stops); `all` and `gapless` navigate to the next event
  // (only difference: gapless skips the intra-load delay — we honour it by
  // navigating immediately on `ended`, vs `all` which we also do but
  // future-proofed for a real delay if we want one).
  const handleVideoEnded = () => {
    setIsPlaying(false);
    if ((replayMode === 'all' || replayMode === 'gapless') && nextEventId != null) {
      navigate({ to: '/events/$eventId', params: { eventId: String(nextEventId) } });
    }
  };

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => deleteEvent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      window.location.href = '/events';
    },
  });

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

  const navPrev = () => {
    if (prevEventId != null) {
      navigate({ to: '/events/$eventId', params: { eventId: String(prevEventId) } });
    }
  };
  const navNext = () => {
    if (nextEventId != null) {
      navigate({ to: '/events/$eventId', params: { eventId: String(nextEventId) } });
    }
  };

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
    event,
    monitor,
    videoInfo,

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

    prevEventId,
    nextEventId,
    navPrev,
    navNext,

    handleVideoEnded,
    handlePlayPause,
    handleToggleMute,
    handleToggleFullscreen,
    handleSeek,
    handleSkip,
    seekTo,

    deleteEvent: () => deleteMutation.mutate(),
    deletePending: deleteMutation.isPending,

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
