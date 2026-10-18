import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, RefreshCw, Archive, ArchiveRestore, Pencil, ExternalLink, Download, Trash2,
  Film, Info, Layers, LayoutGrid, SkipBack, SkipForward, Rewind, FastForward, Play, Pause,
  Maximize2, Volume2, VolumeX, ChevronsLeft, ChevronsRight, Tag, Tv,
} from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { EventKeyFrames } from '@/features/events/EventKeyFrames';
import { EventEditForm } from '@/features/events/EventEditForm';
import { FrameScrubber } from '@/features/events/FrameScrubber';
import { PlayerOverlayControls } from '@/features/events/PlayerOverlayControls';
import { TagChips } from '@/features/events/TagChips';
import { ZonesOverlay } from '@/features/events/ZonesOverlay';
import { usePinchZoom } from '@/features/events/usePinchZoom';
import {
  useCodecOptions, useRateOptions, useReplayModeOptions, useScaleOptions,
} from '@/features/events/playbackOptions';
import { formatDurationHms } from '@/features/events/duration';
import { useEventDetailPage } from '@/features/events/useEventDetailPage';
import { useDateTimeFormat } from '@/features/config/useDateTimeFormat';
import { formatBytes } from '@/lib/format';
import { useCanGoBack } from '@/features/nav/useCanGoBack';
import { useDocumentTitle } from '@/skins/modern/layouts/useDocumentTitle';
import { ClassicButton, ClassicLinkButton } from '../components/events/primitives';
import { classicSelect, classicLink } from '../components/events/styles';

const barSelect = clsx(classicSelect, 'py-0.5 text-xs');
/** Legacy's small `btn-normal` icon buttons beside the monitor name. */
const statsBtn = 'inline-flex items-center p-1 border rounded-sm bg-[#e9ecef] border-[#adb5bd] text-zinc-800 hover:bg-[#dde1e5]';
const dvrBtn = 'p-1.5 rounded-sm text-zinc-700 hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed';

/**
 * Event view — classic skin, after legacy 1.39.41 `?view=event`: dark
 * control bar (back/refresh, title, Replay / Scale / Codec), toolbar (Archive, Edit, Export, Download, Delete, Frames, Stats,
 * Zones, Montage Review), the tag input heading the stats column beside the
 * player, the level graph under it, and one row holding the monitor name,
 * the DVR buttons and the replay status with its Rate select.
 */
export default function ClassicEventDetailPage({ eventId }: { eventId: number }) {
  const { t } = useTranslation();
  const replayModeOptions = useReplayModeOptions();
  const scaleOptions = useScaleOptions();
  const rateOptions = useRateOptions();
  const codecOptions = useCodecOptions();
  // Event stamps render through ZoneMinder's own patterns / server zone.
  const { formatDateTime } = useDateTimeFormat();
  const s = useEventDetailPage(eventId);
  // Legacy greys Back with no referrer to go back to (event.js:1541).
  const canGoBack = useCanGoBack();
  // Click, pinch or trackpad-pinch to zoom into the picture, as legacy's
  // panzoom does; the overlay buttons drive the same state.
  const { ref: zoomRef, style: zoomStyle, scale: zoomScale, zoomIn, zoomOut } =
    usePinchZoom<HTMLDivElement>(true, true);
  // Pull the refs out so the remaining `s.*` reads are plain values.
  const { event, monitor, videoRef, playerRef, tagApiRef } = s;
  useDocumentTitle(event ? t('Event {{id}}', { id: event.id }) : t('Event'));

  if (!s.isAuthenticated) return null;

  return (
    <AppShell title={event ? t('Event {{id}}', { id: event.id }) : t('Event')}>
      <main className="flex-1 overflow-auto bg-white text-zinc-900">
        {/* Dark control bar */}
        <div className="flex flex-wrap items-center gap-3 px-3 py-1.5 bg-[#485563] text-white">
          <div className="flex items-center gap-1">
            {/* Legacy's Back is `history.back()`, not a link to the list —
                it returns to wherever the operator came from. */}
            <ClassicButton onClick={() => window.history.back()} disabled={!canGoBack} title={t('Back')} aria-label={t('Back')}>
              <ArrowLeft size={14} className="rtl:-scale-x-100" />
            </ClassicButton>
            <ClassicButton tone="primary" onClick={() => window.location.reload()} title={t('Refresh')} aria-label={t('Refresh')}>
              <RefreshCw size={14} />
            </ClassicButton>
          </div>
          <h1 className="flex-1 text-center text-base font-semibold">
            {event ? t('Event {{id}}', { id: event.id }) : t('Event')}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1">
              <span className="font-semibold">{t('Replay')}</span>
              <select aria-label={t('Replay mode')} value={s.replayMode} onChange={(e) => s.setReplayMode(e.target.value as typeof s.replayMode)} className={barSelect}>
                {replayModeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1">
              <span className="font-semibold">{t('Scale')}</span>
              <select aria-label={t('Scale')} value={s.scale} onChange={(e) => s.setScale(e.target.value as typeof s.scale)} className={barSelect}>
                {scaleOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            {/* Stream quality is hidden whenever a video tag plays
                (event.php:255), which is every event here. */}
            <label className="flex items-center gap-1" title={t('Source codec: {{codec}}', { codec: s.codecHint })}>
              <span className="font-semibold">{t('Codec')}</span>
              <select
                aria-label={t('Codec')}
                value={s.codec}
                onChange={(e) => s.setCodec(e.target.value as typeof s.codec)}
                className={barSelect}
              >
                {codecOptions.map((o) => (
                  <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <QueryState isLoading={s.eventLoading} isError={!!s.eventError} error={s.eventError} empty={!s.eventLoading && !event} emptyMessage={t('Event was not found.')}>
          {event && (
            <div className="px-3 py-2 space-y-2">
              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-1.5">
                <RequirePerm feature="events" level="Edit">
                  {/* Two buttons, each live in one state (event.js:1532). */}
                  <ClassicButton onClick={s.toggleArchived} disabled={s.archivePending || event.archived === 1} title={t('Archive')}>
                    <Archive size={14} />
                    {t('Archive')}
                  </ClassicButton>
                  <ClassicButton onClick={s.toggleArchived} disabled={s.archivePending || event.archived !== 1} title={t('Unarchive')}>
                    <ArchiveRestore size={14} />
                    {t('Unarchive')}
                  </ClassicButton>
                  <ClassicButton onClick={s.openEdit} title={t('Edit')}>
                    <Pencil size={14} />
                    {t('Edit')}
                  </ClassicButton>
                </RequirePerm>
                <ClassicButton disabled title={t('Export needs a backend endpoint (zip of the event directory).')}>
                  <ExternalLink size={14} />
                  {t('Export')}
                </ClassicButton>
                {/* No stored video file, no download (legacy hides it). */}
                {s.downloadFileName && (
                  <ClassicLinkButton href={s.downloadUrl} download title={t('Download {{file}}', { file: s.downloadFileName })}>
                    <Download size={14} />
                    {t('Download')}
                  </ClassicLinkButton>
                )}
                <RequirePerm feature="events" level="Edit">
                  <ClassicButton
                    tone="danger"
                    onClick={(e) => s.requestDelete(e.shiftKey)}
                    disabled={s.deletePending || !s.canDelete}
                    title={s.deleteBlockedReason ?? t('Delete')}
                  >
                    <Trash2 size={14} />
                    {t('Delete')}
                  </ClassicButton>
                </RequirePerm>
                <Link to="/events/$eventId/frames" params={{ eventId: String(event.id) }} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-sm font-medium bg-[#e9ecef] border-[#adb5bd] text-zinc-800 hover:bg-[#dde1e5]">
                  <Film size={14} />
                  {t('Frames')}
                </Link>
                <ClassicButton onClick={() => s.setShowStats(!s.showStats)} aria-pressed={s.showStats} title={t('Stats')}>
                  <Info size={14} />
                  {t('Stats')}
                </ClassicButton>
                {/* Zones are a System-permission view in legacy. */}
                <RequirePerm feature="system" level="View">
                  <ClassicButton onClick={() => s.setShowZones(!s.showZones)} aria-pressed={s.showZones} title={s.showZones ? t('Hide Zones') : t('Show Zones')}>
                    <Layers size={14} />
                    {t('Zones')}
                  </ClassicButton>
                </RequirePerm>
                {s.reviewSearch && (
                  <Link to="/montagereview" search={s.reviewSearch} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-sm font-medium bg-[#e9ecef] border-[#adb5bd] text-zinc-800 hover:bg-[#dde1e5]">
                    <LayoutGrid size={14} />
                    {t('Montage Review')}
                  </Link>
                )}
              </div>

              {/* Legacy's `#eventStats` column keeps the tag input at its top
                  and stays when the stats are hidden, spanning the width
                  above the video (`showEventStats`, 710c6f07e). */}
              <div className={clsx('flex flex-col gap-3', s.showStats && 'lg:flex-row')}>
                <div className={clsx('shrink-0 space-y-2', s.showStats ? 'lg:w-80 self-start' : 'w-full')}>
                  <RequirePerm feature="events" level="Edit" fallback={<span className="text-sm">{(event.tags ?? []).map((tag) => tag.name).join(', ') || t('No tags')}</span>}>
                    <div className="flex items-start gap-1" data-testid="event-tags">
                      <div className="flex-1 min-w-0">
                        <TagChips eventId={event.id} currentTags={event.tags ?? []} apiRef={tagApiRef} />
                      </div>
                      {/* Legacy's two `label` icons, the first mirrored. */}
                      <button
                        type="button"
                        onClick={s.tagAndPrev}
                        disabled={s.prevEventId == null}
                        title={t('Apply the last tag, then play the previous event')}
                        aria-label={t('Apply the last tag, then play the previous event')}
                        className={dvrBtn}
                      >
                        <Tag size={16} className="-scale-x-100" />
                      </button>
                      <button
                        type="button"
                        onClick={s.tagAndNext}
                        disabled={s.nextEventId == null}
                        title={t('Apply the last tag, then play the next event')}
                        aria-label={t('Apply the last tag, then play the next event')}
                        className={dvrBtn}
                      >
                        <Tag size={16} />
                      </button>
                    </div>
                  </RequirePerm>
                {/* Stats table, with legacy's stills under it */}
                {s.showStats && (
                  <div className="space-y-2">
                    <table className="text-sm w-full" data-testid="event-stats-panel">
                      <tbody className="[&>tr>th]:text-end [&>tr>th]:pe-3 [&>tr>th]:py-0.5 [&>tr>th]:font-semibold [&>tr>th]:text-zinc-600 [&>tr>td]:py-0.5 [&>tr>td]:tabular-nums">
                        {/* Legacy `getStat` (event.js:1291), row for row. */}
                        <tr><th scope="row">{t('Name')}</th><td>{event.name} ({t('Id')}:{event.id})</td></tr>
                        <tr>
                          <th scope="row">{t('Monitor')}</th>
                          <td>
                            <span className="me-1">({event.monitor_id}) {monitor?.name ?? ''}</span>
                            <span className="inline-flex gap-0.5 align-middle">
                              <Link to="/monitors/$monitorId" params={{ monitorId: String(event.monitor_id) }} title={t('Live')} aria-label={t('Live')} className={statsBtn}>
                                <Tv size={12} />
                              </Link>
                              <RequirePerm feature="monitors" level="Edit">
                                <Link to="/monitors/$monitorId" params={{ monitorId: String(event.monitor_id) }} search={{ edit: true }} title={t('Edit')} aria-label={t('Edit')} className={statsBtn}>
                                  <Pencil size={12} />
                                </Link>
                              </RequirePerm>
                              <Link to="/events" search={{ monitor_id: event.monitor_id, sort: 'start_time', dir: 'asc' }} title={t('All Events')} aria-label={t('All Events')} className={statsBtn}>
                                <Film size={12} />
                              </Link>
                            </span>
                          </td>
                        </tr>
                        <tr><th scope="row">{t('Cause')}</th><td>{event.cause ?? ''}</td></tr>
                        <tr><th scope="row">{t('Notes')}</th><td className="whitespace-pre-wrap">{event.notes ?? ''}</td></tr>
                        <tr><th scope="row">{t('Start Time')}</th><td>{s.startTime ? formatDateTime(s.startTime) : ''}</td></tr>
                        <tr><th scope="row">{t('End Time')}</th><td>{s.endTime ? formatDateTime(s.endTime) : ''}</td></tr>
                        <tr><th scope="row">{t('Duration')}</th><td>{formatDurationHms(event.length)}</td></tr>
                        <tr>
                          <th scope="row">{t('Frames')}</th>
                          <td>
                            <Link to="/events/$eventId/frames" params={{ eventId: String(event.id) }} className={classicLink}>{event.frames ?? 0}</Link>
                            {' '}{t('Alarm')}:<Link to="/events/$eventId/frames" params={{ eventId: String(event.id) }} className={classicLink}>{event.alarm_frames ?? 0}</Link>
                          </td>
                        </tr>
                        <tr>
                          <th scope="row">{t('Score')}</th>
                          <td data-testid="event-score">
                            {t('Total')}:{event.tot_score ?? 0}{' '}
                            {/* Legacy links Max to `?view=frame&fid=0`, the max-score frame. */}
                            <Link to="/events/$eventId/frames/$frameId" params={{ eventId: String(event.id), frameId: '0' }} className={classicLink}>
                              {t('Max')}:{event.max_score ?? 0}
                            </Link>
                            {' '}{t('Avg')}:{event.avg_score ?? 0}
                          </td>
                        </tr>
                        <tr><th scope="row">{t('Resolution')}</th><td>{event.width}x{event.height}</td></tr>
                        <tr>
                          <th scope="row">{t('Disk Space')}</th>
                          <td data-testid="event-storage">
                            {t('{{size}} on {{storage}}', { size: formatBytes(event.disk_space ?? 0), storage: s.storageName ?? t('ID: {{id}}', { id: event.storage_id }) })}
                          </td>
                        </tr>
                        <tr>
                          <th scope="row">{t('Info')}</th>
                          <td>
                            {t('Archived')}:{event.archived === 1 ? t('Yes') : t('No')}, {t('Emailed')}:{event.emailed === 1 ? t('Yes') : t('No')}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <EventKeyFrames eventId={event.id} />
                  </div>
                )}
                </div>

                {/* Player */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div
                    ref={playerRef}
                    dir="ltr"
                    className="group relative bg-black mx-auto overflow-hidden"
                    style={{ aspectRatio: `${s.videoContainerW} / ${s.videoContainerH}`, maxWidth: s.playerMaxWidth }}
                  >
                    {/* Everything that is the picture zooms together; the
                        controls over it stay where they are. */}
                    <div ref={zoomRef} style={zoomStyle} className="absolute inset-0">
                      <video
                        ref={videoRef}
                        poster={s.thumbnailUrl}
                        className={s.useSwappedRotation ? 'object-contain bg-black' : 'w-full h-full object-contain bg-black'}
                        style={s.videoElementStyle}
                        onTimeUpdate={(e) => s.setCurrentTime(e.currentTarget.currentTime)}
                        onLoadedMetadata={(e) => {
                          const d = e.currentTarget.duration;
                          if (Number.isFinite(d) && d > 0) s.setDuration(d);
                        }}
                        onPlay={() => s.setIsPlaying(true)}
                        onPause={() => s.setIsPlaying(false)}
                        onEnded={s.handleVideoEnded}
                      />
                      {s.showZones && event.monitor_id > 0 && (
                        <ZonesOverlay monitorId={event.monitor_id} monitorWidth={event.width || 1920} monitorHeight={event.height || 1080} />
                      )}
                    </div>
                    {event.monitor_id > 0 && (
                      <PlayerOverlayControls
                        monitorId={event.monitor_id}
                        scale={zoomScale}
                        onZoomIn={zoomIn}
                        onZoomOut={zoomOut}
                        onFullscreen={s.handleToggleFullscreen}
                      />
                    )}
                    {/* Legacy's `.vjsMessage`: the replay run has nowhere
                        left to go, or is waiting out the real gap. */}
                    {(s.noMoreEvents || s.gapCountdown) && (
                      <p data-testid="event-replay-message" className="absolute inset-0 flex items-center justify-center bg-black/70 text-white text-lg">
                        {s.noMoreEvents
                          ? t('No more events')
                          : t('{{time}} to next event.', { time: s.gapCountdown })}
                      </p>
                    )}
                    {s.playbackMode === 'unsupported' && (
                      <div data-testid="event-unsupported-overlay" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 p-4 text-center text-white text-sm">
                        <p>{s.playbackError ?? t('This video codec is not supported in this browser.')}</p>
                        <a href={s.downloadUrl} download className="underline">{t('Download Video')}</a>
                      </div>
                    )}
                  </div>

                  {/* Progress strip with alarm cues */}
                  <div dir="ltr" className="border border-[#dee2e6] px-2 py-1">
                    <FrameScrubber
                      eventId={event.id}
                      durationSec={s.duration || Number(event.length) || 0}
                      currentTimeSec={s.currentTime}
                      onSeek={s.seekTo}
                      startTime={s.startTime}
                    />
                  </div>

                  {/* Legacy's `#eventControls` (ce4588bcc): monitor name,
                      DVR buttons and replay status share one row. */}
                  <div data-testid="event-controls" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <p className="text-xs text-zinc-600" data-testid="event-monitor-status">
                    {monitor?.name ?? t('Monitor {{id}}', { id: event.monitor_id })} ({t('ID={{id}}', { id: event.monitor_id })})
                  </p>

                  {/* DVR controls */}
                  <div dir="ltr" className="flex items-center justify-center gap-1">
                    <button type="button" onClick={s.navPrev} disabled={s.prevEventId == null} className={dvrBtn} title={t('Prev')} aria-label={t('Previous event')}><SkipBack size={18} /></button>
                    <button type="button" onClick={s.scanBack} disabled={!s.canScan} className={dvrBtn} title={t('Rewind')} aria-label={t('Rewind')}><Rewind size={18} /></button>
                    <button type="button" onClick={s.stepBack} disabled={!s.canStep} className={dvrBtn} title={t('Step Back')} aria-label={t('Step Back')}><ChevronsLeft size={18} /></button>
                    <button type="button" onClick={s.handlePlayPause} className={dvrBtn} title={s.isPlaying ? t('Pause') : t('Play')} aria-label={s.isPlaying ? t('Pause') : t('Play')}>
                      {s.isPlaying ? <Pause size={18} /> : <Play size={18} />}
                    </button>
                    <button type="button" onClick={s.stepForward} disabled={!s.canStep} className={dvrBtn} title={t('Step Forward')} aria-label={t('Step Forward')}><ChevronsRight size={18} /></button>
                    <button type="button" onClick={s.scanForward} disabled={!s.canScan} className={dvrBtn} title={t('Fast Forward')} aria-label={t('Fast Forward')}><FastForward size={18} /></button>
                    <button type="button" onClick={s.handleToggleMute} className={dvrBtn} aria-label={s.isMuted ? t('Unmute') : t('Mute')}>{s.isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
                    <input type="range" min={0} max={1} step={0.05} value={s.isMuted ? 0 : s.volume} onChange={(e) => s.setVolume(Number(e.target.value))} aria-label={t('Volume')} className="w-16 accent-[#337ab7]" />
                    <button type="button" onClick={s.handleToggleFullscreen} className={dvrBtn} title={t('Fullscreen')} aria-label={t('Fullscreen')}><Maximize2 size={18} /></button>
                    <button type="button" onClick={s.navNext} className={dvrBtn} title={t('Next')} aria-label={t('Next event')}><SkipForward size={18} /></button>
                  </div>

                  {/* Replay status */}
                  <div data-testid="event-replay-status" className="flex flex-wrap items-center gap-3 text-xs text-zinc-700">
                    {/* Legacy's `#replayStatus`: Mode is the transport, not the
                        replay-mode select; Rate is the select itself. */}
                    <span>{t('Mode')}: <b>{s.isPlaying ? t('Replay') : t('Paused')}</b></span>
                    <label className="inline-flex items-center gap-1">
                      {t('Rate')}:
                      <select aria-label={t('Playback speed')} value={s.rate} onChange={(e) => s.setRate(Number(e.target.value))} className={clsx(classicSelect, 'py-0 text-xs')}>
                        {rateOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </label>
                    <span>{t('Progress')}: <b>{Math.floor(s.currentTime)}</b>s</span>
                    <span>{t('Time')}: <b>{s.startTime ? new Date(s.startTime.getTime() + s.currentTime * 1000).toLocaleTimeString() : '—'}</b></span>
                    <span>{t('Zoom')}: <b>{zoomScale.toFixed(1)}</b>x</span>
                  </div>
                  </div>
                </div>
              </div>

              {/* Event_Data rows: Timestamp and Data, as event.php:568 prints them. */}
              {s.eventData.length > 0 && (
                <table className="text-xs border border-[#dee2e6]" data-testid="event-data-table">
                  <thead className="bg-[#e9ecef]">
                    <tr>
                      <th className="px-2 py-1 text-start">{t('Timestamp')}</th>
                      <th className="px-2 py-1 text-start">{t('Data')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.eventData.map((row) => (
                      <tr key={row.id} className="border-t border-[#dee2e6]">
                        <td className="px-2 py-1 whitespace-nowrap">{row.timestamp ? formatDateTime(row.timestamp) : '—'}</td>
                        <td className="px-2 py-1 whitespace-pre-wrap break-words">{row.data ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <ConfirmDialog
                isOpen={s.deleteOpen}
                onClose={s.cancelDelete}
                onConfirm={s.confirmDelete}
                title={t('Delete Event')}
                message={s.deleteError
                  ? t('Delete failed: {{message}}', { message: s.deleteError })
                  : t('Delete event #{{id}} and its recording? This cannot be undone.', { id: event.id })}
                confirmText={t('Delete')}
                isLoading={s.deletePending}
              />
              {s.editOpen && (
                <EventEditForm
                  isOpen
                  title={t('Edit event #{{id}}', { id: event.id })}
                  initial={{ name: event.name, cause: event.cause ?? '', notes: event.notes ?? '' }}
                  onClose={s.closeEdit}
                  onSubmit={(v) => s.saveEdit({ name: v.name, cause: v.cause, notes: v.notes })}
                  pending={s.savePending}
                  error={s.saveError}
                />
              )}
            </div>
          )}
        </QueryState>
      </main>
    </AppShell>
  );
}
