import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Bell,
  BellOff,
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
  Camera,
  Image as ImageIcon,
} from 'lucide-react';
import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import type { CapturingMode, AnalysingMode, RecordingMode } from '@/types';
import type { PagePropsMap } from '@/skins/types';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { MonitorPreview } from '@/components/monitors/MonitorPreview';
import { SCALE_VALUES } from '@/features/monitors/watchStage';
import { PtzControls } from '@/features/ptz/PtzControls';
import { ZoneEditor } from '@/features/zones/ZoneEditor';
import { zoneViewDimensions } from '@/features/zones/useZonesPage';
import { MonitorEditor } from '@/features/monitors/editor/MonitorEditor';
import { useWatchPage } from '@/features/monitors/useWatchPage';
import { formatFps } from '@/features/monitors/useMonitorStatuses';
import { displayDimensions, stageVideoClass, stageVideoStyle } from '@/features/monitors/orientation';
import { WatchLoading, WatchNotFound } from '../layouts/WatchStates';
import { useDocumentTitle } from '../layouts/useDocumentTitle';

/** Watch — Mission Control: live stream with adaptive layout, PTZ, zones, controls. */
export default function MonitorWatchPage({ monitorId }: PagePropsMap['monitors.watch']) {
  const { t, i18n } = useTranslation();
  const page = useWatchPage(monitorId);
  const {
    monitor, monitorLoading, events, liveStats, runtime, protocol, activeStream,
    isStreaming, isConnecting, isActive, fellBackToHls, ptzState, alarm, isMuted, isFullscreen, isWide,
    editorOpen, openEditor, closeEditor, updateModes, isUpdating,
    startStream, stopStream, changeProtocol, toggleFullscreen, toggleMute, retry,
    viewMode, setViewMode, stage, downloadImage, isDownloading,
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
  const stills = viewMode === 'stills';
  // Only constrain the stage when a legacy Scale was picked; otherwise the
  // adaptive layout sizes it.
  const stageSized = stage.size.scale !== '0';
  const scaleLabel = (v: string): string => {
    switch (v) {
      case '0': return t('Auto');
      case '100': return t('Actual');
      case 'fit_to_width': return t('Fit to width');
      default: return t('Max {{size}}', { size: v });
    }
  };

  // Effective dimensions after orientation, used to drive the layout.
  const { width: effW, height: effH } = displayDimensions(monitor);
  const aspect = effW > 0 && effH > 0 ? effW / effH : 16 / 9;
  // Portrait/tall cameras get a side-by-side layout that fills the viewport
  // vertically; everything else stacks. Side requires desktop width.
  const layout: 'side' | 'stacked' = aspect <= 0.9 && isWide ? 'side' : 'stacked';
  const aspectStyle = { aspectRatio: `${effW} / ${effH}` };

  // Rotated cameras: swapped-dimension rotation inline (the container has
  // the camera's displayed aspect), plain rotate + scale in fullscreen where
  // the container is screen-shaped. See features/monitors/orientation.ts.
  const videoClassName = clsx(
    stageVideoClass(monitor, isFullscreen),
    (stills || !(isActive || isStreaming)) && 'hidden',
  );
  const videoElementStyle = stageVideoStyle(monitor, isFullscreen);
  const protocolLabel = protocol === 'webrtc' ? 'WebRTC' : fellBackToHls ? t('HLS · fallback') : 'HLS';

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

        {stills && isEnabled && (
          <MonitorPreview
            monitorId={monitor.id}
            monitorName={monitor.name}
            orientation={monitor.orientation}
            isActive
            rotationFit="fit"
          />
        )}

        {/* Connecting overlay */}
        {!stills && isConnecting && (
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
        {!stills && (isActive || isStreaming) && (
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
                    {t('LIVE')} {isStreaming && <>&middot; {protocolLabel}</>}
                  </span>
                </div>

                {/* Runtime: capture-process state + fps (legacy State / Capturing FPS readout) */}
                {runtime && (
                  <span className="text-xs font-mono text-text-muted tabular-nums whitespace-nowrap" data-testid="watch-runtime">
                    {runtime.status}
                    {' · '}
                    {layout === 'side'
                      // Portrait stage is narrow: fps only.
                      ? formatFps(runtime.captureFps, i18n.language)
                      : <>
                          {t('Capture: {{fps}}', { fps: formatFps(runtime.captureFps, i18n.language) })}
                          {' · '}
                          {t('Analysis: {{fps}}', { fps: formatFps(runtime.analysisFps, i18n.language) })}
                        </>}
                  </span>
                )}

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
                  type="button"
                  onClick={stopStream}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-danger text-danger-fg hover:bg-danger-dim transition-colors"
                >
                  <Pause size={14} aria-hidden />
                  <span className="text-sm font-medium">{t('Stop')}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Error overlay */}
        {!stills && streamError && streamState === 'failed' && (
          <div
            role="alert"
            data-testid="stream-error"
            className="absolute inset-0 flex items-center justify-center bg-black/60"
          >
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
        {!stills && streamError && streamState !== 'failed' && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber/90 text-void text-xs font-medium">
              <AlertTriangle size={12} />
              {streamError}
            </div>
          </div>
        )}

        {/* Not streaming placeholder */}
        {(stills ? !isEnabled : !(isActive || isStreaming)) && (
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
          </div>
        )}
      </div>
    </div>
  );

  const infoCards = (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
              type="button"
              aria-pressed={protocol === 'webrtc'}
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
              type="button"
              aria-pressed={protocol === 'hls'}
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

        {/* Legacy Stream / Stills, Scale, Download Image */}
        <div>
          <label className="text-sm text-text-secondary mb-2 block">{t('View')}</label>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label={t('View mode')}>
            <button
              type="button"
              aria-pressed={!stills}
              onClick={() => setViewMode('stream')}
              className={clsx(
                'flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all duration-fast',
                !stills ? 'bg-cyan/20 text-cyan border-cyan/30' : 'bg-surface/50 text-text-muted border-border hover:border-text-muted/50',
              )}
            >
              <Video size={12} aria-hidden />
              {t('Stream')}
            </button>
            <button
              type="button"
              aria-pressed={stills}
              onClick={() => setViewMode('stills')}
              className={clsx(
                'flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all duration-fast',
                stills ? 'bg-cyan/20 text-cyan border-cyan/30' : 'bg-surface/50 text-text-muted border-border hover:border-text-muted/50',
              )}
            >
              <Camera size={12} aria-hidden />
              {t('Stills')}
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <label className="flex-1 flex items-center gap-2 text-xs text-text-secondary">
              <span>{t('Scale')}</span>
              <select
                value={stage.size.scale}
                onChange={(e) => stage.setScale(e.target.value)}
                className="flex-1 px-2 py-1.5 rounded-lg border border-border bg-surface text-text-primary text-xs"
              >
                {SCALE_VALUES.map((v) => (
                  <option key={v} value={v}>{scaleLabel(v)}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={downloadImage}
              disabled={!isEnabled || isDownloading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-surface/50 text-text-secondary hover:text-text-primary hover:border-text-muted/50 disabled:opacity-50 transition-colors"
              title={t('Download the current snapshot as a JPEG')}
            >
              <ImageIcon size={12} aria-hidden />
              {isDownloading ? t('Saving…') : t('Download Image')}
            </button>
          </div>
        </div>

        {/* Capturing */}
        <div>
          <label className="text-sm text-text-secondary mb-2 block">{t('Capturing')}</label>
          <div className="grid grid-cols-3 gap-2">
            {(['None', 'Ondemand', 'Always'] as CapturingMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={monitor.capturing === mode}
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
                type="button"
                aria-pressed={monitor.analysing === mode}
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
                type="button"
                aria-pressed={monitor.recording === mode}
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
      <RequirePerm feature="monitors" level="Edit" fallback="message">
        <ZoneEditor
          monitorId={monitor.id}
          width={zoneView.width}
          height={zoneView.height}
        />
      </RequirePerm>
    </Panel>
  ) : null;

  // Only mount the PTZ panel when the backend reports real capabilities;
  // non-PTZ monitors get no empty panel at all.
  const ptzPanel = ptzState.status === 'ready' ? (
    <RequirePerm feature="control" level="Edit">
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
    </RequirePerm>
  ) : null;

  return (
    <AppShell title={monitor.name}>
      <main className="flex-1 p-4 sm:p-6 overflow-auto min-w-0">
        {/* Breadcrumb + Edit affordance */}
          <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
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
            <RequirePerm feature="monitors" level="Edit">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Force Alarm / Cancel — legacy watch buttons. Shown once the
                  alarm endpoint has answered for this (capturing) monitor. */}
              {alarm.available && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(t('Force alarm on "{{name}}"? This creates an event right now.', { name: monitor.name }))) {
                        alarm.force();
                      }
                    }}
                    disabled={alarm.isPending}
                    className={clsx(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded border transition-colors text-xs font-medium disabled:opacity-50',
                      alarm.forced
                        ? 'border-crimson bg-crimson/30 text-crimson animate-pulse'
                        : 'border-crimson/40 bg-crimson/10 text-crimson hover:bg-crimson/20',
                    )}
                    title={t('Force alarm — creates an event immediately')}
                  >
                    <Bell size={12} />
                    {alarm.forced ? t('Alarm forced') : t('Force Alarm')}
                  </button>
                  <button
                    type="button"
                    onClick={alarm.cancel}
                    disabled={alarm.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border bg-surface/50 text-text-secondary hover:text-text-primary hover:border-text-muted/50 transition-colors text-xs font-medium disabled:opacity-50"
                    title={t('Cancel forced alarm')}
                  >
                    <BellOff size={12} />
                    {t('Cancel Alarm')}
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={openEditor}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-cyan/40 bg-cyan/10 text-cyan hover:bg-cyan/20 transition-colors text-xs font-medium"
              >
                <Pencil size={12} aria-hidden />
                {t('Edit configuration')}
              </button>
            </div>
            </RequirePerm>
          </div>

          {alarm.error && (
            <div role="alert" className="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg border border-crimson/40 bg-crimson/10 text-crimson text-xs">
              <AlertTriangle size={12} />
              {alarm.error}
            </div>
          )}

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
                  <div className="flex-1 min-w-0">
                    <div className="mx-auto" style={stageSized ? stage.style : undefined}>{videoPanel}</div>
                  </div>
                  <div className="xl:w-[22rem] xl:flex-shrink-0">{ptzPanel}</div>
                </div>
              ) : (
                <div className="mx-auto" style={stageSized ? stage.style : undefined}>{videoPanel}</div>
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
