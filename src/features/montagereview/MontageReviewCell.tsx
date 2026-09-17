import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { Link, useNavigate, useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Download, Video } from 'lucide-react';
import { useReviewEvents, findEventAt, DEFAULT_REVIEW_FILTERS, type ReviewEventFilters } from './useReviewEvents';
import { playbackRateFor } from './useReviewClock';
import { getEventVideoUrl } from '@/api/events';
import { getAuthToken } from '@/api/client';
import { getOrientationStyle } from '@/types';
import type { Monitor } from '@/types';

interface MontageReviewCellProps {
  monitor: Monitor;
  currentTime: Date;
  rangeStart: Date;
  rangeEnd: Date;
  isPlaying: boolean;
  speed: number;
  /** Archived / Tags / Notes filters from the toolbar. */
  filters?: ReviewEventFilters;
  /**
   * Fill the parent instead of holding a 16:9 shape — the fitted wall sizes
   * every cell itself, so the cell must take the height it is given.
   */
  fill?: boolean;
  /**
   * Legacy `clickMonitor`: the top-left quarter zooms in by 15 %, the
   * top-right quarter back out. Without a handler the corners behave like
   * the rest of the cell (the modern grid sizes its own cells).
   */
  onZoom?: (factor: number) => void;
}

/** Legacy `clickMonitor`: ±15 % per corner click. */
export const REVIEW_ZOOM_STEP = 1.15;

/**
 * One monitor's tile in the Review grid. Renders the past-event MP4 currently
 * spanning the master playhead, or an explicit "No Event" placeholder when
 * the monitor didn't record at that moment.
 *
 * Each cell syncs to the master clock: video.currentTime is set to the
 * offset within the current event whenever the playhead drifts >1 s from
 * what the video is doing on its own. Play/pause/playbackRate follow the
 * master state. Re-seeking happens only when needed to avoid stutter.
 */
export function MontageReviewCell({
  monitor,
  currentTime,
  rangeStart,
  rangeEnd,
  isPlaying,
  speed,
  filters = DEFAULT_REVIEW_FILTERS,
  fill = false,
  onZoom,
}: MontageReviewCellProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const router = useRouter();
  const { events, isLoading } = useReviewEvents(monitor.id, rangeStart, rangeEnd, filters);
  const currentEvent = findEventAt(events, currentTime);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Sync to the master clock — only re-seek when the drift would be visible.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !currentEvent || !currentEvent.start_date_time) return;
    const eventStart = Date.parse(currentEvent.start_date_time);
    if (isNaN(eventStart)) return;
    const targetSec = (currentTime.getTime() - eventStart) / 1000;
    if (Number.isFinite(targetSec) && Math.abs(v.currentTime - targetSec) > 1) {
      try { v.currentTime = Math.max(0, targetSec); } catch { /* ignore */ }
    }
  }, [currentTime, currentEvent]);

  // Match master play state.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !currentEvent) return;
    // Above ~16× the browser refuses to decode, so the cell stops playing
    // faster and the clock's seeks step it through the event instead.
    v.playbackRate = playbackRateFor(speed) || 1;
    if (isPlaying) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [isPlaying, speed, currentEvent]);

  // Legacy `clickMonitor` + `showOneMonitor`: the two top corners zoom the
  // one monitor, anything else opens what is under the playhead — the event
  // if the monitor was recording, its Watch page otherwise. Ctrl/⌘ opens a
  // new tab.
  const target = currentEvent
    ? { to: '/events/$eventId' as const, params: { eventId: String(currentEvent.id) } }
    : { to: '/monitors/$monitorId' as const, params: { monitorId: String(monitor.id) } };

  const handleClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    // The #id link and the download icon are their own targets.
    if ((e.target as HTMLElement).closest('a,button')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (onZoom && rect.width > 0 && y < rect.height / 4) {
      if (x < rect.width / 4) { onZoom(REVIEW_ZOOM_STEP); return; }
      if (x > (rect.width * 3) / 4) { onZoom(1 / REVIEW_ZOOM_STEP); return; }
    }
    if (e.ctrlKey || e.metaKey) {
      window.open(router.buildLocation(target).href, '_blank', 'noopener');
      return;
    }
    void navigate(target);
  };

  const token = getAuthToken();
  const downloadHref = currentEvent
    ? getEventVideoUrl(currentEvent.id, token ?? undefined)
    : null;

  return (
    <div
      dir="ltr"
      className={`relative bg-bg-sunken rounded overflow-hidden border border-border-subtle cursor-pointer ${fill ? 'w-full h-full' : 'aspect-video'}`}
      onClick={handleClick}
      data-testid={`review-cell-${monitor.id}`}
    >
      {/* Monitor name overlay */}
      <div className="absolute top-1.5 start-1.5 z-10 px-1.5 py-0.5 rounded bg-black/60">
        <span className="text-xs font-medium text-white">{monitor.name}</span>
      </div>

      {currentEvent ? (
        <>
          <video
            ref={videoRef}
            key={currentEvent.id}
            src={getEventVideoUrl(currentEvent.id, token ?? undefined)}
            className="w-full h-full object-contain bg-black"
            style={getOrientationStyle(monitor.orientation)}
            muted
            playsInline
            preload="auto"
          />
          {/* Download + event info */}
          <div className="absolute top-1.5 end-1.5 z-10 flex items-center gap-1">
            <Link
              to="/events/$eventId"
              params={{ eventId: String(currentEvent.id) }}
              className="px-1.5 py-0.5 rounded bg-black/60 text-white text-xs font-mono tabular-nums hover:bg-black/80 transition-colors"
              title={t('Open event detail')}
            >
              #{currentEvent.id}
            </Link>
            {downloadHref && (
              <a
                href={downloadHref}
                download
                className="p-1 rounded bg-black/60 text-white hover:bg-black/80 transition-colors"
                title={t("Download this event's video")}
              >
                <Download size={12} />
              </a>
            )}
          </div>
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-fg-faint">
          {isLoading ? (
            <span className="text-xs">{t('Loading…')}</span>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <Video size={28} className="opacity-50" />
              <span className="text-xs">
                {t('No Event')}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
