import type { EventSummary } from '@/api/eventSummaries';
import { isDeleted, type Monitor } from '@/types';
import { monitorSource } from '@/features/monitors/useMonitorFilterRow';
import { formatBandwidthLegacy, type MonitorRuntime } from '@/features/monitors/useMonitorStatuses';
import type { ConsoleColumnKey } from './consoleColumns';

/** One table row: the config record, its event rollups and its runtime row. */
export interface ConsoleRow {
  monitor: Monitor;
  summary: EventSummary;
  runtime: MonitorRuntime | undefined;
}

export type ConsoleSortKey = Exclude<ConsoleColumnKey, 'thumbnail'>;
export type SortDir = 'asc' | 'desc';

/**
 * A status row older than this is treated as a dead capture process. Legacy
 * console.js: "FPS report interval: 60 seconds base + 30 seconds buffer".
 */
export const FPS_REPORT_STALE_MS = 90_000;

/** True when the monitor's status row is missing or older than 90 s (console.js `Offline`). */
export function isOffline(runtime: MonitorRuntime | undefined, now: number = Date.now()): boolean {
  if (!runtime?.updatedOn) return true;
  const stamp = Date.parse(runtime.updatedOn);
  return !Number.isFinite(stamp) || stamp < now - FPS_REPORT_STALE_MS;
}

/**
 * Legacy "Function" cell, one entry per line (console.js:265-283). `Offline`
 * when the status row is stale; otherwise the raw Analysing / Recording modes
 * plus the ONVIF alarm text when the event listener is on. Legacy prints the
 * enum values verbatim (`Recording: OnMotion`), so no relabelling here.
 */
export function functionLines(m: Monitor, runtime?: MonitorRuntime, now: number = Date.now()): string[] {
  if (isOffline(runtime, now)) return ['Offline'];
  const lines: string[] = [];
  if (m.analysing && m.analysing !== 'None') lines.push(`Analysing: ${m.analysing}`);
  // ajax/console.php hands the JS `ONVIF_Alarm_Text` when the listener is on,
  // and the JS skips the line when that text is empty.
  if (m.onvif_event_listener && m.onvif_alarm_text) lines.push(`Use ONVIF '${m.onvif_alarm_text}'`);
  if (m.recording && m.recording !== 'None') lines.push(`Recording: ${m.recording}`);
  return lines;
}

/**
 * The small line under the Function cell (console.js:284-298):
 * `CaptureFPS[/AnalysisFPS] fps CaptureBandwidth`. The analysis fps only
 * shows while analysing; the bandwidth only when non-zero.
 */
export function runtimeLine(m: Monitor, runtime: MonitorRuntime): string {
  let fps = runtime.captureFpsRaw;
  if (m.analysing !== 'None') fps += `/${runtime.analysisFpsRaw}`;
  fps += ' fps';
  if (runtime.bandwidth > 0) fps += ` ${formatBandwidthLegacy(runtime.bandwidth)}`;
  return fps;
}

/** Legacy `infoText` / `warnText` / `errorText` on the lens dot and Source cell. */
export type SourceClass = 'info' | 'warn' | 'error';

/**
 * console.js:210-232: which colour the row's lens dot and Source cell take,
 * and the reason the dot's tooltip gives. The status row decides, not the
 * configured mode: a monitor set to capture whose process is down is red.
 */
export function sourceClass(m: Monitor, runtime: MonitorRuntime | undefined): { cls: SourceClass; reason: string } {
  if (isDeleted(m)) return { cls: 'error', reason: 'Deleted' };
  if ((!runtime?.status || runtime.status === 'NotRunning') && m.type !== 'WebSite') {
    return { cls: 'error', reason: 'Not Running' };
  }
  if (runtime?.captureFpsRaw === '0.00') return { cls: 'error', reason: 'No capture FPS' };
  if (runtime && !runtime.analysisFps && m.analysing !== 'None') return { cls: 'warn', reason: 'No analysis FPS' };
  return { cls: 'info', reason: '' };
}

/** The six count columns; `events` is legacy's `Total`. */
export type CountPeriod = 'events' | 'hour' | 'day' | 'week' | 'month' | 'archived';

/**
 * Lower bound for a period's events-list link, as the ISO stamp the events
 * page accepts. Legacy passes MySQL's `-1 hour` / `-1 day` / `-7 day` /
 * `-1 month`; the month case is calendar arithmetic (same day last month),
 * like MySQL's, not 30 days. `events` and `archived` carry no bound.
 */
export function periodStart(period: CountPeriod, now: Date = new Date()): string | undefined {
  const d = new Date(now.getTime());
  switch (period) {
    case 'hour': d.setHours(d.getHours() - 1); break;
    case 'day': d.setDate(d.getDate() - 1); break;
    case 'week': d.setDate(d.getDate() - 7); break;
    case 'month': d.setMonth(d.getMonth() - 1); break;
    default: return undefined;
  }
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
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
    case 'function': return byText(functionLines(am, a.runtime).join(' '), functionLines(bm, b.runtime).join(' '));
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
  return rows.filter(({ monitor: m, runtime }) =>
    [String(m.id), m.name, monitorSource(m), m.type, ...functionLines(m, runtime)]
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
    { key: 'function', label: 'Function', value: (r) => functionLines(r.monitor, r.runtime).join(' ') },
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
