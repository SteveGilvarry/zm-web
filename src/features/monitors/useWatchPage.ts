import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getMonitor, updateMonitor, getLiveStats, controlMonitorAlarm, getMonitorSnapshotUrl } from '@/api/monitors';
import { getAuthToken } from '@/api/client';
import { getEvents } from '@/api/events';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/components/common/toastStore';
import { useRouteSearch, searchFlag } from './useRouteSearch';
import { displayDimensions } from './orientation';
import { DEFAULT_STAGE_SIZE, stageStyle, type StageSize } from './watchStage';
import { useWebRtcStream, type StreamHookResult } from '@/hooks/useWebRtcStream';
import { useHlsStream } from '@/hooks/useHlsStream';
import { usePtzCapabilities, type PtzState } from '@/features/ptz/usePtz';
import { useMonitorStatus, type MonitorRuntime } from './useMonitorStatuses';
import type { LiveStats, Monitor, StreamProtocol, ZmEvent } from '@/types';

export interface WatchModeUpdate {
  capturing?: string;
  analysing?: string;
  recording?: string;
}

/**
 * Force Alarm / Cancel — the legacy watch buttons, backed by
 * `PATCH /monitors/{id}/alarm`. On load the hook issues `action: 'status'`;
 * the backend answers with the monitor record (it logs the shared-memory
 * alarm state server-side but does not return it — backend ticket), so the
 * call tells us the endpoint works for this monitor, not whether an alarm
 * is currently forced. `forced` therefore tracks what this session did.
 */
export interface WatchAlarmState {
  /** The alarm endpoint answered for this monitor. */
  available: boolean;
  /** This session forced an alarm and has not cancelled it. */
  forced: boolean;
  isPending: boolean;
  error: string | null;
  force: () => void;
  cancel: () => void;
}

/** Legacy `Stream | Stills` toggle: live video or a refreshing snapshot. */
export type WatchViewMode = 'stream' | 'stills';

/** The legacy Width / Height / Scale selects and the style they produce. */
export interface WatchStageState {
  size: StageSize;
  setWidth: (v: string) => void;
  setHeight: (v: string) => void;
  setScale: (v: string) => void;
  /** Inline style for the stage box (aspect ratio from the monitor). */
  style: CSSProperties;
}

export interface WatchPageState {
  monitorId: number;
  isAuthenticated: boolean;
  monitor: Monitor | undefined;
  monitorLoading: boolean;
  /** Most recent events for this monitor (5). */
  events: ZmEvent[];
  /** HLS packet stats; only polled while an HLS stream is connected. */
  liveStats: LiveStats | undefined;
  /** Capture-process state + fps from the shared 5 s `/monitor-status` poll. */
  runtime: MonitorRuntime | undefined;
  protocol: StreamProtocol;
  /** The stream hook for the selected protocol. Both are always mounted. */
  activeStream: StreamHookResult;
  isStreaming: boolean;
  isConnecting: boolean;
  /** Stream is anything other than idle. */
  isActive: boolean;
  /** WebRTC gave up and the page moved itself to HLS. */
  fellBackToHls: boolean;
  ptzState: PtzState;
  alarm: WatchAlarmState;
  isMuted: boolean;
  isFullscreen: boolean;
  /** Viewport is at least 1024px wide. */
  isWide: boolean;
  editorOpen: boolean;
  openEditor: () => void;
  closeEditor: () => void;
  updateModes: (data: WatchModeUpdate) => void;
  isUpdating: boolean;
  startStream: () => void;
  stopStream: () => void;
  changeProtocol: (next: StreamProtocol) => void;
  toggleFullscreen: () => void;
  toggleMute: () => void;
  retry: () => void;
  /** Refetch the monitor and its recent events. */
  refresh: () => void;
  viewMode: WatchViewMode;
  setViewMode: (mode: WatchViewMode) => void;
  stage: WatchStageState;
  /** Legacy "Download Image": save the current snapshot as a JPEG. */
  downloadImage: () => void;
  isDownloading: boolean;
}

/**
 * Everything the Watch page needs for one monitor: the monitor record,
 * both stream hooks (only the selected protocol is started), PTZ
 * capabilities, runtime status, alarm control, recent events, mode
 * mutations, and the transport handlers. Both skins render from this.
 */
export function useWatchPage(monitorId: number): WatchPageState {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();
  const toast = useToast();
  const search = useRouteSearch();
  const id = monitorId;

  const [protocol, setProtocol] = useState<StreamProtocol>('webrtc');
  const [fellBackToHls, setFellBackToHls] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // `?edit=true` (legacy `?view=monitor&mid=`) opens the editor on load.
  const [editorOpen, setEditorOpen] = useState(() => searchFlag(search, 'edit'));
  const [viewMode, setViewModeState] = useState<WatchViewMode>('stream');
  const [stageSize, setStageSize] = useState<StageSize>(DEFAULT_STAGE_SIZE);
  const [isDownloading, setIsDownloading] = useState(false);

  // Track fullscreen so the rotated-video styling can switch between the
  // portrait-container fit (inline) and the 16:9-screen fit (fullscreen).
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Viewport width — side-by-side layout is only meaningful at desktop width.
  const isWide = useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia('(min-width: 1024px)');
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia('(min-width: 1024px)').matches,
    () => true,
  );

  // Streaming hooks — both always mounted, only active one gets start() called
  const webrtc = useWebRtcStream(id);
  const hls = useHlsStream(id);
  const ptzState = usePtzCapabilities(id, isAuthenticated && !isNaN(id));
  const runtime = useMonitorStatus(id, isAuthenticated && !isNaN(id));

  const activeStream = protocol === 'webrtc' ? webrtc : hls;
  const isStreaming = activeStream.state === 'connected';
  const isConnecting = activeStream.state === 'connecting' || activeStream.state === 'signaling';
  const isActive = activeStream.state !== 'idle';

  // Fetch monitor details
  const { data: monitor, isLoading: monitorLoading } = useQuery({
    queryKey: ['monitor', id],
    queryFn: () => getMonitor(id),
    enabled: isAuthenticated && !isNaN(id),
    refetchInterval: 30000,
  });

  // Fetch live stats when streaming
  const { data: liveStats } = useQuery({
    queryKey: ['liveStats', id],
    queryFn: () => getLiveStats(id),
    enabled: isAuthenticated && isStreaming && protocol === 'hls',
    refetchInterval: 5000,
  });

  // Auto-start the stream once monitor data confirms it's capturing. Re-arms
  // when the protocol changes so a switch after auto-start plays too.
  const autoStarted = useRef<StreamProtocol | null>(null);
  useEffect(() => {
    if (!monitor || autoStarted.current === protocol || viewMode !== 'stream') return;
    const isCapturing = monitor.capturing !== 'None';
    if (isCapturing) {
      // Always call start() so this view registers as a stream consumer —
      // even when the shared WebRTC stream is already running (navigated in
      // from the console). start() is reference-counted and idempotent.
      const timer = setTimeout(() => {
        autoStarted.current = protocol;
        activeStream.start();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [monitor, activeStream, protocol, viewMode]);

  // WebRTC exhausted its retries (no TURN, ICE never completes): move to
  // HLS once, automatically. A manual protocol pick clears the flag.
  const webrtcFailed = webrtc.state === 'failed';
  useEffect(() => {
    if (protocol !== 'webrtc' || !webrtcFailed || fellBackToHls) return;
    if (autoStarted.current !== 'webrtc') return;
    setFellBackToHls(true);
    setProtocol('hls');
  }, [protocol, webrtcFailed, fellBackToHls]);

  // Fetch recent events for this monitor
  const { data: eventsData } = useQuery({
    queryKey: ['monitorEvents', id],
    queryFn: () => getEvents({ monitor_id: id, page: 1, page_size: 5 }),
    enabled: isAuthenticated && !isNaN(id),
    refetchInterval: 30000,
  });

  // Update monitor mutation
  const updateMonitorMutation = useMutation({
    mutationFn: (data: WatchModeUpdate) => updateMonitor(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monitor', id] });
      queryClient.invalidateQueries({ queryKey: ['monitors'] });
    },
    onError: toast.apiError,
  });

  /* ----- Alarm control -------------------------------------------------- */
  const alarmStatusQ = useQuery({
    queryKey: ['monitorAlarmStatus', id],
    queryFn: () => controlMonitorAlarm(id, { action: 'status' }),
    enabled: isAuthenticated && !!monitor && monitor.capturing !== 'None',
    retry: false,
    staleTime: 60_000,
  });
  const [alarmForced, setAlarmForced] = useState(false);
  const [alarmError, setAlarmError] = useState<string | null>(null);
  const alarmMutation = useMutation({
    mutationFn: (action: 'on' | 'cancel') =>
      controlMonitorAlarm(id, action === 'on'
        ? { action: 'on', cause: 'API', score: 100 }
        : { action: 'cancel' }),
    onMutate: () => setAlarmError(null),
    onSuccess: (_data, action) => setAlarmForced(action === 'on'),
    onError: (err: unknown, action) => {
      setAlarmError(err instanceof Error
        ? err.message
        : action === 'on' ? t('Failed to force alarm') : t('Failed to cancel alarm'));
      toast.apiError(err);
    },
  });
  const alarm: WatchAlarmState = {
    available: alarmStatusQ.isSuccess,
    forced: alarmForced,
    isPending: alarmMutation.isPending,
    error: alarmError,
    force: () => alarmMutation.mutate('on'),
    cancel: () => alarmMutation.mutate('cancel'),
  };

  const startStream = () => {
    activeStream.start();
  };

  const stopStream = () => {
    activeStream.stop();
    queryClient.invalidateQueries({ queryKey: ['liveSessions'] });
  };

  const changeProtocol = (newProtocol: StreamProtocol) => {
    if (newProtocol === protocol) return;
    // Stop current stream before switching
    if (isActive) {
      activeStream.stop();
      queryClient.invalidateQueries({ queryKey: ['liveSessions'] });
    }
    setFellBackToHls(false);
    setProtocol(newProtocol);
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
      return;
    }
    // Fullscreen the container — not the <video> directly — so the CSS
    // rotation transform on the video is preserved. Browsers route a
    // fullscreened <video> through the native player which strips CSS.
    const video = activeStream.videoRef.current;
    const container = video?.parentElement;
    if (container) container.requestFullscreen().catch(() => {});
  };

  const toggleMute = () => {
    const video = activeStream.videoRef.current;
    if (video) {
      // Event handler toggling a DOM property on the <video>.
      video.muted = !video.muted;
      setIsMuted(video.muted);
    }
  };

  const retry = () => {
    activeStream.stop();
    // Small delay before restarting
    setTimeout(() => activeStream.start(), 200);
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['monitor', id] });
    queryClient.invalidateQueries({ queryKey: ['monitorEvents', id] });
    queryClient.invalidateQueries({ queryKey: ['monitorStatuses'] });
  };

  // Stills: tear the stream down and let the page poll snapshots instead.
  const setViewMode = (mode: WatchViewMode) => {
    if (mode === viewMode) return;
    if (mode === 'stills' && isActive) {
      activeStream.stop();
      queryClient.invalidateQueries({ queryKey: ['liveSessions'] });
    }
    // Re-arm auto-start for the return trip.
    if (mode === 'stream') autoStarted.current = null;
    setViewModeState(mode);
  };

  const stage: WatchStageState = {
    size: stageSize,
    setWidth: (width) => setStageSize((s) => ({ ...s, width })),
    setHeight: (height) => setStageSize((s) => ({ ...s, height })),
    setScale: (scale) => setStageSize((s) => ({ ...s, scale })),
    style: stageStyle(stageSize, monitor ? displayDimensions(monitor) : { width: 16, height: 9 }),
  };

  // The snapshot endpoint needs the bearer token, so an `<a download>` is
  // not enough: fetch it, then hand the blob to the browser.
  const downloadImage = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      const token = getAuthToken();
      const res = await fetch(getMonitorSnapshotUrl(id), {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error(t('Snapshot unavailable ({{status}})', { status: res.status }));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      a.href = url;
      a.download = `${monitor?.name ?? `monitor-${id}`}-${stamp}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      toast.apiError(err);
    } finally {
      setIsDownloading(false);
    }
  };

  return {
    monitorId: id,
    isAuthenticated,
    monitor,
    monitorLoading,
    events: eventsData?.items || [],
    liveStats,
    runtime,
    protocol,
    activeStream,
    isStreaming,
    isConnecting,
    isActive,
    fellBackToHls,
    ptzState,
    alarm,
    isMuted,
    isFullscreen,
    isWide,
    editorOpen,
    openEditor: () => setEditorOpen(true),
    closeEditor: () => setEditorOpen(false),
    updateModes: (data) => updateMonitorMutation.mutate(data),
    isUpdating: updateMonitorMutation.isPending,
    startStream,
    stopStream,
    changeProtocol,
    toggleFullscreen,
    toggleMute,
    retry,
    refresh,
    viewMode,
    setViewMode,
    stage,
    downloadImage: () => { void downloadImage(); },
    isDownloading,
  };
}
