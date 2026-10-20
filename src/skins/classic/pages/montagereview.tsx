import { useCallback, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { isDeleted } from '@/types';
import { ChevronDown, ChevronUp, Clock, Filter, FilterX, History } from 'lucide-react';
import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import { StreamCell } from '@/components/common/StreamCell';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { MontageReviewCell } from '@/features/montagereview/MontageReviewCell';
import { MontageReviewTimeline } from '@/features/montagereview/MontageReviewTimeline';
import { ReviewDownloadVideo } from '@/features/montagereview/ReviewDownloadVideo';
import { averageArea, reviewCanvasWidth } from '@/features/montagereview/reviewScale';
import {
  REVIEW_SPEEDS, reviewSpeedIndex, toLocalInputValue, useMontageReviewPage, useReviewNotesOptions,
} from '@/features/montagereview/useMontageReviewPage';
import { REVIEW_ANY_TAG, REVIEW_NO_TAG } from '@/features/montagereview/useReviewEvents';
import { displayDimensions } from '@/features/monitors/orientation';
import { maxFit } from '@/features/montage/maxfit';
import { useAvailableHeight, useMeasuredBox } from '@/features/monitors/useStageFit';
import { useMonitorFilterRow } from '@/features/monitors/useMonitorFilterRow';
import { useMonitorStatuses } from '@/features/monitors/useMonitorStatuses';
import { useDocumentTitle } from '@/skins/modern/layouts/useDocumentTitle';
import { useMontageStore } from '@/stores/montage';
import { ClassicButton, ClassicChosen, ClassicFilterRow, ClassicPage, classicInputClass } from '@/skins/classic/components';
import type { Monitor } from '@/types';

const selectClass = 'rounded-sm border border-zinc-400 bg-white px-1.5 py-0.5 text-sm text-zinc-900';

/**
 * One legacy filter term: the attribute label over its operator, then the
 * value (`Filter::simple_widget`).
 */
function Term({ label, op, children }: { label: string; op: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="flex flex-col items-center leading-tight">
        <span className="font-semibold">{label}</span>
        <span>{op}</span>
      </span>
      {children}
    </div>
  );
}

/**
 * Legacy's multi-select term value: a Chosen multi-select with ZM's clear
 * button over its corner. An empty selection means "all".
 */
function MultiSelect({
  label, placeholder, value, options, onChange,
}: {
  label: string;
  /** Legacy's `data-placeholder` from Filter.php's widget. */
  placeholder: string;
  value: string[];
  options: Array<{ value: string; label: string }>;
  onChange: (next: string[]) => void;
}) {
  return (
    <ClassicChosen label={label} value={value} options={options} onChange={onChange} placeholder={placeholder} className="w-44" />
  );
}

/**
 * Legacy `maxfit2` over the monitors on screen: one absolute-position style
 * per monitor, or null when the wall is unmeasured or nothing fits.
 */
function fitPlacements(monitors: Monitor[], width: number, height: number): Map<number, CSSProperties> | null {
  // 1px border each side, as the cell renders.
  const placed = maxFit(monitors.map((m) => displayDimensions(m)), width, height, { width: 2, height: 2 });
  if (!placed) return null;
  const byId = new Map<number, CSSProperties>();
  monitors.forEach((m, i) => {
    const p = placed[i];
    byId.set(m.id, { position: 'absolute', insetInlineStart: p.left, top: p.top, width: p.width, height: p.height });
  });
  return byId;
}

/**
 * Montage Review — classic skin: legacy `?view=montagereview`. Filter row,
 * the Date Time >= / <= inputs, Scale and Speed sliders, the button row
 * (`< Pan`, `In +`, `Out -`, `24 Hour`, `8 Hour`, `1 Hour`, `All Events`,
 * `Live`, `Fit`, `Pan >`), the timeline, then the monitor canvases.
 */
export default function ClassicMontageReviewPage() {
  const { t } = useTranslation();
  // Legacy's page loads into motion at the cookie speed; the Speed slider at
  // 0 is the only pause.
  const page = useMontageReviewPage({ autoplay: true });
  const notesOptions = useReviewNotesOptions();
  const { byId: runtimeById } = useMonitorStatuses(page.isAuthenticated);
  const filter = useMonitorFilterRow(page.allMonitors, runtimeById);
  useDocumentTitle(t('Montage Review'));
  const { clock, isLive, preset } = page;
  // Legacy's three flips (skin.js): the whole panel and the timeline keep
  // their state in cookies; Monitor Filters always opens collapsed
  // (`data-initial-state-icon="hidden"`).
  const panelOpen = useMontageStore((st) => st.reviewPanelOpen);
  const setPanelOpen = useMontageStore((st) => st.setReviewPanelOpen);
  const timelineOpen = useMontageStore((st) => st.reviewTimelineOpen);
  const setTimelineOpen = useMontageStore((st) => st.setReviewTimelineOpen);
  const [monitorFiltersOpen, setMonitorFiltersOpen] = useState(false);
  // Legacy prints the playback multiplier, two decimal places, then " x".
  const speedLabel = t('{{speed}} x', { speed: clock.speed.toFixed(2) });

  // Filter row survivors ∩ chip selection (the chip row is the modern
  // page's; here the Monitor select in the filter row plays that role).
  const filteredIds = new Set(filter.filtered.map((m) => m.id));
  const monitors = [
    ...page.enabled.filter((m) => filteredIds.has(m.id) && page.selectedIds.has(m.id)),
    // Deleted monitors reach the wall only through the filter row's Deleted pick.
    ...filter.filtered.filter((m) => isDeleted(m) && page.selectedIds.has(m.id)),
  ];
  // Legacy normalises every canvas against the mean area of the monitors on
  // screen before applying Scale (montagereview.js.php:140-162).
  const avgArea = averageArea(monitors.map((m) => displayDimensions(m)));

  // Legacy Fit (`montagereview.js` `redrawScreen`): the wall gets the height
  // left under it in the viewport, and `maxfit2` packs the cells into it.
  // One node carries both measurements — its width for the packing, its top
  // for the height below.
  const [widthRef, wallBox] = useMeasuredBox<HTMLDivElement>();
  const [heightRef, wallHeight] = useAvailableHeight<HTMLDivElement>();
  const wallRef = useCallback((el: HTMLDivElement | null) => {
    widthRef(el);
    heightRef(el);
  }, [widthRef, heightRef]);

  // Legacy backs out of fit mode when nothing fits; here the scaled sizing
  // simply stays in place (and comes back once the wall has been measured).
  const fitStyles = page.fit ? fitPlacements(monitors, wallBox.width, wallHeight) : null;

  if (!page.isAuthenticated) return null;

  const presetBtn = (value: typeof preset, label: string) => (
    <ClassicButton
      tone={preset === value ? 'primary' : 'default'}
      aria-pressed={preset === value}
      onClick={() => page.setPreset(value)}
    >
      {label}
    </ClassicButton>
  );

  return (
    <AppShell title={t('Montage Review')}>
      <div className="bg-[#485a6b] px-3 py-2 flex flex-col gap-2 text-white">
        {/* Legacy `#mfbflip`: folds away everything above the wall. */}
        <button
          type="button"
          onClick={() => setPanelOpen(!panelOpen)}
          aria-expanded={panelOpen}
          aria-controls="review-panel"
          aria-label={t('Toggle filters and controls')}
          title={t('Toggle filters and controls')}
          className="self-start text-white/90 hover:text-white"
        >
          {panelOpen ? <FilterX size={18} aria-hidden /> : <Filter size={18} aria-hidden />}
        </button>
        {panelOpen && (
          <div id="review-panel" className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setMonitorFiltersOpen((o) => !o)}
            aria-expanded={monitorFiltersOpen}
            className="self-start flex items-center gap-1 text-sm text-white/90 hover:text-white"
          >
            {monitorFiltersOpen ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
            {t('Monitor Filters')}
          </button>
          {monitorFiltersOpen && (
            <ClassicFilterRow state={filter} tone="dark" />
          )}
          {/* Legacy's event terms, in its order: the Monitor select spliced in
              first, then Archive Status, Date Time >= and <=, Tags, Notes
              (`montagereview.php:318-327`, `simple_widget`). */}
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
            <Term label={t('Monitor')} op="">
              <MultiSelect
                label={t('Monitor')}
                placeholder={t('All Monitors')}
                value={filter.valuesMulti.monitorId}
                options={page.allMonitors.map((m) => ({ value: String(m.id), label: `${m.id} ${m.name}` }))}
                onChange={(next) => filter.setMulti('monitorId', next)}
              />
            </Term>
            <Term label={t('Archive Status')} op="=">
              <select
                aria-label={t('Archive Status')}
                value={page.filters.archived}
                onChange={(e) => page.setFilters({ archived: e.target.value as 'all' | 'unarchived' | 'archived' })}
                className={selectClass}
              >
                <option value="all">{t('All')}</option>
                <option value="unarchived">{t('Unarchived Only')}</option>
                <option value="archived">{t('Archived Only')}</option>
              </select>
            </Term>
            <Term label={t('Date Time')} op=">=">
              <input
                type="datetime-local"
                step={1}
                aria-label={t('Date Time >=')}
                value={toLocalInputValue(clock.rangeStart)}
                onChange={(e) => page.setRangeBound('start', new Date(e.target.value))}
                className={classicInputClass}
              />
            </Term>
            <Term label={t('Date Time')} op="<=">
              <input
                type="datetime-local"
                step={1}
                aria-label={t('Date Time <=')}
                value={toLocalInputValue(clock.rangeEnd)}
                onChange={(e) => page.setRangeBound('end', new Date(e.target.value))}
                className={classicInputClass}
              />
            </Term>
            <Term label={t('Tags')} op="=">
              <MultiSelect
                label={t('Tags')}
                placeholder={t('All Tags')}
                value={page.filters.tagIds.map(String)}
                options={[
                  { value: String(REVIEW_NO_TAG), label: t('No Tag') },
                  { value: String(REVIEW_ANY_TAG), label: t('Any Tag') },
                  ...page.tags.map((tag) => ({ value: String(tag.id), label: tag.name })),
                ]}
                onChange={(next) => page.setFilters({ tagIds: next.map(Number) })}
              />
            </Term>
            <Term label={t('Notes')} op="LIKE">
              <MultiSelect
                label={t('Notes')}
                placeholder={t('Event Type')}
                value={page.filters.notes}
                options={notesOptions}
                onChange={(next) => page.setFilters({ notes: next })}
              />
            </Term>
          </div>
          <div className="flex flex-wrap items-end justify-center gap-x-4 gap-y-2 text-sm">
            {!page.fit && (
              <label className="flex items-center gap-2">
                <span className="font-semibold">{t('Scale')}</span>
                <input
                  type="range" min={0.1} max={1} step={0.1}
                  value={page.scale}
                  onChange={(e) => page.setScale(Number(e.target.value))}
                  aria-label={t('Scale')}
                  aria-valuetext={t('{{scale}} x', { scale: page.scale.toFixed(2) })}
                />
                <span className="tabular-nums w-14">{t('{{scale}} x', { scale: page.scale.toFixed(2) })}</span>
              </label>
            )}
            {!isLive && (
            <label className="flex items-center gap-2">
              <span className="font-semibold">{t('Speed')}</span>
              {/* Legacy is a 13-step slider over REVIEW_SPEEDS, 0 = paused. */}
              <input
                type="range"
                min={0}
                max={REVIEW_SPEEDS.length - 1}
                step={1}
                value={reviewSpeedIndex(clock.speed)}
                onChange={(e) => clock.setSpeed(REVIEW_SPEEDS[Number(e.target.value)])}
                aria-label={t('Speed')}
                aria-valuetext={speedLabel}
              />
              {/* `montagereview.js:963` — a playback multiplier to two places
                  ("1.00 x"), not a frame rate. The `N fps` in the PHP is the
                  pre-JS server render, overwritten by `setSpeed` on load. */}
              <span className="tabular-nums w-16" data-testid="review-speed">
                {speedLabel}
              </span>
            </label>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-1.5" role="toolbar" aria-label={t('Review range')}>
            {/* Live view hides what only history uses (`redrawScreen`). */}
            {!isLive && (
              <>
                <ClassicButton onClick={() => page.pan(-0.5)}>&lt; {t('Pan')}</ClassicButton>
                <ClassicButton onClick={() => page.zoom(0.5)}>{t('In')} +</ClassicButton>
                <ClassicButton onClick={() => page.zoom(2)}>{t('Out')} -</ClassicButton>
              </>
            )}
            {presetBtn('24h', t('24 Hour'))}
            {presetBtn('8h', t('8 Hour'))}
            {presetBtn('1h', t('1 Hour'))}
            <ClassicButton
              onClick={page.fitToEvents}
              disabled={isLive || page.isFittingEvents || page.selectedMonitors.length === 0}
            >
              {t('All Events')}
            </ClassicButton>
            <ClassicButton onClick={page.toggleLive}>
              {isLive ? t('History') : t('Live')}
            </ClassicButton>
            <ClassicButton
              tone={page.fit ? 'primary' : 'default'}
              aria-pressed={page.fit}
              onClick={() => page.setFit(!page.fit)}
            >
              {page.fit ? t('Scale') : t('Fit')}
            </ClassicButton>
            {!isLive && <ClassicButton onClick={() => page.pan(0.5)}>{t('Pan')} &gt;</ClassicButton>}
            {/* Legacy shows Download Video in history with monitors on screen (montagereview.php:426). */}
            {!isLive && page.selectedMonitors.length > 0 && (
              <ReviewDownloadVideo
                monitors={page.selectedMonitors}
                rangeStart={clock.rangeStart}
                rangeEnd={clock.rangeEnd}
                filters={page.filters}
                variant="classic"
                trigger={(open) => <ClassicButton onClick={open}>{t('Download Video')}</ClassicButton>}
              />
            )}
            {/* Legacy `#collapse`: the timeline's own toggle, last in the row. */}
            <ClassicButton
              onClick={() => setTimelineOpen(!timelineOpen)}
              aria-expanded={timelineOpen}
              aria-label={t('Toggle timeline visibility')}
              title={t('Toggle timeline visibility')}
            >
              {timelineOpen ? <History size={14} aria-hidden /> : <Clock size={14} aria-hidden />}
            </ClassicButton>
            {page.fitEventsEmpty && (
              <span role="status" className="text-xs text-red-700">{t('No events to fit')}</span>
            )}
          </div>
          </div>
        )}
      </div>

      <ClassicPage>
        <QueryState
          isLoading={page.isLoading}
          isError={page.isError}
          error={page.error}
          onRetry={page.refetch}
          empty={monitors.length === 0}
          emptyMessage={t('Select one or more monitors to review.')}
        >
          {!isLive && panelOpen && timelineOpen && (
            <div dir="ltr" className="mb-3">
              <MontageReviewTimeline
                collapsible={false}
                monitors={monitors}
                rangeStart={clock.rangeStart}
                rangeEnd={clock.rangeEnd}
                currentTime={clock.currentTime}
                onSeek={clock.setCurrentTime}
                filters={page.filters}
              />
            </div>
          )}
          {/* Measures the wall: its width packs the cells, its top says how
              much viewport height is left for them. */}
          <div ref={wallRef} className="w-full" aria-hidden />
          <RequirePerm feature={isLive ? 'stream' : 'events'} level="View" fallback="message">
            <div
              dir="ltr"
              className={fitStyles ? 'relative' : 'flex flex-wrap gap-1 justify-center'}
              style={fitStyles ? { height: wallHeight } : undefined}
              data-fit={fitStyles ? 'true' : undefined}
              data-testid="review-classic-grid"
            >
              {monitors.map((m) => {
                const dims = displayDimensions(m);
                const width = reviewCanvasWidth(dims, avgArea, page.scale, page.monitorZoom[m.id] ?? 1);
                const fitted = fitStyles?.get(m.id);
                return (
                  <div
                    key={m.id}
                    className="relative bg-black border"
                    style={{
                      ...(fitted ?? { width, maxWidth: '100%', aspectRatio: `${dims.width} / ${dims.height}` }),
                      borderColor: m.web_colour || '#ffffff',
                    }}
                    title={`${m.id} ${m.name}`}
                  >
                    {isLive ? (
                      <StreamCell protocol="hls" monitorId={m.id} monitorName={m.name} orientation={m.orientation} autoStart compact />
                    ) : (
                      <MontageReviewCell
                        monitor={m}
                        currentTime={clock.currentTime}
                        rangeStart={clock.rangeStart}
                        rangeEnd={clock.rangeEnd}
                        isPlaying={clock.isPlaying}
                        speed={clock.speed}
                        filters={page.filters}
                        fill={!!fitted}
                        onZoom={(factor) => page.zoomMonitor(m.id, factor)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </RequirePerm>
        </QueryState>
      </ClassicPage>
    </AppShell>
  );
}
