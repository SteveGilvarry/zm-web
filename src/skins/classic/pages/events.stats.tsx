import { useTranslation } from 'react-i18next';
import { ArrowLeft, RefreshCw } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import { useEventStatsPage } from '@/features/events/useEventStatsPage';
import { useCanGoBack } from '@/features/nav/useCanGoBack';
import { useDocumentTitle } from '@/skins/modern/layouts/useDocumentTitle';
import { ClassicButton } from '../components/events/primitives';
import { ClassicStatsTable } from '../components/events/ClassicStatsTable';

/**
 * Legacy `?view=stats&eid=&fid=` — classic skin. Back (greyed with nowhere
 * to go back to) and Refresh over one centred stats table (`stats.php`).
 */
export default function ClassicEventStatsPage({ eventId, frameId }: { eventId: number; frameId?: number }) {
  const { t } = useTranslation();
  const s = useEventStatsPage(eventId, frameId);
  const canGoBack = useCanGoBack();
  const title = `${t('Stats')} - ${eventId} - ${s.frameId ?? ''}`;
  useDocumentTitle(title);

  if (!s.isAuthenticated) return null;

  return (
    <AppShell title={title}>
      <main className="flex-1 p-4 overflow-auto bg-white">
        <div id="toolbar" className="flex items-center gap-1.5 mb-3">
          <ClassicButton onClick={() => window.history.back()} disabled={!canGoBack} title={t('Back')} aria-label={t('Back')}>
            <ArrowLeft size={14} className="rtl:-scale-x-100" />
          </ClassicButton>
          <ClassicButton onClick={s.refetch} title={t('Refresh')} aria-label={t('Refresh')}>
            <RefreshCw size={14} />
          </ClassicButton>
        </div>
        <QueryState
          isLoading={s.isLoading}
          isError={s.isError}
          error={s.error}
          onRetry={s.refetch}
          empty={!s.isLoading && !s.event}
          emptyMessage={t('Event was not found.')}
        >
          <ClassicStatsTable eventId={eventId} frameId={s.frameId} rows={s.rows} />
        </QueryState>
      </main>
    </AppShell>
  );
}
