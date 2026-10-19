import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight, List, RefreshCw, ZoomOut } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import { useTimelinePage } from '@/features/timeline/useTimelinePage';
import { GRAPH_WIDTH, formatDbTime, parseWhen, type TimelineChart } from '@/features/timeline/timelineChart';
import { useDocumentTitle } from '../layouts/useDocumentTitle';

const field = clsx(
  'px-2 py-1 text-sm bg-surface border border-border-subtle rounded',
  'text-fg focus:outline-none focus:border-accent transition-colors',
);
const toolBtn = 'p-1.5 rounded text-fg-dim hover:text-fg hover:bg-surface-2 transition-colors disabled:opacity-50';

/** Px per monitor row and for the score strip; the SVGs stretch across. */
const ROW_HEIGHT = 18;
const STRIP_HEIGHT = 56;

/**
 * Timeline — the modern skin.
 *
 * The same chart legacy `?view=timeline` draws (one bar per monitor in its
 * own colour, the alarm-score strip above, a zoom band between each pair of
 * ticks), in plain SVG. The window is the control an operator moves, so
 * pan / zoom out and its two edges are the query line; the readout of what
 * the pointer last touched is a table under the chart, one row per monitor.
 */
export default function TimelinePage() {
  const { t } = useTranslation();
  useDocumentTitle(t('Timeline'));
  const s = useTimelinePage();

  if (!s.isAuthenticated) return null;
  const chart = s.chart;

  return (
    <AppShell title={t('Timeline')}>
      <main className="flex-1 min-h-0 flex flex-col">
        <div className="flex items-center gap-2 px-3 h-11 shrink-0 border-b border-border-subtle bg-surface">
          <button type="button" onClick={s.panLeft} aria-label={t('Pan Left')} title={t('Pan Left')} className={toolBtn} disabled={!chart}>
            <ChevronLeft size={16} className="rtl:-scale-x-100" />
          </button>
          <button type="button" onClick={s.zoomOut} aria-label={t('Zoom Out')} title={t('Zoom Out')} className={toolBtn} disabled={!chart}>
            <ZoomOut size={16} />
          </button>
          <button type="button" onClick={s.panRight} aria-label={t('Pan Right')} title={t('Pan Right')} className={toolBtn} disabled={!chart}>
            <ChevronRight size={16} className="rtl:-scale-x-100" />
          </button>
          <input
            type="datetime-local"
            step={1}
            aria-label={t('Window start')}
            value={s.minInput}
            onChange={(e) => s.setWindow(e.target.value, s.maxInput)}
            className={field}
          />
          <span className="shrink-0 text-xs text-fg-dim">{t('to')}</span>
          <input
            type="datetime-local"
            step={1}
            aria-label={t('Window end')}
            value={s.maxInput}
            onChange={(e) => s.setWindow(s.minInput, e.target.value)}
            className={field}
          />
          {chart && (
            <span className="hidden md:inline text-xs text-fg-muted font-mono tabular-nums" data-testid="timeline-range">
              {chart.title}
            </span>
          )}
          <span className="ms-auto" />
          <Link
            to="/events"
            search={s.eventsSearch as never}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-sm text-fg-muted hover:text-fg hover:bg-surface-2"
          >
            <List size={16} aria-hidden />
            {t('Events')}
          </Link>
          <button type="button" onClick={s.refresh} aria-label={t('Refresh')} className={toolBtn}>
            <RefreshCw size={16} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-3 space-y-3">
          <QueryState
            isLoading={s.isLoading}
            isError={!!s.error}
            error={s.error}
            onRetry={s.refresh}
            empty={!!chart && chart.rows.length === 0}
            emptyMessage={t('No events in this range.')}
          >
            {chart && <Chart chart={chart} s={s} />}
            {s.truncated && (
              <p className="text-xs text-warn">
                {t('More events fall in this range than the timeline draws; zoom in to see them all.')}
              </p>
            )}
            <Readout s={s} />
          </QueryState>
        </div>
      </main>
    </AppShell>
  );
}

type PageState = ReturnType<typeof useTimelinePage>;

function Chart({ chart, s }: { chart: TimelineChart; s: PageState }) {
  const { t } = useTranslation();
  const peak = Math.max(1, ...chart.activity.map((a) => a.value));
  const colourOf = new Map(chart.rows.map((r) => [r.monitorId, r.colour]));

  return (
    <div dir="ltr" className="rounded border border-border-subtle bg-surface" data-testid="timeline-chart">
      <div className="grid grid-cols-[8rem_1fr]">
        <div className="px-3 flex items-end pb-1 text-xs text-fg-dim border-e border-border-subtle" style={{ height: STRIP_HEIGHT }}>
          {t('Score')}
        </div>
        <svg
          viewBox={`0 0 ${GRAPH_WIDTH} ${STRIP_HEIGHT}`}
          preserveAspectRatio="none"
          className="w-full block"
          style={{ height: STRIP_HEIGHT }}
          role="img"
          aria-label={t('Alarm score')}
        >
          {chart.xTicks.map((x) => (
            <line key={x.x} x1={(x.x / 100) * GRAPH_WIDTH} x2={(x.x / 100) * GRAPH_WIDTH} y1={0} y2={STRIP_HEIGHT} className="stroke-border-subtle" vectorEffect="non-scaling-stroke" />
          ))}
          {chart.activity.map((a) => {
            const h = (a.value / peak) * (STRIP_HEIGHT - 4);
            return (
              <rect
                key={`${a.monitorId}-${a.index}`}
                data-testid={`timeline-activity-${a.event.id}`}
                x={a.index}
                width={1}
                y={STRIP_HEIGHT - h}
                height={h}
                fill={colourOf.get(a.monitorId)}
                className="cursor-pointer"
                onMouseEnter={() => s.preview(a)}
                onClick={() => s.openEvent(a.event.id, a.frame)}
              >
                <title>{`${a.event.name} · ${a.value}`}</title>
              </rect>
            );
          })}
        </svg>

        {chart.rows.map((row) => (
          <Row key={row.monitorId} row={row} chart={chart} s={s} />
        ))}

        <div className="border-e border-border-subtle" />
        <div className="relative h-8 border-t border-border-subtle">
          <svg viewBox={`0 0 ${GRAPH_WIDTH} 1`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
            {chart.zoomBands.map((b) => (
              <rect
                key={b.minT}
                data-testid="timeline-zoom-band"
                x={(b.x / 100) * GRAPH_WIDTH}
                width={(b.width / 100) * GRAPH_WIDTH}
                y={0}
                height={1}
                className="fill-transparent hover:fill-surface-2 cursor-zoom-in"
                onClick={() => s.zoomTo(b)}
              >
                <title>{t('Zoom In')}</title>
              </rect>
            ))}
          </svg>
          {chart.xTicks.map((x) => (
            <span
              key={x.x}
              className="absolute top-1.5 -translate-x-1/2 text-xs font-mono tabular-nums text-fg-dim pointer-events-none"
              style={{ left: `${x.x}%` }}
            >
              {x.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({ row, chart, s }: { row: TimelineChart['rows'][number]; chart: TimelineChart; s: PageState }) {
  return (
    <>
      <div className="px-3 flex items-center gap-2 text-xs text-fg-muted border-e border-t border-border-subtle" style={{ height: ROW_HEIGHT }}>
        <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: row.colour }} aria-hidden />
        <span className="truncate">{row.name}</span>
      </div>
      <svg
        viewBox={`0 0 ${GRAPH_WIDTH} ${ROW_HEIGHT}`}
        preserveAspectRatio="none"
        className="w-full block border-t border-border-subtle"
        style={{ height: ROW_HEIGHT }}
        data-testid={`timeline-row-${row.monitorId}`}
      >
        {chart.xTicks.map((x) => (
          <line key={x.x} x1={(x.x / 100) * GRAPH_WIDTH} x2={(x.x / 100) * GRAPH_WIDTH} y1={0} y2={ROW_HEIGHT} className="stroke-border-subtle" vectorEffect="non-scaling-stroke" />
        ))}
        {row.slots.map((slot) => (
          <rect
            key={slot.index}
            data-testid={`timeline-event-${slot.event.id}`}
            x={slot.index}
            width={slot.width}
            y={3}
            height={ROW_HEIGHT - 6}
            fill={row.colour}
            className="cursor-pointer"
            onMouseEnter={() => s.preview(slot)}
            onClick={() => s.openEvent(slot.event.id, slot.frame)}
          >
            <title>{`${slot.event.name} · ${startText(slot.event.start_date_time)}`}</title>
          </rect>
        ))}
      </svg>
    </>
  );
}

function Readout({ s }: { s: PageState }) {
  const { t } = useTranslation();
  const rows = s.previews.filter((p) => p.preview);
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded border border-border-subtle bg-surface">
      <table className="w-full text-sm" data-testid="timeline-readout">
        <thead className="border-b border-border-subtle">
          <tr className="text-xs text-fg-dim">
            <th scope="col" className="px-3 py-2 text-start font-medium w-32">{t('Image')}</th>
            <th scope="col" className="px-3 py-2 text-start font-medium">{t('Monitor')}</th>
            <th scope="col" className="px-3 py-2 text-start font-medium">{t('Event')}</th>
            <th scope="col" className="px-3 py-2 text-start font-medium">{t('Start Time')}</th>
            <th scope="col" className="px-3 py-2 text-end font-medium">{t('Length')}</th>
            <th scope="col" className="px-3 py-2 text-start font-medium">{t('Cause')}</th>
            <th scope="col" className="px-3 py-2 text-start font-medium">{t('Notes')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ monitorId, preview: p }) => p && (
            <tr
              key={monitorId}
              data-testid={`timeline-data-${monitorId}`}
              onClick={() => s.openEvent(p.event.id, p.frame)}
              className="border-b border-border-subtle last:border-0 hover:bg-surface-2 cursor-pointer"
            >
              <td className="px-3 py-1">
                <img
                  src={p.imageUrl}
                  alt={t('View Event')}
                  loading="lazy"
                  className="w-28 h-auto rounded bg-bg-sunken"
                  onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                />
              </td>
              <td className="px-3 py-1 text-fg">{p.monitorName}</td>
              <td className="px-3 py-1">
                <span className="text-fg">{p.event.name}</span>
                {typeof p.frame === 'number' && <span className="ms-1 font-mono tabular-nums text-fg-dim">{`#${p.frame}`}</span>}
                {p.event.archived === 1 && <span className="ms-2 text-xs text-fg-dim">{t('Archived')}</span>}
              </td>
              <td className="px-3 py-1 whitespace-nowrap font-mono tabular-nums text-fg-muted">{startText(p.event.start_date_time)}</td>
              <td className="px-3 py-1 text-end font-mono tabular-nums text-fg-muted">{`${p.event.length}s`}</td>
              <td className="px-3 py-1 text-fg-muted">{p.event.cause}</td>
              <td className="px-3 py-1 text-fg-muted truncate max-w-[20rem]">{p.event.notes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function startText(iso: string | null | undefined): string {
  const t = parseWhen(iso ?? undefined);
  return t == null ? '' : formatDbTime(t);
}
