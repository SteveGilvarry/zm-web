import { useEffect } from 'react';
import { clsx } from 'clsx';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle, Bell, BellOff, Camera, Image as ImageIcon, Maximize2, Pencil, Play,
  RefreshCw, Square, Video, Volume2, VolumeX, ZoomOut,
} from 'lucide-react';
import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import { MonitorPreview } from '@/components/monitors/MonitorPreview';
import type { PagePropsMap } from '@/skins/types';
import type { StreamProtocol } from '@/types';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { usePerms } from '@/features/auth/usePerms';
import { ClassicEventsTable, WATCH_EVENT_COLUMNS } from '@/features/events/ClassicEventsTable';
import { usePinchZoom } from '@/features/events/usePinchZoom';
import { MonitorEditor } from '@/features/monitors/editor/MonitorEditor';
import { displayDimensions, stageVideoClass, stageVideoStyle } from '@/features/monitors/orientation';
import { useMonitorEvents } from '@/features/monitors/useMonitorEvents';
import { formatFpsLegacy } from '@/features/monitors/useMonitorStatuses';
import { useAvailableHeight } from '@/features/monitors/useStageFit';
import { useWatchPage } from '@/features/monitors/useWatchPage';
import { PtzControls } from '@/features/ptz/PtzControls';
import { WatchLoading, WatchNotFound } from '@/skins/modern/layouts/WatchStates';
import { useDocumentTitle } from '@/skins/modern/layouts/useDocumentTitle';
import {
  ClassicButton, ClassicHeader, ClassicIconButton, ClassicPage, ClassicSelect,
  ClassicToolbar, classicButtonClass,
} from '@/skins/classic/components';
import { StageSizeSelects } from '@/skins/classic/components/StageSizeSelects';

/**
 * Watch — classic skin: legacy `?view=watch&mid=`. Header squares, the
 * action row, the stage (+ PTZ column when the camera is controllable), the
 * transport row, and the newest 20 events for this monitor.
 */
export default function ClassicMonitorWatchPage({ monitorId }: PagePropsMap['monitors.watch']) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { can } = usePerms();
  const page = useWatchPage(monitorId);
  // Digital zoom on the received picture (legacy panzoom); the camera is not moved.
  const { ref: zoomRef, style: zoomStyle, zoomed, scale: zoomScale, reset: resetZoom } = usePinchZoom<HTMLDivElement>();
  const [stageAreaRef, availableHeight] = useAvailableHeight<HTMLDivElement>();
  // Feed the measurement back so Auto sizes a portrait camera to the space
  // that is actually left, rather than to a constant.
  const { setAvailableHeight } = page.stage;
  useEffect(() => { setAvailableHeight(availableHeight); }, [availableHeight, setAvailableHeight]);
  const { monitor, monitorLoading, runtime, alarm, ptzState, protocol, viewMode, stage, contentRef } = page;
  const events = useMonitorEvents(monitorId, page.isAuthenticated && !!monitor);
  useDocumentTitle(monitor ? t('Monitor - {{id}} - {{name}}', { id: monitor.id, name: monitor.name }) : t('Watch'));

  if (!page.isAuthenticated) return null;
  if (monitorLoading) return <WatchLoading />;
  if (!monitor) return <WatchNotFound />;

  const { videoRef, state: streamState, error: streamError, hasAudio } = page.activeStream;
  const isEnabled = monitor.capturing !== 'None';
  const isConnecting = streamState === 'connecting' || streamState === 'signaling';
  const isStreaming = streamState === 'connected';
  const isActive = streamState !== 'idle';
  const dims = displayDimensions(monitor);
  const showPtz = ptzState.status === 'ready';

  const forceAlarm = () => {
    if (window.confirm(t('Force alarm on "{{name}}"? This creates an event right now.', { name: monitor.name }))) {
      alarm.force();
    }
  };

  return (
    <AppShell title={monitor.name}>
      <ClassicPage>
        <ClassicHeader
          title={t('Monitor - {{id}} - {{name}}', { id: monitor.id, name: monitor.name })}
          // Legacy: `history.back()`, greyed when there is no page to go back to.
          backDisabled={!document.referrer}
          onRefresh={page.refresh}
          end={
            <>
              <ClassicIconButton aria-label={t('Fullscreen')} onClick={page.toggleFullscreen}>
                <Maximize2 size={15} aria-hidden />
              </ClassicIconButton>
              <RequirePerm feature="monitors" level="Edit">
                <ClassicIconButton aria-label={t('Edit monitor')} onClick={page.openEditor}>
                  <Pencil size={15} aria-hidden />
                </ClassicIconButton>
              </RequirePerm>
            </>
          }
        />

        {/* Action row */}
        <ClassicToolbar
          label={t('Watch actions')}
          end={<StageSizeSelects stage={stage} monitors={[monitor]} />}
        >
          {/* Legacy Watch puts the monitor chooser first in this row, so
              stepping through cameras never goes via the console. */}
          {page.siblings.length > 1 && (
            <ClassicSelect
              label={t('Monitor')}
              value={String(monitor.id)}
              options={page.siblings.map((m) => ({ value: String(m.id), label: m.name }))}
              onChange={(value) => { void navigate({ to: '/monitors/$monitorId', params: { monitorId: value } }); }}
            />
          )}
          <RequirePerm feature="monitors" level="Edit">
            <ClassicButton icon={<Pencil size={14} />} onClick={page.openEditor}>{t('Edit')}</ClassicButton>
            <ClassicButton
              tone="danger"
              icon={<Bell size={14} />}
              onClick={forceAlarm}
              disabled={!isEnabled || alarm.isPending || !alarm.available}
              title={t('Force alarm — creates an event immediately')}
            >
              {alarm.forced ? t('Alarm forced') : t('Force Alarm')}
            </ClassicButton>
            <ClassicButton
              icon={<BellOff size={14} />}
              onClick={alarm.cancel}
              disabled={!isEnabled || alarm.isPending || !alarm.available}
              title={t('Cancel forced alarm')}
            >
              {t('Cancel Alarm')}
            </ClassicButton>
          </RequirePerm>
          <ClassicButton
            icon={<ImageIcon size={14} />}
            onClick={page.downloadImage}
            disabled={!isEnabled || page.isDownloading}
            title={t('Download the current snapshot as a JPEG')}
          >
            {page.isDownloading ? t('Saving…') : t('Download Image')}
          </ClassicButton>
          <div role="group" aria-label={t('View mode')} className="inline-flex">
            <ClassicButton
              tone={viewMode === 'stream' ? 'primary' : 'default'}
              aria-pressed={viewMode === 'stream'}
              icon={<Video size={14} />}
              onClick={() => page.setViewMode('stream')}
              className="rounded-e-none"
            >
              {t('Stream')}
            </ClassicButton>
            <ClassicButton
              tone={viewMode === 'stills' ? 'primary' : 'default'}
              aria-pressed={viewMode === 'stills'}
              icon={<Camera size={14} />}
              onClick={() => page.setViewMode('stills')}
              className="rounded-s-none"
            >
              {t('Stills')}
            </ClassicButton>
          </div>
          <Link to="/events" search={{ monitor_id: monitor.id }} className={classicButtonClass('default')}>
            {t('All Events')}
          </Link>
        </ClassicToolbar>

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
        <div className={clsx('flex flex-col gap-3 items-start', showPtz && 'lg:flex-row')}>
          <div ref={stageAreaRef} className="flex-1 min-w-0 w-full">
            <RequirePerm feature="stream" level="View" fallback="message">
              <div dir="ltr" data-testid="watch-stage" className="relative bg-black mx-auto overflow-hidden" style={stage.style}>
                {viewMode === 'stills' ? (
                  isEnabled ? (
                    <MonitorPreview
                      monitorId={monitor.id}
                      monitorName={monitor.name}
                      orientation={monitor.orientation}
                      isActive
                      rotationFit="fill"
                    />
                  ) : (
                    <p className="absolute inset-0 flex items-center justify-center text-zinc-400 text-sm">{t('Monitor is disabled')}</p>
                  )
                ) : (
                  <>
                    {/* Pinch, trackpad-pinch or drag once zoomed; double-click resets. */}
                    <div ref={zoomRef} style={zoomStyle} className="absolute inset-0" data-testid="watch-zoom">
                      <video
                        ref={videoRef}
                        className={clsx(stageVideoClass(monitor, page.isFullscreen), !isActive && 'hidden')}
                        style={stageVideoStyle(monitor, page.isFullscreen)}
                        autoPlay
                        muted={page.isMuted}
                        playsInline
                      />
                    </div>
                    {isConnecting && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white text-sm" role="status">
                        {t('Loading…')}
                      </div>
                    )}
                    {streamError && streamState === 'failed' && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 text-white" role="alert" data-testid="stream-error">
                        <AlertTriangle size={28} className="text-amber-400 mb-2" aria-hidden />
                        <p className="text-sm mb-2 max-w-xs text-center">{streamError}</p>
                        <ClassicButton tone="primary" onClick={page.retry}>{t('Retry')}</ClassicButton>
                      </div>
                    )}
                    {!isActive && !isConnecting && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-400">
                        {isEnabled ? (
                          <ClassicButton tone="primary" icon={<Play size={14} />} onClick={page.startStream}>{t('Start Stream')}</ClassicButton>
                        ) : (
                          <p className="text-sm">{t('Monitor is disabled')}</p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </RequirePerm>

            {/* Legacy status line under the picture */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1 py-1 text-sm text-zinc-800" data-testid="watch-runtime">
              <span className="tabular-nums">
                {runtime
                  ? t('State: {{state}} {{capture}} {{analysis}}', {
                      state: runtime.status,
                      capture: formatFpsLegacy(runtime.captureFpsRaw),
                      analysis: formatFpsLegacy(runtime.analysisFpsRaw),
                    })
                  : t('State: {{state}}', { state: isStreaming ? t('Connected') : t('Idle') })}
              </span>
              {zoomed && (
                <span className="tabular-nums">{t('Zoom: {{scale}}x', { scale: zoomScale.toFixed(1) })}</span>
              )}
              <span>{t('{{name}} (id={{id}})', { name: monitor.name, id: monitor.id })}</span>
              <span className="uppercase">{viewMode === 'stills' ? t('Stills') : protocol === 'webrtc' ? 'WebRTC' : 'HLS'}</span>
            </div>

            {/* Transport row */}
            <ClassicToolbar label={t('Stream controls')}>
              <ClassicButton icon={<Square size={14} />} onClick={page.stopStream} disabled={viewMode !== 'stream' || !isActive}>{t('Stop')}</ClassicButton>
              <ClassicButton icon={<Play size={14} />} onClick={page.startStream} disabled={viewMode !== 'stream' || isActive || !isEnabled}>{t('Play')}</ClassicButton>
              <ClassicButton icon={<ZoomOut size={14} />} onClick={resetZoom} disabled={!zoomed}>{t('Zoom Out')}</ClassicButton>
              {hasAudio && (
                <ClassicButton icon={page.isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />} onClick={page.toggleMute} aria-pressed={!page.isMuted}>
                  {page.isMuted ? t('Unmute') : t('Mute')}
                </ClassicButton>
              )}
              <ClassicButton icon={<Maximize2 size={14} />} onClick={page.toggleFullscreen}>{t('Fullscreen')}</ClassicButton>
              <ClassicSelect
                label={t('Player')}
                value={protocol}
                onChange={(v) => page.changeProtocol(v as StreamProtocol)}
                options={[{ value: 'webrtc', label: 'WebRTC' }, { value: 'hls', label: 'HLS' }]}
              />
              <span className="text-xs text-zinc-500">{dims.width}×{dims.height}</span>
            </ClassicToolbar>
          </div>

          {/* Legacy `canView('Control')`: viewing the panel needs View, not Edit. */}
          {showPtz && (
            <RequirePerm feature="control" level="View">
              <aside className="w-full lg:w-80 shrink-0 bg-white border border-zinc-300 rounded-sm p-3" aria-label={t('Camera control')}>
                <h2 className="text-sm font-bold text-zinc-800 mb-2 flex items-center justify-between">
                  {t('Camera control')}
                  {ptzState.capabilities.protocol && (
                    <span className="text-[11px] font-normal text-zinc-500 uppercase">{ptzState.capabilities.protocol}</span>
                  )}
                </h2>
                <PtzControls monitorId={monitor.id} capabilities={ptzState.capabilities} />
              </aside>
            </RequirePerm>
          )}
        </div>

        {/* Events for this monitor: legacy `#eventList` — fixed columns, newest
            20 by Id, no sorting or pager, a trash icon per row. */}
        <section className="mt-4" aria-labelledby="watch-events-heading">
          <ClassicToolbar
            label={t('Events toolbar')}
            end={
              <ClassicIconButton aria-label={t('Refresh events')} onClick={events.refetch}>
                <RefreshCw size={14} aria-hidden />
              </ClassicIconButton>
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
                columns={WATCH_EVENT_COLUMNS}
                selectedIds={events.selectedIds}
                onToggleSelected={events.toggleSelected}
                onDeleteRow={can('events', 'Edit') ? events.deleteOne : undefined}
                token={events.accessToken}
                showThumbs={events.showThumbs}
                thumbsAtEnd
                thumbWidth={events.thumbWidth}
              />
            </div>
          </QueryState>
        </section>
        </div>
      </ClassicPage>

      {page.editorOpen && <MonitorEditor monitor={monitor} onClose={page.closeEditor} />}
    </AppShell>
  );
}
