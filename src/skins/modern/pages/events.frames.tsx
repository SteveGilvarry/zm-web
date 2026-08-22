import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import type { Frame } from '@/api/frames';
import { useEventFramesPage } from '@/features/events/useEventFramesPage';
import { useDateTimeFormat } from '@/features/config/useDateTimeFormat';
import { useDocumentTitle } from '../layouts/useDocumentTitle';

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
  const title = t('Frames — Event {{id}}', { id: eventId });
  useDocumentTitle(title);

  if (!s.isAuthenticated) return null;

  return (
    <AppShell title={title}>
      <main className="flex-1 min-h-0 flex flex-col">
        <div className="flex items-center gap-3 px-3 h-11 shrink-0 border-b border-border-subtle bg-surface">
          <Link
            to="/events/$eventId"
            params={{ eventId: String(eventId) }}
            className="inline-flex items-center gap-1.5 text-xs text-fg-dim hover:text-fg transition-colors"
          >
            <ArrowLeft size={14} className="rtl:-scale-x-100" aria-hidden />
            {t('Back to event')}
          </Link>
          <h1 className="text-sm font-medium text-fg truncate">{title}</h1>
          {s.event && (
            <span className="text-xs text-fg-dim truncate">{s.event.name}</span>
          )}

          <label className="ms-auto shrink-0 flex items-center gap-1 text-xs text-fg-dim">
            {t('Per page')}
            <select
              aria-label={t('Rows per page')}
              value={s.pageSize}
              onChange={(e) => s.setPageSize(Number(e.target.value))}
              className={clsx(field, 'px-1 py-0.5 text-xs cursor-pointer')}
            >
              {s.pageSizeOptions.map((n) => (
                <option key={n} value={n}>{n}</option>
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
                    <Th numeric>{t('Event Id')}</Th>
                    <Th numeric>{t('Frame Id')}</Th>
                    <Th>{t('Type')}</Th>
                    <Th>{t('Time Stamp')}</Th>
                    <Th numeric>{t('Time Delta')}</Th>
                    <Th numeric>{t('Score')}</Th>
                    <Th>{t('Thumbnail')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {s.frames.map((f) => (
                    <FrameRow key={f.id} frame={f} maxScore={s.maxScore} />
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

function Th({ children, numeric }: { children: React.ReactNode; numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={clsx(
        'px-3 py-2 text-xs font-medium text-fg-dim whitespace-nowrap',
        numeric ? 'text-end' : 'text-start',
      )}
    >
      {children}
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

function FrameRow({ frame: f, maxScore }: { frame: Frame; maxScore: number }) {
  const { formatDateTime } = useDateTimeFormat();
  const { t } = useTranslation();
  // An alarm frame is state, so it keeps its colour; everything else is grey.
  const alarm = f.type === 'Alarm';
  const pct = maxScore > 0 ? Math.round((f.score / maxScore) * 100) : 0;
  return (
    <tr
      data-testid={`frame-row-${f.frame_id}`}
      data-frame-type={f.type}
      className="border-b border-border-subtle last:border-0 hover:bg-surface-2 transition-colors"
    >
      <td className="px-3 py-1 text-end font-mono tabular-nums text-fg-muted">{f.event_id}</td>
      <td className="px-3 py-1 text-end font-mono tabular-nums text-fg">{f.frame_id}</td>
      <td className={clsx('px-3 py-1 whitespace-nowrap', alarm ? 'text-danger' : 'text-fg-muted')}>
        {f.type}
      </td>
      <td className="px-3 py-1 font-mono tabular-nums text-fg-muted whitespace-nowrap">
        {formatDateTime(f.time_stamp)}
      </td>
      <td className="px-3 py-1 text-end font-mono tabular-nums text-fg-muted">
        {Number(f.delta).toFixed(2)}
      </td>
      <td className="px-3 py-1 text-end font-mono tabular-nums">
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
      <td
        className="px-3 py-1 text-fg-faint italic whitespace-nowrap"
        title={t('Per-frame images are not served by the API yet.')}
      >
        {t('needs zm-api#26')}
      </td>
    </tr>
  );
}
