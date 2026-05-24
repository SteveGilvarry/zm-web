import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useRef, useEffect } from 'react';
import { clsx } from 'clsx';
import {
  ArrowLeft,
  Play,
  Pause,
  Video,
  Monitor,
  ChevronRight,
  Maximize2,
  Volume2,
  VolumeX,
  Trash2,
  Download,
  AlertTriangle,
  Activity,
  SkipBack,
  SkipForward,
  Tag as TagIcon,
} from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { getEvent, getEventVideoUrl, getEventThumbnailUrl, deleteEvent } from '@/api/events';
import { getMonitor } from '@/api/monitors';
import { useAuthStore } from '@/stores/auth';
import { getOrientationStyle, isOrientationRotated } from '@/types';
import type { CSSProperties } from 'react';
import { TagChips } from '@/features/events/TagChips';
import { FrameScrubber } from '@/features/events/FrameScrubber';

export const Route = createFileRoute('/events/$eventId')({
  component: EventDetailPage,
});

function EventDetailPage() {
  const { eventId } = Route.useParams();
  const { isAuthenticated, accessToken } = useAuthStore();
  const queryClient = useQueryClient();

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Tracks the video file's intrinsic dimensions once metadata loads. If
  // these already match the event's declared (post-rotation) dimensions,
  // the file was rotated server-side at write time and we must not apply
  // a second CSS rotation on top.
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Track fullscreen so the rotated-video styling can switch between the
  // event-shaped container fit (inline) and the 16:9-screen fit (fullscreen).
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const id = parseInt(eventId, 10);

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

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getCauseColor = (cause: string) => {
    const lowerCause = cause.toLowerCase();
    if (lowerCause.includes('motion')) return 'bg-amber/20 text-amber border-amber/30';
    if (lowerCause.includes('alarm')) return 'bg-crimson/20 text-crimson border-crimson/30';
    if (lowerCause.includes('continuous')) return 'bg-cyan/20 text-cyan border-cyan/30';
    return 'bg-text-muted/20 text-text-secondary border-text-muted/30';
  };

  if (!isAuthenticated) return null;

  if (eventLoading) {
    return (
      <AppShell title="Loading...">
        <main className="flex-1 p-6">
          <div className="animate-pulse space-y-6">
            <div className="h-[500px] bg-surface rounded-xl" />
            <div className="grid grid-cols-4 gap-4">
              <div className="h-24 bg-surface rounded-xl" />
              <div className="h-24 bg-surface rounded-xl" />
              <div className="h-24 bg-surface rounded-xl" />
              <div className="h-24 bg-surface rounded-xl" />
            </div>
          </div>
        </main>
      </AppShell>
    );
  }

  if (!event) {
    return (
      <AppShell title="Event Not Found">
        <main className="flex-1 p-6 flex items-center justify-center">
          <div className="text-center">
            <Video size={64} className="mx-auto mb-4 text-text-muted" />
            <h2 className="text-xl font-bold text-text-primary mb-2">Event Not Found</h2>
            <p className="text-text-muted mb-6">The requested event could not be found.</p>
            <Link
              to="/events"
              className="px-6 py-3 bg-cyan text-void font-medium rounded-lg hover:bg-cyan-dim transition-colors"
            >
              Back to Events
            </Link>
          </div>
        </main>
      </AppShell>
    );
  }

  const startTime = event.start_date_time ? new Date(event.start_date_time) : null;
  const endTime = event.end_date_time ? new Date(event.end_date_time) : null;
  const videoUrl = getEventVideoUrl(event.id, accessToken || undefined);
  const thumbnailUrl = getEventThumbnailUrl(event.id, accessToken || undefined);

  // Rotation handling — two cases:
  //
  //  (a) the saved MP4 was rotated server-side at write time; its intrinsic
  //      dimensions already match the event's declared (post-rotation) dims.
  //      In this case we must NOT apply CSS rotation — the file is already
  //      correctly oriented, and rotating it would un-rotate it visually.
  //
  //  (b) the file is the raw pre-rotation stream and we need CSS to rotate
  //      it on display, the same way the live monitor view does.
  //
  // We detect (a) by waiting for the video element to load metadata and
  // comparing videoWidth/Height against event.width/height. Until metadata
  // is available we optimistically assume (a) for rotated cameras so we
  // don't briefly show a wrongly-rotated frame.
  const rotated = isOrientationRotated(event.orientation);
  const effW = event.width  || 16;
  const effH = event.height || 9;
  const fileAlreadyRotated =
    rotated && natural != null && natural.w === effW && natural.h === effH;
  const needsCssRotation = rotated && natural != null && !fileAlreadyRotated;

  // Container takes the camera's declared aspect when inline, 16:9 in
  // fullscreen (browsers letterbox inside the screen anyway).
  const videoContainerW = isFullscreen ? 16 : effW;
  const videoContainerH = isFullscreen ? 9  : effH;

  // Swap-dimensions rotation only applies when CSS rotation is actually
  // needed AND we're not in fullscreen. Otherwise plain object-contain.
  const useSwappedRotation = needsCssRotation && !isFullscreen;
  const rotationDeg = (event.orientation ?? '').replace(/[_\s]/g, '').toLowerCase() === 'rotate270' ? 270 : 90;
  const videoElementStyle: CSSProperties | undefined = useSwappedRotation
    ? {
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: `${(effH / effW) * 100}%`,
        height: `${(effW / effH) * 100}%`,
        maxWidth: 'none',
        maxHeight: 'none',
        transform: `translate(-50%, -50%) rotate(${rotationDeg}deg)`,
        transformOrigin: 'center',
      }
    : needsCssRotation
      ? getOrientationStyle(event.orientation)
      : undefined;

  return (
    <AppShell title={event.name}>
      <main className="flex-1 p-6 overflow-auto">
        {/* Breadcrumb */}
          <div className="flex items-center gap-2 mb-6 text-sm">
            <Link
              to="/events"
              className="flex items-center gap-1 text-text-muted hover:text-cyan transition-colors"
            >
              <ArrowLeft size={14} />
              Events
            </Link>
            <ChevronRight size={14} className="text-text-muted" />
            <span className="text-text-primary">{event.name}</span>
          </div>

          <div className="grid grid-cols-12 gap-6">
            {/* Video Player - 8 columns */}
            <div className="col-span-8 space-y-6">
              <Panel noPadding className="overflow-hidden">
                <div
                  className="relative bg-black"
                  style={{ aspectRatio: `${videoContainerW} / ${videoContainerH}` }}
                >
                  {/* Video element — rotated cameras need a swap-dimensions
                      + rotate trick so the portrait content fills the
                      portrait container instead of pillarboxing at center. */}
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    poster={thumbnailUrl}
                    className={useSwappedRotation ? 'object-contain bg-black' : 'w-full h-full object-contain bg-black'}
                    style={videoElementStyle}
                    onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                    onLoadedMetadata={(e) => {
                      setDuration(e.currentTarget.duration);
                      setNatural({
                        w: e.currentTarget.videoWidth,
                        h: e.currentTarget.videoHeight,
                      });
                    }}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onEnded={() => setIsPlaying(false)}
                  />

                  {/* Play overlay when paused */}
                  {!isPlaying && (
                    <button
                      onClick={handlePlayPause}
                      className="absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity hover:bg-black/40"
                    >
                      <div className="w-16 h-16 rounded-full bg-cyan/80 flex items-center justify-center">
                        <Play size={32} className="text-void ml-1" />
                      </div>
                    </button>
                  )}

                  {/* Controls overlay */}
                  <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/90 to-transparent">
                    {/* Progress bar */}
                    <div className="mb-3">
                      <input
                        type="range"
                        min={0}
                        max={duration || 100}
                        value={currentTime}
                        onChange={handleSeek}
                        className="w-full h-1 bg-text-muted/30 rounded-full appearance-none cursor-pointer
                          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {/* Play/Pause */}
                        <button
                          onClick={handlePlayPause}
                          className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
                        >
                          {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                        </button>

                        {/* Skip buttons */}
                        <button
                          onClick={() => handleSkip(-10)}
                          className="p-2 rounded-lg text-white/70 hover:text-white transition-colors"
                        >
                          <SkipBack size={16} />
                        </button>
                        <button
                          onClick={() => handleSkip(10)}
                          className="p-2 rounded-lg text-white/70 hover:text-white transition-colors"
                        >
                          <SkipForward size={16} />
                        </button>

                        {/* Time */}
                        <span className="text-sm font-mono text-white">
                          {formatTime(currentTime)} / {formatTime(duration)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Volume */}
                        <button
                          onClick={handleToggleMute}
                          className="p-2 rounded-lg text-white/70 hover:text-white transition-colors"
                        >
                          {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                        </button>

                        {/* Fullscreen */}
                        <button
                          onClick={handleToggleFullscreen}
                          className="p-2 rounded-lg text-white/70 hover:text-white transition-colors"
                        >
                          <Maximize2 size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </Panel>

              {/* Frame Scrubber — per-frame stepper, score-graded ticks */}
              <Panel>
                <FrameScrubber
                  eventId={event.id}
                  durationSec={duration || Number(event.length) || 0}
                  currentTimeSec={currentTime}
                  onSeek={(t) => {
                    if (videoRef.current) {
                      videoRef.current.currentTime = t;
                      setCurrentTime(t);
                    }
                  }}
                />
              </Panel>

              {/* Stats Cards — five cells so Total Score gets its own readout */}
              <div className="grid grid-cols-5 gap-4">
                <Panel>
                  <div className="text-center">
                    <p className="text-2xl font-mono font-bold text-text-primary">
                      {event.frames || 0}
                    </p>
                    <p className="text-xs text-text-muted mt-1">Total Frames</p>
                  </div>
                </Panel>

                <Panel>
                  <div className="text-center">
                    <p className="text-2xl font-mono font-bold text-crimson">
                      {event.alarm_frames || 0}
                    </p>
                    <p className="text-xs text-text-muted mt-1">Alarm Frames</p>
                  </div>
                </Panel>

                <Panel>
                  <div className="text-center">
                    <p className="text-2xl font-mono font-bold text-text-primary">
                      {event.tot_score ?? 0}
                    </p>
                    <p className="text-xs text-text-muted mt-1">Tot Score</p>
                  </div>
                </Panel>

                <Panel>
                  <div className="text-center">
                    <p className="text-2xl font-mono font-bold text-cyan">
                      {event.avg_score ?? 0}
                    </p>
                    <p className="text-xs text-text-muted mt-1">Avg Score</p>
                  </div>
                </Panel>

                <Panel>
                  <div className="text-center">
                    <p className="text-2xl font-mono font-bold text-amber">
                      {event.max_score ?? 0}
                    </p>
                    <p className="text-xs text-text-muted mt-1">Max Score</p>
                  </div>
                </Panel>
              </div>
            </div>

            {/* Sidebar - 4 columns */}
            <div className="col-span-4 space-y-6">
              {/* Event Details */}
              <Panel title="Event Details" icon={<Video size={16} />}>
                <div className="space-y-4">
                  {/* Monitor */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-secondary">Monitor</span>
                    <Link
                      to="/monitors/$monitorId"
                      params={{ monitorId: String(event.monitor_id) }}
                      className="flex items-center gap-1.5 text-sm text-cyan hover:text-cyan-dim transition-colors"
                    >
                      <Monitor size={14} />
                      {monitor?.name || `Monitor ${event.monitor_id}`}
                    </Link>
                  </div>

                  {/* Cause */}
                  {event.cause && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-text-secondary">Cause</span>
                      <span
                        className={clsx(
                          'px-2 py-1 rounded text-xs font-medium border',
                          getCauseColor(event.cause)
                        )}
                      >
                        {event.cause}
                      </span>
                    </div>
                  )}

                  {/* Start Time */}
                  {startTime && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-text-secondary">Start</span>
                      <span className="text-sm font-mono text-text-primary">
                        {startTime.toLocaleString()}
                      </span>
                    </div>
                  )}

                  {/* End Time */}
                  {endTime && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-text-secondary">End</span>
                      <span className="text-sm font-mono text-text-primary">
                        {endTime.toLocaleString()}
                      </span>
                    </div>
                  )}

                  {/* Duration */}
                  {event.length && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-text-secondary">Duration</span>
                      <span className="text-sm font-mono text-text-primary">
                        {Math.round(event.length)}s
                      </span>
                    </div>
                  )}

                  {/* Archived */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-secondary">Archived</span>
                    <span
                      className={clsx(
                        'text-sm',
                        event.archived === 1 ? 'text-amber' : 'text-text-muted'
                      )}
                    >
                      {event.archived === 1 ? 'Yes' : 'No'}
                    </span>
                  </div>
                </div>
              </Panel>

              {/* Technical Details */}
              <Panel title="Technical" icon={<Activity size={16} />}>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Resolution</span>
                    <span className="font-mono text-text-primary">
                      {event.width}x{event.height}
                    </span>
                  </div>

                  {event.storage_id && (
                    <div className="flex items-center justify-between">
                      <span className="text-text-secondary">Storage</span>
                      <span className="font-mono text-text-primary">ID: {event.storage_id}</span>
                    </div>
                  )}

                  {event.disk_space && (
                    <div className="flex items-center justify-between">
                      <span className="text-text-secondary">Disk Space</span>
                      <span className="font-mono text-text-primary">
                        {(event.disk_space / 1024 / 1024).toFixed(2)} MB
                      </span>
                    </div>
                  )}

                  {event.scheme && (
                    <div className="flex items-center justify-between">
                      <span className="text-text-secondary">Scheme</span>
                      <span className="font-mono text-text-primary">{event.scheme}</span>
                    </div>
                  )}
                </div>
              </Panel>

              {/* Tags — chips + inline editor */}
              <Panel title="Tags" icon={<TagIcon size={16} />}>
                <TagChips eventId={event.id} currentTags={event.tags ?? []} />
              </Panel>

              {/* Notes */}
              {event.notes && (
                <Panel title="Notes" icon={<AlertTriangle size={16} />}>
                  <p className="text-sm text-text-secondary whitespace-pre-wrap">
                    {event.notes}
                  </p>
                </Panel>
              )}

              {/* Actions */}
              <Panel title="Actions">
                <div className="space-y-2">
                  <a
                    href={videoUrl}
                    download
                    className={clsx(
                      'flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg',
                      'bg-surface border border-border-subtle',
                      'text-text-primary hover:border-cyan/50 transition-colors'
                    )}
                  >
                    <Download size={16} />
                    Download Video
                  </a>

                  <button
                    onClick={() => {
                      if (confirm('Are you sure you want to delete this event?')) {
                        deleteMutation.mutate();
                      }
                    }}
                    disabled={deleteMutation.isPending}
                    className={clsx(
                      'flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg',
                      'bg-crimson/10 border border-crimson/30',
                      'text-crimson hover:bg-crimson/20 transition-colors',
                      'disabled:opacity-50 disabled:cursor-not-allowed'
                    )}
                  >
                    <Trash2 size={16} />
                    Delete Event
                  </button>
                </div>
              </Panel>
            </div>
          </div>
      </main>
    </AppShell>
  );
}
