import { describe, expect, it } from 'vitest';
import type { Monitor } from '@/types';
import type { EventSummary } from '@/api/eventSummaries';
import {
  exportColumns, functionLines, isOffline, pageSlice, periodStart, rowsToCsv, rowsToJson, runtimeLine, searchRows,
  sortRows, sourceClass, streamAvailable, totalsFor, type ConsoleRow,
} from './consoleTable';
import type { MonitorRuntime } from '@/features/monitors/useMonitorStatuses';

const summary = (monitor_id: number, over: Partial<EventSummary> = {}): EventSummary => ({
  monitor_id,
  total_events: 0, total_event_disk_space: 0,
  hour_events: 0, hour_event_disk_space: 0,
  day_events: 0, day_event_disk_space: 0,
  week_events: 0, week_event_disk_space: 0,
  month_events: 0, month_event_disk_space: 0,
  archived_events: 0, archived_event_disk_space: 0,
  ...over,
});

const monitor = (over: Partial<Monitor>): Monitor => ({
  id: 1, name: 'Cam', capturing: 'Always', analysing: 'Always', recording: 'OnMotion',
  host: '10.0.0.1', type: 'Ffmpeg', width: 1920, height: 1080, zone_count: 1, sequence: 1,
  onvif_event_listener: 0,
  ...over,
} as unknown as Monitor);

/** A status row fresh enough to count as online for the rows below. */
const live = (monitorId: number): MonitorRuntime => ({
  monitorId, status: 'Connected', captureFps: 10, analysisFps: 5, captureFpsRaw: '10.00', analysisFpsRaw: '5.00',
  bandwidth: 2048, updatedOn: new Date().toISOString(),
});

const rows: ConsoleRow[] = [
  { monitor: monitor({ id: 1, name: 'Front', sequence: 2, zone_count: 2 }), summary: summary(1, { total_events: 30, total_event_disk_space: 100, hour_events: 6 }), runtime: live(1) },
  // No status row: reads Offline.
  { monitor: monitor({ id: 2, name: 'Back', sequence: 1, host: '10.0.0.2', capturing: 'None' }), summary: summary(2, { total_events: 5, total_event_disk_space: 10 }), runtime: undefined },
  { monitor: monitor({ id: 3, name: 'Side', sequence: null, onvif_event_listener: 1, onvif_alarm_text: 'MotionAlarm', recording: 'Always' }), summary: summary(3, { total_events: 280 }), runtime: live(3) },
];

const NOW = Date.parse('2026-09-16T10:00:00Z');
const runtime = (over: Partial<MonitorRuntime> = {}): MonitorRuntime => ({
  monitorId: 1, status: 'Connected', captureFps: 10, analysisFps: 5, captureFpsRaw: '10.00', analysisFpsRaw: '5.00',
  bandwidth: 2048, updatedOn: '2026-09-16T09:59:30+00:00', ...over,
});

describe('functionLines — legacy Function cell (console.js:265-283)', () => {
  it('says Offline when the status row is missing or older than 90 s', () => {
    expect(functionLines(monitor({}), undefined, NOW)).toEqual(['Offline']);
    expect(functionLines(monitor({}), runtime({ updatedOn: '2026-09-16T09:58:29Z' }), NOW)).toEqual(['Offline']);
    expect(functionLines(monitor({}), runtime({ updatedOn: 'garbage' }), NOW)).toEqual(['Offline']);
    expect(isOffline(runtime({ updatedOn: '2026-09-16T09:58:31Z' }), NOW)).toBe(false);
  });
  it('prints Analysing, the ONVIF alarm text and Recording verbatim, in that order', () => {
    expect(functionLines(monitor({ onvif_event_listener: 1, onvif_alarm_text: 'MotionAlarm', recording: 'Always' }), runtime(), NOW))
      .toEqual(['Analysing: Always', "Use ONVIF 'MotionAlarm'", 'Recording: Always']);
    expect(functionLines(monitor({ analysing: 'Always', recording: 'OnMotion' }), runtime(), NOW))
      .toEqual(['Analysing: Always', 'Recording: OnMotion']);
    // Listener on but no alarm text: legacy's `if (row.ONVIF_Event_Listener)` is falsy.
    expect(functionLines(monitor({ onvif_event_listener: 1, onvif_alarm_text: '', analysing: 'None', recording: 'None' }), runtime(), NOW))
      .toEqual([]);
  });
});

describe('runtimeLine — the fps/bandwidth sub-line', () => {
  it('adds the analysis fps only while analysing and the bandwidth only when non-zero', () => {
    expect(runtimeLine(monitor({}), runtime())).toBe('10.00/5.00 fps 2.00kB/s');
    expect(runtimeLine(monitor({ analysing: 'None' }), runtime({ bandwidth: 0 }))).toBe('10.00 fps');
  });
});

describe('sourceClass — lens dot and Source colour (console.js:210-232)', () => {
  it('follows the status row, not the configured mode', () => {
    expect(sourceClass(monitor({}), undefined)).toEqual({ cls: 'error', reason: 'Not Running' });
    expect(sourceClass(monitor({}), runtime({ status: 'NotRunning' }))).toEqual({ cls: 'error', reason: 'Not Running' });
    expect(sourceClass(monitor({ type: 'WebSite' }), undefined)).toEqual({ cls: 'info', reason: '' });
    expect(sourceClass(monitor({}), runtime({ captureFpsRaw: '0.00' }))).toEqual({ cls: 'error', reason: 'No capture FPS' });
    expect(sourceClass(monitor({}), runtime({ analysisFps: 0 }))).toEqual({ cls: 'warn', reason: 'No analysis FPS' });
    expect(sourceClass(monitor({ analysing: 'None' }), runtime({ analysisFps: 0 }))).toEqual({ cls: 'info', reason: '' });
    expect(sourceClass(monitor({ deleted: 1 } as Partial<Monitor>), runtime())).toEqual({ cls: 'error', reason: 'Deleted' });
  });
});

describe('streamAvailable — whether Id and Name link to Watch (console.js:205)', () => {
  it('links a capturing monitor with an fps reading', () => {
    expect(streamAvailable(monitor({}), runtime(), true)).toBe(true);
  });

  it('links a WebSite monitor whatever its status says', () => {
    expect(streamAvailable(monitor({ type: 'WebSite', capturing: 'None' }), undefined, true)).toBe(true);
  });

  it('counts a literal 0.00 fps as a reading, as the legacy JS truthiness does', () => {
    expect(streamAvailable(monitor({}), runtime({ captureFpsRaw: '0.00' }), true)).toBe(true);
  });

  it('refuses a monitor with no status row, no capture mode, or no Stream permission', () => {
    expect(streamAvailable(monitor({}), undefined, true)).toBe(false);
    expect(streamAvailable(monitor({ capturing: 'None' }), runtime(), true)).toBe(false);
    expect(streamAvailable(monitor({}), runtime(), false)).toBe(false);
  });

  it('refuses a soft-deleted monitor even when it still has a stale status row', () => {
    expect(streamAvailable(monitor({ deleted: 1 } as Partial<Monitor>), runtime(), true)).toBe(false);
  });
});

describe('periodStart — the events-list lower bound', () => {
  const now = new Date('2026-03-31T12:00:00Z');
  it('mirrors MySQL -1 hour / -1 day / -7 day / -1 month', () => {
    expect(periodStart('hour', now)).toBe('2026-03-31T11:00:00Z');
    expect(periodStart('day', now)).toBe('2026-03-30T12:00:00Z');
    expect(periodStart('week', now)).toBe('2026-03-24T12:00:00Z');
    // Calendar month, clamped like MySQL: 31 March − 1 month → 28 February… JS
    // rolls 31 Feb over to 3 March; either way it is a month back, not 30 days.
    expect(periodStart('month', now)).toMatch(/^2026-0[23]-/);
    expect(periodStart('events', now)).toBeUndefined();
    expect(periodStart('archived', now)).toBeUndefined();
  });
});

describe('sortRows', () => {
  it('sorts by sequence with unset sequences last, and flips for desc', () => {
    expect(sortRows(rows, 'sequence', 'asc').map((r) => r.monitor.id)).toEqual([2, 1, 3]);
    expect(sortRows(rows, 'sequence', 'desc').map((r) => r.monitor.id)).toEqual([3, 1, 2]);
  });
  it('sorts names case-insensitively and counts numerically', () => {
    expect(sortRows(rows, 'name', 'asc').map((r) => r.monitor.name)).toEqual(['Back', 'Front', 'Side']);
    expect(sortRows(rows, 'events', 'desc').map((r) => r.summary.total_events)).toEqual([280, 30, 5]);
  });
  it('sorts the id columns through the name lookups it is given', () => {
    const ctx = { manufacturerName: (id: number | null | undefined) => (id === 1 ? 'Zebra' : 'Axis') };
    const withMakers = rows.map((r, i) => ({ ...r, monitor: { ...r.monitor, manufacturer_id: i === 0 ? 1 : 2 } }));
    expect(sortRows(withMakers, 'manufacturer', 'asc', ctx).map((r) => r.monitor.id)).toEqual([2, 3, 1]);
  });
});

describe('searchRows', () => {
  it('matches id, name, source and the Function text, case-insensitively', () => {
    expect(searchRows(rows, 'front').map((r) => r.monitor.id)).toEqual([1]);
    expect(searchRows(rows, '10.0.0.2').map((r) => r.monitor.id)).toEqual([2]);
    expect(searchRows(rows, 'onvif').map((r) => r.monitor.id)).toEqual([3]);
    expect(searchRows(rows, 'offline').map((r) => r.monitor.id)).toEqual([2]);
    expect(searchRows(rows, '')).toBe(rows);
  });
});

describe('pageSlice / totalsFor', () => {
  it('slices pages and treats a non-positive size as "All"', () => {
    expect(pageSlice([1, 2, 3, 4, 5], 2, 2)).toEqual([3, 4]);
    expect(pageSlice([1, 2, 3], 1, 0)).toEqual([1, 2, 3]);
  });
  it('sums every bucket and the zone counts', () => {
    const t = totalsFor(rows);
    expect(t.events).toEqual({ count: 315, disk: 110 });
    expect(t.hour.count).toBe(6);
    expect(t.zones).toBe(4);
  });
});

describe('export', () => {
  it('writes CSV with a header row and quotes fields that need it', () => {
    const cols = exportColumns().filter((c) => ['id', 'name', 'events'].includes(c.key));
    const csv = rowsToCsv([{ ...rows[0], monitor: { ...rows[0].monitor, name: 'Front, "North"' } }], cols);
    expect(csv.split('\n')).toEqual(['Id,Name,Events', '1,"Front, ""North""",30']);
  });
  it('writes JSON keyed by column', () => {
    const cols = exportColumns().filter((c) => ['id', 'zones'].includes(c.key));
    expect(JSON.parse(rowsToJson(rows.slice(0, 1), cols))).toEqual([{ id: 1, zones: 2 }]);
  });
});
