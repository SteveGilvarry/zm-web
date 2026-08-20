import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import {
  Calendar,
  Clock,
  Monitor,
  Play,
  Archive,
  Tag as TagIcon,
  Download,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import { getEventThumbnailUrl, getEventVideoUrl } from '@/api/events';
import type { ZmEvent } from '@/types';
import { eventDurationSeconds } from '@/features/events/duration';

// Rotation transform for events-list thumbnails (square layout footprint,
// object-contain). No scale factor — the 1:1 footprint already handles
// letterbox/pillarbox via object-contain.
function thumbnailRotationStyle(orientation?: string | null): CSSProperties | undefined {
  if (!orientation) return undefined;
  const norm = orientation.replace(/[_\s]/g, '').toLowerCase();
  switch (norm) {
    case 'rotate90':  return { transform: 'rotate(90deg)' };
    case 'rotate180': return { transform: 'rotate(180deg)' };
    case 'rotate270': return { transform: 'rotate(270deg)' };
    case 'fliphori':
    case 'fliphorizontal': return { transform: 'scaleX(-1)' };
    case 'flipvert':
    case 'flipvertical':   return { transform: 'scaleY(-1)' };
    default: return undefined;
  }
}

/** One row of the Mission Control events list: thumbnail, meta, scores, download. */
export function EventCard({
  event,
  monitorName,
  token,
  isSelected,
  onToggleSelected,
}: {
  event: ZmEvent;
  monitorName: string;
  token?: string | null;
  isSelected: boolean;
  onToggleSelected: () => void;
}) {
  const { t } = useTranslation();
  const startTime = event.start_date_time ? new Date(event.start_date_time) : null;
  const endTime = event.end_date_time ? new Date(event.end_date_time) : null;
  const duration = eventDurationSeconds(event.length) || null;

  const getCauseColor = (cause: string) => {
    const lowerCause = cause.toLowerCase();
    if (lowerCause.includes('motion')) return 'bg-amber/20 text-amber';
    if (lowerCause.includes('alarm')) return 'bg-crimson/20 text-crimson';
    if (lowerCause.includes('continuous')) return 'bg-cyan/20 text-cyan';
    return 'bg-text-muted/20 text-text-secondary';
  };

  return (
    <div
      className={clsx(
        'flex items-center gap-3 p-4 group',
        'bg-surface border rounded-xl',
        'transition-all duration-base',
        isSelected
          ? 'border-cyan/60 shadow-lg shadow-cyan/10'
          : 'border-border-subtle hover:border-cyan/50 hover:shadow-lg hover:shadow-cyan/10',
      )}
    >
      {/* Selection checkbox — opt-in, doesn't compete with the Link target */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleSelected(); }}
        aria-label={isSelected ? t('Deselect event') : t('Select event')}
        className={clsx(
          'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0',
          'transition-all',
          isSelected
            ? 'border-cyan bg-cyan/20'
            : 'border-border opacity-0 group-hover:opacity-100 hover:border-cyan',
        )}
      >
        {isSelected && <span className="text-cyan text-xs leading-none">✓</span>}
      </button>

      <Link
        to="/events/$eventId"
        params={{ eventId: String(event.id) }}
        className="flex items-center gap-4 flex-1 min-w-0"
      >
      <div className="w-40 aspect-square relative flex-shrink-0">
        <img
          src={getEventThumbnailUrl(event.id, token || undefined)}
          alt={event.name}
          className="w-full h-full object-contain rounded-lg"
          style={thumbnailRotationStyle(event.orientation)}
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Play size={32} className="text-white/80 drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)]" />
        </div>
        {duration && (
          <div className="absolute bottom-1 end-1 px-1.5 py-0.5 rounded bg-black/70 text-[10px] font-mono text-white">
            {t('{{seconds}}s', { seconds: duration })}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-2">
          <h3 className="font-medium text-text-primary truncate">{event.name}</h3>
          <span className="text-xs font-mono text-text-muted">#{event.id}</span>
          {event.archived === 1 && (
            <span className="flex items-center gap-1 text-xs text-amber">
              <Archive size={12} />
              {t('Archived')}
            </span>
          )}
        </div>

        <div className="flex items-center gap-4 text-sm text-text-secondary mb-2 flex-wrap">
          <span className="flex items-center gap-1.5">
            <Monitor size={14} className="text-text-muted" />
            {monitorName}
          </span>
          {event.cause && (
            <span
              className={clsx(
                'px-2 py-0.5 rounded text-xs font-medium',
                getCauseColor(event.cause)
              )}
            >
              {event.cause}
            </span>
          )}
          {event.tags && event.tags.length > 0 && (
            <span className="flex items-center gap-1 flex-wrap">
              {event.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan/15 border border-cyan/30 text-cyan text-[10px]"
                >
                  <TagIcon size={9} />
                  {tag.name}
                </span>
              ))}
            </span>
          )}
        </div>

        <div className="flex items-center gap-4 text-xs text-text-muted">
          {startTime && (
            <>
              <span className="flex items-center gap-1.5">
                <Calendar size={12} />
                {startTime.toLocaleDateString()}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock size={12} />
                {startTime.toLocaleTimeString()}
                {endTime && ` - ${endTime.toLocaleTimeString()}`}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-5 text-end">
        {event.frames != null && event.frames > 0 && (
          <div>
            <p className="text-lg font-mono font-medium text-text-primary">{event.frames}</p>
            <p className="text-xs text-text-muted">{t('Frames')}</p>
          </div>
        )}
        {event.alarm_frames != null && event.alarm_frames > 0 && (
          <div>
            <p className="text-lg font-mono font-medium text-crimson">{event.alarm_frames}</p>
            <p className="text-xs text-text-muted">{t('Alarm')}</p>
          </div>
        )}
        {event.tot_score != null && event.tot_score > 0 && (
          <div>
            <p className="text-lg font-mono font-medium text-text-primary">{event.tot_score}</p>
            <p className="text-xs text-text-muted">{t('Tot')}</p>
          </div>
        )}
        {event.avg_score != null && event.avg_score > 0 && (
          <div>
            <p className="text-lg font-mono font-medium text-cyan">{event.avg_score}</p>
            <p className="text-xs text-text-muted">{t('Avg')}</p>
          </div>
        )}
        {event.max_score != null && event.max_score > 0 && (
          <div>
            <p className="text-lg font-mono font-medium text-amber">{event.max_score}</p>
            <p className="text-xs text-text-muted">{t('Max')}</p>
          </div>
        )}
      </div>
      </Link>

      {/* Per-row Download Video — sits outside the <Link> so clicking it
          doesn't navigate to event-detail. */}
      <a
        href={getEventVideoUrl(event.id, token ?? undefined)}
        target="_blank"
        rel="noopener noreferrer"
        download={`event-${event.id}.mp4`}
        aria-label={t('Download video for event {{id}}', { id: event.id })}
        title={t('Download video')}
        className={clsx(
          'flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0',
          'border border-border-subtle text-text-muted',
          'hover:border-cyan/50 hover:text-cyan transition-colors',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <Download size={14} />
      </a>
    </div>
  );
}
