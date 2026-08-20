import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getMonitor, updateMonitor, getLiveStats } from '@/api/monitors';
import { getEvents } from '@/api/events';
import { useAuthStore } from '@/stores/auth';
import { useWebRtcStream, type StreamHookResult } from '@/hooks/useWebRtcStream';
import { useHlsStream } from '@/hooks/useHlsStream';
import { usePtzCapabilities, type PtzState } from '@/features/ptz/usePtz';
import type { LiveStats, Monitor, StreamProtocol, ZmEvent } from '@/types';

export interface WatchModeUpdate {
  capturing?: string;
  analysing?: string;
  recording?: string;
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
  protocol: StreamProtocol;
  /** The stream hook for the selected protocol. Both are always mounted. */
  activeStream: StreamHookResult;
  isStreaming: boolean;
  isConnecting: boolean;
  /** Stream is anything other than idle. */
  isActive: boolean;
  ptzState: PtzState;
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
}

/**
 * Everything the Watch page needs for one monitor: the monitor record,
 * both stream hooks (only the selected protocol is started), PTZ
 * capabilities, recent events, mode mutations, and the transport handlers.
 * Both skins render from this.
 */
export function useWatchPage(monitorId: number): WatchPageState {
  const { isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();
  const id = monitorId;

  const [protocol, setProtocol] = useState<StreamProtocol>('webrtc');
  const [isMuted, setIsMuted] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);

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

  // Auto-start stream once monitor data confirms it's capturing
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!monitor || autoStarted.current) return;
    const isCapturing = monitor.capturing !== 'None';
    if (isCapturing) {
      // Always call start() so this view registers as a stream consumer —
      // even when the shared WebRTC stream is already running (navigated in
      // from the console). start() is reference-counted and idempotent.
      const timer = setTimeout(() => {
        autoStarted.current = true;
        activeStream.start();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [monitor, activeStream]);

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
  });

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
      // Event handler toggling a DOM property on the <video>; the compiler
      // cannot see that this element is not React state.
      // eslint-disable-next-line react-hooks/immutability
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
  };

  return {
    monitorId: id,
    isAuthenticated,
    monitor,
    monitorLoading,
    events: eventsData?.items || [],
    liveStats,
    protocol,
    activeStream,
    isStreaming,
    isConnecting,
    isActive,
    ptzState,
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
  };
}
