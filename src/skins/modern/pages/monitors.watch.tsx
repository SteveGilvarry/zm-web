import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import type { CSSProperties } from 'react';
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
  Joystick,
  Square,
  Pencil,
} from 'lucide-react';
import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import type { CapturingMode, AnalysingMode, RecordingMode } from '@/types';
import { getOrientationStyle, isOrientationRotated } from '@/types';
import type { PagePropsMap } from '@/skins/types';
import { PtzControls } from '@/features/ptz/PtzControls';
import { ZoneEditor } from '@/features/zones/ZoneEditor';
import { zoneViewDimensions } from '@/features/zones/useZonesPage';
import { MonitorEditor } from '@/features/monitors/editor/MonitorEditor';
import { useWatchPage } from '@/features/monitors/useWatchPage';
import { WatchLoading, WatchNotFound } from '../layouts/WatchStates';
import { useDocumentTitle } from '../layouts/useDocumentTitle';

/** Watch — Mission Control: live stream with adaptive layout, PTZ, zones, controls. */
export default function MonitorWatchPage({ monitorId }: PagePropsMap['monitors.watch']) {
  const { t } = useTranslation();
  const page = useWatchPage(monitorId);
  const {
    monitor, monitorLoading, events, liveStats, protocol, activeStream,
    isStreaming, isConnecting, isActive, ptzState, isMuted, isFullscreen, isWide,
    editorOpen, openEditor, closeEditor, updateModes, isUpdating,
    startStream, stopStream, changeProtocol, toggleFullscreen, toggleMute, retry,
  } = page;
  const id = monitorId;
  // Display labels for the capture/analysis/recording wire values. The
  // values themselves are sent to the API untranslated.
  const modeLabel = (mode: string): string => {
    switch (mode) {
      case 'None': return t('None');
      case 'Ondemand': return t('On Demand');
      case 'Always': return t('Always');
      case 'OnMotion': return t('On Motion');
      default: return mode;
    }
  };
  // Read the stream fields once; the hook result carries the video ref, and
  // reading through it inside JSX trips the refs-during-render lint.
  const { videoRef, state: streamState, error: streamError, hasAudio } = activeStream;
  useDocumentTitle(monitor?.name ?? t('Watch'));

  if (!page.isAuthenticated) return null;

  if (monitorLoading) return <WatchLoading />;

  if (!monitor) return <WatchNotFound />;

  const isEnabled = monitor.capturing !== 'None';

  // Effective dimensions after orientation, used to drive the layout.
  const rotated = isOrientationRotated(monitor.orientation);
  const effW = rotated ? monitor.height : monitor.width;
  const effH = rotated ? monitor.width : monitor.height;
  const aspect = effW > 0 && effH > 0 ? effW / effH : 16 / 9;
  // Portrait/tall cameras get a side-by-side layout that fills the viewport
  // vertically; everything else stacks. Side requires desktop width.
  const layout: 'side' | 'stacked' = aspect <= 0.9 && isWide ? 'side' : 'stacked';
  const aspectStyle = { aspectRatio: `${effW} / ${effH}` };

  // Rotated cameras need different fit logic depending on the container shape.
  // - In a portrait container (side layout, or stacked + narrow viewport),
  //   size the element to the container's swapped dimensions and rotate, so
  //   the rotated content fills the container with no letterboxing.
  // - In fullscreen the container becomes screen-shaped (typically 16:9),
  //   where the classic rotate + scale(9/16) fit applies cleanly.
  const norm = (monitor.orientation ?? '').replace(/[_\s]/g, '').toLowerCase();
  const rotationDeg = norm === 'rotate270' ? 270 : 90;
  const useSwappedRotation = rotated && !isFullscreen;

  const videoClassName = clsx(
    useSwappedRotation
      ? 'object-contain bg-black'
      : 'w-full h-full object-contain bg-black',
    !(isActive || isStreaming) && 'hidden',
  );
  const videoElementStyle: CSSProperties | undefined = useSwappedRotation
    ? {
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: `${(effH / effW) * 100}%`,
        height: `${(effW / effH) * 100}%`,
        // Tailwind preflight applies `max-width: 100%` to <video>; override
        // so the swapped-dimension sizing isn't clamped to the container.
        maxWidth: 'none',
        maxHeight: 'none',
        transform: `translate(-50%, -50%) rotate(${rotationDeg}deg)`,
        transformOrigin: 'center',
      }
    : getOrientationStyle(monitor.orientation);

  // Render the video frame as a styled div rather than wrapping it in <Panel>
  // — Panel's inner content wrapper doesn't propagate height, which breaks the
  // h-full chain needed for the side layout's height-driven sizing.
  const videoPanel = (
    <div
      dir="ltr"
      className={clsx(
        'bg-surface rounded-xl border border-border-subtle shadow-panel relative overflow-hidden',
        layout === 'side' && 'h-full',
      )}
    >
      <div
        className={clsx(
          'relative bg-abyss',
          layout === 'side' ? 'h-full w-full' : 'w-full',
        )}
        style={layout === 'stacked' ? aspectStyle : undefined}
      >
        {/* Video element — always rendered so ref is available for HLS attachment */}
        <video
          ref={videoRef}
          className={videoClassName}
          style={videoElementStyle}
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
                {streamState === 'signaling' ? t('Negotiating...') : t('Connecting...')}
              </p>
              <p className="text-xs text-text-muted mt-1">
                {t('{{protocol}} stream', { protocol: protocol === 'webrtc' ? 'WebRTC' : 'HLS' })}
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
                    {t('LIVE')} {isStreaming && <>&middot; {protocol === 'webrtc' ? 'WebRTC' : 'HLS'}</>}
                  </span>
                </div>

                {/* Stats */}
                {liveStats && (
                  <span className="text-xs font-mono text-text-muted">
                    {t('{{count}} packets', { count: liveStats.packets_processed })}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {hasAudio && (
                  <button
                    onClick={toggleMute}
                    aria-label={isMuted ? t('Unmute') : t('Mute')}
                    className="p-2 rounded-lg bg-black/50 text-white hover:bg-black/70 transition-colors"
                  >
                    {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                  </button>
                )}
                <button
                  onClick={toggleFullscreen}
                  aria-label={t('Fullscreen')}
                  className="p-2 rounded-lg bg-black/50 text-white hover:bg-black/70 transition-colors"
                >
                  <Maximize2 size={16} />
                </button>
                <button
                  onClick={stopStream}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-crimson/80 text-white hover:bg-crimson transition-colors"
                >
                  <Pause size={14} />
                  <span className="text-sm font-medium">{t('Stop')}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Error overlay */}
        {streamError && streamState === 'failed' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="text-center">
              <AlertTriangle size={32} className="mx-auto mb-2 text-amber" />
              <p className="text-sm text-white mb-3">{streamError}</p>
              <button
                onClick={retry}
                className="flex items-center gap-2 px-4 py-2 mx-auto rounded-lg bg-cyan text-void font-medium hover:bg-cyan-dim transition-colors"
              >
                <RefreshCw size={14} />
                {t('Retry')}
              </button>
            </div>
          </div>
        )}

        {/* Non-fatal error toast */}
        {streamError && streamState !== 'failed' && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber/90 text-void text-xs font-medium">
              <AlertTriangle size={12} />
              {streamError}
            </div>
          </div>
        )}

        {/* Not streaming placeholder */}
        {!(isActive || isStreaming) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {isEnabled ? (
              <>
                <Video size={64} className="mb-4 text-text-dim" />
                <p className="text-text-muted mb-6">{t('Stream not active')}</p>
                <button
                  onClick={startStream}
                  className={clsx(
                    'flex items-center gap-2 px-6 py-3 rounded-lg',
                    'bg-cyan text-void font-medium',
                    'hover:bg-cyan-dim transition-colors',
                  )}
                >
                  <Play size={18} />
                  {t('Start Stream')}
                </button>
              </>
            ) : (
              <>
                <VideoOff size={64} className="mb-4 text-text-dim" />
                <p className="text-text-muted">{t('Monitor is disabled')}</p>
              </>
            )}
            <div className="absolute inset-0 scanlines pointer-events-none" />
          </div>
        )}
      </div>
    </div>
  );

  const infoCards = (
    <div className="grid grid-cols-3 gap-4">
      <Panel>
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-cyan/10">
            <Layers size={20} className="text-cyan" />
          </div>
          <div>
            <p className="text-xs text-text-muted mb-1">{t('Resolution')}</p>
            <p className="text-lg font-mono font-medium text-text-primary">
              {monitor.width}x{monitor.height}
            </p>
            <p className="text-xs text-text-muted mt-1">{t('{{bits}} bit color', { bits: monitor.colours })}</p>
          </div>
        </div>
      </Panel>

      <Panel>
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-amber/10">
            <Activity size={20} className="text-amber" />
          </div>
          <div>
            <p className="text-xs text-text-muted mb-1">{t('Type')}</p>
            <p className="text-lg font-medium text-text-primary">
              {monitor.type || t('Unknown')}
            </p>
            <p className="text-xs text-text-muted mt-1">
              {monitor.protocol || t('N/A')} / {monitor.method || t('N/A')}
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
            <p className="text-xs text-text-muted mb-1">{t('Storage')}</p>
            <p className="text-lg font-medium text-text-primary">
              {t('ID: {{id}}', { id: monitor.storage_id || t('Default') })}
            </p>
            <p className="text-xs text-text-muted mt-1">
              {t('Server: {{server}}', { server: monitor.server_id || t('Local') })}
            </p>
          </div>
        </div>
      </Panel>
    </div>
  );

  const controlsPanel = (
    <Panel title={t('Controls')} icon={<Settings size={16} />}>
      <div className="space-y-4">
        {/* Stream Protocol Toggle */}
        <div>
          <label className="text-sm text-text-secondary mb-2 block">{t('Stream Protocol')}</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => changeProtocol('webrtc')}
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
              onClick={() => changeProtocol('hls')}
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
              ? t('Low latency (~500ms)')
              : t('Universal compatibility (~3-6s delay)')}
          </p>
        </div>

        {/* Capturing */}
        <div>
          <label className="text-sm text-text-secondary mb-2 block">{t('Capturing')}</label>
          <div className="grid grid-cols-3 gap-2">
            {(['None', 'Ondemand', 'Always'] as CapturingMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => updateModes({ capturing: mode })}
                disabled={isUpdating}
                className={clsx(
                  'px-3 py-2 rounded-lg text-xs font-medium border',
                  'transition-all duration-fast',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  monitor.capturing === mode
                    ? 'bg-cyan/20 text-cyan border-cyan/30'
                    : 'bg-surface/50 text-text-muted border-border hover:border-text-muted/50'
                )}
              >
                {modeLabel(mode)}
              </button>
            ))}
          </div>
        </div>

        {/* Analysing */}
        <div>
          <label className="text-sm text-text-secondary mb-2 block">{t('Analysing')}</label>
          <div className="grid grid-cols-2 gap-2">
            {(['None', 'Always'] as AnalysingMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => updateModes({ analysing: mode })}
                disabled={isUpdating}
                className={clsx(
                  'px-3 py-2 rounded-lg text-xs font-medium border',
                  'transition-all duration-fast',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  monitor.analysing === mode
                    ? 'bg-amber/20 text-amber border-amber/30'
                    : 'bg-surface/50 text-text-muted border-border hover:border-text-muted/50'
                )}
              >
                {modeLabel(mode)}
              </button>
            ))}
          </div>
        </div>

        {/* Recording */}
        <div>
          <label className="text-sm text-text-secondary mb-2 block">{t('Recording')}</label>
          <div className="grid grid-cols-3 gap-2">
            {(['None', 'OnMotion', 'Always'] as RecordingMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => updateModes({ recording: mode })}
                disabled={isUpdating}
                className={clsx(
                  'px-3 py-2 rounded-lg text-xs font-medium border',
                  'transition-all duration-fast',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  monitor.recording === mode
                    ? 'bg-crimson/20 text-crimson border-crimson/30'
                    : 'bg-surface/50 text-text-muted border-border hover:border-text-muted/50'
                )}
              >
                {modeLabel(mode)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );

  const statusPanel = (
    <Panel title={t('Status')} icon={<Activity size={16} />}>
      <div className="space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-text-secondary">{t('Capturing')}</span>
          <span className={clsx(
            'text-xs font-medium',
            monitor.capturing === 'Always' ? 'text-emerald' : 'text-text-muted'
          )}>
            {modeLabel(monitor.capturing || 'None')}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-text-secondary">{t('Analysing')}</span>
          <span className={clsx(
            'text-xs font-medium',
            monitor.analysing === 'Always' ? 'text-amber' : 'text-text-muted'
          )}>
            {modeLabel(monitor.analysing || 'None')}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-text-secondary">{t('Recording')}</span>
          <span className={clsx(
            'text-xs font-medium',
            monitor.recording === 'Always' ? 'text-crimson' : 'text-text-muted'
          )}>
            {modeLabel(monitor.recording || 'None')}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-text-secondary">{t('Decoding')}</span>
          <span className={clsx(
            'text-xs font-medium',
            monitor.decoding_enabled === 1 ? 'text-emerald' : 'text-text-muted'
          )}>
            {monitor.decoding_enabled === 1 ? t('Enabled') : t('Disabled')}
          </span>
        </div>

        {monitor.event_prefix && (
          <div className="flex items-center justify-between">
            <span className="text-text-secondary">{t('Event Prefix')}</span>
            <span className="font-mono text-text-primary">
              {monitor.event_prefix}
            </span>
          </div>
        )}
      </div>
    </Panel>
  );

  const connectionPanel = (
    <Panel title={t('Connection')} icon={<Activity size={16} />}>
      <div className="space-y-3 text-sm">
        {monitor.host && (
          <div className="flex items-center justify-between">
            <span className="text-text-secondary">{t('Host')}</span>
            <span className="font-mono text-text-primary truncate max-w-[180px]">
              {monitor.host}
            </span>
          </div>
        )}
        {monitor.port && (
          <div className="flex items-center justify-between">
            <span className="text-text-secondary">{t('Port')}</span>
            <span className="font-mono text-text-primary">{monitor.port}</span>
          </div>
        )}
        {monitor.path && (
          <div className="flex items-center justify-between">
            <span className="text-text-secondary">{t('Path')}</span>
            <span className="font-mono text-text-primary truncate max-w-[180px]">
              {monitor.path}
            </span>
          </div>
        )}
        {monitor.user && (
          <div className="flex items-center justify-between">
            <span className="text-text-secondary">{t('User')}</span>
            <span className="font-mono text-text-primary">{monitor.user}</span>
          </div>
        )}
      </div>
    </Panel>
  );

  const eventsPanel = (
    <Panel
      title={t('Recent Events')}
      icon={<Video size={16} />}
      action={
        <Link
          to="/events"
          search={{ monitor_id: id }}
          className="text-xs text-cyan hover:text-cyan-dim transition-colors"
        >
          {t('View all')}
        </Link>
      }
    >
      {events.length === 0 ? (
        <p className="text-sm text-text-muted py-4 text-center">{t('No recent events')}</p>
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
                {event.start_date_time ? new Date(event.start_date_time).toLocaleTimeString() : t('Unknown')}
              </div>
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );

  // Motion-detection polygons. Editor lives below the operations row so the
  // operator can refer to the live picture while drawing zones. Drawn in
  // ZoneMinder's view space, so rotated cameras get swapped dimensions.
  const zoneView = zoneViewDimensions(monitor);
  const zonesPanel = zoneView.width && zoneView.height ? (
    <Panel
      title={t('Motion zones')}
      icon={<Square size={16} />}
    >
      <ZoneEditor
        monitorId={monitor.id}
        width={zoneView.width}
        height={zoneView.height}
      />
    </Panel>
  ) : null;

  // Only mount the PTZ panel when the backend reports real capabilities;
  // non-PTZ monitors get no empty panel at all.
  const ptzPanel = ptzState.status === 'ready' ? (
    <Panel
      title={t('Camera control')}
      icon={<Joystick size={16} />}
      action={
        ptzState.capabilities.protocol ? (
          <span className="text-[10px] font-mono uppercase tracking-wider text-cyan/80 px-2 py-0.5 rounded border border-cyan/25 bg-cyan/5">
            {ptzState.capabilities.protocol}
          </span>
        ) : undefined
      }
    >
      <PtzControls monitorId={id} capabilities={ptzState.capabilities} />
    </Panel>
  ) : null;

  return (
    <AppShell title={monitor.name}>
      <main className="flex-1 p-6 overflow-auto">
        {/* Breadcrumb + Edit affordance */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2 text-sm">
              <Link
                to="/monitors"
                className="flex items-center gap-1 text-text-muted hover:text-cyan transition-colors"
              >
                <ArrowLeft size={14} className="rtl:-scale-x-100" />
                {t('Monitors')}
              </Link>
              <ChevronRight size={14} className="text-text-muted rtl:-scale-x-100" />
              <span className="text-text-primary">{monitor.name}</span>
            </div>
            <button
              onClick={openEditor}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-cyan/40 bg-cyan/10 text-cyan hover:bg-cyan/20 transition-colors text-xs font-medium"
            >
              <Pencil size={12} />
              {t('Edit configuration')}
            </button>
          </div>

          {layout === 'side' ? (
            // Portrait/tall camera: video fills viewport height; panels alongside.
            // PTZ is the first sidebar card when present — sits right next to
            // the live picture for live operation.
            <div className="flex gap-6">
              <div
                className="h-[calc(100vh-9rem)] flex-shrink-0"
                style={aspectStyle}
              >
                {videoPanel}
              </div>
              <div className="flex-1 min-w-0 space-y-6">
                {ptzPanel}
                {infoCards}
                {controlsPanel}
                {statusPanel}
                {connectionPanel}
                {eventsPanel}
                {zonesPanel}
              </div>
            </div>
          ) : (
            // Landscape/square camera: video fills width; panels arranged below.
            // PTZ-capable cameras get an "operations row" — video + PTZ panel
            // side-by-side at xl, stacked at narrower widths — so the camera
            // controls live above the fold next to the picture.
            <div className="space-y-6">
              {ptzPanel ? (
                <div className="flex flex-col xl:flex-row gap-6">
                  <div className="flex-1 min-w-0">{videoPanel}</div>
                  <div className="xl:w-[22rem] xl:flex-shrink-0">{ptzPanel}</div>
                </div>
              ) : (
                videoPanel
              )}
              {infoCards}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                {controlsPanel}
                {statusPanel}
                {connectionPanel}
                {eventsPanel}
              </div>
              {zonesPanel}
            </div>
          )}
      </main>

      {editorOpen && (
        <MonitorEditor
          monitor={monitor}
          onClose={closeEditor}
        />
      )}
    </AppShell>
  );
}
