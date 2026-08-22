import { describe, expect, it } from 'vitest';
import type { Monitor } from '@/types';
import type { EventSummary } from '@/api/eventSummaries';
import {
  exportColumns, functionLines, pageSlice, rowsToCsv, rowsToJson, searchRows, sortRows, totalsFor,
  type ConsoleRow,
} from './consoleTable';

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

const rows: ConsoleRow[] = [
  { monitor: monitor({ id: 1, name: 'Front', sequence: 2, zone_count: 2 }), summary: summary(1, { total_events: 30, total_event_disk_space: 100, hour_events: 6 }), runtime: undefined },
  { monitor: monitor({ id: 2, name: 'Back', sequence: 1, host: '10.0.0.2', capturing: 'None' }), summary: summary(2, { total_events: 5, total_event_disk_space: 10 }), runtime: undefined },
  { monitor: monitor({ id: 3, name: 'Side', sequence: null, onvif_event_listener: 1, recording: 'Always' }), summary: summary(3, { total_events: 280 }), runtime: undefined },
];

describe('functionLines — legacy Function cell', () => {
  it('says Offline when not capturing', () => {
    expect(functionLines(monitor({ capturing: 'None' }))).toEqual(['Offline']);
  });
  it('prefers the ONVIF line over plain analysing, then the recording mode', () => {
    expect(functionLines(monitor({ onvif_event_listener: 1, recording: 'Always' })))
      .toEqual(["Use ONVIF 'MotionAlarm'", 'Recording: Always']);
    expect(functionLines(monitor({ analysing: 'Always', recording: 'OnMotion' })))
      .toEqual(['Analysing: Always', 'Recording: On Motion']);
  });
  it('never returns an empty cell', () => {
    expect(functionLines(monitor({ analysing: 'None', recording: 'None' }))).toEqual(['Capturing']);
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
