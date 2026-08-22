import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
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
  Info,
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

const toolBtn = 'p-1.5 rounded text-fg-dim hover:text-fg hover:bg-surface-2 transition-colors disabled:opacity-50';
const segBtn = (active: boolean) =>
  clsx(
    'flex items-center justify-center gap-1 px-2 py-0.5 rounded text-xs transition-colors',
    active ? 'bg-accent/15 text-accent' : 'text-fg-dim hover:text-fg',
  );
const modeBtn = (active: boolean) =>
  clsx(
    'px-2 py-1 rounded border text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
    active
      ? 'bg-accent/15 text-accent border-accent/40'
      : 'bg-surface text-fg-dim border-border-subtle hover:text-fg hover:border-border',
  );

/**
 * Watch — the modern skin.
 *
 * The camera gets the frame. One control line at the top carries the
 * breadcrumb and the verbs an operator reaches for while watching (view
 * mode, scale, snapshot, alarm, edit); everything descriptive lives in a
 * rail beside the picture that scrolls on its own, so the stage never ends
 * below the fold (docs/DESIGN.md).
 */
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
  const stageRef = useRef<HTMLDivElement>(null);
  const box = useBoxSize(stageRef);
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
  // measured fit sizes it to the frame.
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
  // A portrait camera on a wide screen leaves the stage narrow, so its
  // overlay drops the Capture/Analysis pair for the fps alone.
  const narrowStage = aspect <= 0.9 && isWide;

  // Rotated cameras: swapped-dimension rotation inline (the container has
  // the camera's displayed aspect), plain rotate + scale in fullscreen where
  // the container is screen-shaped. See features/monitors/orientation.ts.
  const videoClassName = clsx(
    stageVideoClass(monitor, isFullscreen),
    (stills || !(isActive || isStreaming)) && 'hidden',
  );
  const videoElementStyle = stageVideoStyle(monitor, isFullscreen);
  const protocolLabel = protocol === 'webrtc' ? 'WebRTC' : fellBackToHls ? t('HLS · fallback') : 'HLS';

  const stageStyle: CSSProperties = stageSized
    ? { ...stage.style, maxHeight: '100%' }
    : fitStyle(box, effW, effH);

  const videoPanel = (
    <div
      className="relative h-full w-full bg-bg-sunken rounded border border-border-subtle overflow-hidden"
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
            <Loader2 size={32} className="mx-auto mb-3 text-white animate-spin" aria-hidden />
            <p className="text-sm text-white">
              {streamState === 'signaling' ? t('Negotiating...') : t('Connecting...')}
            </p>
            <p className="text-xs text-white/70 mt-1">
              {t('{{protocol}} stream', { protocol: protocol === 'webrtc' ? 'WebRTC' : 'HLS' })}
            </p>
          </div>
        </div>
      )}

      {/* Stream controls overlay */}
      {!stills && (isActive || isStreaming) && (
        <div className="absolute inset-x-0 bottom-0 px-2 py-1.5 bg-black/55 z-10">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 shrink-0">
              <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-recording" />
              <span className="text-xs font-medium text-white">
                {t('LIVE')} {isStreaming && <>&middot; {protocolLabel}</>}
              </span>
            </span>

            {/* Runtime: capture-process state + fps (legacy State / Capturing FPS readout) */}
            {runtime && (
              <span className="text-xs font-mono tabular-nums text-white/70 whitespace-nowrap" data-testid="watch-runtime">
                {runtime.status}
                {' · '}
                {narrowStage
                  ? formatFps(runtime.captureFps, i18n.language)
                  : <>
                      {t('Capture: {{fps}}', { fps: formatFps(runtime.captureFps, i18n.language) })}
                      {' · '}
                      {t('Analysis: {{fps}}', { fps: formatFps(runtime.analysisFps, i18n.language) })}
                    </>}
              </span>
            )}

            {liveStats && (
              <span className="text-xs font-mono tabular-nums text-white/70 whitespace-nowrap">
                {t('{{count}} packets', { count: liveStats.packets_processed })}
              </span>
            )}

            <div className="ms-auto flex items-center gap-1 shrink-0">
              {hasAudio && (
                <button
                  onClick={toggleMute}
                  aria-label={isMuted ? t('Unmute') : t('Mute')}
                  className="p-1.5 rounded text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                >
                  {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
              )}
              <button
                onClick={toggleFullscreen}
                aria-label={t('Fullscreen')}
                className="p-1.5 rounded text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              >
                <Maximize2 size={14} />
              </button>
              <button
                type="button"
                onClick={stopStream}
                className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              >
                <Pause size={12} aria-hidden />
                {t('Stop')}
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
            <AlertTriangle size={24} className="mx-auto mb-2 text-danger" aria-hidden />
            <p className="text-sm text-white mb-3">{streamError}</p>
            <button
              onClick={retry}
              className="flex items-center gap-2 px-3 py-1.5 mx-auto rounded bg-accent text-accent-fg text-sm hover:bg-accent-dim transition-colors"
            >
              <RefreshCw size={14} aria-hidden />
              {t('Retry')}
            </button>
          </div>
        </div>
      )}

      {/* Non-fatal error toast */}
      {!stills && streamError && streamState !== 'failed' && (
        <div className="absolute top-2 start-1/2 -translate-x-1/2 rtl:translate-x-1/2">
          <span className="flex items-center gap-2 px-2 py-1 rounded bg-warn text-warn-fg text-xs">
            <AlertTriangle size={12} aria-hidden />
            {streamError}
          </span>
        </div>
      )}

      {/* Not streaming placeholder */}
      {(stills ? !isEnabled : !(isActive || isStreaming)) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {isEnabled ? (
            <>
              <Video size={40} className="mb-3 text-fg-faint" aria-hidden />
              <p className="text-sm text-fg-dim mb-4">{t('Stream not active')}</p>
              <button
                onClick={startStream}
                className="flex items-center gap-2 px-3 py-1.5 rounded bg-accent text-accent-fg text-sm hover:bg-accent-dim transition-colors"
              >
                <Play size={14} aria-hidden />
                {t('Start Stream')}
              </button>
            </>
          ) : (
            <>
              <VideoOff size={40} className="mb-3 text-fg-faint" aria-hidden />
              <p className="text-sm text-fg-dim">{t('Monitor is disabled')}</p>
            </>
          )}
        </div>
      )}
    </div>
  );

  const detailsPanel = (
    <Panel title={t('Details')} icon={<Info size={16} />}>
      <dl className="space-y-1.5 text-sm">
        <Row label={t('Resolution')} value={`${monitor.width}x${monitor.height}`} mono />
        <Row label={t('Colour depth')} value={t('{{bits}} bit color', { bits: monitor.colours })} />
        <Row label={t('Type')} value={monitor.type || t('Unknown')} />
        <Row
          label={t('Source')}
          value={`${monitor.protocol || t('N/A')} / ${monitor.method || t('N/A')}`}
        />
        <Row label={t('Storage')} value={t('ID: {{id}}', { id: monitor.storage_id || t('Default') })} />
        <Row label={t('Server')} value={t('Server: {{server}}', { server: monitor.server_id || t('Local') })} />
      </dl>
    </Panel>
  );

  const controlsPanel = (
    <Panel title={t('Controls')} icon={<Settings size={16} />}>
      <div className="space-y-4">
        {/* Stream Protocol Toggle */}
        <div>
          <label className="text-xs text-fg-dim mb-1.5 block">{t('Stream Protocol')}</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={protocol === 'webrtc'}
              onClick={() => changeProtocol('webrtc')}
              className={clsx(modeBtn(protocol === 'webrtc'), 'flex items-center justify-center gap-1.5')}
            >
              <Wifi size={12} aria-hidden />
              WebRTC
            </button>
            <button
              type="button"
              aria-pressed={protocol === 'hls'}
              onClick={() => changeProtocol('hls')}
              className={clsx(modeBtn(protocol === 'hls'), 'flex items-center justify-center gap-1.5')}
            >
              <Radio size={12} aria-hidden />
              HLS
            </button>
          </div>
          <p className="text-xs text-fg-dim mt-1.5">
            {protocol === 'webrtc'
              ? t('Low latency (~500ms)')
              : t('Universal compatibility (~3-6s delay)')}
          </p>
        </div>

        {/* Capturing */}
        <div>
          <label className="text-xs text-fg-dim mb-1.5 block">{t('Capturing')}</label>
          <div className="grid grid-cols-3 gap-2">
            {(['None', 'Ondemand', 'Always'] as CapturingMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={monitor.capturing === mode}
                onClick={() => updateModes({ capturing: mode })}
                disabled={isUpdating}
                className={modeBtn(monitor.capturing === mode)}
              >
                {modeLabel(mode)}
              </button>
            ))}
          </div>
        </div>

        {/* Analysing */}
        <div>
          <label className="text-xs text-fg-dim mb-1.5 block">{t('Analysing')}</label>
          <div className="grid grid-cols-2 gap-2">
            {(['None', 'Always'] as AnalysingMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={monitor.analysing === mode}
                onClick={() => updateModes({ analysing: mode })}
                disabled={isUpdating}
                className={modeBtn(monitor.analysing === mode)}
              >
                {modeLabel(mode)}
              </button>
            ))}
          </div>
        </div>

        {/* Recording */}
        <div>
          <label className="text-xs text-fg-dim mb-1.5 block">{t('Recording')}</label>
          <div className="grid grid-cols-3 gap-2">
            {(['None', 'OnMotion', 'Always'] as RecordingMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={monitor.recording === mode}
                onClick={() => updateModes({ recording: mode })}
                disabled={isUpdating}
                className={modeBtn(monitor.recording === mode)}
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
      <dl className="space-y-1.5 text-sm">
        {/* Colour is state: a camera that is recording says so in red, a
            capture process that is up says so in green. Everything else is
            grey on purpose. */}
        <Row
          label={t('Capturing')}
          value={modeLabel(monitor.capturing || 'None')}
          tone={monitor.capturing === 'Always' ? 'ok' : undefined}
        />
        <Row label={t('Analysing')} value={modeLabel(monitor.analysing || 'None')} />
        <Row
          label={t('Recording')}
          value={modeLabel(monitor.recording || 'None')}
          tone={monitor.recording === 'Always' ? 'danger' : undefined}
        />
        <Row
          label={t('Decoding')}
          value={monitor.decoding_enabled === 1 ? t('Enabled') : t('Disabled')}
        />
        {monitor.event_prefix && (
          <Row label={t('Event Prefix')} value={monitor.event_prefix} mono />
        )}
      </dl>
    </Panel>
  );

  const connectionPanel = (
    <Panel title={t('Connection')} icon={<Activity size={16} />}>
      <dl className="space-y-1.5 text-sm">
        {monitor.host && <Row label={t('Host')} value={monitor.host} mono truncate />}
        {monitor.port && <Row label={t('Port')} value={String(monitor.port)} mono />}
        {monitor.path && <Row label={t('Path')} value={monitor.path} mono truncate />}
        {monitor.user && <Row label={t('User')} value={monitor.user} mono />}
      </dl>
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
          className="text-xs text-accent hover:underline"
        >
          {t('View all')}
        </Link>
      }
    >
      {events.length === 0 ? (
        <p className="text-sm text-fg-dim py-2 text-center">{t('No recent events')}</p>
      ) : (
        <div className="flex flex-col">
          {events.map((event) => (
            <Link
              key={event.id}
              to="/events/$eventId"
              params={{ eventId: String(event.id) }}
              className="flex items-center justify-between gap-2 py-1 rounded hover:bg-surface-2 transition-colors"
            >
              <span className="text-sm text-fg truncate">{event.name}</span>
              <span className="flex items-center gap-1 shrink-0 text-xs font-mono tabular-nums text-fg-dim">
                <Clock size={11} aria-hidden />
                {event.start_date_time ? new Date(event.start_date_time).toLocaleTimeString() : t('Unknown')}
              </span>
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );

  // Motion-detection polygons. Drawn in ZoneMinder's view space, so rotated
  // cameras get swapped dimensions.
  const zoneView = zoneViewDimensions(monitor);
  const zonesPanel = zoneView.width && zoneView.height ? (
    <Panel title={t('Motion zones')} icon={<Square size={16} />}>
      <RequirePerm feature="monitors" level="Edit" fallback="message">
        <div dir="ltr">
          <ZoneEditor
            monitorId={monitor.id}
            width={zoneView.width}
            height={zoneView.height}
          />
        </div>
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
            <span className="text-xs font-mono text-fg-dim">
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
      <main className="flex-1 min-h-0 min-w-0 flex flex-col">
        {/* One control line: where you are, and what you do while watching. */}
        <div className="flex items-center gap-2 px-3 h-11 shrink-0 border-b border-border-subtle bg-surface">
          <Link
            to="/monitors"
            className="flex items-center gap-1 shrink-0 text-sm text-fg-dim hover:text-fg transition-colors"
          >
            <ArrowLeft size={14} className="rtl:-scale-x-100" aria-hidden />
            {t('Monitors')}
          </Link>
          <ChevronRight size={12} className="shrink-0 text-fg-faint rtl:-scale-x-100" aria-hidden />
          <span className="text-sm text-fg truncate min-w-0">{monitor.name}</span>

          <div className="ms-auto flex items-center gap-2 shrink-0">
            <div
              role="group"
              aria-label={t('View mode')}
              className="flex items-center gap-0.5 rounded border border-border-subtle p-0.5"
            >
              <button
                type="button"
                aria-pressed={!stills}
                onClick={() => setViewMode('stream')}
                className={segBtn(!stills)}
              >
                <Video size={12} aria-hidden />
                {t('Stream')}
              </button>
              <button
                type="button"
                aria-pressed={stills}
                onClick={() => setViewMode('stills')}
                className={segBtn(stills)}
              >
                <Camera size={12} aria-hidden />
                {t('Stills')}
              </button>
            </div>

            <select
              aria-label={t('Scale')}
              title={t('Scale')}
              value={stage.size.scale}
              onChange={(e) => stage.setScale(e.target.value)}
              className="px-1.5 py-1 rounded border border-border-subtle bg-surface text-fg text-xs cursor-pointer focus:outline-none focus:border-accent"
            >
              {SCALE_VALUES.map((v) => (
                <option key={v} value={v}>{scaleLabel(v)}</option>
              ))}
            </select>

            <button
              type="button"
              onClick={downloadImage}
              disabled={!isEnabled || isDownloading}
              aria-label={t('Download Image')}
              title={t('Download the current snapshot as a JPEG')}
              className={toolBtn}
            >
              {isDownloading
                ? <Loader2 size={16} className="animate-spin" aria-hidden />
                : <ImageIcon size={16} aria-hidden />}
            </button>

            <RequirePerm feature="monitors" level="Edit">
              <div className="flex items-center gap-2">
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
                        'flex items-center gap-1.5 px-2 py-1 rounded border text-xs transition-colors disabled:opacity-50',
                        alarm.forced
                          ? 'border-danger bg-danger/15 text-danger'
                          : 'border-border-subtle text-fg-dim hover:text-fg hover:border-border',
                      )}
                      title={t('Force alarm — creates an event immediately')}
                    >
                      <Bell size={12} aria-hidden />
                      {alarm.forced ? t('Alarm forced') : t('Force Alarm')}
                    </button>
                    <button
                      type="button"
                      onClick={alarm.cancel}
                      disabled={alarm.isPending}
                      className="flex items-center gap-1.5 px-2 py-1 rounded border border-border-subtle text-xs text-fg-dim hover:text-fg hover:border-border transition-colors disabled:opacity-50"
                      title={t('Cancel forced alarm')}
                    >
                      <BellOff size={12} aria-hidden />
                      {t('Cancel Alarm')}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={openEditor}
                  className="flex items-center gap-1.5 px-2 py-1 rounded bg-accent text-accent-fg text-xs hover:bg-accent-dim transition-colors"
                >
                  <Pencil size={12} aria-hidden />
                  {t('Edit configuration')}
                </button>
              </div>
            </RequirePerm>
          </div>
        </div>

        {alarm.error && (
          <div
            role="alert"
            className="flex items-center gap-2 px-3 py-1.5 shrink-0 border-b border-border-subtle bg-danger/10 text-danger text-xs"
          >
            <AlertTriangle size={12} aria-hidden />
            {alarm.error}
          </div>
        )}

        <div className="flex-1 min-h-0 flex">
          {/* The picture takes the frame; the rail scrolls beside it. */}
          <section
            ref={stageRef}
            aria-label={t('Live view')}
            className="flex-1 min-w-0 min-h-0 p-2 flex items-center justify-center"
            dir="ltr"
          >
            <div className="relative max-w-full max-h-full" style={stageStyle}>
              {videoPanel}
            </div>
          </section>

          <aside
            aria-label={t('Monitor detail')}
            className="w-[22rem] xl:w-[26rem] shrink-0 min-h-0 overflow-auto border-s border-border-subtle p-3 space-y-3"
          >
            {ptzPanel}
            {detailsPanel}
            {controlsPanel}
            {statusPanel}
            {connectionPanel}
            {eventsPanel}
            {zonesPanel}
          </aside>
        </div>
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

/* ------------------------------------------------------------------------ */
/*  Small pieces                                                            */
/* ------------------------------------------------------------------------ */

/** One label/value line in a rail panel. */
function Row({
  label, value, mono, truncate, tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  truncate?: boolean;
  tone?: 'ok' | 'danger';
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-fg-dim shrink-0">{label}</dt>
      <dd
        className={clsx(
          'text-sm text-end min-w-0',
          mono && 'font-mono tabular-nums',
          truncate && 'truncate',
          tone === 'ok' ? 'text-ok' : tone === 'danger' ? 'text-danger' : 'text-fg',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/** The live size of an element, tracked through a ResizeObserver. */
function useBoxSize(ref: RefObject<HTMLElement | null>) {
  const [box, setBox] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBox({ width: r.width, height: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return box;
}

/**
 * The largest box with the camera's displayed aspect that fits the region.
 *
 * CSS cannot express "fit both axes" for a non-replaced element with an
 * aspect ratio — `max-height` does not feed back into the derived width —
 * so the region is measured and the box sized outright.
 */
function fitStyle(
  box: { width: number; height: number },
  w: number,
  h: number,
): CSSProperties {
  if (box.width <= 0 || box.height <= 0 || w <= 0 || h <= 0) {
    return { width: '100%', aspectRatio: `${w || 16} / ${h || 9}` };
  }
  const scale = Math.min(box.width / w, box.height / h);
  return { width: Math.floor(w * scale), height: Math.floor(h * scale) };
}
