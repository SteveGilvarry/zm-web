import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Pause, Play, Radio, Calendar, FastForward, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Maximize2} from 'lucide-react';
import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import { StreamCell } from '@/components/common/StreamCell';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { MontageReviewCell } from '@/features/montagereview/MontageReviewCell';
import { MontageReviewTimeline } from '@/features/montagereview/MontageReviewTimeline';
import { MonitorFilterBar } from '@/features/monitors/MonitorFilterBar';
import {
  useReviewRangePresets,
  REVIEW_SPEEDS,
  reviewGridColumns,
  useMontageReviewPage,
  type ReviewRangePreset,
} from '@/features/montagereview/useMontageReviewPage';
import { useDocumentTitle } from '../layouts/useDocumentTitle';

/** Montage Review — Mission Control: range presets, monitor chips, grid, timeline. */
export default function MontageReviewPage() {
  const { t, i18n } = useTranslation();
  const page = useMontageReviewPage();
  const rangePresets = useReviewRangePresets();
  useDocumentTitle(t('Montage Review'));
  const {
    preset, setPreset, isLive, clock, allMonitors, setFilteredMonitors,
    enabled, selectedIds, selectedMonitors, toggleMonitor,
  } = page;

  // Range preset labels live in the feature module as plain English; map the
  // ids to literal keys here so extraction sees them.
  const presetLabel = (value: ReviewRangePreset): string => {
    switch (value) {
      case '1h': return t('1 hour');
      case '8h': return t('8 hours');
      case '24h': return t('24 hours');
      case 'all': return t('All events');
      case 'live': return t('Live');
      case 'custom': return t('Custom');
    }
  };

  const fmt = (d: Date) => d.toLocaleString(i18n.language, { dateStyle: 'short', timeStyle: 'short' });

  if (!page.isAuthenticated) return null;

  const toolBtn = (active: boolean, tone: 'cyan' | 'crimson' = 'cyan') =>
    clsx(
      'flex items-center gap-1.5 px-3 py-1.5 rounded-md border-2 text-xs font-medium uppercase tracking-wider transition-all',
      active
        ? tone === 'crimson'
          ? 'border-crimson/60 bg-crimson/15 text-crimson'
          : 'border-cyan/60 bg-cyan/15 text-cyan'
        : 'border-border bg-surface/50 text-text-muted hover:border-cyan/40 hover:text-cyan',
    );

  return (
    <AppShell title={t('Montage Review')}>
      <main className="flex-1 p-4 sm:p-6 overflow-auto flex flex-col gap-6 min-h-0">
        {/* Shared multi-select filter bar (Group / Capturing / etc.) */}
        <div className="flex-shrink-0">
          <MonitorFilterBar monitors={allMonitors} onChange={setFilteredMonitors} />
        </div>

        {/* Toolbar */}
        <div className="space-y-3 flex-shrink-0">
          {/* Range presets + pan/zoom */}
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('Range')}>
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted me-1">
              {t('Range')}
            </span>
            {rangePresets.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setPreset(r.value)}
                aria-pressed={preset === r.value}
                className={toolBtn(preset === r.value, r.value === 'live' ? 'crimson' : 'cyan')}
              >
                {r.icon === 'live' ? <Radio size={12} aria-hidden /> : <Calendar size={12} aria-hidden />}
                {presetLabel(r.value)}
              </button>
            ))}
            {!isLive && (
              <>
                <div className="w-px h-6 bg-border mx-1" aria-hidden />
                <button type="button" onClick={() => page.pan(-0.5)} aria-label={t('Pan earlier')} title={t('Pan earlier')} className={toolBtn(false)}>
                  <ChevronLeft size={12} className="rtl:-scale-x-100" aria-hidden />
                </button>
                <button type="button" onClick={() => page.zoom(0.5)} aria-label={t('Zoom in')} title={t('Zoom in')} className={toolBtn(false)}>
                  <ZoomIn size={12} aria-hidden />
                </button>
                <button type="button" onClick={() => page.zoom(2)} aria-label={t('Zoom out')} title={t('Zoom out')} className={toolBtn(false)}>
                  <ZoomOut size={12} aria-hidden />
                </button>
                <button type="button" onClick={() => page.pan(0.5)} aria-label={t('Pan later')} title={t('Pan later')} className={toolBtn(false)}>
                  <ChevronRight size={12} className="rtl:-scale-x-100" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={page.fit}
                  disabled={page.isFitting || page.selectedMonitors.length === 0}
                  aria-label={t('Fit the window to the recorded events')}
                  title={t('Fit the window to the recorded events')}
                  className={toolBtn(false)}
                >
                  <Maximize2 size={12} aria-hidden />
                </button>
                <span className={clsx('text-[11px] font-mono tabular-nums', preset === 'custom' ? 'text-cyan' : 'text-text-muted')}>
                  {fmt(clock.rangeStart)} – {fmt(clock.rangeEnd)}
                </span>
                {page.fitEmpty && (
                  <span role="status" className="text-[11px] text-warn">
                    {t('No events to fit')}
                  </span>
                )}
              </>
            )}
          </div>

          {/* Monitor selector + transport */}
          <div className="flex flex-wrap items-center gap-2">
            <span id="review-monitors-label" className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted me-1">
              {t('Monitors')}
            </span>
            <div role="group" aria-labelledby="review-monitors-label" className="flex flex-wrap items-center gap-2">
              {enabled.map((m) => {
                const active = selectedIds.has(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleMonitor(m.id)}
                    aria-pressed={active}
                    className={clsx(
                      'px-2.5 py-1.5 rounded-md border-2 text-xs transition-all',
                      active
                        ? 'border-cyan/50 bg-cyan/10 text-cyan'
                        : 'border-border bg-surface/30 text-text-muted hover:border-text-secondary/50 hover:text-text-secondary',
                    )}
                  >
                    {m.name}
                  </button>
                );
              })}
            </div>

            {!isLive && (
              <>
                <div className="w-px h-6 bg-border mx-2" aria-hidden />
                <button
                  type="button"
                  onClick={clock.togglePlay}
                  aria-pressed={clock.isPlaying}
                  className={toolBtn(clock.isPlaying)}
                >
                  {clock.isPlaying ? <Pause size={12} aria-hidden /> : <Play size={12} aria-hidden />}
                  {clock.isPlaying ? t('Pause') : t('Play')}
                </button>
                <div role="group" aria-label={t('Speed')} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-surface/30 border-2 border-border">
                  <FastForward size={12} className="text-text-muted" aria-hidden />
                  {REVIEW_SPEEDS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => clock.setSpeed(s)}
                      aria-pressed={clock.speed === s}
                      aria-label={t('{{speed}}× speed', { speed: s })}
                      className={clsx(
                        'px-1.5 py-0.5 text-[10px] font-mono rounded transition-colors',
                        clock.speed === s
                          ? 'bg-cyan/20 text-cyan'
                          : 'text-text-muted hover:text-text-primary',
                      )}
                    >
                      {s}×
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <QueryState
          isLoading={page.isLoading}
          isError={page.isError}
          error={page.error}
          onRetry={page.refetch}
          empty={selectedMonitors.length === 0}
          emptyMessage={t('Select one or more monitors to review.')}
          className="flex-1"
        >
          <RequirePerm feature={isLive ? 'stream' : 'events'} level="View" fallback="message">
            <div
              dir="ltr"
              className="grid gap-3 flex-shrink-0"
              style={{
                gridTemplateColumns: `repeat(${reviewGridColumns(selectedMonitors.length)}, minmax(0, 1fr))`,
              }}
            >
              {selectedMonitors.map((m) =>
                isLive ? (
                  <div key={m.id} className="relative aspect-video">
                    <StreamCell
                      protocol="hls"
                      monitorId={m.id}
                      monitorName={m.name}
                      orientation={m.orientation}
                      autoStart
                      compact
                    />
                  </div>
                ) : (
                  <MontageReviewCell
                    key={m.id}
                    monitor={m}
                    currentTime={clock.currentTime}
                    rangeStart={clock.rangeStart}
                    rangeEnd={clock.rangeEnd}
                    isPlaying={clock.isPlaying}
                    speed={clock.speed}
                  />
                ),
              )}
            </div>
          </RequirePerm>

          {/* Timeline */}
          {!isLive && selectedMonitors.length > 0 && (
            <div className="flex-shrink-0 mt-6" dir="ltr">
              <MontageReviewTimeline
                monitors={selectedMonitors}
                rangeStart={clock.rangeStart}
                rangeEnd={clock.rangeEnd}
                currentTime={clock.currentTime}
                onSeek={clock.setCurrentTime}
              />
            </div>
          )}
        </QueryState>
      </main>
    </AppShell>
  );
}
