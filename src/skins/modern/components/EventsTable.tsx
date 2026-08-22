import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Archive, Download } from 'lucide-react';
import type { CSSProperties } from 'react';
import { getEventThumbnailUrl, getEventVideoUrl, type EventSortField } from '@/api/events';
import type { ZmEvent } from '@/types';
import { formatDuration } from '@/features/events/duration';
import { useDateTimeFormat } from '@/features/config/useDateTimeFormat';

/**
 * The modern events list, as a table.
 *
 * An operator scans this page: the card layout it replaces showed three and a
 * half events per screen where this shows twenty (docs/DESIGN.md). Cards
 * remain available for browsing by thumbnail — `EventsView` in the store.
 *
 * Numbers are `tabular-nums` so columns line up while sorting; colour is
 * reserved for state (archived), not for decorating scores.
 */

interface EventsTableProps {
  events: ZmEvent[];
  monitorName: (monitorId: number) => string;
  token: string | undefined;
  selectedIds: Set<number>;
  onToggleSelected: (id: number) => void;
  onToggleAll: () => void;
  showThumbnail: boolean;
  sortField: EventSortField;
  sortDir: 'asc' | 'desc';
  onSort: (field: EventSortField) => void;
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

export function EventsTable({
  events,
  monitorName,
  token,
  selectedIds,
  onToggleSelected,
  onToggleAll,
  showThumbnail,
  sortField,
  sortDir,
  onSort,
}: EventsTableProps) {
  const { t } = useTranslation();
  const { formatDateTime } = useDateTimeFormat();
  const allSelected = events.length > 0 && events.every((e) => selectedIds.has(e.id));

  // `th()` returns an element rather than defining a component in the render
  // body — a nested component would remount every cell on each keystroke.
  const th = (field: EventSortField | undefined, label: string, numeric = false) => (
    <SortableTh
      field={field}
      label={label}
      numeric={numeric}
      sortField={sortField}
      sortDir={sortDir}
      onSort={onSort}
    />
  );

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
            {showThumbnail && th(undefined, t('Thumbnail'))}
            {th('id', t('Id'), true)}
            {th('monitor_id', t('Monitor'))}
            {th('name', t('Name'))}
            {th('cause', t('Cause'))}
            {th('start_time', t('Start'))}
            {th('length', t('Duration'), true)}
            {th('frames', t('Frames'), true)}
            {th('alarm_frames', t('Alarm'), true)}
            {th('max_score', t('Max score'), true)}
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
                <td className="px-3 py-1 font-mono tabular-nums text-end text-fg-muted">
                  <Link
                    to="/events/$eventId"
                    params={{ eventId: String(event.id) }}
                    className="hover:text-accent transition-colors"
                  >
                    {event.id}
                  </Link>
                </td>
                <td className="px-3 py-1 text-fg-muted whitespace-nowrap">
                  {monitorName(event.monitor_id)}
                </td>
                <td className="px-3 py-1 max-w-[16rem]">
                  <Link
                    to="/events/$eventId"
                    params={{ eventId: String(event.id) }}
                    className="text-fg hover:text-accent transition-colors inline-flex items-center gap-1.5 max-w-full"
                  >
                    {event.archived === 1 && (
                      <Archive size={12} className="text-fg-dim" aria-label={t('Archived')} />
                    )}
                    <span className="truncate">{event.name}</span>
                  </Link>
                </td>
                <td className="px-3 py-1 text-fg-muted whitespace-nowrap">{event.cause}</td>
                <td className="px-3 py-1 font-mono tabular-nums text-fg-muted whitespace-nowrap">
                  {formatDateTime(event.start_date_time)}
                </td>
                <td className="px-3 py-1 font-mono tabular-nums text-end text-fg-muted">
                  {formatDuration(event.length)}
                </td>
                <td className="px-3 py-1 font-mono tabular-nums text-end text-fg-muted">
                  {event.frames ?? 0}
                </td>
                <td className="px-3 py-1 font-mono tabular-nums text-end text-fg-muted">
                  {event.alarm_frames ?? 0}
                </td>
                <td className="px-3 py-1 font-mono tabular-nums text-end text-fg-muted">
                  {event.max_score ?? 0}
                </td>
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
