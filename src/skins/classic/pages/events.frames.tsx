import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';

import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import type { Frame } from '@/api/frames';
import { useEventFramesPage } from '@/features/events/useEventFramesPage';
import { useDateTimeFormat } from '@/features/config/useDateTimeFormat';
import { useDocumentTitle } from '@/skins/modern/layouts/useDocumentTitle';
import {
  ClassicPageTitle, ClassicPager, ClassicTable, ClassicTbody, ClassicTd, ClassicTh, ClassicThead,
} from '../components/events/primitives';
import { classicLink } from '../components/events/styles';

/** Legacy `?view=frames` — classic skin. Striped white table, alarm rows in red. */
export default function EventFramesPage({ eventId }: { eventId: number }) {
  const { t } = useTranslation();
  const s = useEventFramesPage(eventId);
  const title = t('Frames — Event {{id}}', { id: eventId });
  useDocumentTitle(title);

  if (!s.isAuthenticated) return null;

  return (
    <AppShell title={title}>
      <main className="flex-1 p-4 overflow-auto bg-zinc-50">
        <div className="max-w-screen-2xl mx-auto space-y-4">
          <ClassicPageTitle
            actions={
              <Link
                to="/events/$eventId"
                params={{ eventId: String(eventId) }}
                className={clsx(classicLink, 'text-sm')}
              >
                {t('Back to event')}
              </Link>
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
                  <ClassicTh numeric>{t('Event Id')}</ClassicTh>
                  <ClassicTh numeric>{t('Frame Id')}</ClassicTh>
                  <ClassicTh>{t('Type')}</ClassicTh>
                  <ClassicTh>{t('Time Stamp')}</ClassicTh>
                  <ClassicTh numeric>{t('Time Delta')}</ClassicTh>
                  <ClassicTh numeric>{t('Score')}</ClassicTh>
                  <ClassicTh center>{t('Thumbnail')}</ClassicTh>
                </tr>
              </ClassicThead>
              <ClassicTbody>
                {s.frames.map((f) => (
                  <FrameRow key={f.id} frame={f} maxScore={s.maxScore} />
                ))}
              </ClassicTbody>
            </ClassicTable>
          </QueryState>

          <ClassicPager
            page={s.page}
            pageSize={s.pageSize}
            total={s.total}
            totalPages={s.totalPages}
            pageSizeOptions={s.pageSizeOptions}
            onPage={s.setPage}
            onPageSize={s.setPageSize}
            shown={s.frames.length}
          />
        </div>
      </main>
    </AppShell>
  );
}

function FrameRow({ frame: f, maxScore }: { frame: Frame; maxScore: number }) {
  const { formatDateTime } = useDateTimeFormat();
  const { t } = useTranslation();
  const alarm = f.type === 'Alarm';
  const pct = maxScore > 0 ? Math.round((f.score / maxScore) * 100) : 0;
  return (
    <tr
      data-testid={`frame-row-${f.frame_id}`}
      data-frame-type={f.type}
      // Legacy colours alarm frames with bootstrap's "danger" row tint. The
      // important-flag beats the striped/hover backgrounds from ClassicTbody.
      className={alarm ? 'bg-[#f8d7da]! text-[#721c24]' : undefined}
    >
      <ClassicTd numeric>{f.event_id}</ClassicTd>
      <ClassicTd numeric>{f.frame_id}</ClassicTd>
      <ClassicTd>{f.type}</ClassicTd>
      <ClassicTd className="whitespace-nowrap">{formatDateTime(f.time_stamp)}</ClassicTd>
      <ClassicTd numeric>{Number(f.delta).toFixed(2)}</ClassicTd>
      <ClassicTd numeric>
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
      <ClassicTd
        center
        className="text-zinc-400 italic whitespace-nowrap"
        title={t('Per-frame images are not served by the API yet.')}
      >
        {t('needs zm-api#26')}
      </ClassicTd>
    </tr>
  );
}
