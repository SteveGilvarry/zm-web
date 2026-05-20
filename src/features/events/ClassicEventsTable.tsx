import { Link } from '@tanstack/react-router';
import { Archive, Tag as TagIcon } from 'lucide-react';
import type { ZmEvent } from '@/types';

interface ClassicEventsTableProps {
  events: ZmEvent[];
  monitorLookup: Record<number, string>;
}

/**
 * Legacy ZM-style events table. One row per event with the columns operators
 * are used to: id, monitor, name, cause, start time, duration, frames,
 * alarm frames, total/avg/max score, archived state, and tags. Everything
 * the modern card layout shows, but packed into a single dense table — the
 * way veteran ZM users navigate their event history.
 */
export function ClassicEventsTable({ events, monitorLookup }: ClassicEventsTableProps) {
  if (events.length === 0) {
    return (
      <div className="bg-white border border-zinc-300 rounded p-12 text-center text-zinc-500">
        No events match the current filters.
      </div>
    );
  }

  return (
    <div className="bg-white border border-zinc-300 rounded overflow-hidden">
      <table className="w-full text-sm text-zinc-800">
        <thead className="bg-zinc-100 border-b border-zinc-300 text-[11px] uppercase tracking-wider">
          <tr>
            <Th>ID</Th>
            <Th>Monitor</Th>
            <Th>Name</Th>
            <Th>Cause</Th>
            <Th>Time</Th>
            <Th numeric>Duration</Th>
            <Th numeric>Frames</Th>
            <Th numeric>Alarm</Th>
            <Th numeric>Tot</Th>
            <Th numeric>Avg</Th>
            <Th numeric>Max</Th>
            <Th>Tags</Th>
            <Th></Th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <Row key={e.id} event={e} monitorName={monitorLookup[e.monitor_id]} />
          ))}
        </tbody>
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
        (numeric ? 'text-right' : 'text-left')
      }
    >
      {children}
    </th>
  );
}

function Row({
  event,
  monitorName,
}: {
  event: ZmEvent;
  monitorName?: string;
}) {
  const start = event.start_date_time ? new Date(event.start_date_time) : null;
  const duration = event.length ? Math.round(Number(event.length)) : null;
  return (
    <tr className="border-b border-zinc-200 hover:bg-zinc-50 transition-colors">
      <td className="px-3 py-1.5 font-mono text-zinc-500 whitespace-nowrap">
        <Link
          to="/events/$eventId"
          params={{ eventId: String(event.id) }}
          className="text-cyan-700 hover:underline"
        >
          #{event.id}
        </Link>
      </td>
      <td className="px-3 py-1.5 text-zinc-700 truncate max-w-[10rem]">
        {monitorName ?? `Monitor ${event.monitor_id}`}
      </td>
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
      <td className="px-3 py-1.5 text-zinc-700">
        {event.cause ?? '—'}
      </td>
      <td className="px-3 py-1.5 font-mono text-zinc-700 whitespace-nowrap text-[12px]">
        {start
          ? start.toLocaleString([], {
              year: '2-digit', month: '2-digit', day: '2-digit',
              hour: '2-digit', minute: '2-digit', second: '2-digit',
              hour12: false,
            })
          : '—'}
      </td>
      <td className="px-3 py-1.5 text-right font-mono">{duration ? `${duration}s` : '—'}</td>
      <td className="px-3 py-1.5 text-right font-mono tabular-nums">{event.frames ?? 0}</td>
      <td className="px-3 py-1.5 text-right font-mono tabular-nums text-red-600">
        {event.alarm_frames ?? 0}
      </td>
      <td className="px-3 py-1.5 text-right font-mono tabular-nums">{event.tot_score ?? 0}</td>
      <td className="px-3 py-1.5 text-right font-mono tabular-nums">{event.avg_score ?? 0}</td>
      <td className="px-3 py-1.5 text-right font-mono tabular-nums text-amber-600">
        {event.max_score ?? 0}
      </td>
      <td className="px-3 py-1.5">
        {event.tags && event.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {event.tags.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center gap-0.5 px-1 py-0 rounded text-[10px] bg-cyan-50 border border-cyan-300 text-cyan-700"
              >
                <TagIcon size={9} />
                {t.name}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-zinc-400">—</span>
        )}
      </td>
      <td className="px-3 py-1.5 text-right">
        {event.archived === 1 && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-amber-50 border border-amber-300 text-amber-700">
            Arch
          </span>
        )}
      </td>
    </tr>
  );
}
