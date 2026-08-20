import type { EventSummary } from '@/api/eventSummaries';
import type { Monitor } from '@/types';
import type { MonitorRuntime } from '@/features/monitors/useMonitorStatuses';
import { monitorSource } from '@/features/monitors/useMonitorFilterRow';
import type { ConsoleColumnKey } from './consoleColumns';

/** One table row: the config record, its event rollups and its runtime row. */
export interface ConsoleRow {
  monitor: Monitor;
  summary: EventSummary;
  runtime: MonitorRuntime | undefined;
}

export type ConsoleSortKey = Exclude<ConsoleColumnKey, 'thumbnail'>;
export type SortDir = 'asc' | 'desc';

/** Legacy "Function" cell, one entry per line. `Offline` when not capturing. */
export function functionLines(m: Monitor): string[] {
  if (!m.capturing || m.capturing === 'None') return ['Offline'];
  const lines: string[] = [];
  if (m.capturing === 'Ondemand') lines.push('Capturing: On Demand');
  if (m.onvif_event_listener === 1) lines.push("Use ONVIF 'MotionAlarm'");
  else if (m.analysing === 'Always') lines.push('Analysing: Always');
  if (m.recording && m.recording !== 'None') {
    lines.push(`Recording: ${m.recording === 'OnMotion' ? 'On Motion' : m.recording}`);
  }
  return lines.length ? lines : ['Capturing'];
}

export interface SortContext {
  manufacturerName?: (id: number | null | undefined) => string;
  modelName?: (id: number | null | undefined) => string;
  serverName?: (id: number | null | undefined) => string;
  storageName?: (id: number | null | undefined) => string;
}

const byText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });

export function compareRows(a: ConsoleRow, b: ConsoleRow, key: ConsoleSortKey, ctx: SortContext = {}): number {
  const am = a.monitor; const bm = b.monitor;
  switch (key) {
    case 'id': return am.id - bm.id;
    case 'name': return byText(am.name, bm.name);
    case 'manufacturer': return byText(ctx.manufacturerName?.(am.manufacturer_id) ?? '', ctx.manufacturerName?.(bm.manufacturer_id) ?? '');
    case 'model': return byText(ctx.modelName?.(am.model_id) ?? '', ctx.modelName?.(bm.model_id) ?? '');
    case 'function': return byText(functionLines(am).join(' '), functionLines(bm).join(' '));
    case 'server': return byText(ctx.serverName?.(am.server_id) ?? String(am.server_id ?? ''), ctx.serverName?.(bm.server_id) ?? String(bm.server_id ?? ''));
    case 'source': return byText(monitorSource(am), monitorSource(bm));
    case 'storage': return byText(ctx.storageName?.(am.storage_id) ?? String(am.storage_id), ctx.storageName?.(bm.storage_id) ?? String(bm.storage_id));
    case 'events': return a.summary.total_events - b.summary.total_events;
    case 'hour': return a.summary.hour_events - b.summary.hour_events;
    case 'day': return a.summary.day_events - b.summary.day_events;
    case 'week': return a.summary.week_events - b.summary.week_events;
    case 'month': return a.summary.month_events - b.summary.month_events;
    case 'archived': return a.summary.archived_events - b.summary.archived_events;
    case 'zones': return (am.zone_count ?? 0) - (bm.zone_count ?? 0);
    // Monitors without a sequence sort last.
    case 'sequence': return (am.sequence ?? Number.MAX_SAFE_INTEGER) - (bm.sequence ?? Number.MAX_SAFE_INTEGER);
  }
}

export function sortRows(rows: ConsoleRow[], key: ConsoleSortKey, dir: SortDir, ctx: SortContext = {}): ConsoleRow[] {
  const sorted = [...rows].sort((a, b) => compareRows(a, b, key, ctx));
  return dir === 'asc' ? sorted : sorted.reverse();
}

/** bootstrap-table's client-side search: substring over the text cells. */
export function searchRows(rows: ConsoleRow[], query: string): ConsoleRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(({ monitor: m }) =>
    [String(m.id), m.name, monitorSource(m), m.type, ...functionLines(m)]
      .some((v) => v.toLowerCase().includes(q)),
  );
}

export function pageSlice<T>(rows: T[], page: number, pageSize: number): T[] {
  if (pageSize <= 0) return rows;
  const start = (page - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

export interface BucketTotals { count: number; disk: number }
export interface ConsoleTotals {
  events: BucketTotals; hour: BucketTotals; day: BucketTotals; week: BucketTotals;
  month: BucketTotals; archived: BucketTotals; zones: number;
}

export function totalsFor(rows: ConsoleRow[]): ConsoleTotals {
  const acc: ConsoleTotals = {
    events: { count: 0, disk: 0 }, hour: { count: 0, disk: 0 }, day: { count: 0, disk: 0 },
    week: { count: 0, disk: 0 }, month: { count: 0, disk: 0 }, archived: { count: 0, disk: 0 }, zones: 0,
  };
  for (const { summary: s, monitor: m } of rows) {
    acc.events.count += s.total_events; acc.events.disk += s.total_event_disk_space;
    acc.hour.count += s.hour_events; acc.hour.disk += s.hour_event_disk_space;
    acc.day.count += s.day_events; acc.day.disk += s.day_event_disk_space;
    acc.week.count += s.week_events; acc.week.disk += s.week_event_disk_space;
    acc.month.count += s.month_events; acc.month.disk += s.month_event_disk_space;
    acc.archived.count += s.archived_events; acc.archived.disk += s.archived_event_disk_space;
    acc.zones += m.zone_count ?? 0;
  }
  return acc;
}

/* ------------------------------------------------------------------------ */
/*  Export (bootstrap-table's CSV / JSON)                                   */
/* ------------------------------------------------------------------------ */

export interface ExportColumn { key: string; label: string; value: (row: ConsoleRow) => string | number }

export function exportColumns(ctx: SortContext = {}): ExportColumn[] {
  return [
    { key: 'id', label: 'Id', value: (r) => r.monitor.id },
    { key: 'name', label: 'Name', value: (r) => r.monitor.name },
    { key: 'manufacturer', label: 'Manufacturer', value: (r) => ctx.manufacturerName?.(r.monitor.manufacturer_id) ?? '' },
    { key: 'model', label: 'Model', value: (r) => ctx.modelName?.(r.monitor.model_id) ?? '' },
    { key: 'function', label: 'Function', value: (r) => functionLines(r.monitor).join(' ') },
    { key: 'status', label: 'Status', value: (r) => r.runtime?.status ?? 'Unknown' },
    { key: 'capture_fps', label: 'CaptureFPS', value: (r) => r.runtime?.captureFps ?? '' },
    { key: 'source', label: 'Source', value: (r) => monitorSource(r.monitor) },
    { key: 'resolution', label: 'Resolution', value: (r) => `${r.monitor.width}x${r.monitor.height}` },
    { key: 'events', label: 'Events', value: (r) => r.summary.total_events },
    { key: 'hour', label: 'Hour', value: (r) => r.summary.hour_events },
    { key: 'day', label: 'Day', value: (r) => r.summary.day_events },
    { key: 'week', label: 'Week', value: (r) => r.summary.week_events },
    { key: 'month', label: 'Month', value: (r) => r.summary.month_events },
    { key: 'archived', label: 'Archived', value: (r) => r.summary.archived_events },
    { key: 'zones', label: 'Zones', value: (r) => r.monitor.zone_count ?? 0 },
    { key: 'sequence', label: 'Sequence', value: (r) => r.monitor.sequence ?? '' },
  ];
}

const csvCell = (v: string | number): string => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function rowsToCsv(rows: ConsoleRow[], columns: ExportColumn[]): string {
  const head = columns.map((c) => csvCell(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => csvCell(c.value(r))).join(','));
  return [head, ...body].join('\n');
}

export function rowsToJson(rows: ConsoleRow[], columns: ExportColumn[]): string {
  return JSON.stringify(
    rows.map((r) => Object.fromEntries(columns.map((c) => [c.key, c.value(r)]))),
    null,
    2,
  );
}

/** Hand the browser a file. Not exercised in jsdom. */
export function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
