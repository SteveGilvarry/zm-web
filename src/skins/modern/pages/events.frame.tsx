import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Film, RefreshCw, Table2,
} from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import { useScaleOptions } from '@/features/events/playbackOptions';
import { useEventFramePage } from '@/features/events/useEventFramePage';
import type { PlaybackScale } from '@/stores/eventPlayback';
import { StatsTable } from '../components/StatsTable';
import { useDocumentTitle } from '../layouts/useDocumentTitle';

const iconBtn = 'shrink-0 p-1 rounded text-fg-dim hover:text-fg transition-colors disabled:text-fg-faint disabled:cursor-not-allowed';

/**
 * Legacy `?view=frame` — modern skin. The chrome line carries the frame
 * stepper (first / prev / next / last), the scale, and the way out to the
 * frames table and the stats page; the frame fills the region with its
 * per-zone stats under it.
 */
export default function EventFramePage({ eventId, frameId }: { eventId: number; frameId: number }) {
  const { t } = useTranslation();
  const s = useEventFramePage(eventId, frameId);
  const scaleOptions = useScaleOptions();
  const [imageFailed, setImageFailed] = useState<string | null>(null);
  const fid = s.frameId;
  const title = t('Frame {{eventId}}-{{frameId}}', { eventId, frameId: fid ?? '—' });
  useDocumentTitle(title);

  if (!s.isAuthenticated) return null;
  const n = s.neighbours;

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
          <span className="text-xs text-fg-dim font-mono tabular-nums" data-testid="frame-score">
            {t('score {{score}}', { score: s.score })}
          </span>

          <div dir="ltr" className="flex items-center gap-0.5">
            <button type="button" className={iconBtn} disabled={!n.canBack} onClick={() => s.goToFrame(n.first)} aria-label={t('First')} title={t('First')}>
              <ChevronsLeft size={14} />
            </button>
            <button type="button" className={iconBtn} disabled={!n.canBack || n.prev == null} onClick={() => s.goToFrame(n.prev)} aria-label={t('Prev')} title={t('Prev')}>
              <ChevronLeft size={14} />
            </button>
            <button type="button" className={iconBtn} disabled={!n.canForward || n.next == null} onClick={() => s.goToFrame(n.next)} aria-label={t('Next')} title={t('Next')}>
              <ChevronRight size={14} />
            </button>
            <button type="button" className={iconBtn} disabled={!n.canForward} onClick={() => s.goToFrame(n.last)} aria-label={t('Last')} title={t('Last')}>
              <ChevronsRight size={14} />
            </button>
          </div>

          <label className="ms-auto shrink-0 flex items-center gap-1 text-xs text-fg-dim">
            {t('Scale')}
            <select
              aria-label={t('Scale')}
              value={s.scale}
              onChange={(e) => s.setScale(e.target.value as PlaybackScale)}
              className="bg-surface border border-border-subtle rounded text-fg px-1 py-0.5 text-xs focus:outline-none focus:border-accent"
            >
              {scaleOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <button
            type="button"
            onClick={() => s.setShowStats(!s.showStats)}
            aria-pressed={s.showStats}
            className={clsx(
              'shrink-0 px-2 py-0.5 rounded text-xs transition-colors',
              s.showStats ? 'bg-accent/15 text-accent' : 'text-fg-dim hover:text-fg',
            )}
          >
            {t('Stats')}
          </button>
          <Link
            to="/events/$eventId/stats"
            params={{ eventId: String(eventId) }}
            search={{ fid: fid ?? undefined }}
            aria-label={t('Stats View')}
            title={t('Stats View')}
            className={iconBtn}
          >
            <Table2 size={14} aria-hidden />
          </Link>
          <Link
            to="/events/$eventId/frames"
            params={{ eventId: String(eventId) }}
            aria-label={t('Frames')}
            title={t('Frames')}
            className={iconBtn}
          >
            <Film size={14} aria-hidden />
          </Link>
          <button type="button" onClick={s.refetch} aria-label={t('Refresh')} title={t('Refresh')} className={iconBtn}>
            <RefreshCw size={14} aria-hidden />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-3 space-y-3">
          <QueryState
            isLoading={s.isLoading}
            isError={s.isError}
            error={s.error}
            onRetry={s.refetch}
            empty={!s.isLoading && !s.event}
            emptyMessage={t('Event was not found.')}
          >
            <div dir="ltr" className="mx-auto bg-black" style={{ maxWidth: s.imageMaxWidth }}>
              {s.imageUrl && imageFailed !== s.imageUrl ? (
                <img
                  data-testid="frame-image"
                  src={s.imageUrl}
                  alt={t('Frame {{n}}', { n: fid })}
                  onError={() => setImageFailed(s.imageUrl)}
                  className="block w-full h-auto"
                />
              ) : (
                <p className="py-12 text-center text-sm text-white/80">{t('No stored image for this frame.')}</p>
              )}
            </div>
            {s.showStats && (
              <StatsTable rows={s.stats} isLoading={s.statsLoading} testId="frame-stats-table" />
            )}
          </QueryState>
        </div>
      </main>
    </AppShell>
  );
}
