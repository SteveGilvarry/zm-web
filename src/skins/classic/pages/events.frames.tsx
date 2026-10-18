import { Fragment } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Download, RefreshCw, Search } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import type { Frame } from '@/api/frames';
import { FrameThumbnail } from '@/features/events/FrameThumbnail';
import { FramesColumnChooser } from '@/features/events/FramesColumnChooser';
import { FRAMES_ALL_PAGE_SIZE, useEventFramesPage } from '@/features/events/useEventFramesPage';
import { useFramesColumnLabels } from '@/features/events/columnLabels';
import { FRAMES_COLUMNS, type FramesSortKey } from '@/features/events/framesTable';
import { useDateTimeFormat } from '@/features/config/useDateTimeFormat';
import { useCanGoBack } from '@/features/nav/useCanGoBack';
import { useDocumentTitle } from '@/skins/modern/layouts/useDocumentTitle';
import {
  ClassicButton, ClassicPageTitle, ClassicPager, ClassicTable, ClassicTbody, ClassicTd, ClassicThead,
} from '../components/events/primitives';
import { classicInput } from '../components/events/styles';
import { ClassicStatsTable } from '../components/events/ClassicStatsTable';
import { useFrameStats } from '@/features/events/useFrameStats';
import type { ZmEvent } from '@/types';

/**
 * Legacy `?view=frames` — classic skin. Striped white table, alarm rows in
 * red, with bootstrap-table's toolbar over it: Back (history), Refresh, the
 * search box, the column chooser and the CSV export. Sorting, searching and
 * the export all work on the rows that were fetched — `/frames` takes no
 * sort or search parameter — so "All" rows per page makes them event-wide.
 */
export default function EventFramesPage({ eventId }: { eventId: number }) {
  const { t } = useTranslation();
  const s = useEventFramesPage(eventId);
  const labels = useFramesColumnLabels();
  // Legacy `views/js/frames.js` greys Back when there is nowhere to go back to.
  const canGoBack = useCanGoBack();
  const title = t('Frames — Event {{id}}', { id: eventId });
  useDocumentTitle(title);

  if (!s.isAuthenticated) return null;

  const sortArrow = (key: FramesSortKey) =>
    s.sort === key ? (s.dir === 'asc' ? ' ▲' : ' ▼') : '';

  return (
    <AppShell title={title}>
      <main className="flex-1 p-4 overflow-auto bg-zinc-50">
        <div className="max-w-screen-2xl mx-auto space-y-4">
          <ClassicPageTitle
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <ClassicButton onClick={() => window.history.back()} disabled={!canGoBack} title={t('Back')} aria-label={t('Back')}>
                  <ArrowLeft size={14} className="rtl:-scale-x-100" />
                  {t('Back')}
                </ClassicButton>
                <ClassicButton tone="primary" onClick={s.refetch} title={t('Refresh')} aria-label={t('Refresh')}>
                  <RefreshCw size={14} />
                  {t('Refresh')}
                </ClassicButton>
                <label className="inline-flex items-center gap-1.5">
                  <Search size={14} className="text-zinc-500" aria-hidden />
                  <input
                    type="search"
                    value={s.query}
                    onChange={(e) => s.setQuery(e.target.value)}
                    placeholder={t('Search')}
                    aria-label={t('Search frames')}
                    className={clsx(classicInput, 'py-1 text-sm')}
                  />
                </label>
                <FramesColumnChooser
                  variant="classic"
                  isVisible={s.isVisible}
                  onToggle={s.toggleColumn}
                  onReset={s.resetColumns}
                />
                <ClassicButton onClick={s.exportCsv} title={t('Export')}>
                  <Download size={14} />
                  {t('Export')}
                </ClassicButton>
              </div>
            }
          >
            {title}
            {s.event && (
              <span className="ms-2 text-sm font-normal text-zinc-500">{s.event.name}</span>
            )}
          </ClassicPageTitle>

          <QueryState
            isLoading={s.isLoading}
            isError={s.isError}
            error={s.error}
            onRetry={s.refetch}
            empty={s.frames.length === 0}
            emptyMessage={t('No frames recorded for this event.')}
            className="bg-white border border-[#dee2e6] text-zinc-700"
          >
            <ClassicTable testId="frames-table">
              <ClassicThead>
                <tr>
                  {/* bootstrap-table's detail-view column: the "+" per row. */}
                  <td aria-hidden className="w-6 px-1 py-1" />
                  {FRAMES_COLUMNS.filter((c) => s.isVisible(c.key)).map((col) => (
                    <th
                      key={col.key}
                      scope="col"
                      aria-sort={s.sort === col.key ? (s.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                      className={clsx(
                        'px-2 py-1 font-semibold whitespace-nowrap',
                        col.numeric ? 'text-end' : col.data ? 'text-start' : 'text-center',
                      )}
                    >
                      {col.data ? (
                        <button
                          type="button"
                          onClick={() => s.toggleSort(col.key as FramesSortKey)}
                          className="hover:underline"
                        >
                          {labels[col.key]}{sortArrow(col.key as FramesSortKey)}
                        </button>
                      ) : labels[col.key]}
                    </th>
                  ))}
                </tr>
              </ClassicThead>
              <ClassicTbody>
                {s.frames.map((f) => (
                  <Fragment key={f.id}>
                    <FrameRow
                      frame={f}
                      maxScore={s.maxScore}
                      isVisible={s.isVisible}
                      showThumbs={s.showThumbs}
                      thumbWidth={s.thumbWidth}
                      token={s.token}
                      expanded={s.isExpanded(f.frame_id)}
                      onToggle={() => s.toggleExpanded(f.frame_id)}
                      onOpen={() => s.openFrame(f.frame_id)}
                      onStats={() => s.openStats(f.frame_id)}
                    />
                    {s.isExpanded(f.frame_id) && (
                      <tr data-testid={`frame-detail-${f.frame_id}`}>
                        <td colSpan={s.visibleColumns.length + 1} className="px-2 py-2 bg-white!">
                          <FrameStatsDetail event={s.event} eventId={eventId} frameId={f.frame_id} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </ClassicTbody>
            </ClassicTable>
          </QueryState>

          <ClassicPager
            page={s.page}
            pageSize={s.pageSize === FRAMES_ALL_PAGE_SIZE ? Math.max(s.total, 1) : s.pageSize}
            total={s.total}
            totalPages={s.totalPages}
            pageSizeOptions={s.pageSizeOptions}
            pageSizeLabel={(n) => (n === FRAMES_ALL_PAGE_SIZE ? t('All') : String(n))}
            onPage={s.setPage}
            onPageSize={s.setPageSize}
            shown={s.frames.length}
          />
        </div>
      </main>
    </AppShell>
  );
}

/** The "+" row: legacy `detailFormatter` loads `getStatsTableHTML` for the frame. */
function FrameStatsDetail({ event, eventId, frameId }: { event: ZmEvent | undefined; eventId: number; frameId: number }) {
  const stats = useFrameStats(event, frameId);
  return (
    <ClassicStatsTable
      eventId={eventId}
      frameId={frameId}
      rows={stats.rows}
      isLoading={stats.isLoading}
      testId={`frame-stats-${frameId}`}
    />
  );
}

function FrameRow({
  frame: f, maxScore, isVisible, showThumbs, thumbWidth, token, expanded, onToggle, onOpen, onStats,
}: {
  frame: Frame;
  maxScore: number;
  isVisible: (key: (typeof FRAMES_COLUMNS)[number]['key']) => boolean;
  showThumbs: boolean;
  thumbWidth: number;
  token: string | null;
  expanded: boolean;
  onToggle: () => void;
  /** Any cell but the "+" and Score: legacy `processClicks` opens the frame. */
  onOpen: () => void;
  onStats: () => void;
}) {
  const { t } = useTranslation();
  const { formatDateTime } = useDateTimeFormat();
  const alarm = f.type === 'Alarm';
  const pct = maxScore > 0 ? Math.round((f.score / maxScore) * 100) : 0;
  return (
    <tr
      data-testid={`frame-row-${f.frame_id}`}
      data-frame-type={f.type}
      // Legacy colours alarm frames with bootstrap's "danger" row tint. The
      // important-flag beats the striped/hover backgrounds from ClassicTbody.
      className={clsx('cursor-pointer', alarm && 'bg-[#f8d7da]! text-[#721c24]')}
      onClick={onOpen}
    >
      <ClassicTd center className="w-6 px-1">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          aria-expanded={expanded}
          aria-label={expanded ? t('Hide stats for frame {{n}}', { n: f.frame_id }) : t('Show stats for frame {{n}}', { n: f.frame_id })}
          className="w-5 font-bold text-[#337ab7] hover:text-[#23527c]"
        >
          {expanded ? '−' : '+'}
        </button>
      </ClassicTd>
      {isVisible('event_id') && <ClassicTd numeric>{f.event_id}</ClassicTd>}
      {isVisible('frame_id') && <ClassicTd numeric>{f.frame_id}</ClassicTd>}
      {isVisible('type') && <ClassicTd>{f.type}</ClassicTd>}
      {isVisible('time_stamp') && (
        <ClassicTd className="whitespace-nowrap">{formatDateTime(f.time_stamp)}</ClassicTd>
      )}
      {isVisible('delta') && <ClassicTd numeric>{Number(f.delta).toFixed(2)}</ClassicTd>}
      {isVisible('score') && (
        <ClassicTd
          numeric
          onClick={(e) => { e.stopPropagation(); onStats(); }}
          title={t('Stats')}
          data-testid={`frame-score-${f.frame_id}`}
        >
          <span className="inline-flex items-center justify-end gap-2">
            <span
              aria-hidden
              className="inline-block h-2 w-16 bg-zinc-200 border border-zinc-300 overflow-hidden"
            >
              <span
                className={clsx('block h-full', alarm ? 'bg-[#d9534f]' : 'bg-[#337ab7]')}
                style={{ width: `${pct}%` }}
              />
            </span>
            <span>{f.score}</span>
          </span>
        </ClassicTd>
      )}
      {isVisible('thumbnail') && (
        <ClassicTd center className="whitespace-nowrap">
          {showThumbs && (
            <FrameThumbnail
              frameId={f.id}
              frameNumber={f.frame_id}
              token={token}
              width={thumbWidth}
            />
          )}
        </ClassicTd>
      )}
    </tr>
  );
}
