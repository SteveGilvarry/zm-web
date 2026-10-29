import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Archive, Download, Mail } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { getEventThumbnailUrl, getEventVideoUrl, type EventSortField } from '@/api/events';
import type { ZmEvent } from '@/types';
import { formatDuration } from '@/features/events/duration';
import { COLUMN_SORT_FIELD } from '@/features/events/sortColumns';
import { formatBytes } from '@/lib/format';
import { EVENTS_COLUMNS, useEventsColumnsStore, type EventsColumnKey } from '@/stores/eventsColumns';
import { useDateTimeFormat } from '@/features/config/useDateTimeFormat';
import { EventCauseCell } from '@/features/events/EventCauseCell';
import type { EventNavSearch } from '@/features/events/eventsSearch';
import { maxScoreFrameParams } from '@/features/events/maxScoreLink';

/**
 * The modern events list, as a table.
 *
 * An operator scans this page: the card layout it replaces showed three and a
 * half events per screen where this shows twenty (docs/DESIGN.md). Cards
 * remain available for browsing by thumbnail — `EventsView` in the store.
 *
 * Numbers are `tabular-nums` so columns line up while sorting; colour is
 * reserved for state (archived), not for decorating scores.
 *
 * Which columns show, and in what order, is the operator's choice in the
 * column chooser (`useEventsColumnsStore`, legacy's `zmEventsTable` cookie);
 * the classic table reads the same store.
 */

interface EventsTableProps {
  events: ZmEvent[];
  monitorName: (monitorId: number) => string;
  /** `/storage` name for an event's `storage_id` (0 → Default). */
  storageName?: (storageId: number) => string;
  token: string | undefined;
  selectedIds: Set<number>;
  onToggleSelected: (id: number) => void;
  onToggleAll: () => void;
  showThumbnail: boolean;
  sortField: EventSortField;
  sortDir: 'asc' | 'desc';
  onSort: (field: EventSortField) => void;
  /**
   * List context carried on every event link, so Prev / Next on the detail
   * page walk this list in this order (legacy `filterQuery` + `sortQuery`).
   */
  detailSearch?: EventNavSearch;
}

function thumbnailRotationStyle(orientation?: string | null): CSSProperties | undefined {
  if (!orientation) return undefined;
  switch (orientation.replace(/[_\s]/g, '').toLowerCase()) {
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


function SortableTh({
  field, label, numeric, sortField, sortDir, onSort,
}: {
  field?: EventSortField;
  label: string;
  numeric?: boolean;
  sortField: EventSortField;
  sortDir: 'asc' | 'desc';
  onSort: (field: EventSortField) => void;
}) {
  const { t } = useTranslation();
  const active = field != null && sortField === field;
  return (
    <th
      scope="col"
      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
      className={clsx(
        'px-3 py-2 text-xs font-medium text-fg-dim whitespace-nowrap',
        numeric ? 'text-end' : 'text-start',
      )}
    >
      {field ? (
        <button
          type="button"
          onClick={() => onSort(field)}
          aria-pressed={active}
          // Same phrasing the sort bar used, so what gets announced does not
          // depend on which layout the operator picked.
          aria-label={
            active
              ? sortDir === 'asc'
                ? t('{{label}}, sorted ascending', { label })
                : t('{{label}}, sorted descending', { label })
              : t('Sort by {{label}}', { label })
          }
          className={clsx(
            'inline-flex items-center gap-1 rounded-sm hover:text-fg transition-colors',
            active && 'text-fg',
          )}
        >
          {label}
          <span aria-hidden className="text-fg-faint">
            {active ? (sortDir === 'asc' ? '\u25b2' : '\u25bc') : ''}
          </span>
        </button>
      ) : (
        label
      )}
    </th>
  );
}

/** Right-aligned, tabular columns. */
const NUMERIC: ReadonlySet<EventsColumnKey> = new Set([
  'id', 'duration', 'frames', 'alarm_frames', 'tot_score', 'avg_score', 'max_score', 'disk_space',
]);

/** Sentence-case header labels (docs/DESIGN.md), keyed like the store. */
function useModernColumnLabels(): Record<EventsColumnKey, string> {
  const { t } = useTranslation();
  return {
    id: t('Id'),
    monitor: t('Monitor'),
    name: t('Name'),
    cause: t('Cause'),
    time: t('Start'),
    end: t('End'),
    duration: t('Duration'),
    frames: t('Frames'),
    alarm_frames: t('Alarm'),
    tot_score: t('Total score'),
    avg_score: t('Avg score'),
    max_score: t('Max score'),
    tags: t('Tags'),
    storage: t('Storage'),
    disk_space: t('Disk space'),
    archived: t('Archived'),
    emailed: t('Emailed'),
    notes: t('Notes'),
  };
}

export function EventsTable({
  events,
  monitorName,
  storageName,
  token,
  selectedIds,
  onToggleSelected,
  onToggleAll,
  showThumbnail,
  sortField,
  sortDir,
  onSort,
  detailSearch,
}: EventsTableProps) {
  const { t } = useTranslation();
  const { formatDateTime } = useDateTimeFormat();
  const labels = useModernColumnLabels();
  const hidden = useEventsColumnsStore((s) => s.hidden);
  const columns = EVENTS_COLUMNS.map((c) => c.key).filter((k) => !hidden.includes(k));
  const allSelected = events.length > 0 && events.every((e) => selectedIds.has(e.id));

  const mono = 'font-mono tabular-nums text-fg-muted';
  const tdClass = (key: EventsColumnKey) => clsx(
    'px-3 py-1',
    NUMERIC.has(key) && clsx(mono, 'text-end'),
    (key === 'time' || key === 'end') && clsx(mono, 'whitespace-nowrap'),
    (key === 'monitor' || key === 'storage') && 'text-fg-muted whitespace-nowrap',
    key === 'name' && 'max-w-[16rem]',
    (key === 'cause' || key === 'tags') && 'text-fg-muted max-w-[18rem]',
    (key === 'archived' || key === 'emailed') && 'text-fg-dim',
  );

  const cell = (event: ZmEvent, key: EventsColumnKey): ReactNode => {
    const eventLink = { to: '/events/$eventId' as const, params: { eventId: String(event.id) }, search: detailSearch };
    switch (key) {
      case 'id':
        return (
          <Link {...eventLink} className="hover:text-accent transition-colors">
            {event.id}
          </Link>
        );
      case 'monitor':
        return monitorName(event.monitor_id);
      case 'name':
        return (
          <Link
            {...eventLink}
            className="text-fg hover:text-accent transition-colors inline-flex items-center gap-1.5 max-w-full"
          >
            {event.archived === 1 && (
              <Archive size={12} className="text-fg-dim" aria-label={t('Archived')} />
            )}
            {event.emailed === 1 && (
              <Mail size={12} className="text-fg-dim" aria-label={t('Emailed')} />
            )}
            <span className="truncate">{event.name}</span>
          </Link>
        );
      case 'archived':
        return event.archived === 1 ? t('Yes') : t('No');
      case 'emailed':
        return event.emailed === 1 ? t('Yes') : t('No');
      case 'cause':
        return <EventCauseCell event={event} tone="modern" />;
      case 'tags':
        return (event.tags ?? []).map((tag) => tag.name).join(', ');
      case 'time':
        return formatDateTime(event.start_date_time);
      case 'end':
        return event.end_date_time ? formatDateTime(event.end_date_time) : '—';
      case 'duration':
        return formatDuration(event.length);
      case 'frames':
        return event.frames ?? 0;
      case 'alarm_frames':
        return event.alarm_frames ?? 0;
      case 'tot_score':
        return event.tot_score ?? 0;
      case 'avg_score':
        return event.avg_score ?? 0;
      case 'max_score':
        // The frame with the max score, as legacy's Max column links (events.js:108).
        return (
          <Link
            to="/events/$eventId/frames/$frameId"
            params={maxScoreFrameParams(event)}
            className="hover:text-accent transition-colors"
            title={t('Open the frame with the max score')}
          >
            {event.max_score ?? 0}
          </Link>
        );
      case 'storage':
        return storageName ? storageName(event.storage_id) : String(event.storage_id);
      case 'disk_space':
        return event.disk_space != null ? formatBytes(event.disk_space) : '—';
      case 'notes':
        return event.notes ?? '';
    }
  };

  return (
    <div className="overflow-x-auto rounded border border-border-subtle bg-surface">
      <table className="w-full text-sm">
        {/* The scroll container is the page area, so the header pins to it. */}
        <thead className="sticky top-0 z-10 bg-surface border-b border-border-subtle">
          <tr>
            <th scope="col" className="w-9 px-3 py-2">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleAll}
                aria-label={t('Select all events on this page')}
              />
            </th>
            {showThumbnail && (
              <SortableTh label={t('Thumbnail')} sortField={sortField} sortDir={sortDir} onSort={onSort} />
            )}
            {columns.map((key) => (
              <SortableTh
                key={key}
                field={COLUMN_SORT_FIELD[key]}
                label={labels[key]}
                numeric={NUMERIC.has(key)}
                sortField={sortField}
                sortDir={sortDir}
                onSort={onSort}
              />
            ))}
            <th scope="col" className="w-10 px-3 py-2">
              <span className="sr-only">{t('Actions')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => {
            const selected = selectedIds.has(event.id);
            return (
              <tr
                key={event.id}
                // Legacy's `data-click-to-select`: a click on the row itself
                // (not on a control in it) toggles the checkbox.
                onClick={(ev) => {
                  if ((ev.target as HTMLElement).closest('a, button, input, select, textarea, label')) return;
                  onToggleSelected(event.id);
                }}
                className={clsx(
                  'border-b border-border-subtle last:border-0 transition-colors',
                  selected ? 'bg-accent/10' : 'hover:bg-surface-2',
                )}
              >
                <td className="px-3 py-1">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => onToggleSelected(event.id)}
                    aria-label={t('Select event {{id}}', { id: event.id })}
                  />
                </td>
                {showThumbnail && (
                  <td className="px-3 py-1">
                    <Link
                      to="/events/$eventId"
                      params={{ eventId: String(event.id) }}
                      search={detailSearch}
                      // The image is decorative (the row names the event
                      // twice already), so the link needs its own name.
                      aria-label={t('Event {{id}}', { id: event.id })}
                      className="block w-10 h-10 overflow-hidden rounded bg-bg-sunken"
                    >
                      <img
                        src={getEventThumbnailUrl(event.id, token)}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-contain"
                        style={thumbnailRotationStyle(event.orientation)}
                      />
                    </Link>
                  </td>
                )}
                {columns.map((key) => (
                  <td key={key} className={tdClass(key)}>{cell(event, key)}</td>
                ))}
                <td className="px-3 py-1 text-end">
                  <a
                    href={getEventVideoUrl(event.id, token)}
                    download
                    aria-label={t('Download video for event {{id}}', { id: event.id })}
                    className="inline-flex p-1 rounded text-fg-dim hover:text-fg hover:bg-surface-3 transition-colors"
                  >
                    <Download size={14} />
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
