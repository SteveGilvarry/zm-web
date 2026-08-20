import { clsx } from 'clsx';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Video, Clock, AlertTriangle } from 'lucide-react';
import { getEventThumbnailUrl } from '@/api/events';
import { getAuthToken } from '@/api/client';
import type { ZmEvent } from '@/types';

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

function formatDuration(seconds?: number): string {
  if (!seconds) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function EventsFeed({ events, isLoading }: EventsFeedProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="animate-pulse flex items-center gap-3 p-3 rounded-lg bg-panel/50"
          >
            <div className="w-16 h-10 bg-border/30 rounded" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-24 bg-border/30 rounded" />
              <div className="h-2 w-16 bg-border/30 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-text-muted">
        <Video size={32} className="mb-2 opacity-50" />
        <p className="text-sm">{t('No recent events')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {events.map((event, index) => (
        <Link
          key={event.id}
          to="/events/$eventId"
          params={{ eventId: String(event.id) }}
          className={clsx(
            'flex items-center gap-3 p-3 rounded-lg',
            'bg-panel/50 border border-transparent',
            'transition-all duration-fast',
            'hover:bg-panel hover:border-border-subtle',
            'animate-fade-in'
          )}
          style={{ animationDelay: `${index * 50}ms` }}
        >
          {/* Thumbnail */}
          <div className="relative w-16 h-10 rounded bg-abyss overflow-hidden flex-shrink-0">
            {/* Fallback icon — shown if the thumbnail fails to load */}
            <div className="absolute inset-0 flex items-center justify-center">
              <Video size={16} className="text-text-dim" />
            </div>
            <img
              src={getEventThumbnailUrl(event.id, getAuthToken() ?? undefined)}
              alt={event.name}
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
              onLoad={(e) => {
                (e.target as HTMLImageElement).style.visibility = 'visible';
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.visibility = 'hidden';
              }}
            />
            {/* Score indicator */}
            {event.max_score && event.max_score > 50 && (
              <div className="absolute top-0.5 end-0.5">
                <AlertTriangle size={10} className="text-amber" />
              </div>
            )}
          </div>

          {/* Event info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-text-primary truncate">
                {event.name}
              </span>
              {event.cause && (
                <span
                  className={clsx(
                    'text-[10px] font-mono px-1.5 py-0.5 rounded',
                    event.cause === 'Alarm' ? 'bg-crimson/20 text-crimson' : 'bg-amber/20 text-amber'
                  )}
                >
                  {event.cause}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-xs text-text-muted flex items-center gap-1">
                <Clock size={10} />
                {event.start_date_time ? formatTimeAgo(event.start_date_time, t) : t('Unknown')}
              </span>
              <span className="text-xs text-text-muted">
                {formatDuration(event.length)}
              </span>
              {event.max_score != null && (
                <span
                  className={clsx(
                    'text-xs font-mono',
                    event.max_score > 100 ? 'text-crimson' : event.max_score > 50 ? 'text-amber' : 'text-text-muted'
                  )}
                >
                  {event.max_score}
                </span>
              )}
            </div>
          </div>

          {/* Monitor indicator */}
          <div className="text-xs font-mono text-text-dim">
            {t('M{{id}}', { id: event.monitor_id })}
          </div>
        </Link>
      ))}
    </div>
  );
}
