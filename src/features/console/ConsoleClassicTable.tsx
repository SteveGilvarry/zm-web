import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { ChevronDown, ChevronUp, Monitor as MonitorIcon } from 'lucide-react';
import { type ConsoleData, lookupSummary } from './useConsoleData';
import { MonitorPreview } from '@/components/monitors/MonitorPreview';
import { formatBytes } from '@/lib/format';
import type { Monitor } from '@/types';

type SortKey =
  | 'id' | 'name' | 'function' | 'source'
  | 'hour' | 'day' | 'week' | 'month' | 'total' | 'archived';

interface ConsoleClassicTableProps {
  data: ConsoleData;
}

/**
 * Legacy ZM-style Console: a dense, sortable monitor table with per-row
 * Hour / Day / Week / Month event counts plus monitor metadata. Pulls from
 * the shared `useConsoleData` hook, so the modern Console (stat cards +
 * thumbnail grid) and this table never disagree about a number.
 */
export function ConsoleClassicTable({ data }: ConsoleClassicTableProps) {
  const { monitors, summariesByMonitor } = data;
  const [sortKey, setSortKey] = useState<SortKey>('id');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const rows = useMemo(() => {
    const enriched = monitors.map((m) => ({
      monitor: m,
      summary: lookupSummary(summariesByMonitor, m.id),
    }));
    const sorted = enriched.sort((a, b) => {
      const cmp = compare(a, b, sortKey);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [monitors, summariesByMonitor, sortKey, sortDir]);

  const totals = useMemo(() => {
    const t = {
      hour: 0, hour_disk: 0,
      day: 0, day_disk: 0,
      week: 0, week_disk: 0,
      month: 0, month_disk: 0,
      total: 0, total_disk: 0,
      archived: 0, archived_disk: 0,
    };
    for (const { summary: s } of rows) {
      t.hour     += s.hour_events;        t.hour_disk     += s.hour_event_disk_space;
      t.day      += s.day_events;         t.day_disk      += s.day_event_disk_space;
      t.week     += s.week_events;        t.week_disk     += s.week_event_disk_space;
      t.month    += s.month_events;       t.month_disk    += s.month_event_disk_space;
      t.total    += s.total_events;       t.total_disk    += s.total_event_disk_space;
      t.archived += s.archived_events;    t.archived_disk += s.archived_event_disk_space;
    }
    return t;
  }, [rows]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  if (monitors.length === 0) {
    return (
      <div className="bg-white rounded border border-zinc-300 p-12 text-center text-zinc-500">
        <MonitorIcon size={32} className="mx-auto mb-2 opacity-50" />
        No monitors configured.
      </div>
    );
  }

  return (
    <div className="bg-white rounded border border-zinc-300 overflow-hidden">
      <table className="w-full text-sm text-zinc-800">
        <thead className="bg-zinc-100 border-b border-zinc-300 text-xs">
          <tr>
            <Th label="ID"        sortKey="id"       active={sortKey} dir={sortDir} onClick={toggleSort} />
            <th className="px-2 py-2 text-left font-semibold">Thumbnail</th>
            <Th label="Name"      sortKey="name"     active={sortKey} dir={sortDir} onClick={toggleSort} />
            <Th label="Function"  sortKey="function" active={sortKey} dir={sortDir} onClick={toggleSort} />
            <Th label="Source"    sortKey="source"   active={sortKey} dir={sortDir} onClick={toggleSort} />
            <Th label="Hour"      sortKey="hour"     active={sortKey} dir={sortDir} onClick={toggleSort} numeric />
            <Th label="Day"       sortKey="day"      active={sortKey} dir={sortDir} onClick={toggleSort} numeric />
            <Th label="Week"      sortKey="week"     active={sortKey} dir={sortDir} onClick={toggleSort} numeric />
            <Th label="Month"     sortKey="month"    active={sortKey} dir={sortDir} onClick={toggleSort} numeric />
            <Th label="Total"     sortKey="total"    active={sortKey} dir={sortDir} onClick={toggleSort} numeric />
            <Th label="Archived"  sortKey="archived" active={sortKey} dir={sortDir} onClick={toggleSort} numeric />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ monitor, summary }) => (
            <Row key={monitor.id} monitor={monitor} summary={summary} />
          ))}
        </tbody>
        <tfoot className="bg-zinc-50 border-t border-zinc-300 text-xs">
          <tr>
            <td className="px-3 py-2 font-semibold text-zinc-700" colSpan={5}>
              Total ({rows.length} monitors)
            </td>
            <FootCount count={totals.hour}     disk={totals.hour_disk} />
            <FootCount count={totals.day}      disk={totals.day_disk} />
            <FootCount count={totals.week}     disk={totals.week_disk} />
            <FootCount count={totals.month}    disk={totals.month_disk} />
            <FootCount count={totals.total}    disk={totals.total_disk} />
            <FootCount count={totals.archived} disk={totals.archived_disk} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function FootCount({ count, disk }: { count: number; disk: number }) {
  return (
    <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-zinc-800">
      {count}
      <div className="text-[10px] font-normal text-zinc-500">
        {disk > 0 ? formatBytes(disk) : '—'}
      </div>
    </td>
  );
}

interface ThProps {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  dir: 'asc' | 'desc';
  onClick: (k: SortKey) => void;
  numeric?: boolean;
}

function Th({ label, sortKey, active, dir, onClick, numeric }: ThProps) {
  const isActive = active === sortKey;
  return (
    <th
      className={clsx(
        'px-3 py-2 font-semibold cursor-pointer select-none',
        'hover:bg-zinc-200 transition-colors',
        numeric ? 'text-right' : 'text-left',
      )}
      onClick={() => onClick(sortKey)}
    >
      <span className={clsx(
        'inline-flex items-center gap-1',
        isActive && 'text-cyan-700',
      )}>
        {label}
        {isActive && (dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
      </span>
    </th>
  );
}

function Row({
  monitor, summary,
}: {
  monitor: Monitor;
  summary: ReturnType<typeof lookupSummary>;
}) {
  const isActive = monitor.capturing !== 'None';

  return (
    <tr className="border-b border-zinc-200 hover:bg-zinc-50 transition-colors">
      <td className="px-3 py-2 font-mono tabular-nums text-zinc-600">{monitor.id}</td>
      <td className="px-2 py-1">
        <div className="w-16 h-10 relative rounded overflow-hidden bg-zinc-200">
          <MonitorPreview
            monitorId={monitor.id}
            monitorName={monitor.name}
            orientation={monitor.orientation}
            isActive={isActive}
            compact
          />
        </div>
      </td>
      <td className="px-3 py-2">
        <Link
          to="/monitors/$monitorId"
          params={{ monitorId: String(monitor.id) }}
          className="inline-flex items-center gap-2 text-cyan-700 hover:underline"
        >
          <span
            className={clsx(
              'w-2 h-2 rounded-full',
              isActive ? 'bg-emerald-500' : 'bg-zinc-400',
            )}
          />
          {monitor.name}
        </Link>
      </td>
      <td className="px-3 py-2 text-zinc-600">
        {describeFunction(monitor)}
      </td>
      <td className="px-3 py-2 font-mono text-xs text-zinc-600">
        {monitor.host ?? '—'}
        {monitor.width && monitor.height && (
          <div className="text-[10px] text-zinc-500">
            {monitor.width}×{monitor.height}
          </div>
        )}
      </td>
      <CountCell count={summary.hour_events}     disk={summary.hour_event_disk_space} />
      <CountCell count={summary.day_events}      disk={summary.day_event_disk_space} />
      <CountCell count={summary.week_events}     disk={summary.week_event_disk_space} />
      <CountCell count={summary.month_events}    disk={summary.month_event_disk_space} />
      <CountCell count={summary.total_events}    disk={summary.total_event_disk_space} />
      <CountCell count={summary.archived_events} disk={summary.archived_event_disk_space} />
    </tr>
  );
}

function CountCell({ count, disk }: { count: number; disk: number }) {
  return (
    <td className="px-3 py-2 text-right font-mono tabular-nums">
      <div className={count === 0 ? 'text-zinc-400' : ''}>{count}</div>
      {count > 0 && disk > 0 && (
        <div className="text-[10px] text-zinc-500">{formatBytes(disk)}</div>
      )}
    </td>
  );
}

function compare(
  a: { monitor: Monitor; summary: ReturnType<typeof lookupSummary> },
  b: { monitor: Monitor; summary: ReturnType<typeof lookupSummary> },
  key: SortKey,
): number {
  switch (key) {
    case 'id':       return a.monitor.id - b.monitor.id;
    case 'name':     return a.monitor.name.localeCompare(b.monitor.name);
    case 'function': return describeFunction(a.monitor).localeCompare(describeFunction(b.monitor));
    case 'source':   return (a.monitor.host ?? '').localeCompare(b.monitor.host ?? '');
    case 'hour':     return a.summary.hour_events     - b.summary.hour_events;
    case 'day':      return a.summary.day_events      - b.summary.day_events;
    case 'week':     return a.summary.week_events     - b.summary.week_events;
    case 'month':    return a.summary.month_events    - b.summary.month_events;
    case 'total':    return a.summary.total_events    - b.summary.total_events;
    case 'archived': return a.summary.archived_events - b.summary.archived_events;
  }
}

function describeFunction(m: Monitor): string {
  return `${m.capturing ?? 'None'} / ${m.analysing ?? 'None'} / ${m.recording ?? 'None'}`;
}
