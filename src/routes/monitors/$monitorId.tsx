import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import {
  ArrowLeft,
  Play,
  Pause,
  Video,
  VideoOff,
  Settings,
  Maximize2,
  Volume2,
  VolumeX,
  RefreshCw,
  Activity,
  Clock,
  HardDrive,
  Layers,
  AlertTriangle,
  ChevronRight,
  Loader2,
  Wifi,
  Radio,
} from 'lucide-react';

import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { Panel } from '@/components/common/Panel';
import {
  getMonitor,
  updateMonitor,
  getLiveStats,
} from '@/api/monitors';
import { getEvents } from '@/api/events';
import { useAuthStore } from '@/stores/auth';
import type { StreamProtocol, CapturingMode, AnalysingMode, RecordingMode } from '@/types';
import { getOrientationStyle } from '@/types';
import { useWebRtcStream } from '@/hooks/useWebRtcStream';
import { useHlsStream } from '@/hooks/useHlsStream';

export const Route = createFileRoute('/monitors/$monitorId')({
  component: MonitorDetailPage,
});

function MonitorDetailPage() {
  const { monitorId } = Route.useParams();
  const { isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();

  const [protocol, setProtocol] = useState<StreamProtocol>('webrtc');
  const [isMuted, setIsMuted] = useState(true);

  const id = parseInt(monitorId, 10);

  // Streaming hooks — both always mounted, only active one gets start() called
  const webrtc = useWebRtcStream(id);
  const hls = useHlsStream(id);

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
    mutationFn: (data: { capturing?: string; analysing?: string; recording?: string }) => updateMonitor(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monitor', id] });
      queryClient.invalidateQueries({ queryKey: ['monitors'] });
    },
  });

  const handleStartStream = () => {
    activeStream.start();
  };

  const handleStopStream = () => {
    activeStream.stop();
    queryClient.invalidateQueries({ queryKey: ['liveSessions'] });
  };

  const handleProtocolChange = (newProtocol: StreamProtocol) => {
    if (newProtocol === protocol) return;
    // Stop current stream before switching
    if (isActive) {
      activeStream.stop();
      queryClient.invalidateQueries({ queryKey: ['liveSessions'] });
    }
    setProtocol(newProtocol);
  };

  const handleToggleFullscreen = () => {
    const video = activeStream.videoRef.current;
    if (video) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        video.requestFullscreen();
      }
    }
  };

  const handleToggleMute = () => {
    const video = activeStream.videoRef.current;
    if (video) {
      video.muted = !video.muted;
      setIsMuted(video.muted);
    }
  };

  const handleRetry = () => {
    activeStream.stop();
    // Small delay before restarting
    setTimeout(() => activeStream.start(), 200);
  };

  if (!isAuthenticated) return null;

  if (monitorLoading) {
    return (
      <div className="min-h-screen bg-void">
        <Sidebar />
        <div className="ml-56 min-h-screen flex flex-col">
          <Header title="Loading..." />
          <main className="flex-1 p-6">
            <div className="animate-pulse space-y-6">
              <div className="h-[500px] bg-surface rounded-xl" />
              <div className="grid grid-cols-3 gap-4">
                <div className="h-32 bg-surface rounded-xl" />
                <div className="h-32 bg-surface rounded-xl" />
                <div className="h-32 bg-surface rounded-xl" />
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (!monitor) {
    return (
      <div className="min-h-screen bg-void">
        <Sidebar />
        <div className="ml-56 min-h-screen flex flex-col">
          <Header title="Monitor Not Found" />
          <main className="flex-1 p-6 flex items-center justify-center">
            <div className="text-center">
              <VideoOff size={64} className="mx-auto mb-4 text-text-muted" />
              <h2 className="text-xl font-bold text-text-primary mb-2">Monitor Not Found</h2>
              <p className="text-text-muted mb-6">The requested monitor could not be found.</p>
              <Link
                to="/monitors"
                className="px-6 py-3 bg-cyan text-void font-medium rounded-lg hover:bg-cyan-dim transition-colors"
              >
                Back to Monitors
              </Link>
            </div>
          </main>
        </div>
      </div>
    );
  }

  const isEnabled = monitor.capturing !== 'None';
  const events = eventsData?.items || [];

  return (
    <div className="min-h-screen bg-void">
      <Sidebar />

      <div className="ml-56 min-h-screen flex flex-col">
        <Header title={monitor.name} />

        <main className="flex-1 p-6 overflow-auto">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 mb-6 text-sm">
            <Link
              to="/monitors"
              className="flex items-center gap-1 text-text-muted hover:text-cyan transition-colors"
            >
              <ArrowLeft size={14} />
              Monitors
            </Link>
            <ChevronRight size={14} className="text-text-muted" />
            <span className="text-text-primary">{monitor.name}</span>
          </div>

          <div className="grid grid-cols-12 gap-6">
            {/* Main video area - 8 columns */}
            <div className="col-span-8 space-y-6">
              {/* Video Player */}
              <Panel noPadding className="overflow-hidden">
                <div className="relative aspect-video bg-abyss">
                  {/* Video element — always rendered so ref is available for HLS attachment */}
                  <video
                    ref={activeStream.videoRef}
                    className={clsx(
                      'w-full h-full object-contain bg-black',
                      !(isActive || isStreaming) && 'hidden',
                    )}
                    style={getOrientationStyle(monitor.orientation)}
                    autoPlay
                    muted={isMuted}
                    playsInline
                  />

                  {/* Connecting overlay */}
                  {isConnecting && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                      <div className="text-center">
                        <Loader2 size={40} className="mx-auto mb-3 text-cyan animate-spin" />
                        <p className="text-sm font-medium text-white">
                          {activeStream.state === 'signaling' ? 'Negotiating...' : 'Connecting...'}
                        </p>
                        <p className="text-xs text-text-muted mt-1">
                          {protocol === 'webrtc' ? 'WebRTC' : 'HLS'} stream
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Stream controls overlay */}
                  {(isActive || isStreaming) && (
                    <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 to-transparent z-10">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {/* Live indicator with protocol */}
                          <div className="flex items-center gap-1.5">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-crimson opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-crimson" />
                            </span>
                            <span className="text-xs font-mono font-bold text-white">
                              LIVE {isStreaming && <>&middot; {protocol === 'webrtc' ? 'WebRTC' : 'HLS'}</>}
                            </span>
                          </div>

                          {/* Stats */}
                          {liveStats && (
                            <span className="text-xs font-mono text-text-muted">
                              {liveStats.packets_processed} packets
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {activeStream.hasAudio && (
                            <button
                              onClick={handleToggleMute}
                              className="p-2 rounded-lg bg-black/50 text-white hover:bg-black/70 transition-colors"
                            >
                              {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                            </button>
                          )}
                          <button
                            onClick={handleToggleFullscreen}
                            className="p-2 rounded-lg bg-black/50 text-white hover:bg-black/70 transition-colors"
                          >
                            <Maximize2 size={16} />
                          </button>
                          <button
                            onClick={handleStopStream}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-crimson/80 text-white hover:bg-crimson transition-colors"
                          >
                            <Pause size={14} />
                            <span className="text-sm font-medium">Stop</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Error overlay */}
                  {activeStream.error && activeStream.state === 'failed' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                      <div className="text-center">
                        <AlertTriangle size={32} className="mx-auto mb-2 text-amber" />
                        <p className="text-sm text-white mb-3">{activeStream.error}</p>
                        <button
                          onClick={handleRetry}
                          className="flex items-center gap-2 px-4 py-2 mx-auto rounded-lg bg-cyan text-void font-medium hover:bg-cyan-dim transition-colors"
                        >
                          <RefreshCw size={14} />
                          Retry
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Non-fatal error toast */}
                  {activeStream.error && activeStream.state !== 'failed' && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2">
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber/90 text-void text-xs font-medium">
                        <AlertTriangle size={12} />
                        {activeStream.error}
                      </div>
                    </div>
                  )}

                  {/* Not streaming placeholder */}
                  {!(isActive || isStreaming) && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      {isEnabled ? (
                        <>
                          <Video size={64} className="mb-4 text-text-dim" />
                          <p className="text-text-muted mb-6">Stream not active</p>
                          <button
                            onClick={handleStartStream}
                            className={clsx(
                              'flex items-center gap-2 px-6 py-3 rounded-lg',
                              'bg-cyan text-void font-medium',
                              'hover:bg-cyan-dim transition-colors',
                            )}
                          >
                            <Play size={18} />
                            Start Stream
                          </button>
                        </>
                      ) : (
                        <>
                          <VideoOff size={64} className="mb-4 text-text-dim" />
                          <p className="text-text-muted">Monitor is disabled</p>
                        </>
                      )}
                      <div className="absolute inset-0 scanlines pointer-events-none" />
                    </div>
                  )}
                </div>
              </Panel>

              {/* Monitor Info Cards */}
              <div className="grid grid-cols-3 gap-4">
                <Panel>
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-cyan/10">
                      <Layers size={20} className="text-cyan" />
                    </div>
                    <div>
                      <p className="text-xs text-text-muted mb-1">Resolution</p>
                      <p className="text-lg font-mono font-medium text-text-primary">
                        {monitor.width}x{monitor.height}
                      </p>
                      <p className="text-xs text-text-muted mt-1">{monitor.colours} bit color</p>
                    </div>
                  </div>
                </Panel>

                <Panel>
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-amber/10">
                      <Activity size={20} className="text-amber" />
                    </div>
                    <div>
                      <p className="text-xs text-text-muted mb-1">Type</p>
                      <p className="text-lg font-medium text-text-primary">
                        {monitor.type || 'Unknown'}
                      </p>
                      <p className="text-xs text-text-muted mt-1">
                        {monitor.protocol || 'N/A'} / {monitor.method || 'N/A'}
                      </p>
                    </div>
                  </div>
                </Panel>

                <Panel>
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-emerald/10">
                      <HardDrive size={20} className="text-emerald" />
                    </div>
                    <div>
                      <p className="text-xs text-text-muted mb-1">Storage</p>
                      <p className="text-lg font-medium text-text-primary">
                        ID: {monitor.storage_id || 'Default'}
                      </p>
                      <p className="text-xs text-text-muted mt-1">
                        Server: {monitor.server_id || 'Local'}
                      </p>
                    </div>
                  </div>
                </Panel>
              </div>
            </div>

            {/* Sidebar - 4 columns */}
            <div className="col-span-4 space-y-6">
              {/* Monitor Controls */}
              <Panel title="Controls" icon={<Settings size={16} />}>
                <div className="space-y-4">
                  {/* Stream Protocol Toggle */}
                  <div>
                    <label className="text-sm text-text-secondary mb-2 block">Stream Protocol</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleProtocolChange('webrtc')}
                        className={clsx(
                          'flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border',
                          'transition-all duration-fast',
                          protocol === 'webrtc'
                            ? 'bg-cyan/20 text-cyan border-cyan/30'
                            : 'bg-surface/50 text-text-muted border-border hover:border-text-muted/50'
                        )}
                      >
                        <Wifi size={12} />
                        WebRTC
                      </button>
                      <button
                        onClick={() => handleProtocolChange('hls')}
                        className={clsx(
                          'flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border',
                          'transition-all duration-fast',
                          protocol === 'hls'
                            ? 'bg-cyan/20 text-cyan border-cyan/30'
                            : 'bg-surface/50 text-text-muted border-border hover:border-text-muted/50'
                        )}
                      >
                        <Radio size={12} />
                        HLS
                      </button>
                    </div>
                    <p className="text-xs text-text-muted mt-2">
                      {protocol === 'webrtc'
                        ? 'Low latency (~500ms)'
                        : 'Universal compatibility (~3-6s delay)'}
                    </p>
                  </div>

                  {/* Capturing */}
                  <div>
                    <label className="text-sm text-text-secondary mb-2 block">Capturing</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['None', 'Ondemand', 'Always'] as CapturingMode[]).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => updateMonitorMutation.mutate({ capturing: mode })}
                          disabled={updateMonitorMutation.isPending}
                          className={clsx(
                            'px-3 py-2 rounded-lg text-xs font-medium border',
                            'transition-all duration-fast',
                            'disabled:opacity-50 disabled:cursor-not-allowed',
                            monitor.capturing === mode
                              ? 'bg-cyan/20 text-cyan border-cyan/30'
                              : 'bg-surface/50 text-text-muted border-border hover:border-text-muted/50'
                          )}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Analysing */}
                  <div>
                    <label className="text-sm text-text-secondary mb-2 block">Analysing</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['None', 'Always'] as AnalysingMode[]).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => updateMonitorMutation.mutate({ analysing: mode })}
                          disabled={updateMonitorMutation.isPending}
                          className={clsx(
                            'px-3 py-2 rounded-lg text-xs font-medium border',
                            'transition-all duration-fast',
                            'disabled:opacity-50 disabled:cursor-not-allowed',
                            monitor.analysing === mode
                              ? 'bg-amber/20 text-amber border-amber/30'
                              : 'bg-surface/50 text-text-muted border-border hover:border-text-muted/50'
                          )}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Recording */}
                  <div>
                    <label className="text-sm text-text-secondary mb-2 block">Recording</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['None', 'OnMotion', 'Always'] as RecordingMode[]).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => updateMonitorMutation.mutate({ recording: mode })}
                          disabled={updateMonitorMutation.isPending}
                          className={clsx(
                            'px-3 py-2 rounded-lg text-xs font-medium border',
                            'transition-all duration-fast',
                            'disabled:opacity-50 disabled:cursor-not-allowed',
                            monitor.recording === mode
                              ? 'bg-crimson/20 text-crimson border-crimson/30'
                              : 'bg-surface/50 text-text-muted border-border hover:border-text-muted/50'
                          )}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </Panel>

              {/* Status Info */}
              <Panel title="Status" icon={<Activity size={16} />}>
                <div className="space-y-3 text-sm">
                  {/* Capturing */}
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Capturing</span>
                    <span className={clsx(
                      'text-xs font-medium',
                      monitor.capturing === 'Always' ? 'text-emerald' : 'text-text-muted'
                    )}>
                      {monitor.capturing || 'None'}
                    </span>
                  </div>

                  {/* Analysing */}
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Analysing</span>
                    <span className={clsx(
                      'text-xs font-medium',
                      monitor.analysing === 'Always' ? 'text-amber' : 'text-text-muted'
                    )}>
                      {monitor.analysing || 'None'}
                    </span>
                  </div>

                  {/* Recording */}
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Recording</span>
                    <span className={clsx(
                      'text-xs font-medium',
                      monitor.recording === 'Always' ? 'text-crimson' : 'text-text-muted'
                    )}>
                      {monitor.recording || 'None'}
                    </span>
                  </div>

                  {/* Decoding */}
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Decoding</span>
                    <span className={clsx(
                      'text-xs font-medium',
                      monitor.decoding_enabled === 1 ? 'text-emerald' : 'text-text-muted'
                    )}>
                      {monitor.decoding_enabled === 1 ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>

                  {/* Event Prefix */}
                  {monitor.event_prefix && (
                    <div className="flex items-center justify-between">
                      <span className="text-text-secondary">Event Prefix</span>
                      <span className="font-mono text-text-primary">
                        {monitor.event_prefix}
                      </span>
                    </div>
                  )}
                </div>
              </Panel>

              {/* Connection Details */}
              <Panel title="Connection" icon={<Activity size={16} />}>
                <div className="space-y-3 text-sm">
                  {monitor.host && (
                    <div className="flex items-center justify-between">
                      <span className="text-text-secondary">Host</span>
                      <span className="font-mono text-text-primary truncate max-w-[180px]">
                        {monitor.host}
                      </span>
                    </div>
                  )}
                  {monitor.port && (
                    <div className="flex items-center justify-between">
                      <span className="text-text-secondary">Port</span>
                      <span className="font-mono text-text-primary">{monitor.port}</span>
                    </div>
                  )}
                  {monitor.path && (
                    <div className="flex items-center justify-between">
                      <span className="text-text-secondary">Path</span>
                      <span className="font-mono text-text-primary truncate max-w-[180px]">
                        {monitor.path}
                      </span>
                    </div>
                  )}
                  {monitor.user && (
                    <div className="flex items-center justify-between">
                      <span className="text-text-secondary">User</span>
                      <span className="font-mono text-text-primary">{monitor.user}</span>
                    </div>
                  )}
                </div>
              </Panel>

              {/* Recent Events */}
              <Panel
                title="Recent Events"
                icon={<Video size={16} />}
                action={
                  <Link
                    to="/events"
                    search={{ monitor_id: id }}
                    className="text-xs text-cyan hover:text-cyan-dim transition-colors"
                  >
                    View all
                  </Link>
                }
              >
                {events.length === 0 ? (
                  <p className="text-sm text-text-muted py-4 text-center">No recent events</p>
                ) : (
                  <div className="space-y-2">
                    {events.map((event) => (
                      <Link
                        key={event.id}
                        to="/events/$eventId"
                        params={{ eventId: String(event.id) }}
                        className="flex items-center justify-between p-2 rounded-lg hover:bg-panel transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Video size={14} className="text-text-muted flex-shrink-0" />
                          <span className="text-sm text-text-primary truncate">
                            {event.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-text-muted">
                          <Clock size={12} />
                          {event.start_date_time ? new Date(event.start_date_time).toLocaleTimeString() : 'Unknown'}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </Panel>
            </div>
          </div>
        </main>
      </div>

      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute inset-0 bg-grid opacity-20" />
      </div>
    </div>
  );
}
