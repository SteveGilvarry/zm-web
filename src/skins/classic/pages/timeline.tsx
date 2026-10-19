import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, FastForward, List, RefreshCw, Rewind, ZoomOut } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import { useCanGoBack } from '@/features/nav/useCanGoBack';
import { useTimelinePage, type TimelinePreview } from '@/features/timeline/useTimelinePage';
import { GRAPH_HEIGHT, GRAPH_WIDTH, formatDbTime, parseWhen } from '@/features/timeline/timelineChart';
import { useDocumentTitle } from '@/skins/modern/layouts/useDocumentTitle';
import { ClassicButton } from '../components/events/primitives';

const slotPct = (n: number) => `${Math.round((1000 * n) / GRAPH_WIDTH) / 10}%`;

/**
 * Legacy `?view=timeline` — classic skin (`timeline.php`, `timeline.js`).
 * Toolbar: Back, Refresh, List and the "Timeline" heading. Inside the
 * bordered content box: the four tips, one image + event-data readout per
 * monitor, Pan Left / Zoom Out / Pan Right, then the chart — an activity
 * strip of alarm scores over one bar per monitor in its WebColour, dotted
 * gridlines, and a "Zoom In" band between each pair of ticks — and under it
 * the key of monitor colours and the range.
 */
export default function ClassicTimelinePage() {
  const { t } = useTranslation();
  useDocumentTitle(t('Timeline'));
  const s = useTimelinePage();
  const canGoBack = useCanGoBack();

  if (!s.isAuthenticated) return null;
  const chart = s.chart;
  const n = s.previews.length;

  return (
    <AppShell title={t('Timeline')}>
      <main className="flex-1 overflow-auto bg-white text-zinc-900">
        <div className="flex items-end p-1">
          <div id="toolbar" className="me-auto flex gap-1">
            <ClassicButton onClick={() => window.history.back()} disabled={!canGoBack} title={t('Back')} aria-label={t('Back')}>
              <ArrowLeft size={14} className="rtl:-scale-x-100" />
            </ClassicButton>
            <ClassicButton onClick={s.refresh} title={t('Refresh')} aria-label={t('Refresh')}>
              <RefreshCw size={14} />
            </ClassicButton>
            <Link
              to="/events"
              search={s.eventsSearch as never}
              title={t('List')}
              aria-label={t('List')}
              className="inline-flex items-center px-3 py-1.5 text-sm border rounded-sm bg-[#e9ecef] border-[#adb5bd] text-zinc-800 hover:bg-[#dde1e5]"
            >
              <List size={14} />
            </Link>
          </div>
          <h2 className="text-2xl font-medium">{t('Timeline')}</h2>
        </div>

        <QueryState
          isLoading={s.isLoading}
          isError={!!s.error}
          error={s.error}
          onRetry={s.refresh}
          className="bg-white text-zinc-700"
        >
          <div id="content" dir="ltr" className="relative mx-auto text-center border border-[#666666]">
            {s.showInstructions && (
              <div id="instruction" className="text-sm space-y-2 py-2">
                <p>{t('Pass your mouse over the graph to view a snapshot image and event details.')}</p>
                <p>{t('Click on the coloured sections of the graph, or the image, to view the event.')}</p>
                <p>{t('Click on the background to zoom in to a smaller time period based around your click.')}</p>
                <p>{t('Use the controls below to zoom out or navigate back and forward through the time range.')}</p>
              </div>
            )}

            {/* Legacy's `.graphWidth`: the panel, chart and labels share the graph's 600 px. */}
            <div id="topPanel" className="relative block mx-auto mt-1 mb-1.5 after:block after:clear-both after:content-['']" style={{ width: GRAPH_WIDTH }}>
              {s.previews.map(({ monitorId, preview }) => (
                <div key={monitorId} className="float-left" style={{ width: `${100 / n}%` }} data-testid={`timeline-panel-${monitorId}`}>
                  <div className={clsx('text-end', n === 1 && 'w-1/2 float-left')}>
                    <div
                      className="relative w-full me-0.5 bg-[#eeeeee] border border-[#c8c8c8]"
                      style={{ paddingTop: s.imagePaddingTop }}
                    >
                      {preview && (
                        <img
                          src={preview.imageUrl}
                          alt={t('View Event')}
                          title={t('View Event')}
                          loading="lazy"
                          onClick={() => s.openEvent(preview.event.id, preview.frame)}
                          onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                          onLoad={(e) => { e.currentTarget.style.visibility = 'visible'; }}
                          className="absolute inset-0 m-auto h-full w-auto max-w-full cursor-pointer"
                        />
                      )}
                    </div>
                  </div>
                  <div className={clsx('text-start', n === 1 && 'w-1/2 float-left')}>
                    {preview && <EventData preview={preview} onOpen={() => s.openEvent(preview.event.id, preview.frame)} />}
                  </div>
                </div>
              ))}

              <div id="navPanel" className="float-left w-full my-1 flex justify-center gap-1">
                <button type="button" title={t('Pan Left')} aria-label={t('Pan Left')} onClick={s.panLeft} className={navBtn}>
                  <Rewind size={18} />
                </button>
                <button type="button" title={t('Zoom Out')} aria-label={t('Zoom Out')} onClick={s.zoomOut} className={navBtn}>
                  <ZoomOut size={18} />
                </button>
                <button type="button" title={t('Pan Right')} aria-label={t('Pan Right')} onClick={s.panRight} className={navBtn}>
                  <FastForward size={18} />
                </button>
              </div>
            </div>

            {chart && (
              <>
                <div id="chartPanel" className="clear-both relative block w-full px-8">
                  <div id="chart" className="relative border border-black mx-auto" style={{ width: GRAPH_WIDTH, height: GRAPH_HEIGHT }} data-testid="timeline-chart">
                    {/* Y scale: score gridlines over the activity strip. */}
                    {chart.yTicks.map((y) => (
                      <div key={`y${y.value}`}>
                        <div className="absolute text-end text-[9px] w-5" style={{ left: -30, top: chart.activityHeight - y.bottom - 6 }}>{y.value}</div>
                        <div className="absolute h-px w-[7px] border-t border-black" style={{ left: -7, top: chart.activityHeight - y.bottom - 1 }} />
                        <div className="absolute z-[1] left-0 w-full h-px border-t border-dotted border-[#cccccc]" style={{ top: chart.activityHeight - y.bottom - 1 }} />
                      </div>
                    ))}
                    {/* X scale: labels, ticks, gridlines and the zoom bands. */}
                    {chart.xTicks.map((x) => (
                      <div key={`x${x.x}`}>
                        <div className="absolute w-[50px] -translate-x-1/2 text-center text-[9px]" style={{ left: `${x.x}%`, bottom: -20 }}>{x.label}</div>
                        <div className="absolute w-px h-[7px] border-s border-black" style={{ left: `${x.x}%`, bottom: -7 }} />
                        <div className="absolute z-[1] top-0 w-px h-full border-s border-dotted border-[#cccccc]" style={{ left: `${x.x}%` }} />
                      </div>
                    ))}
                    {chart.zoomBands.map((b) => (
                      <div
                        key={`z${b.minT}`}
                        role="button"
                        tabIndex={0}
                        title={t('Zoom In')}
                        aria-label={t('Zoom In')}
                        data-testid="timeline-zoom-band"
                        onClick={() => s.zoomTo(b)}
                        onKeyDown={(e) => { if (e.key === 'Enter') s.zoomTo(b); }}
                        className="absolute z-[2] bottom-0 h-full cursor-zoom-in"
                        style={{ left: `${b.x}%`, width: `${b.width}%` }}
                      />
                    ))}
                    <div id="activity" className="absolute top-0 left-0 w-full border-b border-[#cccccc]" style={{ height: chart.activityHeight }}>
                      {chart.activity.map((a) => {
                        const h = chart.activityHeightOf(a.value);
                        if (h <= 0) return null;
                        const colour = chart.rows.find((r) => r.monitorId === a.monitorId)?.colour;
                        return (
                          <div
                            key={`${a.monitorId}-${a.index}`}
                            data-testid={`timeline-activity-${a.event.id}`}
                            className="absolute bottom-0 z-[3] cursor-pointer"
                            style={{ left: slotPct(a.index), width: '0.17%', height: h, backgroundColor: colour }}
                            onMouseOver={() => s.preview(a)}
                            onClick={() => s.openEvent(a.event.id, a.frame)}
                          />
                        );
                      })}
                    </div>
                    {chart.rows.map((row) => (
                      <div
                        key={row.monitorId}
                        className="absolute left-0 w-full text-center bg-[#fcfcfc] border-b border-black"
                        style={{ top: row.top, height: chart.eventBarHeight }}
                      >
                        {row.slots.map((slot) => (
                          <div
                            key={slot.index}
                            data-testid={`timeline-event-${slot.event.id}`}
                            className="absolute bottom-0 z-[3] cursor-pointer"
                            style={{ left: slotPct(slot.index), width: slotPct(slot.width), height: chart.eventBarHeight, backgroundColor: row.colour }}
                            onMouseOver={() => s.preview(slot)}
                            onClick={() => s.openEvent(slot.event.id, slot.frame)}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                <div id="chartLabels" className="block mx-auto mt-[25px] text-center px-8" style={{ width: GRAPH_WIDTH }}>
                  <div id="key" className="float-right -mt-1 text-end text-sm">
                    {chart.rows.map((row) => (
                      <span key={row.monitorId} className="ms-2">
                        {row.name}
                        <span
                          title={row.name}
                          className="relative inline-block border border-black w-4 h-4 top-1 ms-1"
                          style={{ backgroundColor: row.colour }}
                        />
                      </span>
                    ))}
                  </div>
                  <div id="range" className="w-[30%] mx-auto text-[#016A9D] text-[11px] font-bold leading-5" data-testid="timeline-range">
                    {chart.title}
                  </div>
                </div>
                {s.truncated && (
                  <p className="clear-both text-xs text-[#856404] py-1">
                    {t('More events fall in this range than the timeline draws; zoom in to see them all.')}
                  </p>
                )}
              </>
            )}
          </div>
        </QueryState>
      </main>
    </AppShell>
  );
}

const navBtn = 'bg-[#eeeeee] border border-[#c8c8c8] p-[5px] text-zinc-800 hover:bg-[#e0e0e0]';


/** Legacy prints `StartDateTime` as stored: `YYYY-MM-DD HH:MM:SS`. */
function startText(iso: string | null | undefined): string {
  const t = parseWhen(iso ?? undefined);
  return t == null ? '' : formatDbTime(t);
}

/** `createEventHtml`: monitor, event (frame), start - length, cause, notes, Archived. */
function EventData({ preview, onOpen }: { preview: TimelinePreview; onOpen: () => void }) {
  const { t } = useTranslation();
  const e = preview.event;
  return (
    <div
      className="ms-0.5 p-0.5 bg-[#eeeeee] border border-[#c8c8c8] text-[#016A9D] text-[11px] font-bold leading-[14px] cursor-pointer"
      onClick={onOpen}
      data-testid={`timeline-data-${e.monitor_id}`}
    >
      <div className={clsx(e.archived === 1 && 'archived')}>
        <p>{preview.monitorName}</p>
        <p>{e.name}{typeof preview.frame === 'number' ? `(${preview.frame})` : ''}</p>
        <p>{`${startText(e.start_date_time)} - ${e.length}s`}</p>
        <p>{e.cause}</p>
        {e.notes ? <p>{e.notes}</p> : null}
        {e.archived === 1 ? <p>{t('Archived')}</p> : null}
      </div>
    </div>
  );
}
