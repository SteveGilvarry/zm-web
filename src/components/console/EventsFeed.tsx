import { clsx } from 'clsx';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Video, Clock, AlertTriangle } from 'lucide-react';
import { getEventThumbnailUrl } from '@/api/events';
import { getAuthToken } from '@/api/client';
import type { ZmEvent } from '@/types';
import { getOrientationStyle } from '@/types';
import { eventDurationSeconds } from '@/features/events/duration';

interface EventsFeedProps {
  events: ZmEvent[];
  isLoading?: boolean;
}

function formatTimeAgo(dateString: string, t: TFunction): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t('just now');
  if (diffMins < 60) return t('{{count}}m ago', { count: diffMins });
  if (diffHours < 24) return t('{{count}}h ago', { count: diffHours });
  return t('{{count}}d ago', { count: diffDays });
}

function formatDuration(length: number | string | null | undefined): string {
  const seconds = eventDurationSeconds(length);
  if (!seconds) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function EventsFeed({ events, isLoading }: EventsFeedProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="space-y-1">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="animate-pulse flex items-center gap-2 p-2 rounded bg-surface-2">
            <div className="w-12 h-12 bg-surface-3 rounded" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-24 bg-surface-3 rounded" />
              <div className="h-2 w-16 bg-surface-3 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-fg-dim">
        <Video size={28} className="mb-2" aria-hidden />
        <p className="text-sm">{t('No recent events')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {events.map((event) => (
        <Link
          key={event.id}
          to="/events/$eventId"
          params={{ eventId: String(event.id) }}
          className="flex items-center gap-2 p-1.5 rounded hover:bg-surface-2 transition-colors"
        >
          {/* Thumbnail. The stored JPEG is never rotated, so a camera mounted
              sideways needs the transform here — and a square box, because
              the same rail carries portrait and landscape cameras. */}
          <div className="relative w-12 h-12 rounded bg-bg-sunken overflow-hidden flex-shrink-0">
            {/* Fallback icon — shown if the thumbnail fails to load */}
            <div className="absolute inset-0 flex items-center justify-center">
              <Video size={16} className="text-fg-faint" aria-hidden />
            </div>
            <img
              src={getEventThumbnailUrl(event.id, getAuthToken() ?? undefined)}
              alt=""
              data-testid="feed-thumb"
              className="absolute inset-0 w-full h-full object-contain"
              style={getOrientationStyle(event.orientation)}
              loading="lazy"
              onLoad={(e) => {
                (e.target as HTMLImageElement).style.visibility = 'visible';
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.visibility = 'hidden';
              }}
            />
            {/* A score past the alarm threshold is state, so it takes colour. */}
            {event.max_score && event.max_score > 50 && (
              <div className="absolute top-0.5 end-0.5">
                <AlertTriangle size={10} className="text-warn" aria-hidden />
              </div>
            )}
          </div>

          {/* Event info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm text-fg truncate">{event.name}</span>
              {event.cause && (
                <span
                  className={clsx(
                    'text-xs px-1.5 py-0.5 rounded whitespace-nowrap',
                    // "Alarm" is the only cause that is a state; the rest
                    // (Continuous, Forced Web…) are just labels.
                    event.cause === 'Alarm'
                      ? 'bg-danger/15 text-danger'
                      : 'bg-surface-2 text-fg-dim',
                  )}
                >
                  {event.cause}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-xs text-fg-dim flex items-center gap-1">
                <Clock size={10} aria-hidden />
                {event.start_date_time ? formatTimeAgo(event.start_date_time, t) : t('Unknown')}
              </span>
              <span className="text-xs font-mono tabular-nums text-fg-dim">
                {formatDuration(event.length)}
              </span>
              {event.max_score != null && (
                <span
                  className={clsx(
                    'text-xs font-mono tabular-nums',
                    event.max_score > 100
                      ? 'text-danger'
                      : event.max_score > 50
                        ? 'text-warn'
                        : 'text-fg-dim',
                  )}
                >
                  {event.max_score}
                </span>
              )}
            </div>
          </div>

          {/* Monitor indicator */}
          <div className="text-xs font-mono text-fg-faint">
            {t('M{{id}}', { id: event.monitor_id })}
          </div>
        </Link>
      ))}
    </div>
  );
}
