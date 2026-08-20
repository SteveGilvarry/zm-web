import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, RefreshCw, Archive, ArchiveRestore, Pencil, ExternalLink, Download, Trash2,
  Film, Info, Layers, LayoutGrid, SkipBack, SkipForward, Rewind, FastForward, Play, Pause,
  Maximize2, Volume2, VolumeX,
} from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { EventEditForm } from '@/features/events/EventEditForm';
import { FrameScrubber } from '@/features/events/FrameScrubber';
import { TagChips } from '@/features/events/TagChips';
import { ZonesOverlay } from '@/features/events/ZonesOverlay';
import { useReplayModeOptions, useScaleOptions } from '@/features/events/playbackOptions';
import { formatDurationHms } from '@/features/events/duration';
import { formatTime, useEventDetailPage } from '@/features/events/useEventDetailPage';
import { formatBytes } from '@/lib/format';
import { useDocumentTitle } from '@/skins/modern/layouts/useDocumentTitle';
import { ClassicButton, ClassicLinkButton } from '../components/events/primitives';
import { classicSelect, classicLink } from '../components/events/styles';

const barSelect = clsx(classicSelect, 'py-0.5 text-xs');
const dvrBtn = 'p-1.5 rounded-sm text-zinc-700 hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed';

/**
 * Event view — classic skin, after legacy `?view=event`: dark control bar
 * (back/refresh, title, Replay / Scale / Stream quality / Codec / Rate),
 * toolbar (Archive, Edit, Export, Download, Delete, Frames, Stats, Zones,
 * Montage Review), stats table beside the full-width player, the progress
 * strip with alarm cues, the DVR button row and the replay status line.
 */
export default function ClassicEventDetailPage({ eventId }: { eventId: number }) {
  const { t } = useTranslation();
  const replayModeOptions = useReplayModeOptions();
  const scaleOptions = useScaleOptions();
  const s = useEventDetailPage(eventId);
  // Pull the ref out so the remaining `s.*` reads are plain values.
  const { event, monitor, videoRef } = s;
  useDocumentTitle(event ? t('Event {{id}}', { id: event.id }) : t('Event'));

  if (!s.isAuthenticated) return null;

  return (
    <AppShell title={event ? t('Event {{id}}', { id: event.id }) : t('Event')}>
      <main className="flex-1 overflow-auto bg-white text-zinc-900">
        {/* Dark control bar */}
        <div className="flex flex-wrap items-center gap-3 px-3 py-1.5 bg-[#485563] text-white">
          <div className="flex items-center gap-1">
            <Link to="/events" className="inline-flex items-center px-2.5 py-1.5 rounded-sm bg-[#e9ecef] border border-[#adb5bd] text-zinc-700" title={t('Back')} aria-label={t('Back')}>
              <ArrowLeft size={14} className="rtl:-scale-x-100" />
            </Link>
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
            <label className="flex items-center gap-1" title={t('Recorded playback is served as-is; stream quality applies to live views only.')}>
              <span className="font-semibold">{t('Stream quality')}</span>
              <select aria-label={t('Stream quality')} disabled value="optimal" className={barSelect}>
                <option value="optimal">{t('Optimal')}</option>
              </select>
            </label>
            <label className="flex items-center gap-1" title={t('Source codec: {{codec}}', { codec: s.codecHint })}>
              <span className="font-semibold">{t('Codec')}</span>
              <select aria-label={t('Codec')} disabled value={s.playbackMode ?? 'auto'} className={barSelect}>
                <option value="auto">{t('Auto')}</option>
                <option value="direct">MP4 ({s.codecHint})</option>
                <option value="hls">HLS ({s.codecHint})</option>
                <option value="unsupported">{t('Unsupported')}</option>
              </select>
            </label>
            <label className="flex items-center gap-1">
              <span className="font-semibold">{t('Rate')}</span>
              <select aria-label={t('Playback speed')} value={s.rate} onChange={(e) => s.setRate(Number(e.target.value))} className={barSelect}>
                {s.rateOptions.map((r) => <option key={r} value={r}>{r}×</option>)}
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
                  <ClassicButton onClick={s.toggleArchived} disabled={s.archivePending} aria-pressed={event.archived === 1} title={event.archived === 1 ? t('Unarchive') : t('Archive')}>
                    {event.archived === 1 ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                    {event.archived === 1 ? t('Unarchive') : t('Archive')}
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
                <ClassicLinkButton href={s.downloadUrl} download title={t('Download video')}>
                  <Download size={14} />
                  {t('Download')}
                </ClassicLinkButton>
                <RequirePerm feature="events" level="Edit">
                  <ClassicButton tone="danger" onClick={s.requestDelete} disabled={s.deletePending} title={t('Delete')}>
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
                <ClassicButton onClick={() => s.setShowZones(!s.showZones)} aria-pressed={s.showZones} title={s.showZones ? t('Hide Zones') : t('Show Zones')}>
                  <Layers size={14} />
                  {t('Zones')}
                </ClassicButton>
                {s.reviewSearch && (
                  <Link to="/montagereview" search={s.reviewSearch} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-sm font-medium bg-[#e9ecef] border-[#adb5bd] text-zinc-800 hover:bg-[#dde1e5]">
                    <LayoutGrid size={14} />
                    {t('Montage Review')}
                  </Link>
                )}
              </div>

              {/* Tags */}
              <div className="flex items-center gap-2 text-sm">
                <span className="text-zinc-600">{t('Tags')}</span>
                <RequirePerm feature="events" level="Edit" fallback={<span>{(event.tags ?? []).map((tag) => tag.name).join(', ') || t('No tags')}</span>}>
                  <TagChips eventId={event.id} currentTags={event.tags ?? []} />
                </RequirePerm>
              </div>

              <div className="flex flex-col lg:flex-row gap-3">
                {/* Stats table */}
                {s.showStats && (
                  <table className="text-sm lg:w-80 shrink-0 self-start" data-testid="event-stats-panel">
                    <tbody className="[&>tr>th]:text-end [&>tr>th]:pe-3 [&>tr>th]:py-0.5 [&>tr>th]:font-semibold [&>tr>th]:text-zinc-600 [&>tr>td]:py-0.5 [&>tr>td]:tabular-nums">
                      <tr><th scope="row">{t('Id')}</th><td>{event.id}</td></tr>
                      <tr><th scope="row">{t('Name')}</th><td>{event.name}</td></tr>
                      <tr>
                        <th scope="row">{t('Monitor')}</th>
                        <td>
                          <Link to="/monitors/$monitorId" params={{ monitorId: String(event.monitor_id) }} className={classicLink}>
                            {monitor?.name ?? t('Monitor {{id}}', { id: event.monitor_id })}
                          </Link>
                        </td>
                      </tr>
                      <tr><th scope="row">{t('Cause')}</th><td>{event.cause ?? '—'}</td></tr>
                      {event.notes && <tr><th scope="row">{t('Notes')}</th><td className="whitespace-pre-wrap">{event.notes}</td></tr>}
                      <tr><th scope="row">{t('Start')}</th><td>{s.startTime ? s.startTime.toLocaleString() : '—'}</td></tr>
                      <tr><th scope="row">{t('End')}</th><td>{s.endTime ? s.endTime.toLocaleString() : '—'}</td></tr>
                      <tr><th scope="row">{t('Duration')}</th><td>{formatDurationHms(event.length)}</td></tr>
                      <tr><th scope="row">{t('Frames')}</th><td>{event.frames ?? 0}</td></tr>
                      <tr><th scope="row">{t('Alarm Frames')}</th><td>{event.alarm_frames ?? 0}</td></tr>
                      <tr><th scope="row">{t('Total Score')}</th><td>{event.tot_score ?? 0}</td></tr>
                      <tr><th scope="row">{t('Avg. Score')}</th><td>{event.avg_score ?? 0}</td></tr>
                      <tr><th scope="row">{t('Max. Score')}</th><td>{event.max_score ?? 0}</td></tr>
                      <tr><th scope="row">{t('Disk Space')}</th><td>{formatBytes(event.disk_space ?? 0)}</td></tr>
                      <tr><th scope="row">{t('Storage')}</th><td data-testid="event-storage">{s.storageName ?? t('ID: {{id}}', { id: event.storage_id })}</td></tr>
                      <tr><th scope="row">{t('Archived')}</th><td>{event.archived === 1 ? t('Yes') : t('No')}</td></tr>
                      <tr><th scope="row">{t('Emailed')}</th><td>{event.emailed === 1 ? t('Yes') : t('No')}</td></tr>
                      <tr><th scope="row">{t('Resolution')}</th><td>{event.width}x{event.height}</td></tr>
                      <tr><th scope="row">{t('Codec')}</th><td>{s.codecHint}</td></tr>
                    </tbody>
                  </table>
                )}

                {/* Player */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div
                    dir="ltr"
                    className="relative bg-black mx-auto"
                    style={{ aspectRatio: `${s.videoContainerW} / ${s.videoContainerH}`, maxWidth: s.playerMaxWidth }}
                  >
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
                    />
                  </div>

                  <p className="text-center text-xs text-zinc-600">
                    {monitor?.name ?? t('Monitor {{id}}', { id: event.monitor_id })} ({t('ID={{id}}', { id: event.monitor_id })})
                  </p>

                  {/* DVR controls */}
                  <div dir="ltr" className="flex items-center justify-center gap-1">
                    <button type="button" onClick={s.navPrev} disabled={s.prevEventId == null} className={dvrBtn} title={t('Prev')} aria-label={t('Previous event')}><SkipBack size={18} /></button>
                    <button type="button" onClick={() => s.handleSkip(-10)} className={dvrBtn} title={t('Rewind')} aria-label={t('Rewind')}><Rewind size={18} /></button>
                    <button type="button" onClick={s.handlePlayPause} className={dvrBtn} title={s.isPlaying ? t('Pause') : t('Play')} aria-label={s.isPlaying ? t('Pause') : t('Play')}>
                      {s.isPlaying ? <Pause size={18} /> : <Play size={18} />}
                    </button>
                    <button type="button" onClick={() => s.handleSkip(10)} className={dvrBtn} title={t('Fast Forward')} aria-label={t('Fast Forward')}><FastForward size={18} /></button>
                    <button type="button" onClick={s.handleToggleMute} className={dvrBtn} aria-label={s.isMuted ? t('Unmute') : t('Mute')}>{s.isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
                    <button type="button" onClick={s.handleToggleFullscreen} className={dvrBtn} title={t('Fullscreen')} aria-label={t('Fullscreen')}><Maximize2 size={18} /></button>
                    <button type="button" onClick={s.navNext} disabled={s.nextEventId == null} className={dvrBtn} title={t('Next')} aria-label={t('Next event')}><SkipForward size={18} /></button>
                  </div>

                  {/* Replay status */}
                  <p className="flex flex-wrap items-center justify-center gap-4 text-xs text-zinc-700">
                    <span>{t('Mode')}: <b>{replayModeOptions.find((o) => o.value === s.replayMode)?.label}</b></span>
                    <span>{t('Rate')}: <b>{s.rate}×</b></span>
                    <span>{t('Progress')}: <b>{formatTime(s.currentTime)}</b> / {formatTime(s.duration)}</span>
                    <span>{t('Time')}: <b>{s.startTime ? new Date(s.startTime.getTime() + s.currentTime * 1000).toLocaleTimeString() : '—'}</b></span>
                  </p>
                </div>
              </div>

              {/* Event_Data rows */}
              {s.eventData.length > 0 && (
                <table className="text-xs border border-[#dee2e6]" data-testid="event-data-table">
                  <thead className="bg-[#e9ecef]">
                    <tr>
                      <th className="px-2 py-1 text-start">{t('Frame')}</th>
                      <th className="px-2 py-1 text-start">{t('Timestamp')}</th>
                      <th className="px-2 py-1 text-start">{t('Data')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.eventData.map((row) => (
                      <tr key={row.id} className="border-t border-[#dee2e6]">
                        <td className="px-2 py-1">{row.frame_id ?? '—'}</td>
                        <td className="px-2 py-1 whitespace-nowrap">{row.timestamp ? new Date(row.timestamp).toLocaleString() : '—'}</td>
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
