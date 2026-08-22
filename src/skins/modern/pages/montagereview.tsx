import { useEffect } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import {
  Pause, Play, Radio, Calendar, FastForward, Filter,
  ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Maximize2,
} from 'lucide-react';
import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import { StreamCell } from '@/components/common/StreamCell';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { MontageReviewCell } from '@/features/montagereview/MontageReviewCell';
import { MontageReviewTimeline } from '@/features/montagereview/MontageReviewTimeline';
import { MonitorFilterBar } from '@/features/monitors/MonitorFilterBar';
import { useMonitorFilter } from '@/features/monitors/useMonitorFilter';
import {
  useReviewRangePresets,
  REVIEW_SPEEDS,
  reviewGridColumns,
  useMontageReviewPage,
  type ReviewRangePreset,
} from '@/features/montagereview/useMontageReviewPage';
import { ToolbarDisclosure } from '../components/ToolbarDisclosure';
import { useDocumentTitle } from '../layouts/useDocumentTitle';

const toolBtn = 'p-1.5 rounded text-fg-dim hover:text-fg hover:bg-surface-2 transition-colors disabled:opacity-50';

// The bar reports through the shared filter store, which the page reads for
// itself (useMonitorFilter below), so its callback has nothing left to do.
const noop = () => {};

/**
 * Montage Review — the modern frame.
 *
 * The players and the timeline are the page. The window controls, the
 * transport and the speed dial share one line above them, the monitor
 * selection is a strip of chips under it, and the shared filter bar — the
 * one control an operator sets once — sits behind a disclosure that counts
 * what it is hiding (docs/DESIGN.md).
 */
export default function MontageReviewPage() {
  const { t, i18n } = useTranslation();
  const page = useMontageReviewPage();
  const rangePresets = useReviewRangePresets();
  useDocumentTitle(t('Montage Review'));
  const {
    preset, setPreset, isLive, clock, allMonitors, setFilteredMonitors,
    enabled, selectedIds, selectedMonitors, toggleMonitor,
  } = page;

  // The filter bar lives behind a disclosure, so the page applies the shared
  // selections itself rather than waiting for the bar to be on screen.
  const { filtered, activeCount } = useMonitorFilter(allMonitors);
  useEffect(() => {
    setFilteredMonitors(filtered);
  }, [filtered, setFilteredMonitors]);

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

  const chip = (active: boolean) =>
    clsx(
      'shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors',
      active ? 'bg-accent/15 text-accent' : 'text-fg-dim hover:text-fg hover:bg-surface-2',
    );

  return (
    <AppShell title={t('Montage Review')}>
      <main className="flex-1 min-h-0 min-w-0 flex flex-col">
        {/* Window + transport, in one line. */}
        <div className="flex items-center gap-2 px-3 h-11 shrink-0 border-b border-border-subtle bg-surface">
          <div className="flex items-center gap-0.5 shrink-0" role="group" aria-label={t('Range')}>
            {rangePresets.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setPreset(r.value)}
                aria-pressed={preset === r.value}
                className={chip(preset === r.value)}
              >
                {r.icon === 'live' ? <Radio size={12} aria-hidden /> : <Calendar size={12} aria-hidden />}
                {presetLabel(r.value)}
              </button>
            ))}
          </div>

          {!isLive && (
            <>
              <div className="w-px h-5 bg-border-subtle shrink-0" aria-hidden />
              <button type="button" onClick={() => page.pan(-0.5)} aria-label={t('Pan earlier')} title={t('Pan earlier')} className={toolBtn}>
                <ChevronLeft size={14} className="rtl:-scale-x-100" aria-hidden />
              </button>
              <button type="button" onClick={() => page.zoom(0.5)} aria-label={t('Zoom in')} title={t('Zoom in')} className={toolBtn}>
                <ZoomIn size={14} aria-hidden />
              </button>
              <button type="button" onClick={() => page.zoom(2)} aria-label={t('Zoom out')} title={t('Zoom out')} className={toolBtn}>
                <ZoomOut size={14} aria-hidden />
              </button>
              <button type="button" onClick={() => page.pan(0.5)} aria-label={t('Pan later')} title={t('Pan later')} className={toolBtn}>
                <ChevronRight size={14} className="rtl:-scale-x-100" aria-hidden />
              </button>
              <button
                type="button"
                onClick={page.fit}
                disabled={page.isFitting || page.selectedMonitors.length === 0}
                aria-label={t('Fit the window to the recorded events')}
                title={t('Fit the window to the recorded events')}
                className={toolBtn}
              >
                <Maximize2 size={14} aria-hidden />
              </button>
              <span className={clsx('text-xs font-mono tabular-nums whitespace-nowrap', preset === 'custom' ? 'text-fg' : 'text-fg-dim')}>
                {fmt(clock.rangeStart)} – {fmt(clock.rangeEnd)}
              </span>
              {page.fitEmpty && (
                <span role="status" className="text-xs text-warn">
                  {t('No events to fit')}
                </span>
              )}
            </>
          )}

          <div className="ms-auto flex items-center gap-2 shrink-0">
            {!isLive && (
              <>
                <button
                  type="button"
                  onClick={clock.togglePlay}
                  aria-pressed={clock.isPlaying}
                  className={chip(clock.isPlaying)}
                >
                  {clock.isPlaying ? <Pause size={12} aria-hidden /> : <Play size={12} aria-hidden />}
                  {clock.isPlaying ? t('Pause') : t('Play')}
                </button>
                <div
                  role="group"
                  aria-label={t('Speed')}
                  className="flex items-center gap-0.5 rounded border border-border-subtle p-0.5"
                >
                  <FastForward size={12} className="ms-1 text-fg-faint" aria-hidden />
                  {REVIEW_SPEEDS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => clock.setSpeed(s)}
                      aria-pressed={clock.speed === s}
                      aria-label={t('{{speed}}× speed', { speed: s })}
                      className={clsx(
                        'px-1.5 py-0.5 text-xs font-mono tabular-nums rounded transition-colors',
                        clock.speed === s ? 'bg-accent/15 text-accent' : 'text-fg-dim hover:text-fg',
                      )}
                    >
                      {s}×
                    </button>
                  ))}
                </div>
              </>
            )}

            <ToolbarDisclosure label={t('Filters')} icon={Filter} count={activeCount} align="end">
              <MonitorFilterBar monitors={allMonitors} onChange={noop} />
            </ToolbarDisclosure>
          </div>
        </div>

        {/* Which cameras are under review — a selection strip, not a toolbar. */}
        <div
          role="group"
          aria-label={t('Monitors')}
          className="flex items-center gap-1 px-3 h-9 shrink-0 border-b border-border-subtle bg-surface overflow-x-auto"
        >
          {enabled.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => toggleMonitor(m.id)}
              aria-pressed={selectedIds.has(m.id)}
              className={chip(selectedIds.has(m.id))}
            >
              {m.name}
            </button>
          ))}
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
          <div className="flex-1 min-h-0 flex flex-col">
            <RequirePerm feature={isLive ? 'stream' : 'events'} level="View" fallback="message">
              <div
                dir="ltr"
                className="flex-1 min-h-0 overflow-auto p-2 grid gap-2 content-start"
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
              <div className="shrink-0 max-h-[40%] overflow-auto border-t border-border-subtle p-2" dir="ltr">
                <MontageReviewTimeline
                  monitors={selectedMonitors}
                  rangeStart={clock.rangeStart}
                  rangeEnd={clock.rangeEnd}
                  currentTime={clock.currentTime}
                  onSeek={clock.setCurrentTime}
                />
              </div>
            )}
          </div>
        </QueryState>
      </main>
    </AppShell>
  );
}
