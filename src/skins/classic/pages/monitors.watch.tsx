import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { clsx } from 'clsx';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle, AlertTriangle, Download, ExternalLink, Filter, FilterX, GalleryHorizontal, Maximize, Maximize2,
  Minimize2, Minus, Move, Pause, Pencil, Play, Plus, RefreshCw, SkipBack, SkipForward, Square,
  Volume2, VolumeX,
} from 'lucide-react';
import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import type { PagePropsMap } from '@/skins/types';
import type { StreamProtocol } from '@/types';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { usePerms } from '@/features/auth/usePerms';
import { ClassicEventsTable } from '@/features/events/ClassicEventsTable';
import { ColumnChooser } from '@/features/events/ColumnChooser';
import { usePinchZoom } from '@/features/events/usePinchZoom';
import { ClassicMonitorEditor } from '@/skins/classic/components/monitor/ClassicMonitorEditor';
import { stageVideoClass, stageVideoStyle } from '@/features/monitors/orientation';
import { useMonitorEvents } from '@/features/monitors/useMonitorEvents';
import { useAvailableHeight } from '@/features/monitors/useStageFit';
import { useWatchPage } from '@/features/monitors/useWatchPage';
import { SCALE_VALUES } from '@/features/monitors/watchStage';
import { useMonitorFilterRow } from '@/features/monitors/useMonitorFilterRow';
import { useWatchCycle } from '@/features/cycle/useWatchCycle';
import { useCanGoBack } from '@/features/nav/useCanGoBack';
import { useSiteTitle } from '@/features/settings/useSiteTitle';
import { Modal } from '@/components/common/Modal';
import { useUiStore } from '@/stores/ui';
import { useWatchPrefsStore } from '@/stores/watchPrefs';
import { PtzControls } from '@/features/ptz/PtzControls';
import { WatchLoading, WatchNotFound } from '@/skins/modern/layouts/WatchStates';
import {
  ClassicButton, ClassicFilterRow, ClassicHeader, ClassicIconButton, ClassicPage,
  ClassicSelect, ClassicToolbar, classicButtonClass,
} from '@/skins/classic/components';

// Tailwind v4's trailing `!` beats ClassicIconButton's blue.
const GREY_SQUARE = 'bg-[#8a9299]! border-[#7b838a]! hover:bg-[#6f777e]!';
const RED_SQUARE = 'bg-[#d9534f]! border-[#d43f3a]! hover:bg-[#c9302c]!';
/** skin.css `button.btn.btn-zoom-in` & co: translucent grey over the picture. */
const OVERLAY_BTN = 'pointer-events-auto inline-flex items-center justify-center p-0 rounded-sm bg-[rgba(150,150,150,0.5)] hover:bg-[darkgrey] text-white';

/** MonitorStream.js prints fps with `toLocaleString(undefined, {min: 1, max: n})`. */
function fpsText(fps: number, maxDigits: number): string {
  return fps.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: maxDigits });
}

/** watch.php's period labels: seconds under a minute, minutes above. */
function cyclePeriodLabel(t: (k: string, o?: Record<string, unknown>) => string, seconds: number): string {
  if (seconds < 60) return t('{{count}} seconds', { count: seconds });
  const minutes = seconds / 60;
  if (!Number.isInteger(minutes)) return t('{{count}} seconds', { count: seconds });
  return minutes === 1 ? t('1 minute') : t('{{count}} minutes', { count: minutes });
}

/**
 * Watch — classic skin: legacy `?view=watch&mid=` as 1.39.41 renders it.
 * The filter bar, one header row (navigation and alarm squares, the cycle and
 * PTZ toggles, Scale and Player), the stage with its hover buttons, the
 * status line, the transport row, and the newest 20 events for this monitor.
 */
export default function ClassicMonitorWatchPage({ monitorId }: PagePropsMap['monitors.watch']) {
  const { t } = useTranslation();
  const { can } = usePerms();
  const page = useWatchPage(monitorId);
  const canGoBack = useCanGoBack();
  // `zmFilterBarFlip#mfbpanel`: open by default (`filterSettingsInline()`).
  const showFilters = useUiStore((s) => s.classicMonitorFilterBarOpen);
  const toggleFilters = useUiStore((s) => s.toggleClassicMonitorFilterBar);
  // `zmCycleShow`, or `cycle=true` on the URL.
  const cycleShowSaved = useUiStore((s) => s.classicCycleSidebarOpen);
  const showCycle = cycleShowSaved || page.cycleRequested;
  const toggleCycle = useUiStore((s) => s.toggleClassicCycleSidebar);
  const ptzShow = useWatchPrefsStore((s) => s.ptzShow);
  const togglePtzShow = useWatchPrefsStore((s) => s.togglePtzShow);
  const stageRef = useRef<HTMLDivElement | null>(null);
  // Digital zoom on the received picture (legacy panzoom); the camera is not
  // moved. Double-click on the stream fullscreens it (skin.js
  // `doubleClickOnStream`) rather than resetting the zoom.
  const {
    ref: zoomRef, style: zoomStyle, zoomed, scale: zoomScale, reset: resetZoom, zoomIn, zoomOut,
  } = usePinchZoom<HTMLDivElement>(true, false, {
    onDoubleClick: () => page.toggleStageFullscreen(stageRef.current),
  });
  // panzoom's Zoom OUT: one step, or straight back to 1x with ctrl held.
  const zoomOutClick = (e: ReactMouseEvent) => { if (e.ctrlKey) resetZoom(); else zoomOut(); };
  const [stageAreaRef, availableHeight] = useAvailableHeight<HTMLDivElement>();
  // Feed the measurement back so Auto sizes a portrait camera to the space
  // that is actually left, rather than to a constant.
  const { setAvailableHeight } = page.stage;
  useEffect(() => { setAvailableHeight(availableHeight); }, [availableHeight, setAvailableHeight]);
  const { monitor, monitorLoading, runtime, alarm, ptzState, protocol, stage, contentRef } = page;
  const canViewEvents = can('events', 'View');
  const events = useMonitorEvents(monitorId, page.isAuthenticated && !!monitor && canViewEvents);
  const filter = useMonitorFilterRow(page.siblings);
  // Legacy rotates over the monitors the filter bar left, capturing ones only.
  const cycleMonitors = filter.filtered.filter((m) => m.capturing !== 'None');
  const cycle = useWatchCycle(monitorId, cycleMonitors, showCycle, {
    autoStart: page.cycleRequested,
    playing: page.isStreaming && !page.isPaused,
    failed: page.activeStream.state === 'failed',
  });
  // Legacy `<title>`: `ZM - <Name> - Feed`.
  useSiteTitle(monitor ? `${monitor.name} - ${t('Feed')}` : t('Watch'));

  if (!page.isAuthenticated) return null;
  if (monitorLoading) return <WatchLoading />;
  if (!monitor) return <WatchNotFound />;

  const { videoRef, state: streamState, error: streamError, hasAudio } = page.activeStream;
  const isEnabled = monitor.capturing !== 'None';
  const isConnecting = streamState === 'connecting' || streamState === 'signaling';
  const isStreaming = streamState === 'connected';
  const isActive = streamState !== 'idle';
  // watch.php: `Controllable() && canView('Control') && Type != 'WebSite'`.
  const ptzAvailable = ptzState.status === 'ready' && can('control', 'View') && monitor.type !== 'WebSite';
  const ptzOpen = ptzAvailable && ptzShow && ptzState.status === 'ready';
  const scaleLabel = (v: string): string => {
    switch (v) {
      case '0': return t('Auto');
      case '100': return t('Actual');
      case 'fit_to_width': return t('Fit to width');
      default: return t('Max {{size}}', { size: v });
    }
  };

  return (
    <AppShell title={monitor.name}>
      {/* Legacy `?view=monitor&mid=` is its own page; the watch page stays mounted, hidden, so the stream survives a round trip. */}
      {page.editorOpen && (
        <ClassicMonitorEditor
          monitor={monitor}
          onClose={page.closeEditor}
          initialTab={page.editorTab}
          onTabChange={page.setEditorTab}
        />
      )}
      <ClassicPage hidden={page.editorOpen}>
        {/* Legacy `#mfbflip` + `#mfbpanel`: the shared monitor filter bar,
            open unless the operator folded it away. */}
        <div className="flex items-start gap-2 mb-2">
          <ClassicIconButton
            aria-label={showFilters ? t('Hide filters') : t('Show filters')}
            title={showFilters ? t('Hide filters') : t('Show filters')}
            aria-pressed={showFilters}
            onClick={toggleFilters}
            className="shrink-0"
          >
            {showFilters ? <FilterX size={15} aria-hidden /> : <Filter size={15} aria-hidden />}
          </ClassicIconButton>
          {showFilters && (
            <ClassicFilterRow state={filter} className="flex-1 min-w-0" />
          )}
        </div>

        {/* watch.php `#navButtons` | `#headerButtons` | `#sizeControl`. */}
        <ClassicHeader
          // Legacy: `history.back()`, greyed when there is no page to go back to.
          backDisabled={!canGoBack}
          onRefresh={page.refresh}
          end={
            <>
              <ClassicIconButton
                aria-label={t('Toggle cycle sidebar')}
                aria-pressed={showCycle}
                onClick={toggleCycle}
                className={showCycle ? undefined : GREY_SQUARE}
              >
                <GalleryHorizontal size={15} aria-hidden />
              </ClassicIconButton>
              <ClassicIconButton
                aria-label={ptzAvailable ? t('Toggle PTZ Controls') : t('PTZ Not available')}
                aria-pressed={ptzAvailable ? ptzShow : undefined}
                disabled={!ptzAvailable}
                onClick={togglePtzShow}
                className={ptzAvailable && ptzShow ? undefined : GREY_SQUARE}
              >
                <Move size={15} aria-hidden />
              </ClassicIconButton>
              <ClassicSelect
                label={t('Scale')}
                value={stage.size.scale}
                onChange={stage.setScale}
                options={SCALE_VALUES.map((v) => ({ value: v, label: scaleLabel(v) }))}
                className="ms-2"
              />
              <ClassicSelect
                label={t('Player')}
                value={protocol}
                onChange={(v) => page.changeProtocol(v as StreamProtocol)}
                options={[{ value: 'webrtc', label: 'WebRTC' }, { value: 'hls', label: 'HLS' }]}
              />
            </>
          }
        >
          <div className="flex items-center gap-1">
            <RequirePerm feature="monitors" level="Edit">
              <ClassicIconButton aria-label={t('Edit')} onClick={page.openEditor} className={GREY_SQUARE}>
                <Pencil size={15} aria-hidden />
              </ClassicIconButton>
              {/* One button that flips with the alarm, no confirmation —
                  watch.js `forceAlarm` / `cancelAlarm`. */}
              <ClassicIconButton
                aria-label={alarm.forced ? t('Cancel Forced Alarm') : t('Force Alarm')}
                onClick={alarm.forced ? alarm.cancel : alarm.force}
                disabled={!isEnabled || alarm.isPending || !alarm.available}
                aria-pressed={alarm.forced}
                className={RED_SQUARE}
              >
                <AlertCircle size={15} aria-hidden />
              </ClassicIconButton>
            </RequirePerm>
          </div>
        </ClassicHeader>

        {alarm.error && (
          <div role="alert" className="mb-2 px-3 py-2 rounded-sm border border-red-300 bg-red-50 text-red-700 text-sm flex items-center gap-2">
            <AlertTriangle size={14} aria-hidden />
            {alarm.error}
          </div>
        )}

        {/* Legacy `#content`: what the Fullscreen button fullscreens — stage,
            PTZ column and the events table, not just the picture. */}
        <div ref={contentRef} className={clsx('bg-white', page.isFullscreen && 'overflow-auto p-3')}>
        {/* Stage + PTZ column */}
        <div className={clsx('flex flex-col gap-3 items-start', (ptzOpen || showCycle) && 'lg:flex-row')}>
          {showCycle && (
            <nav
              className="w-full lg:w-52 shrink-0 bg-white border border-zinc-300 rounded-sm p-3"
              aria-label={t('Cycle')}
              data-testid="watch-cycle-sidebar"
            >
              <ClassicSelect
                label={t('Cycle period')}
                value={String(cycle.intervalS)}
                options={cycle.periods.map((secs) => ({ value: String(secs), label: cyclePeriodLabel(t, secs) }))}
                onChange={(v) => cycle.setInterval(Number(v))}
              />
              <p className="text-sm tabular-nums my-2" data-testid="seconds-to-cycle">
                {cycle.isPaused ? '' : cycle.countdown}
              </p>
              <div className="flex items-center gap-1">
                <ClassicIconButton aria-label={t('Previous Monitor')} title={t('Previous Monitor')} onClick={cycle.prev}>
                  <SkipBack size={14} className="rtl:-scale-x-100" aria-hidden />
                </ClassicIconButton>
                {cycle.isPaused ? (
                  <ClassicIconButton aria-label={t('Play Cycle')} title={t('Play Cycle')} onClick={cycle.togglePause}>
                    <Play size={14} aria-hidden />
                  </ClassicIconButton>
                ) : (
                  <ClassicIconButton aria-label={t('Pause Cycle')} title={t('Pause Cycle')} onClick={cycle.togglePause}>
                    <Pause size={14} aria-hidden />
                  </ClassicIconButton>
                )}
                <ClassicIconButton aria-label={t('Next Monitor')} title={t('Next Monitor')} onClick={cycle.next}>
                  <SkipForward size={14} className="rtl:-scale-x-100" aria-hidden />
                </ClassicIconButton>
              </div>
              <ul className="mt-3 flex flex-col gap-0.5">
                {cycleMonitors.map((m, i) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => cycle.jumpTo(i)}
                      aria-current={m.id === monitor.id ? 'true' : undefined}
                      className={clsx(
                        'block w-full text-start px-2 py-1 rounded-sm text-sm truncate',
                        m.id === monitor.id ? 'bg-[#337ab7] text-white' : 'text-[#337ab7] hover:bg-zinc-100',
                      )}
                    >
                      {m.name}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          <div ref={stageAreaRef} className="flex-1 min-w-0 w-full">
            <RequirePerm feature="stream" level="View" fallback="message">
              <div
                ref={stageRef}
                dir="ltr"
                data-testid="watch-stage"
                className="group relative bg-black mx-auto overflow-hidden"
                style={stage.style}
              >
                {page.isWebSite && (
                  <iframe
                    key={page.webSiteReloadKey}
                    src={monitor.path ?? undefined}
                    title={monitor.name}
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    referrerPolicy="no-referrer"
                    className="absolute inset-0 w-full h-full bg-white border-0"
                  />
                )}
                {/* Pinch, trackpad-pinch, shift + wheel, or drag once zoomed;
                    double-click fullscreens the picture. */}
                <div ref={zoomRef} style={zoomStyle} className={clsx('absolute inset-0', page.isWebSite && 'hidden')} data-testid="watch-zoom">
                  <video
                    ref={videoRef}
                    className={clsx(stageVideoClass(monitor, page.isFullscreen), !isActive && 'hidden')}
                    style={stageVideoStyle(monitor, page.isFullscreen)}
                    autoPlay
                    muted={page.isMuted}
                    playsInline
                  />
                </div>
                {/* `#button_zoom<mid>`: shown over the picture on hover or
                    after a click, as `managePanZoomButton` shows it. */}
                <div
                  data-testid="watch-stage-buttons"
                  className="absolute inset-0 z-20 pointer-events-none opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
                >
                  <button type="button" onClick={zoomOutClick} title={t('Zoom OUT')} aria-label={t('Zoom OUT')} className={clsx(OVERLAY_BTN, 'absolute start-[3px] top-[3px]')}>
                    <Minus size={28} aria-hidden />
                  </button>
                  <button type="button" onClick={zoomIn} title={t('Zoom IN')} aria-label={t('Zoom IN')} className={clsx(OVERLAY_BTN, 'absolute end-[3px] top-[3px]')}>
                    <Plus size={28} aria-hidden />
                  </button>
                  <div className="absolute top-[2px] inset-x-0 flex justify-center gap-1">
                    <button type="button" onClick={() => page.toggleStageFullscreen(stageRef.current)} title={t('Open full screen')} aria-label={t('Open full screen')} className={OVERLAY_BTN}>
                      <Maximize size={24} aria-hidden />
                    </button>
                    <Link
                      to="/monitors/$monitorId"
                      params={{ monitorId: String(monitor.id) }}
                      title={t('Open watch page')}
                      aria-label={t('Open watch page')}
                      className={OVERLAY_BTN}
                    >
                      <ExternalLink size={24} aria-hidden />
                    </Link>
                    <RequirePerm feature="monitors" level="Edit">
                      <button type="button" onClick={page.openEditor} title={t('Edit monitor')} aria-label={t('Edit monitor')} className={OVERLAY_BTN}>
                        <Pencil size={24} aria-hidden />
                      </button>
                    </RequirePerm>
                  </div>
                </div>
                {isConnecting && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white text-sm" role="status">
                    {t('Loading…')}
                  </div>
                )}
                {streamError && streamState === 'failed' && (
                  <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/70 text-white" role="alert" data-testid="stream-error">
                    <AlertTriangle size={28} className="text-amber-400 mb-2" aria-hidden />
                    <p className="text-sm mb-2 max-w-xs text-center">{streamError}</p>
                    <ClassicButton tone="primary" onClick={page.retry}>{t('Retry')}</ClassicButton>
                  </div>
                )}
                {!isActive && !isConnecting && !isEnabled && (
                  <p className="absolute inset-0 flex items-center justify-center text-zinc-400 text-sm">{t('Monitor is disabled')}</p>
                )}
              </div>
            </RequirePerm>

            {/* Legacy `#monitorStatus`: stream info, name, then the state line. */}
            <div className="flex flex-col items-center gap-0.5 px-1 py-1 text-sm text-zinc-800" data-testid="watch-runtime">
              <span className="text-xs text-zinc-500" data-testid="watch-stream-info">
                {protocol === 'webrtc' ? 'WebRTC' : 'HLS'}
                {streamError ? ` · ${streamError}` : ''}
              </span>
              <span>{t('{{name}} (id={{id}})', { name: monitor.name, id: monitor.id })}</span>
              <span className="flex flex-wrap justify-center gap-x-3 tabular-nums">
                <span>{t('State: {{state}}', { state: runtime ? runtime.status : isStreaming ? t('Connected') : t('Idle') })}</span>
                <span title={t('Viewing FPS')} data-testid="viewing-fps">
                  {t('{{fps}} fps', { fps: page.viewingFps == null ? '' : fpsText(page.viewingFps, 2) })}
                </span>
                <span title={t('Capturing FPS')}>
                  {t('{{fps}} fps', { fps: runtime ? fpsText(runtime.captureFps, 1) : '' })}
                </span>
                {zoomed && (
                  <span>{t('Zoom: {{scale}}x', { scale: zoomScale.toFixed(1) })}</span>
                )}
              </span>
            </div>

            {/* watch.php `#bottomBlock`: `#dvrControls` then `#extButton`. The
                DVR buttons need the zms replay buffer (zm-api#138). */}
            <ClassicToolbar label={t('Stream controls')} className="justify-center">
              {/* A click in `#dvrControls` pauses the cycle (watch.js `handleClick`). */}
              <span className="inline-flex items-center gap-2" onClickCapture={cycle.pause}>
              <ClassicButton aria-label={t('Stop')} title={t('Stop')} icon={<Square size={14} />} onClick={page.stopStream} disabled={!isActive} />
              {isStreaming && !page.isPaused ? (
                <ClassicButton aria-label={t('Pause')} title={t('Pause')} icon={<Pause size={14} />} onClick={page.pauseStream} />
              ) : (
                <ClassicButton aria-label={t('Play')} title={t('Play')} icon={<Play size={14} />} onClick={page.startStream} disabled={!isEnabled || isConnecting} />
              )}
              </span>
              <span className="mx-2" aria-hidden />
              <ClassicButton
                aria-label={page.isFullscreen ? t('Exit Fullscreen') : t('Fullscreen')}
                title={page.isFullscreen ? t('Exit Fullscreen') : t('Fullscreen')}
                icon={page.isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                onClick={page.toggleFullscreen}
              />
              <Link
                to="/events"
                search={{ monitor_id: monitor.id, sort: 'start_time', dir: 'asc' }}
                className={classicButtonClass('default')}
              >
                {t('All Events')}
              </Link>
              {/* `#volumeControls<mid>`: greyed until the stream has audio. */}
              <span className={clsx('inline-flex items-center gap-1', !hasAudio && 'opacity-50')}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round((page.isMuted ? 0 : page.volume) * 100)}
                  onChange={(e) => page.setVolume(Number(e.target.value) / 100)}
                  disabled={!hasAudio}
                  aria-label={t('Volume')}
                  className="w-24 accent-[#337ab7]"
                />
                <button
                  type="button"
                  onClick={page.toggleMute}
                  disabled={!hasAudio}
                  aria-label={page.isMuted ? t('Unmute') : t('Mute')}
                  title={page.isMuted ? t('Unmute') : t('Mute')}
                  aria-pressed={!page.isMuted}
                  className="p-1 text-zinc-700 disabled:cursor-not-allowed"
                >
                  {page.isMuted ? <VolumeX size={18} aria-hidden /> : <Volume2 size={18} aria-hidden />}
                </button>
              </span>
            </ClassicToolbar>
          </div>

          {/* `#ptzControls`: `canView('Control')` gates it in `ptzAvailable`,
              `ptzShow` decides whether it is open. */}
          {ptzOpen && (
            <aside className="w-full lg:w-80 shrink-0 bg-white border border-zinc-300 rounded-sm p-3" aria-label={t('Camera control')}>
              <PtzControls monitorId={monitor.id} capabilities={ptzState.capabilities} variant="classic" />
            </aside>
          )}
        </div>

        {/* Events for this monitor: legacy `#eventList` — fixed columns, newest
            20 by Id, no sorting or pager, a trash icon per row. Only with
            `canView('Events')` and not for a WebSite monitor. */}
        {canViewEvents && monitor.type !== 'WebSite' && (
        <section className="mt-4" aria-labelledby="watch-events-heading">
          <ClassicToolbar
            label={t('Events toolbar')}
            end={
              <>
                <ClassicIconButton aria-label={t('Refresh events')} onClick={events.refetch}>
                  <RefreshCw size={14} aria-hidden />
                </ClassicIconButton>
                <ColumnChooser variant="classic" source={events.columnSource} />
                <ClassicIconButton
                  aria-label={t('Export visible events as CSV')}
                  onClick={() => events.exportCsv(monitor.name)}
                  disabled={events.events.length === 0}
                >
                  <Download size={14} aria-hidden />
                </ClassicIconButton>
              </>
            }
          >
            <h2 id="watch-events-heading" className="text-sm font-bold text-zinc-800 me-2">{t('Events')}</h2>
          </ClassicToolbar>
          <QueryState
            isLoading={events.isLoading}
            isError={events.isError}
            error={events.error}
            onRetry={events.refetch}
            empty={events.events.length === 0}
            emptyMessage={t('No matching records found')}
          >
            <div className="overflow-x-auto">
              <ClassicEventsTable
                events={events.events}
                monitorLookup={{ [monitor.id]: monitor.name }}
                columns={events.columns}
                selectedIds={events.selectedIds}
                onToggleSelected={events.toggleSelected}
                onDeleteRow={can('events', 'Edit') ? events.deleteOne : undefined}
                token={events.accessToken}
                showThumbs={events.showThumbs}
                thumbsAtEnd
                thumbWidth={events.thumbWidth}
                showFooter={false}
                highlightNew
              />
            </div>
          </QueryState>
        </section>
        )}
        </div>
      </ClassicPage>

      {/* `ZM_WEB_VIEWING_TIMEOUT` — legacy's `areyoustillwatching` modal. */}
      <Modal isOpen={page.idle.prompted} onClose={page.idle.resume} title={t('Are you still watching?')}>
        <p className="text-sm mb-3">{t('Video paused. Continue watching?')}</p>
        <ClassicButton tone="primary" onClick={page.idle.resume}>{t('Yes')}</ClassicButton>
      </Modal>

      {/* `delconfirm`: legacy's delete-confirmation modal for the trash icon. */}
      <Modal isOpen={events.pendingDeleteId != null} onClose={events.cancelDelete} title={t('Delete Confirmation')}>
        <p className="text-sm mb-3">{t('Are you sure you wish to delete the selected events?')}</p>
        <div className="flex justify-end gap-2">
          <ClassicButton onClick={events.cancelDelete}>{t('Cancel')}</ClassicButton>
          <ClassicButton tone="danger" onClick={events.confirmDelete}>{t('Delete')}</ClassicButton>
        </div>
      </Modal>

    </AppShell>
  );
}
