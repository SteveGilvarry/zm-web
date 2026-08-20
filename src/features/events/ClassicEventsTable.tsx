import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Archive, Download, Tag as TagIcon } from 'lucide-react';
import type { ZmEvent } from '@/types';
import { useEventsColumnsStore, type EventsColumnKey } from '@/stores/eventsColumns';
import { getEventVideoUrl } from '@/api/events';
import { formatBytes } from '@/lib/format';
import { eventDurationSeconds, formatDuration, sumEventDurations, sumEventDiskSpace } from './duration';
import { useEventsColumnLabels } from './columnLabels';

interface ClassicEventsTableProps {
  events: ZmEvent[];
  monitorLookup: Record<number, string>;
  selectedIds: Set<number>;
  onToggleSelected: (id: number) => void;
  /** Auth token threaded through so per-row Download Video can authenticate. */
  token?: string | null;
}

/**
 * Legacy ZM-style events table. One row per event with the columns operators
 * are used to: id, monitor, name, cause, start time, duration, frames,
 * alarm frames, total/avg/max score, archived state, and tags. Column
 * visibility is driven by `useEventsColumnsStore` so operators can prune the
 * table to just what they care about (state is persisted to localStorage —
 * legacy ZM does the same with a cookie).
 *
 * A footer row sums Duration and DiskSpace across the visible page (matches
 * bootstrap-tables' `totalLengthFormatter` / `totalDiskSpaceFormatter`).
 */
export function ClassicEventsTable({
  events, monitorLookup, selectedIds, onToggleSelected, token,
}: ClassicEventsTableProps) {
  const { t } = useTranslation();
  const labels = useEventsColumnLabels();
  const isVisible = useEventsColumnsStore((s) => s.isVisible);

  if (events.length === 0) {
    return (
      <div className="bg-white border border-zinc-300 rounded p-12 text-center text-zinc-500">
        {t('No events match the current filters.')}
      </div>
    );
  }

  const allSelected = events.length > 0 && events.every((e) => selectedIds.has(e.id));
  const toggleAll = () => {
    if (allSelected) {
      events.forEach((e) => onToggleSelected(e.id));
    } else {
      events.filter((e) => !selectedIds.has(e.id)).forEach((e) => onToggleSelected(e.id));
    }
  };

  const totalDurationSec = sumEventDurations(events);
  const totalDiskSpace = sumEventDiskSpace(events);

  // Count visible columns (incl. checkbox + per-row download = +2) so the
  // footer-row colspan stays accurate as columns toggle on / off.
  const visibleKeys: EventsColumnKey[] = ([
    'id', 'monitor', 'name', 'cause', 'time',
    'duration', 'frames', 'alarm_frames',
    'tot_score', 'avg_score', 'max_score',
    'tags', 'disk_space', 'archived',
  ] as EventsColumnKey[]).filter(isVisible);

  // Footer-row label spans every column up to (but not including) Duration.
  // If Duration itself is hidden, the label spans everything before Disk.
  const indexOf = (k: EventsColumnKey) => visibleKeys.indexOf(k);
  const durationCol = indexOf('duration');
  const diskCol = indexOf('disk_space');

  return (
    <div className="bg-white border border-zinc-300 rounded overflow-hidden">
      <table className="w-full text-sm text-zinc-800">
        <thead className="bg-zinc-100 border-b border-zinc-300 text-[11px] uppercase tracking-wider">
          <tr>
            <th className="px-3 py-2 w-8 text-start">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                aria-label={t('Select all events')}
                className="cursor-pointer"
              />
            </th>
            {isVisible('id') && <Th>{labels.id}</Th>}
            {isVisible('monitor') && <Th>{labels.monitor}</Th>}
            {isVisible('name') && <Th>{labels.name}</Th>}
            {isVisible('cause') && <Th>{labels.cause}</Th>}
            {isVisible('time') && <Th>{labels.time}</Th>}
            {isVisible('duration') && <Th numeric>{labels.duration}</Th>}
            {isVisible('frames') && <Th numeric>{labels.frames}</Th>}
            {isVisible('alarm_frames') && <Th numeric>{labels.alarm_frames}</Th>}
            {isVisible('tot_score') && <Th numeric>{labels.tot_score}</Th>}
            {isVisible('avg_score') && <Th numeric>{labels.avg_score}</Th>}
            {isVisible('max_score') && <Th numeric>{labels.max_score}</Th>}
            {isVisible('tags') && <Th>{labels.tags}</Th>}
            {isVisible('disk_space') && <Th numeric>{labels.disk_space}</Th>}
            {isVisible('archived') && <Th>{labels.archived}</Th>}
            <Th>{/* Download */}</Th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <Row
              key={e.id}
              event={e}
              monitorName={monitorLookup[e.monitor_id]}
              isSelected={selectedIds.has(e.id)}
              onToggleSelected={() => onToggleSelected(e.id)}
              token={token}
            />
          ))}
        </tbody>
        {/*
          Footer row aggregates Duration + DiskSpace across the visible page.
          Skipped entirely when neither column is on screen — no need to
          display a stray "Totals" cell with nothing to sum.
        */}
        {(durationCol >= 0 || diskCol >= 0) && (
          <tfoot className="bg-zinc-50 border-t border-zinc-300 text-xs" data-testid="events-table-footer">
            <tr>
              {/* Leading label cell: covers the checkbox + every visible column
                  up to (but not including) the first totalled column. */}
              <td
                className="px-3 py-2 font-semibold text-zinc-700 text-end"
                colSpan={1 + (durationCol >= 0 ? durationCol : diskCol)}
              >
                {t('Totals ({{count}} rows)', { count: events.length })}
              </td>
              {durationCol >= 0 && (
                <td
                  className="px-3 py-2 text-end font-mono tabular-nums font-semibold text-zinc-800"
                  data-testid="events-total-duration"
                >
                  {formatDuration(totalDurationSec)}
                </td>
              )}
              {/* Filler cells between Duration and DiskSpace (frames, alarm,
                  tot/avg/max, tags, archived). */}
              {durationCol >= 0 && diskCol >= 0 && diskCol > durationCol + 1 && (
                <td colSpan={diskCol - durationCol - 1} />
              )}
              {diskCol >= 0 && (
                <td
                  className="px-3 py-2 text-end font-mono tabular-nums font-semibold text-zinc-800"
                  data-testid="events-total-disk-space"
                >
                  {formatBytes(totalDiskSpace)}
                </td>
              )}
              {/* Trailing filler: any columns after the last totalled one
                  plus the trailing Download column. */}
              <td
                colSpan={
                  visibleKeys.length
                    - Math.max(durationCol, diskCol)
                    - 1 /* the totalled cell itself */
                    + 1 /* the Download column */
                }
              />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function Th({
  children,
  numeric,
}: {
  children?: React.ReactNode;
  numeric?: boolean;
}) {
  return (
    <th
      className={
        'px-3 py-2 font-semibold ' +
        (numeric ? 'text-end' : 'text-start')
      }
    >
      {children}
    </th>
  );
}

function Row({
  event,
  monitorName,
  isSelected,
  onToggleSelected,
  token,
}: {
  event: ZmEvent;
  monitorName?: string;
  isSelected: boolean;
  onToggleSelected: () => void;
  token?: string | null;
}) {
  const { t } = useTranslation();
  const isVisible = useEventsColumnsStore((s) => s.isVisible);
  const start = event.start_date_time ? new Date(event.start_date_time) : null;
  const durationSec = eventDurationSeconds(event.length);

  return (
    <tr
      className={
        'border-b border-zinc-200 transition-colors ' +
        (isSelected ? 'bg-cyan-50' : 'hover:bg-zinc-50')
      }
    >
      <td className="px-3 py-1.5 w-8">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelected}
          aria-label={t('Select event {{id}}', { id: event.id })}
          className="cursor-pointer"
        />
      </td>
      {isVisible('id') && (
        <td className="px-3 py-1.5 font-mono text-zinc-500 whitespace-nowrap">
          <Link
            to="/events/$eventId"
            params={{ eventId: String(event.id) }}
            className="text-cyan-700 hover:underline"
          >
            #{event.id}
          </Link>
        </td>
      )}
      {isVisible('monitor') && (
        <td className="px-3 py-1.5 text-zinc-700 truncate max-w-[10rem]">
          {monitorName ?? t('Monitor {{id}}', { id: event.monitor_id })}
        </td>
      )}
      {isVisible('name') && (
        <td className="px-3 py-1.5 text-zinc-800">
          <Link
            to="/events/$eventId"
            params={{ eventId: String(event.id) }}
            className="text-cyan-700 hover:underline inline-flex items-center gap-1"
          >
            {event.archived === 1 && <Archive size={11} className="text-amber-600" />}
            {event.name}
          </Link>
        </td>
      )}
      {isVisible('cause') && (
        <td className="px-3 py-1.5 text-zinc-700">
          {event.cause ?? '—'}
        </td>
      )}
      {isVisible('time') && (
        <td className="px-3 py-1.5 font-mono text-zinc-700 whitespace-nowrap text-[12px]">
          {start
            ? start.toLocaleString([], {
                year: '2-digit', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
                hour12: false,
              })
            : '—'}
        </td>
      )}
      {isVisible('duration') && (
        <td className="px-3 py-1.5 text-end font-mono">
          {durationSec > 0 ? formatDuration(durationSec) : '—'}
        </td>
      )}
      {isVisible('frames') && (
        <td className="px-3 py-1.5 text-end font-mono tabular-nums">{event.frames ?? 0}</td>
      )}
      {isVisible('alarm_frames') && (
        <td className="px-3 py-1.5 text-end font-mono tabular-nums text-red-600">
          {event.alarm_frames ?? 0}
        </td>
      )}
      {isVisible('tot_score') && (
        <td className="px-3 py-1.5 text-end font-mono tabular-nums">{event.tot_score ?? 0}</td>
      )}
      {isVisible('avg_score') && (
        <td className="px-3 py-1.5 text-end font-mono tabular-nums">{event.avg_score ?? 0}</td>
      )}
      {isVisible('max_score') && (
        <td className="px-3 py-1.5 text-end font-mono tabular-nums text-amber-600">
          {event.max_score ?? 0}
        </td>
      )}
      {isVisible('tags') && (
        <td className="px-3 py-1.5">
          {event.tags && event.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {event.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-0.5 px-1 py-0 rounded text-[10px] bg-cyan-50 border border-cyan-300 text-cyan-700"
                >
                  <TagIcon size={9} />
                  {tag.name}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-zinc-400">—</span>
          )}
        </td>
      )}
      {isVisible('disk_space') && (
        <td className="px-3 py-1.5 text-end font-mono tabular-nums text-zinc-600">
          {event.disk_space ? formatBytes(event.disk_space) : '—'}
        </td>
      )}
      {isVisible('archived') && (
        <td className="px-3 py-1.5">
          {event.archived === 1 ? (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-amber-50 border border-amber-300 text-amber-700">
              {t('Arch')}
            </span>
          ) : (
            <span className="text-zinc-400">—</span>
          )}
        </td>
      )}
      <td className="px-3 py-1.5 text-end">
        <a
          href={getEventVideoUrl(event.id, token ?? undefined)}
          target="_blank"
          rel="noopener noreferrer"
          download={`event-${event.id}.mp4`}
          aria-label={t('Download video for event {{id}}', { id: event.id })}
          title={t('Download video')}
          className="inline-flex items-center justify-center w-6 h-6 rounded text-zinc-500 hover:text-cyan-700 hover:bg-zinc-100 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <Download size={12} />
        </a>
      </td>
    </tr>
  );
}
