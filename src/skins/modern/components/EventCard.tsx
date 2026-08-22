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
import { useDateTimeFormat } from '@/features/config/useDateTimeFormat';

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

/** One row of the modern events list in card view: thumbnail, meta, scores, download. */
export function EventCard({
  event,
  monitorName,
  token,
  isSelected,
  onToggleSelected,
  showThumbnail = true,
}: {
  event: ZmEvent;
  monitorName: string;
  token?: string | null;
  isSelected: boolean;
  onToggleSelected: () => void;
  /** `ZM_WEB_LIST_THUMBS` — off hides the image column entirely. */
  showThumbnail?: boolean;
}) {
  const { t } = useTranslation();
  // ZoneMinder's configured patterns and server zone, not the raw locale.
  const { formatDate, formatTime } = useDateTimeFormat();
  const startTime = event.start_date_time ? new Date(event.start_date_time) : null;
  const endTime = event.end_date_time ? new Date(event.end_date_time) : null;
  const duration = eventDurationSeconds(event.length) || null;

  return (
    <div
      className={clsx(
        'flex items-center gap-3 p-3 group',
        'bg-surface border rounded transition-colors',
        isSelected ? 'border-accent bg-accent/10' : 'border-border-subtle hover:border-border',
      )}
    >
      {/* Selection checkbox — opt-in, doesn't compete with the Link target */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleSelected(); }}
        aria-label={isSelected ? t('Deselect event') : t('Select event')}
        className={clsx(
          'w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors',
          isSelected ? 'border-accent bg-accent/20' : 'border-border hover:border-fg-dim',
        )}
      >
        {isSelected && <span className="text-accent text-xs leading-none">✓</span>}
      </button>

      <Link
        to="/events/$eventId"
        params={{ eventId: String(event.id) }}
        className="flex items-center gap-4 flex-1 min-w-0"
      >
      {showThumbnail && (
      <div className="w-32 aspect-square relative shrink-0">
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
          <div className="absolute bottom-1 end-1 px-1.5 py-0.5 rounded bg-black/70 text-xs font-mono text-white">
            {t('{{seconds}}s', { seconds: duration })}
          </div>
        )}
      </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-2">
          <h3 className="font-medium text-fg truncate">{event.name}</h3>
          <span className="text-xs font-mono text-fg-dim">#{event.id}</span>
          {event.archived === 1 && (
            <span className="flex items-center gap-1 text-xs text-fg-dim">
              <Archive size={12} aria-hidden />
              {t('Archived')}
            </span>
          )}
        </div>

        <div className="flex items-center gap-4 text-sm text-fg-muted mb-2 flex-wrap">
          <span className="flex items-center gap-1.5">
            <Monitor size={14} className="text-fg-dim" />
            {monitorName}
          </span>
          {/* The cause is a label, not a state, so it stays neutral. */}
          {event.cause && (
            <span className="px-2 py-0.5 rounded bg-surface-2 text-xs text-fg-muted">
              {event.cause}
            </span>
          )}
          {event.tags && event.tags.length > 0 && (
            <span className="flex items-center gap-1 flex-wrap">
              {event.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border-subtle text-xs text-fg-muted"
                >
                  <TagIcon size={10} aria-hidden />
                  {tag.name}
                </span>
              ))}
            </span>
          )}
        </div>

        <div className="flex items-center gap-4 text-xs text-fg-dim">
          {startTime && (
            <>
              <span className="flex items-center gap-1.5">
                <Calendar size={12} />
                {formatDate(startTime)}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock size={12} />
                {formatTime(startTime)}
                {endTime && ` - ${formatTime(endTime)}`}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-end shrink-0">
        {event.frames != null && event.frames > 0 && (
          <Stat label={t('Frames')} value={event.frames} />
        )}
        {event.alarm_frames != null && event.alarm_frames > 0 && (
          <Stat label={t('Alarm')} value={event.alarm_frames} tone="alarm" />
        )}
        {event.tot_score != null && event.tot_score > 0 && (
          <Stat label={t('Tot')} value={event.tot_score} />
        )}
        {event.avg_score != null && event.avg_score > 0 && (
          <Stat label={t('Avg')} value={event.avg_score} />
        )}
        {event.max_score != null && event.max_score > 0 && (
          <Stat label={t('Max')} value={event.max_score} />
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
        className="flex items-center justify-center w-8 h-8 rounded shrink-0 border border-border-subtle text-fg-dim hover:text-fg hover:border-border transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        <Download size={14} />
      </a>
    </div>
  );
}

/**
 * One score readout. Numbers are neutral: an alarm-frame count is the only
 * one that reports a state worth colouring (docs/DESIGN.md).
 */
function Stat({ label, value, tone }: { label: string; value: number; tone?: 'alarm' }) {
  return (
    <div>
      <p className={clsx(
        'text-base font-mono tabular-nums font-medium',
        tone === 'alarm' ? 'text-danger' : 'text-fg',
      )}>
        {value}
      </p>
      <p className="text-xs text-fg-dim">{label}</p>
    </div>
  );
}
