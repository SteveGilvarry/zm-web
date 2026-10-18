import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Image as ImageIcon, RefreshCw } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import { useEventStatsPage } from '@/features/events/useEventStatsPage';
import { StatsTable } from '../components/StatsTable';
import { useDocumentTitle } from '../layouts/useDocumentTitle';

/**
 * Legacy `?view=stats` — modern skin. One line of chrome (back, title, a
 * link to the frame itself, refresh) over the per-zone table.
 */
export default function EventStatsPage({ eventId, frameId }: { eventId: number; frameId?: number }) {
  const { t } = useTranslation();
  const s = useEventStatsPage(eventId, frameId);
  const title = t('Stats — Event {{eventId}}, frame {{frameId}}', { eventId, frameId: s.frameId ?? '—' });
  useDocumentTitle(title);

  if (!s.isAuthenticated) return null;

  return (
    <AppShell title={title}>
      <main className="flex-1 min-h-0 flex flex-col">
        <div className="flex items-center gap-3 px-3 h-11 shrink-0 border-b border-border-subtle bg-surface">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-1.5 text-xs text-fg-dim hover:text-fg transition-colors"
          >
            <ArrowLeft size={14} className="rtl:-scale-x-100" aria-hidden />
            {t('Back')}
          </button>
          <h1 className="text-sm font-medium text-fg truncate">{title}</h1>
          {s.frameId != null && (
            <Link
              to="/events/$eventId/frames/$frameId"
              params={{ eventId: String(eventId), frameId: String(s.frameId) }}
              className="ms-auto inline-flex items-center gap-1.5 text-xs text-fg-dim hover:text-fg transition-colors"
            >
              <ImageIcon size={14} aria-hidden />
              {t('View frame')}
            </Link>
          )}
          <button
            type="button"
            onClick={s.refetch}
            aria-label={t('Refresh')}
            title={t('Refresh')}
            className={clsx(s.frameId == null && 'ms-auto', 'shrink-0 p-1 rounded text-fg-dim hover:text-fg transition-colors')}
          >
            <RefreshCw size={14} aria-hidden />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto p-3">
          <QueryState
            isLoading={s.isLoading}
            isError={s.isError}
            error={s.error}
            onRetry={s.refetch}
            empty={!s.isLoading && !s.event}
            emptyMessage={t('Event was not found.')}
          >
            <StatsTable rows={s.rows} />
          </QueryState>
        </div>
      </main>
    </AppShell>
  );
}
