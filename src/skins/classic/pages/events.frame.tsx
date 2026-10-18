import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Film, Info, RefreshCw, Table2 } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import { useStatsColumnLabels } from '@/features/events/columnLabels';
import { useScaleOptions } from '@/features/events/playbackOptions';
import { useEventFramePage } from '@/features/events/useEventFramePage';
import { useCanGoBack } from '@/features/nav/useCanGoBack';
import type { PlaybackScale } from '@/stores/eventPlayback';
import { useDocumentTitle } from '@/skins/modern/layouts/useDocumentTitle';
import { ClassicButton } from '../components/events/primitives';
import { classicLink, classicSelect } from '../components/events/styles';

/** Legacy's `#controls` links: `btn-primary` anchors, `disabled` at the ends. */
const navLink = (enabled: boolean) => clsx(
  'inline-block px-3 py-1 text-sm border rounded-sm',
  enabled
    ? 'bg-[#337ab7] border-[#2e6da4] text-white hover:bg-[#286090] cursor-pointer'
    : 'bg-[#337ab7] border-[#2e6da4] text-white opacity-65 cursor-not-allowed pointer-events-none',
);

/**
 * Legacy `?view=frame&eid=&fid=` — classic skin (`views/frame.php`): Back,
 * Frames, Refresh, Stats and Stats View over the title `Frame <eid>-<fid>
 * (<score>)` and a Scale select; the frame's stats table beside the JPEG,
 * and First / Prev / Next / Last under it.
 */
export default function ClassicEventFramePage({ eventId, frameId }: { eventId: number; frameId: number }) {
  const { t } = useTranslation();
  const s = useEventFramePage(eventId, frameId);
  const scaleOptions = useScaleOptions();
  const labels = useStatsColumnLabels();
  const canGoBack = useCanGoBack();
  const [imageFailed, setImageFailed] = useState<string | null>(null);
  const fid = s.frameId;
  const title = `${t('Frame')} - ${eventId} - ${fid ?? ''}`;
  useDocumentTitle(title);

  if (!s.isAuthenticated) return null;

  const noStats = !s.statsLoading && s.stats.length === 0;
  const n = s.neighbours;

  return (
    <AppShell title={title}>
      <main className="flex-1 overflow-auto bg-white text-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-3 px-3 pt-1">
          <div id="toolbar" className="flex items-center gap-1">
            <ClassicButton onClick={() => window.history.back()} disabled={!canGoBack} title={t('Back')} aria-label={t('Back')}>
              <ArrowLeft size={14} className="rtl:-scale-x-100" />
            </ClassicButton>
            <Link
              to="/events/$eventId/frames"
              params={{ eventId: String(eventId) }}
              title={t('Frames')}
              aria-label={t('Frames')}
              className="inline-flex items-center px-3 py-1.5 border rounded-sm bg-[#e9ecef] border-[#adb5bd] text-zinc-800 hover:bg-[#dde1e5]"
            >
              <Film size={14} />
            </Link>
            <ClassicButton onClick={s.refetch} title={t('Refresh')} aria-label={t('Refresh')}>
              <RefreshCw size={14} />
            </ClassicButton>
            <ClassicButton
              onClick={() => s.setShowStats(!s.showStats)}
              aria-pressed={s.showStats}
              disabled={noStats}
              title={noStats ? t('No statistics available for this frame') : t('Stats')}
              aria-label={t('Stats')}
            >
              <Info size={14} />
            </ClassicButton>
            <Link
              to="/events/$eventId/stats"
              params={{ eventId: String(eventId) }}
              search={{ fid: fid ?? undefined }}
              title={t('Stats View')}
              aria-label={t('Stats View')}
              className="inline-flex items-center px-3 py-1.5 border rounded-sm bg-[#e9ecef] border-[#adb5bd] text-zinc-800 hover:bg-[#dde1e5]"
            >
              <Table2 size={14} />
            </Link>
          </div>
          <h2 className="text-xl font-semibold" data-testid="frame-title">
            {t('Frame')}{' '}
            <span title={t('Event Id')}>{eventId}</span>-<span title={t('Frame Id')}>{fid ?? ''}</span>
            {' ('}<span title={t('Score')}>{s.score}</span>{')'}
          </h2>
          <label className="flex items-center gap-1 text-sm">
            <span>{t('Scale')}</span>
            <select
              aria-label={t('Scale')}
              value={s.scale}
              onChange={(e) => s.setScale(e.target.value as PlaybackScale)}
              className={clsx(classicSelect, 'py-0.5')}
            >
              {scaleOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        </div>

        <QueryState
          isLoading={s.isLoading}
          isError={s.isError}
          error={s.error}
          onRetry={s.refetch}
          empty={!s.isLoading && !s.event}
          emptyMessage={t('Event was not found.')}
        >
          <div className="flex flex-col md:flex-row justify-center gap-3 p-3">
            {s.showStats && s.stats.length > 0 && (
              <table data-testid="frame-stats-table" className="self-start text-sm">
                {s.stats.map((row) => (
                  <tbody key={row.id} className="[&>tr>th]:text-end [&>tr>th]:pe-3 [&>tr>th]:py-0.5 [&>tr>th]:font-semibold [&>tr>td]:py-0.5 [&>tr>td]:tabular-nums">
                    <tr>
                      <th scope="row">{t('Event Id')}</th>
                      <td><Link to="/events/$eventId" params={{ eventId: String(row.eventId) }} className={classicLink}>{row.eventId}</Link></td>
                    </tr>
                    <tr>
                      <th scope="row">{t('Frame Id')}</th>
                      <td>
                        <Link
                          to="/events/$eventId/frames/$frameId"
                          params={{ eventId: String(row.eventId), frameId: String(row.frameId) }}
                          className={classicLink}
                        >
                          {row.frameId}
                        </Link>
                      </td>
                    </tr>
                    <tr><th scope="row">{labels.zoneName}</th><td>{row.zoneName}</td></tr>
                    <tr><th scope="row">{labels.pixelDiff}</th><td>{row.pixelDiff}</td></tr>
                    <tr><th scope="row">{labels.alarmPx}</th><td>{row.alarmPx}</td></tr>
                    <tr><th scope="row">{labels.filterPx}</th><td>{row.filterPx}</td></tr>
                    <tr><th scope="row">{labels.blobPx}</th><td>{row.blobPx}</td></tr>
                    <tr><th scope="row">{labels.blobs}</th><td>{row.blobs}</td></tr>
                    <tr><th scope="row">{labels.blobSizes}</th><td>{row.blobSizes}</td></tr>
                    <tr><th scope="row">{labels.alarmLimits}</th><td>{row.alarmLimits}</td></tr>
                    <tr><th scope="row">{labels.score}</th><td>{row.score}</td></tr>
                  </tbody>
                ))}
              </table>
            )}
            <div className="min-w-0">
              <p id="image" className="mb-2">
                {s.imageUrl && imageFailed !== s.imageUrl ? (
                  <img
                    data-testid="frame-image"
                    src={s.imageUrl}
                    alt={`${eventId}-${fid}`}
                    onError={() => setImageFailed(s.imageUrl)}
                    className="block h-auto w-full"
                    style={{ maxWidth: s.imageMaxWidth }}
                  />
                ) : (
                  <span className="text-zinc-600">{t('No stored image for this frame.')}</span>
                )}
              </p>
              <p id="controls" className="flex justify-center gap-1">
                <FrameLink eventId={eventId} to={n.first} enabled={n.canBack} label={t('First')} />
                <FrameLink eventId={eventId} to={n.prev} enabled={n.canBack} label={t('Prev')} />
                <FrameLink eventId={eventId} to={n.next} enabled={n.canForward} label={t('Next')} />
                <FrameLink eventId={eventId} to={n.last} enabled={n.canForward} label={t('Last')} />
              </p>
            </div>
          </div>
        </QueryState>
      </main>
    </AppShell>
  );
}

function FrameLink({ eventId, to, enabled, label }: {
  eventId: number; to: number | null; enabled: boolean; label: string;
}) {
  if (!enabled || to == null) {
    return <a aria-disabled="true" className={navLink(false)}>{label}</a>;
  }
  return (
    <Link
      to="/events/$eventId/frames/$frameId"
      params={{ eventId: String(eventId), frameId: String(to) }}
      className={navLink(true)}
    >
      {label}
    </Link>
  );
}
