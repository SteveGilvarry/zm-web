import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
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
  Layers,
  BarChart3,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  FileVideo,
  Archive,
  ArchiveRestore,
  Pencil,
  Gauge,
  Database,
  HardDrive,
  Film,
  LayoutGrid,
} from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { QueryState } from '@/components/common/QueryState';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EventEditForm } from '@/features/events/EventEditForm';
import { useReplayModeOptions, useScaleOptions } from '@/features/events/playbackOptions';
import { useDocumentTitle } from '../layouts/useDocumentTitle';
import { TagChips } from '@/features/events/TagChips';
import { FrameScrubber } from '@/features/events/FrameScrubber';
import { ZonesOverlay } from '@/features/events/ZonesOverlay';
import { formatBytes } from '@/lib/format';
import {
  useEventDetailPage,
  formatTime,
  getCauseColor,
} from '@/features/events/useEventDetailPage';
import { useDateTimeFormat } from '@/features/config/useDateTimeFormat';
import { eventDurationSeconds } from '@/features/events/duration';

/** Event detail — Mission Control. Player, scrubber, stats and sidebar. */
export default function EventDetailPage({ eventId }: { eventId: number }) {
  const { t } = useTranslation();
  const replayModeOptions = useReplayModeOptions();
  const scaleOptions = useScaleOptions();
  // Event stamps render through ZoneMinder's own patterns / server zone.
  const { formatDateTime } = useDateTimeFormat();
  const s = useEventDetailPage(eventId);
  const {
    event, monitor, eventLoading,
    videoRef, playbackMode, playbackError,
    isPlaying, isMuted, currentTime, duration,
    replayMode, setReplayMode, scale, setScale,
    showZones, setShowZones, showStats, setShowStats,
    prevEventId, nextEventId, navMonitorId,
    startTime, endTime, downloadUrl, thumbnailUrl, codecHint,
    videoContainerW, videoContainerH, useSwappedRotation, videoElementStyle,
    playerMaxWidth, rate, setRate, rateOptions,
    storageName, eventData,
  } = s;

  useDocumentTitle(event ? t('Event {{id}}', { id: event.id }) : t('Events'));

  // Wire values stay as-is; only the display label is translated.

  if (!s.isAuthenticated) return null;

  if (eventLoading || s.eventError) {
    return (
      <AppShell title={t('Event')}>
        <main className="flex-1 p-6 overflow-auto">
          <QueryState isLoading={eventLoading} isError={!!s.eventError} error={s.eventError} />
        </main>
      </AppShell>
    );
  }

  if (!event) {
    return (
      <AppShell title={t('Event Not Found')}>
        <main className="flex-1 p-6 flex items-center justify-center">
          <div className="text-center">
            <Video size={64} className="mx-auto mb-4 text-text-muted" />
            <h2 className="text-xl font-bold text-text-primary mb-2">{t('Event Not Found')}</h2>
            <p className="text-text-muted mb-6">
              {t('The requested event could not be found.')}
            </p>
            <Link
              to="/events"
              className="px-6 py-3 bg-cyan text-void font-medium rounded-lg hover:bg-cyan-dim transition-colors"
            >
              {t('Back to Events')}
            </Link>
          </div>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell title={event.name}>
      <main className="flex-1 p-6 overflow-auto">
        {/* Breadcrumb */}
          <div className="flex items-center gap-2 mb-6 text-sm">
            <Link
              to="/events"
              className="flex items-center gap-1 text-text-muted hover:text-cyan transition-colors"
            >
              <ArrowLeft size={14} className="rtl:-scale-x-100" />
              {t('Events')}
            </Link>
            <ChevronRight size={14} className="text-text-muted rtl:-scale-x-100" />
            <span className="text-text-primary">{event.name}</span>
          </div>

          {/* Playback toolbar — prev/next, replay mode, scale, codec hint,
              zones toggle, stats toggle. Sits above the grid so it spans
              the whole width and is visible without scrolling. */}
          <div
            data-testid="event-playback-toolbar"
            className="flex flex-wrap items-center gap-2 mb-4 px-3 py-2 rounded-lg border border-border-subtle bg-surface/40"
          >
            <div
              className="flex items-center gap-1"
              title={navMonitorId == null
                ? t('Prev / Next walk every monitor (← →)')
                : t('Prev / Next stay on {{monitor}} (← →)', { monitor: monitor?.name ?? t('Monitor {{id}}', { id: navMonitorId }) })}
            >
              <button
                type="button"
                onClick={s.navPrev}
                disabled={prevEventId == null}
                aria-label={t('Previous event')}
                aria-keyshortcuts="ArrowLeft"
                className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-border-subtle bg-surface text-text-secondary hover:border-cyan/40 hover:text-cyan transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeftIcon size={14} className="rtl:-scale-x-100" />
                {t('Prev')}
              </button>
              <button
                type="button"
                onClick={s.navNext}
                disabled={nextEventId == null}
                aria-label={t('Next event')}
                aria-keyshortcuts="ArrowRight"
                className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-border-subtle bg-surface text-text-secondary hover:border-cyan/40 hover:text-cyan transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t('Next')}
                <ChevronRightIcon size={14} className="rtl:-scale-x-100" />
              </button>
            </div>

            <div className="h-5 w-px bg-border-subtle" />

            <label className="flex items-center gap-1.5 text-xs text-text-muted">
              <span className="font-mono uppercase tracking-[0.16em]">{t('Replay')}</span>
              <select
                aria-label={t('Replay mode')}
                value={replayMode}
                onChange={(e) => setReplayMode(e.target.value as typeof replayMode)}
                className="px-2 py-1 text-xs bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
              >
                {replayModeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-1.5 text-xs text-text-muted">
              <span className="font-mono uppercase tracking-[0.16em]">{t('Scale')}</span>
              <select
                aria-label={t('Scale')}
                value={scale}
                onChange={(e) => setScale(e.target.value as typeof scale)}
                className="px-2 py-1 text-xs bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
              >
                {scaleOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-1.5 text-xs text-text-muted">
              <Gauge size={12} />
              <span className="font-mono uppercase tracking-[0.16em]">{t('Speed')}</span>
              <select
                aria-label={t('Playback speed')}
                value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
                className="px-2 py-1 text-xs bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
              >
                {rateOptions.map((r) => (
                  <option key={r} value={r}>{r}×</option>
                ))}
              </select>
            </label>

            <div
              data-testid="codec-hint"
              title={t('Source codec: {{codec}}', { codec: codecHint })}
              className="flex items-center gap-1.5 px-2 py-1 text-xs rounded border border-border-subtle bg-surface/70 text-text-secondary"
            >
              <FileVideo size={12} />
              <span className="font-mono uppercase tracking-[0.16em] text-text-muted">{t('Codec')}</span>
              <span className="font-mono">{codecHint}</span>
            </div>

            <div className="flex-1" />

            <button
              type="button"
              onClick={() => setShowZones(!showZones)}
              aria-pressed={showZones}
              className={clsx(
                'flex items-center gap-1 px-2 py-1 text-xs rounded border transition-colors',
                showZones
                  ? 'border-cyan/50 bg-cyan/15 text-cyan'
                  : 'border-border-subtle bg-surface text-text-secondary hover:border-cyan/40 hover:text-cyan',
              )}
            >
              <Layers size={14} />
              {showZones ? t('Hide Zones') : t('Show Zones')}
            </button>

            <button
              type="button"
              onClick={() => setShowStats(!showStats)}
              aria-pressed={showStats}
              className={clsx(
                'flex items-center gap-1 px-2 py-1 text-xs rounded border transition-colors',
                showStats
                  ? 'border-cyan/50 bg-cyan/15 text-cyan'
                  : 'border-border-subtle bg-surface text-text-secondary hover:border-cyan/40 hover:text-cyan',
              )}
            >
              <BarChart3 size={14} />
              {showStats ? t('Hide Stats') : t('Stats')}
            </button>
          </div>

          <div className="grid grid-cols-12 gap-6">
            {/* Video Player - 8 columns */}
            <div className="col-span-8 space-y-6">
              <Panel noPadding className="overflow-hidden">
                <div
                  dir="ltr"
                  className="relative bg-black mx-auto"
                  style={{
                    aspectRatio: `${videoContainerW} / ${videoContainerH}`,
                    maxWidth: playerMaxWidth,
                  }}
                >
                  {/* Video element — rotated cameras need a swap-dimensions
                      + rotate trick so the portrait content fills the
                      portrait container instead of pillarboxing at center. */}
                  <video
                    ref={videoRef}
                    poster={thumbnailUrl}
                    className={useSwappedRotation ? 'object-contain bg-black' : 'w-full h-full object-contain bg-black'}
                    style={videoElementStyle}
                    onTimeUpdate={(e) => s.setCurrentTime(e.currentTarget.currentTime)}
                    onLoadedMetadata={(e) => {
                      const d = e.currentTarget.duration;
                      if (Number.isFinite(d) && d > 0) s.setDuration(d);
                    }}
                    onPlay={() => s.setIsPlaying(true)}
                    onPause={() => s.setIsPlaying(false)}
                    onEnded={s.handleVideoEnded}
                  />

                  {/* Zones overlay — only mounted when toggle is on so we
                      don't fetch the monitor's zone list otherwise. */}
                  {showZones && event.monitor_id > 0 && (
                    <ZonesOverlay
                      monitorId={event.monitor_id}
                      monitorWidth={event.width || 1920}
                      monitorHeight={event.height || 1080}
                    />
                  )}

                  {/* Unsupported-codec fallback — HEVC in a browser whose MSE
                      can't decode it. Offer the download instead of a black
                      frame. Takes precedence over the play overlay. */}
                  {playbackMode === 'unsupported' && (
                    <div
                      data-testid="event-unsupported-overlay"
                      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/80 p-6 text-center"
                    >
                      <AlertTriangle size={40} className="text-amber" />
                      <p className="text-sm font-medium text-text-primary">
                        {playbackError ?? t('This video codec is not supported in this browser.')}
                      </p>
                      <p className="text-xs text-text-muted">
                        {t('{{codec}} playback needs Safari or a browser with hardware HEVC support. You can still download the recording.', { codec: codecHint })}
                      </p>
                      <a
                        href={downloadUrl}
                        download
                        className="mt-1 flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan text-void text-sm font-medium hover:bg-cyan-dim transition-colors"
                      >
                        <Download size={16} />
                        {t('Download Video')}
                      </a>
                    </div>
                  )}

                  {/* Play overlay when paused */}
                  {!isPlaying && playbackMode !== 'unsupported' && (
                    <button
                      onClick={s.handlePlayPause}
                      className="absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity hover:bg-black/40"
                    >
                      <div className="w-16 h-16 rounded-full bg-cyan/80 flex items-center justify-center">
                        <Play size={32} className="text-void ms-1" />
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
                        onChange={s.handleSeek}
                        className="w-full h-1 bg-text-muted/30 rounded-full appearance-none cursor-pointer
                          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {/* Play/Pause */}
                        <button
                          onClick={s.handlePlayPause}
                          aria-label={isPlaying ? t('Pause') : t('Play')}
                          aria-keyshortcuts="Space"
                          className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
                        >
                          {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                        </button>

                        {/* Skip buttons */}
                        <button
                          onClick={() => s.handleSkip(-10)}
                          aria-label={t('Back 10 seconds')}
                          className="p-2 rounded-lg text-white/70 hover:text-white transition-colors"
                        >
                          <SkipBack size={16} />
                        </button>
                        <button
                          onClick={() => s.handleSkip(10)}
                          aria-label={t('Forward 10 seconds')}
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
                          onClick={s.handleToggleMute}
                          className="p-2 rounded-lg text-white/70 hover:text-white transition-colors"
                        >
                          {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                        </button>

                        {/* Fullscreen */}
                        <button
                          onClick={s.handleToggleFullscreen}
                          className="p-2 rounded-lg text-white/70 hover:text-white transition-colors"
                        >
                          <Maximize2 size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </Panel>

              {/* Stats panel — collapsible per-event diagnostics. Pulled
                  from the existing event payload, no extra fetch. */}
              {showStats && (
                <Panel title={t('Event Stats')} icon={<BarChart3 size={16} />}>
                  <div
                    data-testid="event-stats-panel"
                    className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm"
                  >
                    <StatRow label={t('Alarm Frames')} value={event.alarm_frames ?? 0} />
                    <StatRow label={t('Total Frames')} value={event.frames ?? 0} />
                    <StatRow label={t('Tot Score')} value={event.tot_score ?? 0} />
                    <StatRow label={t('Avg Score')} value={event.avg_score ?? 0} />
                    <StatRow label={t('Max Score')} value={event.max_score ?? 0} />
                    <StatRow
                      label={t('Duration')}
                      value={t('{{seconds}}s', { seconds: eventDurationSeconds(event.length) })}
                    />
                    <StatRow
                      label={t('Disk Space')}
                      value={formatBytes(event.disk_space ?? 0)}
                    />
                    <StatRow
                      label={t('Start')}
                      value={startTime ? formatDateTime(startTime) : '—'}
                    />
                    <StatRow
                      label={t('End')}
                      value={endTime ? formatDateTime(endTime) : '—'}
                    />
                    <StatRow
                      label={t('Resolution')}
                      value={`${event.width}x${event.height}`}
                    />
                    <StatRow label={t('Codec')} value={codecHint} />
                    <StatRow
                      label={t('Archived')}
                      value={event.archived === 1 ? t('Yes') : t('No')}
                    />
                  </div>
                </Panel>
              )}

              {/* Frame Scrubber — per-frame stepper, score-graded ticks */}
              <div dir="ltr">
                <Panel>
                  <FrameScrubber
                    eventId={event.id}
                    durationSec={duration || Number(event.length) || 0}
                    currentTimeSec={currentTime}
                    onSeek={s.seekTo}
                  />
                </Panel>
              </div>

              {/* Stats Cards — five cells so Total Score gets its own readout */}
              <div className="grid grid-cols-5 gap-4">
                <Panel>
                  <div className="text-center">
                    <p className="text-2xl font-mono font-bold text-text-primary">
                      {event.frames || 0}
                    </p>
                    <p className="text-xs text-text-muted mt-1">{t('Total Frames')}</p>
                  </div>
                </Panel>

                <Panel>
                  <div className="text-center">
                    <p className="text-2xl font-mono font-bold text-crimson">
                      {event.alarm_frames || 0}
                    </p>
                    <p className="text-xs text-text-muted mt-1">{t('Alarm Frames')}</p>
                  </div>
                </Panel>

                <Panel>
                  <div className="text-center">
                    <p className="text-2xl font-mono font-bold text-text-primary">
                      {event.tot_score ?? 0}
                    </p>
                    <p className="text-xs text-text-muted mt-1">{t('Tot Score')}</p>
                  </div>
                </Panel>

                <Panel>
                  <div className="text-center">
                    <p className="text-2xl font-mono font-bold text-cyan">
                      {event.avg_score ?? 0}
                    </p>
                    <p className="text-xs text-text-muted mt-1">{t('Avg Score')}</p>
                  </div>
                </Panel>

                <Panel>
                  <div className="text-center">
                    <p className="text-2xl font-mono font-bold text-amber">
                      {event.max_score ?? 0}
                    </p>
                    <p className="text-xs text-text-muted mt-1">{t('Max Score')}</p>
                  </div>
                </Panel>
              </div>

              {/* Event_Data rows — only when a detector / trigger wrote some. */}
              {eventData.length > 0 && (
                <Panel title={t('Event Data')} icon={<Database size={16} />} noPadding>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs" data-testid="event-data-table">
                      <thead className="bg-surface/70 border-b border-border-subtle text-[10px] uppercase tracking-wider text-text-muted">
                        <tr>
                          <th className="px-3 py-2 text-start">{t('Frame')}</th>
                          <th className="px-3 py-2 text-start">{t('Timestamp')}</th>
                          <th className="px-3 py-2 text-start">{t('Data')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {eventData.map((row) => (
                          <tr key={row.id} className="border-b border-border-subtle/40">
                            <td className="px-3 py-1.5 font-mono text-text-muted">
                              {row.frame_id != null ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    // Frame n at the event's average rate.
                                    const fps = event.frames && duration ? event.frames / duration : 0;
                                    if (fps > 0 && row.frame_id != null) s.seekTo(row.frame_id / fps);
                                  }}
                                  className="hover:text-cyan"
                                >
                                  #{row.frame_id}
                                </button>
                              ) : '—'}
                            </td>
                            <td className="px-3 py-1.5 font-mono text-text-secondary whitespace-nowrap">
                              {row.timestamp ? formatDateTime(row.timestamp) : '—'}
                            </td>
                            <td className="px-3 py-1.5 font-mono text-text-primary whitespace-pre-wrap break-words">
                              {row.data ?? '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              )}
            </div>

            {/* Sidebar - 4 columns */}
            <div className="col-span-4 space-y-6">
              {/* Event Details */}
              <Panel title={t('Event Details')} icon={<Video size={16} />}>
                <div className="space-y-4">
                  {/* Monitor */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-secondary">{t('Monitor')}</span>
                    <Link
                      to="/monitors/$monitorId"
                      params={{ monitorId: String(event.monitor_id) }}
                      className="flex items-center gap-1.5 text-sm text-cyan hover:text-cyan-dim transition-colors"
                    >
                      <Monitor size={14} />
                      {monitor?.name || t('Monitor {{id}}', { id: event.monitor_id })}
                    </Link>
                  </div>

                  {/* Cause */}
                  {event.cause && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-text-secondary">{t('Cause')}</span>
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
                      <span className="text-sm text-text-secondary">{t('Start')}</span>
                      <span className="text-sm font-mono text-text-primary">
                        {formatDateTime(startTime)}
                      </span>
                    </div>
                  )}

                  {/* End Time */}
                  {endTime && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-text-secondary">{t('End')}</span>
                      <span className="text-sm font-mono text-text-primary">
                        {formatDateTime(endTime)}
                      </span>
                    </div>
                  )}

                  {/* Duration */}
                  {eventDurationSeconds(event.length) > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-text-secondary">{t('Duration')}</span>
                      <span className="text-sm font-mono text-text-primary">
                        {t('{{seconds}}s', { seconds: eventDurationSeconds(event.length) })}
                      </span>
                    </div>
                  )}

                  {/* Archived */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-secondary">{t('Archived')}</span>
                    <span
                      className={clsx(
                        'text-sm',
                        event.archived === 1 ? 'text-amber' : 'text-text-muted'
                      )}
                    >
                      {event.archived === 1 ? t('Yes') : t('No')}
                    </span>
                  </div>
                </div>
              </Panel>

              {/* Technical Details */}
              <Panel title={t('Technical')} icon={<Activity size={16} />}>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">{t('Resolution')}</span>
                    <span className="font-mono text-text-primary">
                      {event.width}x{event.height}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary flex items-center gap-1.5"><HardDrive size={12} />{t('Storage')}</span>
                    <span className="font-mono text-text-primary" data-testid="event-storage">
                      {storageName ?? t('ID: {{id}}', { id: event.storage_id })}
                    </span>
                  </div>

                  {event.disk_space && (
                    <div className="flex items-center justify-between">
                      <span className="text-text-secondary">{t('Disk Space')}</span>
                      <span className="font-mono text-text-primary">
                        {t('{{size}} MB', { size: (event.disk_space / 1024 / 1024).toFixed(2) })}
                      </span>
                    </div>
                  )}

                  {event.scheme && (
                    <div className="flex items-center justify-between">
                      <span className="text-text-secondary">{t('Scheme')}</span>
                      <span className="font-mono text-text-primary">{event.scheme}</span>
                    </div>
                  )}
                </div>
              </Panel>

              {/* Tags — chips + inline editor (read-only without Events Edit) */}
              <Panel title={t('Tags')} icon={<TagIcon size={16} />}>
                <RequirePerm
                  feature="events"
                  level="Edit"
                  fallback={(
                    <p className="text-sm text-text-secondary">
                      {(event.tags ?? []).map((tag) => tag.name).join(', ') || t('No tags')}
                    </p>
                  )}
                >
                  <TagChips eventId={event.id} currentTags={event.tags ?? []} />
                </RequirePerm>
              </Panel>

              {/* Notes */}
              {event.notes && (
                <Panel title={t('Notes')} icon={<AlertTriangle size={16} />}>
                  <p className="text-sm text-text-secondary whitespace-pre-wrap">
                    {event.notes}
                  </p>
                </Panel>
              )}

              {/* Actions */}
              <Panel title={t('Actions')}>
                <div className="space-y-2">
                  <Link
                    to="/events/$eventId/frames"
                    params={{ eventId: String(event.id) }}
                    className={clsx(
                      'flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg',
                      'bg-surface border border-border-subtle',
                      'text-text-primary hover:border-cyan/50 transition-colors'
                    )}
                  >
                    <Film size={16} />
                    {t('Frames')}
                  </Link>

                  {s.reviewSearch && (
                    <Link
                      to="/montagereview"
                      search={s.reviewSearch}
                      className={clsx(
                        'flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg',
                        'bg-surface border border-border-subtle',
                        'text-text-primary hover:border-cyan/50 transition-colors'
                      )}
                    >
                      <LayoutGrid size={16} />
                      {t('Montage Review')}
                    </Link>
                  )}

                  <RequirePerm feature="events" level="Edit">
                  <button
                    type="button"
                    onClick={s.toggleArchived}
                    disabled={s.archivePending}
                    aria-pressed={event.archived === 1}
                    className={clsx(
                      'flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg',
                      'bg-surface border border-border-subtle',
                      'text-text-primary hover:border-amber/50 transition-colors',
                      'disabled:opacity-50 disabled:cursor-not-allowed'
                    )}
                  >
                    {event.archived === 1 ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                    {event.archived === 1 ? t('Unarchive') : t('Archive')}
                  </button>
                  {s.archiveError && (
                    <p role="alert" className="text-xs text-crimson">{s.archiveError}</p>
                  )}

                  <button
                    type="button"
                    onClick={s.openEdit}
                    className={clsx(
                      'flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg',
                      'bg-surface border border-border-subtle',
                      'text-text-primary hover:border-cyan/50 transition-colors'
                    )}
                  >
                    <Pencil size={16} />
                    {t('Edit')}
                  </button>
                  </RequirePerm>

                  <a
                    href={downloadUrl}
                    download
                    title={t('Backend generates the MP4 on demand (Range-supported) and streams it as a download.')}
                    className={clsx(
                      'flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg',
                      'bg-surface border border-border-subtle',
                      'text-text-primary hover:border-cyan/50 transition-colors'
                    )}
                  >
                    <Download size={16} />
                    {t('Download Video')}
                  </a>

                  <RequirePerm feature="events" level="Edit">
                    <button
                      onClick={s.requestDelete}
                      disabled={s.deletePending}
                      aria-keyshortcuts="Delete"
                      className={clsx(
                        'flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg',
                        'bg-crimson/10 border border-crimson/30',
                        'text-crimson hover:bg-crimson/20 transition-colors',
                        'disabled:opacity-50 disabled:cursor-not-allowed'
                      )}
                    >
                      <Trash2 size={16} />
                      {t('Delete Event')}
                    </button>
                  </RequirePerm>
                  <p className="text-[10px] font-mono text-text-muted text-center">
                    {t('Keys: ← → prev/next · Space play/pause · Delete')}
                  </p>
                </div>
              </Panel>
            </div>
          </div>

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
      </main>
    </AppShell>
  );
}

/** Two-cell label/value row used inside the stats panel. */
function StatRow({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border-subtle/50 py-1">
      <span className="text-text-muted text-xs font-mono uppercase tracking-[0.14em]">
        {label}
      </span>
      <span className="font-mono text-text-primary tabular-nums">{value}</span>
    </div>
  );
}
