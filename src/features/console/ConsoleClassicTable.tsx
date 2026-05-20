import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { ChevronDown, ChevronUp, Monitor as MonitorIcon } from 'lucide-react';
import { type ConsoleData, lookupCount } from './useConsoleData';
import { MonitorPreview } from '@/components/monitors/MonitorPreview';
import type { Monitor } from '@/types';

type SortKey = 'id' | 'name' | 'function' | 'source' | 'hour' | 'day' | 'week' | 'month';

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
  const { monitors, countsByMonitor } = data;
  const [sortKey, setSortKey] = useState<SortKey>('id');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const rows = useMemo(() => {
    const enriched = monitors.map((m) => ({
      monitor: m,
      hour:  lookupCount(countsByMonitor.hour,  m.id),
      day:   lookupCount(countsByMonitor.day,   m.id),
      week:  lookupCount(countsByMonitor.week,  m.id),
      month: lookupCount(countsByMonitor.month, m.id),
    }));
    const sorted = enriched.sort((a, b) => {
      const cmp = compare(a, b, sortKey);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [monitors, countsByMonitor, sortKey, sortDir]);

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
          </tr>
        </thead>
        <tbody>
          {rows.map(({ monitor, hour, day, week, month }) => (
            <Row
              key={monitor.id}
              monitor={monitor}
              hour={hour}
              day={day}
              week={week}
              month={month}
            />
          ))}
        </tbody>
      </table>
    </div>
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
  monitor, hour, day, week, month,
}: {
  monitor: Monitor;
  hour: number;
  day: number;
  week: number;
  month: number;
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
      <td className="px-3 py-2 text-right font-mono tabular-nums">{hour}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums">{day}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums">{week}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums">{month}</td>
    </tr>
  );
}

function compare(
  a: { monitor: Monitor; hour: number; day: number; week: number; month: number },
  b: { monitor: Monitor; hour: number; day: number; week: number; month: number },
  key: SortKey,
): number {
  switch (key) {
    case 'id':       return a.monitor.id - b.monitor.id;
    case 'name':     return a.monitor.name.localeCompare(b.monitor.name);
    case 'function': return describeFunction(a.monitor).localeCompare(describeFunction(b.monitor));
    case 'source':   return (a.monitor.host ?? '').localeCompare(b.monitor.host ?? '');
    case 'hour':     return a.hour  - b.hour;
    case 'day':      return a.day   - b.day;
    case 'week':     return a.week  - b.week;
    case 'month':    return a.month - b.month;
  }
}

function describeFunction(m: Monitor): string {
  return `${m.capturing ?? 'None'} / ${m.analysing ?? 'None'} / ${m.recording ?? 'None'}`;
}
