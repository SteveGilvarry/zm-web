import { Fragment } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronLeft, ChevronRight, Download, RefreshCw } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import type { Frame } from '@/api/frames';
import { FrameThumbnail } from '@/features/events/FrameThumbnail';
import { FramesColumnChooser } from '@/features/events/FramesColumnChooser';
import { FRAMES_ALL_PAGE_SIZE, useEventFramesPage } from '@/features/events/useEventFramesPage';
import { useFramesColumnLabels } from '@/features/events/columnLabels';
import { FRAMES_COLUMNS, type FramesColumnKey, type FramesSortKey } from '@/features/events/framesTable';
import { useDateTimeFormat } from '@/features/config/useDateTimeFormat';
import { useDocumentTitle } from '../layouts/useDocumentTitle';
import { StatsTable } from '../components/StatsTable';
import { useFrameStats } from '@/features/events/useFrameStats';
import type { ZmEvent } from '@/types';

const field = clsx(
  'bg-surface border border-border-subtle rounded',
  'text-fg focus:outline-none focus:border-accent transition-colors',
);

/**
 * Legacy `?view=frames` — the modern skin. One row per captured frame, with
 * the table owning the height and the pager pinned to the status bar.
 */
export default function EventFramesPage({ eventId }: { eventId: number }) {
  const { t } = useTranslation();
  const s = useEventFramesPage(eventId);
  const labels = useFramesColumnLabels();
  const title = t('Frames — Event {{id}}', { id: eventId });
  useDocumentTitle(title);

  if (!s.isAuthenticated) return null;

  return (
    <AppShell title={title}>
      <main className="flex-1 min-h-0 flex flex-col">
        <div className="flex items-center gap-3 px-3 h-11 shrink-0 border-b border-border-subtle bg-surface">
          {/* Legacy's Back is history, not a link to the event: it returns
              to wherever the operator came from. */}
          <button
            type="button"
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-1.5 text-xs text-fg-dim hover:text-fg transition-colors"
          >
            <ArrowLeft size={14} className="rtl:-scale-x-100" aria-hidden />
            {t('Back')}
          </button>
          <h1 className="text-sm font-medium text-fg truncate">{title}</h1>
          {s.event && (
            <span className="text-xs text-fg-dim truncate">{s.event.name}</span>
          )}

          <input
            type="search"
            value={s.query}
            onChange={(e) => s.setQuery(e.target.value)}
            placeholder={t('Search')}
            aria-label={t('Search frames')}
            className={clsx(field, 'ms-auto shrink-0 w-40 px-2 py-0.5 text-xs')}
          />
          <button
            type="button"
            onClick={s.refetch}
            aria-label={t('Refresh')}
            title={t('Refresh')}
            className="shrink-0 p-1 rounded text-fg-dim hover:text-fg transition-colors"
          >
            <RefreshCw size={14} aria-hidden />
          </button>
          <FramesColumnChooser
            isVisible={s.isVisible}
            onToggle={s.toggleColumn}
            onReset={s.resetColumns}
          />
          <button
            type="button"
            onClick={s.exportCsv}
            aria-label={t('Export')}
            title={t('Export')}
            className="shrink-0 p-1 rounded text-fg-dim hover:text-fg transition-colors"
          >
            <Download size={14} aria-hidden />
          </button>

          <label className="shrink-0 flex items-center gap-1 text-xs text-fg-dim">
            {t('Per page')}
            <select
              aria-label={t('Rows per page')}
              value={s.pageSize}
              onChange={(e) => s.setPageSize(Number(e.target.value))}
              className={clsx(field, 'px-1 py-0.5 text-xs cursor-pointer')}
            >
              {s.pageSizeOptions.map((n) => (
                <option key={n} value={n}>{n === FRAMES_ALL_PAGE_SIZE ? t('All') : n}</option>
              ))}
            </select>
          </label>
        </div>

        {/* The table is the page: it scrolls under its own pinned header. */}
        <div className="flex-1 min-h-0 overflow-auto p-3">
          <QueryState
            isLoading={s.isLoading}
            isError={s.isError}
            error={s.error}
            onRetry={s.refetch}
            empty={s.frames.length === 0}
            emptyMessage={t('No frames recorded for this event.')}
          >
            <div className="overflow-x-auto rounded border border-border-subtle bg-surface">
              <table className="w-full text-sm" data-testid="frames-table">
                <thead className="sticky top-0 z-10 bg-surface border-b border-border-subtle">
                  <tr>
                    <td aria-hidden className="w-8 px-2 py-2" />
                    {FRAMES_COLUMNS.filter((c) => s.isVisible(c.key)).map((col) => (
                      <Th
                        key={col.key}
                        numeric={col.numeric}
                        sorted={s.sort === col.key ? s.dir : undefined}
                        onSort={col.data ? () => s.toggleSort(col.key as FramesSortKey) : undefined}
                      >
                        {labels[col.key]}
                      </Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
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
                        <tr data-testid={`frame-detail-${f.frame_id}`} className="border-b border-border-subtle bg-bg-sunken">
                          <td colSpan={s.visibleColumns.length + 1} className="px-3 py-2">
                            <FrameStatsDetail event={s.event} frameId={f.frame_id} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </QueryState>
        </div>

        <div className="flex items-center gap-3 px-3 py-2 shrink-0 border-t border-border-subtle bg-surface text-xs text-fg-dim">
          <span className="font-mono tabular-nums">
            {t('Page {{page}} / {{totalPages}} · {{total}} frames', {
              page: s.page, totalPages: s.totalPages, total: s.total,
            })}
          </span>
          {s.totalPages > 1 && (
            <div className="ms-auto flex items-center gap-2">
              <PagerBtn
                onClick={() => s.setPage(s.page - 1)}
                disabled={s.page <= 1}
                label={t('Previous page')}
              >
                <ChevronLeft size={14} className="rtl:-scale-x-100" />
              </PagerBtn>
              <PagerBtn
                onClick={() => s.setPage(s.page + 1)}
                disabled={s.page >= s.totalPages}
                label={t('Next page')}
              >
                <ChevronRight size={14} className="rtl:-scale-x-100" />
              </PagerBtn>
            </div>
          )}
        </div>
      </main>
    </AppShell>
  );
}

function Th({
  children, numeric, sorted, onSort,
}: {
  children: React.ReactNode;
  numeric?: boolean;
  sorted?: 'asc' | 'desc';
  onSort?: () => void;
}) {
  return (
    <th
      scope="col"
      aria-sort={sorted ? (sorted === 'asc' ? 'ascending' : 'descending') : undefined}
      className={clsx(
        'px-3 py-2 text-xs font-medium text-fg-dim whitespace-nowrap',
        numeric ? 'text-end' : 'text-start',
      )}
    >
      {onSort ? (
        <button type="button" onClick={onSort} className="hover:text-fg transition-colors">
          {children}{sorted ? (sorted === 'asc' ? ' ▲' : ' ▼') : ''}
        </button>
      ) : children}
    </th>
  );
}

function PagerBtn({
  onClick, disabled, label, children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={clsx(
        'p-1.5 rounded border border-border-subtle transition-colors',
        disabled ? 'text-fg-faint cursor-not-allowed' : 'text-fg hover:border-accent',
      )}
    >
      {children}
    </button>
  );
}

/** A row's stats, opened from its chevron (legacy's "+" detail view). */
function FrameStatsDetail({ event, frameId }: { event: ZmEvent | undefined; frameId: number }) {
  const stats = useFrameStats(event, frameId);
  return <StatsTable rows={stats.rows} isLoading={stats.isLoading} testId={`frame-stats-${frameId}`} />;
}

function FrameRow({
  frame: f, maxScore, isVisible, showThumbs, thumbWidth, token, expanded, onToggle, onOpen, onStats,
}: {
  frame: Frame;
  maxScore: number;
  isVisible: (key: FramesColumnKey) => boolean;
  showThumbs: boolean;
  thumbWidth: number;
  token: string | null;
  expanded: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onStats: () => void;
}) {
  const { t } = useTranslation();
  const { formatDateTime } = useDateTimeFormat();
  // An alarm frame is state, so it keeps its colour; everything else is grey.
  const alarm = f.type === 'Alarm';
  const pct = maxScore > 0 ? Math.round((f.score / maxScore) * 100) : 0;
  return (
    <tr
      data-testid={`frame-row-${f.frame_id}`}
      data-frame-type={f.type}
      onClick={onOpen}
      className="border-b border-border-subtle last:border-0 hover:bg-surface-2 transition-colors cursor-pointer"
    >
      <td className="w-8 px-2 py-1">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          aria-expanded={expanded}
          aria-label={expanded ? t('Hide stats for frame {{n}}', { n: f.frame_id }) : t('Show stats for frame {{n}}', { n: f.frame_id })}
          className="p-0.5 rounded text-fg-dim hover:text-fg transition-colors"
        >
          <ChevronRight size={14} aria-hidden className={clsx('transition-transform rtl:-scale-x-100', expanded && 'rotate-90')} />
        </button>
      </td>
      {isVisible('event_id') && (
        <td className="px-3 py-1 text-end font-mono tabular-nums text-fg-muted">{f.event_id}</td>
      )}
      {isVisible('frame_id') && (
        <td className="px-3 py-1 text-end font-mono tabular-nums text-fg">{f.frame_id}</td>
      )}
      {isVisible('type') && (
        <td className={clsx('px-3 py-1 whitespace-nowrap', alarm ? 'text-danger' : 'text-fg-muted')}>
          {f.type}
        </td>
      )}
      {isVisible('time_stamp') && (
        <td className="px-3 py-1 font-mono tabular-nums text-fg-muted whitespace-nowrap">
          {formatDateTime(f.time_stamp)}
        </td>
      )}
      {isVisible('delta') && (
        <td className="px-3 py-1 text-end font-mono tabular-nums text-fg-muted">
          {Number(f.delta).toFixed(2)}
        </td>
      )}
      {isVisible('score') && (
      <td
        className="px-3 py-1 text-end font-mono tabular-nums hover:underline"
        onClick={(e) => { e.stopPropagation(); onStats(); }}
        title={t('Stats')}
        data-testid={`frame-score-${f.frame_id}`}
      >
        <span className="inline-flex items-center gap-2">
          <span className={alarm ? 'text-danger' : 'text-fg'}>{f.score}</span>
          <span
            aria-hidden
            className="inline-block h-1.5 w-16 rounded-full bg-bg-sunken overflow-hidden"
          >
            <span
              className={clsx('block h-full rounded-full', alarm ? 'bg-danger' : 'bg-fg-faint')}
              style={{ width: `${pct}%` }}
            />
          </span>
        </span>
      </td>
      )}
      {isVisible('thumbnail') && (
        <td className="px-3 py-1 whitespace-nowrap">
          {showThumbs && (
            <FrameThumbnail
              frameId={f.id}
              frameNumber={f.frame_id}
              token={token}
              width={thumbWidth}
              className="rounded-sm"
            />
          )}
        </td>
      )}
    </tr>
  );
}
