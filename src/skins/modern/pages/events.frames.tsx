import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronLeft, ChevronRight, Film } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { QueryState } from '@/components/common/QueryState';
import type { Frame } from '@/api/frames';
import { useEventFramesPage } from '@/features/events/useEventFramesPage';
import { useDocumentTitle } from '../layouts/useDocumentTitle';

/** Legacy `?view=frames` — Mission Control. One row per captured frame. */
export default function EventFramesPage({ eventId }: { eventId: number }) {
  const { t } = useTranslation();
  const s = useEventFramesPage(eventId);
  const title = t('Frames — Event {{id}}', { id: eventId });
  useDocumentTitle(title);

  if (!s.isAuthenticated) return null;

  return (
    <AppShell title={title}>
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <Link
              to="/events/$eventId"
              params={{ eventId: String(eventId) }}
              className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-cyan transition-colors"
            >
              <ArrowLeft size={12} className="rtl:-scale-x-100" />
              {t('Back to event')}
            </Link>
            <h1 className="text-lg font-semibold text-text-primary">{title}</h1>
            {s.event && (
              <span className="text-xs font-mono text-text-muted">{s.event.name}</span>
            )}
          </div>

          <label className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">
            {t('Per page')}
            <select
              aria-label={t('Rows per page')}
              value={s.pageSize}
              onChange={(e) => s.setPageSize(Number(e.target.value))}
              className="px-2 py-1 text-xs bg-surface border border-border-subtle rounded-md text-text-primary focus:outline-none focus:border-cyan/50"
            >
              {s.pageSizeOptions.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>

        <Panel icon={<Film size={16} />} noPadding>
          <QueryState
            isLoading={s.isLoading}
            isError={s.isError}
            error={s.error}
            onRetry={s.refetch}
            empty={s.frames.length === 0}
            emptyMessage={t('No frames recorded for this event.')}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-xs" data-testid="frames-table">
                <thead className="bg-surface/70 border-b border-border-subtle">
                  <tr className="text-text-muted">
                    <Th>{t('Event Id')}</Th>
                    <Th>{t('Frame Id')}</Th>
                    <Th>{t('Type')}</Th>
                    <Th>{t('Time Stamp')}</Th>
                    <Th>{t('Time Delta')}</Th>
                    <Th>{t('Score')}</Th>
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

          {s.totalPages > 1 && (
            <div className="flex items-center justify-between px-3 py-2 border-t border-border-subtle">
              <span className="text-[11px] text-text-muted font-mono">
                {t('Page {{page}} / {{totalPages}} · {{total}} frames', {
                  page: s.page, totalPages: s.totalPages, total: s.total,
                })}
              </span>
              <div className="flex items-center gap-1">
                <PagerBtn
                  onClick={() => s.setPage(s.page - 1)}
                  disabled={s.page <= 1}
                  label={t('Previous page')}
                >
                  <ChevronLeft size={12} className="rtl:-scale-x-100" />
                </PagerBtn>
                <PagerBtn
                  onClick={() => s.setPage(s.page + 1)}
                  disabled={s.page >= s.totalPages}
                  label={t('Next page')}
                >
                  <ChevronRight size={12} className="rtl:-scale-x-100" />
                </PagerBtn>
              </div>
            </div>
          )}
        </Panel>
      </main>
    </AppShell>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-start font-mono font-semibold uppercase tracking-wider text-[10px]">
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
        'p-1 rounded border transition-colors',
        disabled
          ? 'border-border-subtle text-text-dim cursor-not-allowed'
          : 'border-border-subtle text-text-secondary hover:border-cyan/40 hover:text-cyan',
      )}
    >
      {children}
    </button>
  );
}

function FrameRow({ frame: f, maxScore }: { frame: Frame; maxScore: number }) {
  const { t } = useTranslation();
  const alarm = f.type === 'Alarm';
  const pct = maxScore > 0 ? Math.round((f.score / maxScore) * 100) : 0;
  return (
    <tr
      data-testid={`frame-row-${f.frame_id}`}
      data-frame-type={f.type}
      className={clsx(
        'border-b border-border-subtle/50 hover:bg-surface/40 transition-colors',
        alarm && 'bg-crimson/10',
      )}
    >
      <td className="px-3 py-1.5 font-mono text-text-muted tabular-nums">{f.event_id}</td>
      <td className="px-3 py-1.5 font-mono text-text-primary tabular-nums">{f.frame_id}</td>
      <td className={clsx('px-3 py-1.5 font-mono', alarm ? 'text-crimson' : 'text-text-secondary')}>
        {f.type}
      </td>
      <td className="px-3 py-1.5 font-mono text-text-muted whitespace-nowrap">
        {new Date(f.time_stamp).toLocaleString()}
      </td>
      <td className="px-3 py-1.5 font-mono text-text-muted tabular-nums">
        {Number(f.delta).toFixed(2)}
      </td>
      <td className="px-3 py-1.5 font-mono tabular-nums">
        <span className="inline-flex items-center gap-2">
          <span className={alarm ? 'text-crimson' : 'text-text-primary'}>{f.score}</span>
          <span
            aria-hidden
            className="inline-block h-1.5 w-16 rounded-full bg-surface overflow-hidden"
          >
            <span
              className={clsx('block h-full rounded-full', alarm ? 'bg-crimson' : 'bg-cyan/60')}
              style={{ width: `${pct}%` }}
            />
          </span>
        </span>
      </td>
      <td
        className="px-3 py-1.5 text-text-dim italic whitespace-nowrap"
        title={t('Per-frame images are not served by the API yet.')}
      >
        {t('needs zm-api#26')}
      </td>
    </tr>
  );
}
