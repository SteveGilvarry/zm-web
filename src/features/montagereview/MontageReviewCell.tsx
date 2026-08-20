import { useEffect, useRef } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Download, Video } from 'lucide-react';
import { useReviewEvents, findEventAt } from './useReviewEvents';
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
}

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
}: MontageReviewCellProps) {
  const { t } = useTranslation();
  const { events, isLoading } = useReviewEvents(monitor.id, rangeStart, rangeEnd);
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
    v.playbackRate = speed;
    if (isPlaying) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [isPlaying, speed, currentEvent]);

  const token = getAuthToken();
  const downloadHref = currentEvent
    ? getEventVideoUrl(currentEvent.id, token ?? undefined)
    : null;

  return (
    <div dir="ltr" className="relative bg-abyss rounded-lg overflow-hidden border border-border-subtle aspect-video">
      {/* Monitor name overlay */}
      <div className="absolute top-2 start-2 z-10 px-2 py-1 rounded bg-black/60 backdrop-blur-sm">
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
          <div className="absolute top-2 end-2 z-10 flex items-center gap-1.5">
            <Link
              to="/events/$eventId"
              params={{ eventId: String(currentEvent.id) }}
              className="px-2 py-1 rounded bg-black/60 text-cyan text-[10px] font-mono hover:bg-black/80 transition-colors"
              title={t('Open event detail')}
            >
              #{currentEvent.id}
            </Link>
            {downloadHref && (
              <a
                href={downloadHref}
                download
                className="p-1.5 rounded bg-black/60 text-cyan hover:bg-black/80 transition-colors"
                title={t("Download this event's video")}
              >
                <Download size={12} />
              </a>
            )}
          </div>
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-text-dim">
          {isLoading ? (
            <span className="text-xs font-mono uppercase tracking-wider">{t('Loading…')}</span>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <Video size={28} className="opacity-50" />
              <span className="text-[10px] font-mono uppercase tracking-[0.18em]">
                {t('No Event')}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="absolute inset-0 scanlines pointer-events-none" />
    </div>
  );
}
