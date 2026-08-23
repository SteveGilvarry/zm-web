import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { ZmEvent } from '@/types';
import { useEventsColumnsStore, EVENTS_COLUMNS, type EventsColumnKey } from '@/stores/eventsColumns';
import {
  getEventThumbnailUrl,
  type EventSortField,
  type SortDirection,
} from '@/api/events';
import { humanFilesize } from '@/lib/format';
import { ClassicTable, ClassicTbody, ClassicTd, ClassicTh, ClassicThead } from '@/skins/classic/components/events/primitives';
import { classicLink } from '@/skins/classic/components/events/styles';
import { useLegacyDateTimeFormat } from '@/features/config/useLegacyDateTimeFormat';
import { formatDurationHms, sumEventDurations, sumEventDiskSpace } from './duration';
import { useEventsColumnLabels } from './columnLabels';
import { COLUMN_SORT_FIELD } from './sortColumns';

interface ClassicEventsTableProps {
  events: ZmEvent[];
  monitorLookup: Record<number, string>;
  /** `/storage` name for an event's `storage_id` (0 → Default). */
  storageName?: (storageId: number) => string;
  selectedIds: Set<number>;
  onToggleSelected: (id: number) => void;
  /** Select / deselect every row on the page (header checkbox). */
  onSetSelected?: (ids: number[], selected: boolean) => void;
  /** Auth token for the thumbnail column. */
  token?: string | null;
  /** Active server-side sort; headers of sortable columns become buttons. */
  sortField?: EventSortField;
  sortDir?: SortDirection;
  onSort?: (field: EventSortField) => void;
  /** `ZM_WEB_LIST_THUMBS`: leading thumbnail column. */
  showThumbs?: boolean;
  /** `ZM_WEB_LIST_THUMB_WIDTH`, px. */
  thumbWidth?: number;
}

const NUMERIC: ReadonlySet<EventsColumnKey> = new Set([
  'duration', 'frames', 'alarm_frames', 'tot_score', 'avg_score', 'max_score', 'disk_space',
]);

/**
 * Legacy `?view=events` table: the same columns in the same order as
 * ZoneMinder 1.39 (Thumbnail, Id, Name, Archived, Emailed, Monitor, Cause, Tags,
 * Start Time, End Time, Duration, Frames, Alarm Frames, Total/Avg/Max Score,
 * Storage, DiskSpace), cell deep-links (Id/Name → event, Monitor → watch,
 * Frames/Alarm Frames/Max Score → frames view), and the footer totals row.
 * Column visibility comes from `useEventsColumnsStore` (persisted, like the
 * legacy `zmEventsTable` cookie).
 */
export function ClassicEventsTable({
  events, monitorLookup, storageName, selectedIds, onToggleSelected, onSetSelected, token,
  sortField, sortDir = 'asc', onSort, showThumbs = false, thumbWidth = 48,
}: ClassicEventsTableProps) {
  const { t } = useTranslation();
  const labels = useEventsColumnLabels();
  // ZoneMinder's own date/time patterns and server zone (see useDateTimeFormat).
  const { formatDateTime } = useLegacyDateTimeFormat();
  const fmtTime = (iso: string | null | undefined) => (iso ? formatDateTime(iso) || '—' : '—');
  const hidden = useEventsColumnsStore((s) => s.hidden);
  const visible: EventsColumnKey[] = EVENTS_COLUMNS.map((c) => c.key).filter((k) => !hidden.includes(k));

  const ids = events.map((e) => e.id);
  const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id));
  const toggleAll = () => {
    if (onSetSelected) onSetSelected(ids, !allSelected);
    else ids.filter((id) => allSelected || !selectedIds.has(id)).forEach(onToggleSelected);
  };

  const totalDurationSec = sumEventDurations(events);
  const totalDiskSpace = sumEventDiskSpace(events);

  const cell = (e: ZmEvent, key: EventsColumnKey) => {
    const eventLink = { to: '/events/$eventId' as const, params: { eventId: String(e.id) } };
    const framesLink = { to: '/events/$eventId/frames' as const, params: { eventId: String(e.id) } };
    switch (key) {
      case 'id':
        return <Link {...eventLink} className={classicLink}>{e.id}</Link>;
      case 'name':
        return <Link {...eventLink} className={classicLink}>{e.name}</Link>;
      case 'archived':
        return e.archived === 1 ? t('Yes') : t('No');
      case 'emailed':
        return e.emailed === 1 ? t('Yes') : t('No');
      case 'monitor':
        return (
          <Link to="/monitors/$monitorId" params={{ monitorId: String(e.monitor_id) }} className={classicLink}>
            {monitorLookup[e.monitor_id] ?? t('Monitor {{id}}', { id: e.monitor_id })}
          </Link>
        );
      case 'cause':
        return e.cause ?? '';
      case 'tags':
        return (e.tags ?? []).map((tag) => tag.name).join(', ');
      case 'time':
        return fmtTime(e.start_date_time);
      case 'end':
        return fmtTime(e.end_date_time);
      case 'duration':
        return formatDurationHms(e.length);
      case 'frames':
        return <Link {...framesLink} className={classicLink}>{e.frames ?? 0}</Link>;
      case 'alarm_frames':
        return <Link {...framesLink} className={classicLink}>{e.alarm_frames ?? 0}</Link>;
      case 'tot_score':
        return e.tot_score ?? 0;
      case 'avg_score':
        return e.avg_score ?? 0;
      case 'max_score':
        return <Link {...framesLink} className={classicLink}>{e.max_score ?? 0}</Link>;
      case 'storage':
        return storageName ? storageName(e.storage_id) : String(e.storage_id);
      case 'disk_space':
        return e.disk_space != null ? humanFilesize(e.disk_space) : '—';
    }
  };

  // Footer: totals under Duration and DiskSpace, blanks elsewhere.
  const footerCell = (key: EventsColumnKey) => {
    if (key === 'duration') {
      return <ClassicTd key={key} numeric className="font-semibold" data-testid="events-total-duration">{formatDurationHms(totalDurationSec)}</ClassicTd>;
    }
    if (key === 'disk_space') {
      return <ClassicTd key={key} numeric className="font-semibold" data-testid="events-total-disk-space">{humanFilesize(totalDiskSpace)}</ClassicTd>;
    }
    return <ClassicTd key={key} />;
  };

  return (
    <ClassicTable testId="classic-events-table">
      <ClassicThead>
        <tr>
          <ClassicTh center className="w-8">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              aria-label={t('Select all events')}
            />
          </ClassicTh>
          {showThumbs && <ClassicTh center>{t('Thumbnail')}</ClassicTh>}
          {visible.map((key) => {
            const field = COLUMN_SORT_FIELD[key];
            return (
              <ClassicTh
                key={key}
                numeric={NUMERIC.has(key)}
                sortable={!!field && !!onSort}
                active={!!field && field === sortField}
                dir={sortDir}
                onSort={field && onSort ? () => onSort(field) : undefined}
              >
                {labels[key]}
              </ClassicTh>
            );
          })}
        </tr>
      </ClassicThead>
      <ClassicTbody>
        {events.length === 0 && (
          <tr>
            <ClassicTd colSpan={visible.length + 1 + (showThumbs ? 1 : 0)} center className="py-8 text-zinc-500">
              {t('No events match the current filters.')}
            </ClassicTd>
          </tr>
        )}
        {events.map((e) => (
          <tr key={e.id} className={selectedIds.has(e.id) ? '!bg-[#dbeafe]' : undefined}>
            <ClassicTd center>
              <input
                type="checkbox"
                checked={selectedIds.has(e.id)}
                onChange={() => onToggleSelected(e.id)}
                aria-label={t('Select event {{id}}', { id: e.id })}
              />
            </ClassicTd>
            {showThumbs && (
              <ClassicTd center>
                <Link to="/events/$eventId" params={{ eventId: String(e.id) }}>
                  <img
                    src={getEventThumbnailUrl(e.id, token ?? undefined)}
                    alt={t('Thumbnail for event {{id}}', { id: e.id })}
                    width={thumbWidth}
                    style={{ width: thumbWidth }}
                    className="inline-block h-auto max-w-none"
                    loading="lazy"
                    onError={(ev) => { ev.currentTarget.style.visibility = 'hidden'; }}
                  />
                </Link>
              </ClassicTd>
            )}
            {visible.map((key) => (
              <ClassicTd key={key} numeric={NUMERIC.has(key)} className={key === 'time' || key === 'end' ? 'whitespace-nowrap' : undefined}>
                {cell(e, key)}
              </ClassicTd>
            ))}
          </tr>
        ))}
      </ClassicTbody>
      {events.length > 0 && (visible.includes('duration') || visible.includes('disk_space')) && (
        <tfoot className="bg-[#f8f9fa] text-zinc-800" data-testid="events-table-footer">
          <tr>
            <ClassicTd />
            {showThumbs && <ClassicTd />}
            {visible.map(footerCell)}
          </tr>
        </tfoot>
      )}
    </ClassicTable>
  );
}
