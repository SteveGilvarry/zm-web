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
import { Chip, MonitorFilterBar } from '@/features/monitors/MonitorFilterBar';
import { REVIEW_ANY_TAG, REVIEW_NO_TAG } from '@/features/montagereview/useReviewEvents';
import { useMonitorFilter } from '@/features/monitors/useMonitorFilter';
import {
  useReviewRangePresets,
  REVIEW_SPEEDS,
  reviewGridColumns,
  useMontageReviewPage,
  useReviewNotesOptions,
  toLocalInputValue,
  type ReviewRangePreset,
} from '@/features/montagereview/useMontageReviewPage';
import { ToolbarDisclosure } from '../components/ToolbarDisclosure';
import { useDocumentTitle } from '../layouts/useDocumentTitle';

const toolBtn = 'p-1.5 rounded text-fg-dim hover:text-fg hover:bg-surface-2 transition-colors disabled:opacity-50';
const selectField = clsx(
  'bg-surface border border-border-subtle rounded px-2 py-1 text-sm cursor-pointer',
  'text-fg focus:outline-none focus:border-accent transition-colors',
);

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
  const notesOptions = useReviewNotesOptions();
  useDocumentTitle(t('Montage Review'));
  const {
    preset, setPreset, isLive, clock, allMonitors, setFilteredMonitors,
    enabled, selectedIds, selectedMonitors, toggleMonitor,
  } = page;

  // The filter bar lives behind a disclosure, so the page applies the shared
  // selections itself rather than waiting for the bar to be on screen.
  const { filtered, activeCount } = useMonitorFilter(allMonitors);
  // Archived / Tags / Notes count towards the Filters badge alongside the
  // monitor filter bar's own selections.
  const eventFilterCount = [
    page.filters.archived !== 'all',
    page.filters.tagIds.length > 0,
    page.filters.notes.length > 0,
  ].filter(Boolean).length;
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
                onClick={page.fitToEvents}
                disabled={page.isFittingEvents || page.selectedMonitors.length === 0}
                aria-label={t('Fit the window to the recorded events')}
                title={t('Fit the window to the recorded events')}
                className={toolBtn}
              >
                <Maximize2 size={14} aria-hidden />
              </button>
              {/* The window itself opens the From / To inputs (legacy's
                  Date Time >= / <=, capped at 24 h when edited). */}
              <ToolbarDisclosure label={`${fmt(clock.rangeStart)} – ${fmt(clock.rangeEnd)}`} icon={Calendar}>
                <div className="flex flex-col gap-2">
                  <label className="flex flex-col gap-1 text-xs text-fg-dim">
                    {t('From')}
                    <input
                      type="datetime-local"
                      step={1}
                      value={toLocalInputValue(clock.rangeStart)}
                      onChange={(e) => page.setRangeBound('start', new Date(e.target.value))}
                      className={selectField}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-fg-dim">
                    {t('To')}
                    <input
                      type="datetime-local"
                      step={1}
                      value={toLocalInputValue(clock.rangeEnd)}
                      onChange={(e) => page.setRangeBound('end', new Date(e.target.value))}
                      className={selectField}
                    />
                  </label>
                  <p className="text-xs text-fg-faint">{t('Editing one end keeps the window within 24 hours.')}</p>
                </div>
              </ToolbarDisclosure>
              {page.fitEventsEmpty && (
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
                {/* 13 steps is too many chips: one dial, same values as the
                    classic slider (0 = paused, scrub only). */}
                <label className="flex items-center gap-1 text-xs text-fg-dim">
                  <FastForward size={12} className="text-fg-faint" aria-hidden />
                  <span className="sr-only">{t('Speed')}</span>
                  <select
                    aria-label={t('Speed')}
                    value={clock.speed}
                    onChange={(e) => clock.setSpeed(Number(e.target.value))}
                    className={selectField}
                  >
                    {REVIEW_SPEEDS.map((s) => (
                      <option key={s} value={s}>{s === 0 ? t('Paused') : t('{{speed}}×', { speed: s })}</option>
                    ))}
                  </select>
                </label>
              </>
            )}

            <ToolbarDisclosure
              label={t('Filters')}
              icon={Filter}
              count={activeCount + eventFilterCount}
              align="end"
            >
              <div className="space-y-3">
                <MonitorFilterBar monitors={allMonitors} onChange={noop} />
                <div className="space-y-2 pt-3 border-t border-border-subtle">
                  <label className="flex flex-col gap-1 text-xs text-fg-dim">
                    {t('Archive Status')}
                    <select
                      aria-label={t('Archive Status')}
                      value={page.filters.archived}
                      onChange={(e) => page.setFilters({ archived: e.target.value as 'all' | 'unarchived' | 'archived' })}
                      className={selectField}
                    >
                      <option value="all">{t('All')}</option>
                      <option value="unarchived">{t('Unarchived Only')}</option>
                      <option value="archived">{t('Archived Only')}</option>
                    </select>
                  </label>
                  {/* Legacy's Tags and Notes are multi-selects; an empty
                      selection is every event. */}
                  <div className="flex flex-col gap-1 text-xs text-fg-dim">
                    {t('Tags')}
                    <Chip
                      label={t('Tags')}
                      emptyLabel={t('All Tags')}
                      options={[
                        { value: String(REVIEW_NO_TAG), label: t('No Tag') },
                        { value: String(REVIEW_ANY_TAG), label: t('Any Tag') },
                        ...page.tags.map((tag) => ({ value: String(tag.id), label: tag.name })),
                      ]}
                      selected={page.filters.tagIds.map(String)}
                      onChange={(next) => page.setFilters({ tagIds: next.map(Number) })}
                    />
                  </div>
                  <div className="flex flex-col gap-1 text-xs text-fg-dim">
                    {t('Notes')}
                    <Chip
                      label={t('Notes')}
                      emptyLabel={t('Any')}
                      options={notesOptions}
                      selected={page.filters.notes}
                      onChange={(next) => page.setFilters({ notes: next })}
                    />
                  </div>
                </div>
              </div>
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
                      filters={page.filters}
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
                  filters={page.filters}
                />
              </div>
            )}
          </div>
        </QueryState>
      </main>
    </AppShell>
  );
}
