/**
 * Coverage for the console table helpers the first pass left untouched:
 * every `compareRows` branch (including the four name-lookup columns and
 * the five event buckets), the `pageSlice` edges, every `exportColumns`
 * value function, and `downloadText`'s anchor dance.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Monitor } from '@/types';
import type { EventSummary } from '@/api/eventSummaries';
import type { MonitorRuntime } from '@/features/monitors/useMonitorStatuses';
import {
  compareRows, downloadText, exportColumns, functionLines, pageSlice, rowsToCsv, rowsToJson,
  searchRows, sortRows, totalsFor, type ConsoleRow, type ConsoleSortKey,
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
  onvif_event_listener: 0, storage_id: 1,
  ...over,
} as unknown as Monitor);

const row = (m: Partial<Monitor>, s: Partial<EventSummary> = {}, runtime?: MonitorRuntime): ConsoleRow => ({
  monitor: monitor(m),
  summary: summary(m.id ?? 1, s),
  runtime,
});

/** `compareRows` normalised to -1 / 0 / 1 so localeCompare magnitudes don't matter. */
const sign = (a: ConsoleRow, b: ConsoleRow, key: ConsoleSortKey, ctx = {}) =>
  Math.sign(compareRows(a, b, key, ctx));

describe('compareRows — every sort key', () => {
  it('orders the numeric columns by their raw value', () => {
    expect(sign(row({ id: 1 }), row({ id: 9 }), 'id')).toBe(-1);
    expect(sign(row({ id: 1, zone_count: 5 }), row({ id: 2, zone_count: 2 }), 'zones')).toBe(1);
    // zone_count is optional on the wire; a missing one counts as zero.
    expect(sign(row({ id: 1, zone_count: undefined }), row({ id: 2, zone_count: 1 }), 'zones')).toBe(-1);
  });

  it('orders each event bucket independently', () => {
    const buckets: Array<[ConsoleSortKey, keyof EventSummary]> = [
      ['events', 'total_events'],
      ['hour', 'hour_events'],
      ['day', 'day_events'],
      ['week', 'week_events'],
      ['month', 'month_events'],
      ['archived', 'archived_events'],
    ];
    for (const [key, field] of buckets) {
      const low = row({ id: 1 }, { [field]: 1 } as Partial<EventSummary>);
      const high = row({ id: 2 }, { [field]: 7 } as Partial<EventSummary>);
      expect(sign(low, high, key), key).toBe(-1);
      expect(sign(high, low, key), key).toBe(1);
    }
  });

  it('orders the Function column by its rendered text', () => {
    // 'Analysing: Always …' sorts ahead of 'Offline'.
    expect(sign(row({ id: 1 }), row({ id: 2, capturing: 'None' }), 'function')).toBe(-1);
  });

  it('orders Source by the resolved host / device / path', () => {
    const host = row({ id: 1, host: 'aaa.local' });
    const device = row({ id: 2, type: 'Local', device: '/dev/video0', host: undefined });
    expect(sign(device, host, 'source')).toBe(-1); // '/dev/…' < 'aaa.local'
  });

  it('orders Server and Storage through the lookup, falling back to the raw id', () => {
    const ctx = {
      serverName: (id: number | null | undefined) => (id === 1 ? 'zebra' : 'alpha'),
      storageName: (id: number | null | undefined) => (id === 1 ? 'zulu' : 'alpha'),
    };
    expect(sign(row({ id: 1, server_id: 1 }), row({ id: 2, server_id: 2 }), 'server', ctx)).toBe(1);
    expect(sign(row({ id: 1, storage_id: 1 }), row({ id: 2, storage_id: 2 }), 'storage', ctx)).toBe(1);

    // With no lookup supplied the ids stringify; a null server_id becomes ''.
    expect(sign(row({ id: 1, server_id: null }), row({ id: 2, server_id: 2 }), 'server')).toBe(-1);
    expect(sign(row({ id: 1, storage_id: 1 }), row({ id: 2, storage_id: 2 }), 'storage')).toBe(-1);
  });

  it('orders Model through the lookup', () => {
    const ctx = { modelName: (id: number | null | undefined) => (id === 1 ? 'Bullet' : 'Aperture') };
    expect(sign(row({ id: 1, model_id: 1 }), row({ id: 2, model_id: 2 }), 'model', ctx)).toBe(1);
    // Without a lookup both sides read as '' and compare equal.
    expect(sign(row({ id: 1, model_id: 1 }), row({ id: 2, model_id: 2 }), 'model')).toBe(0);
    expect(sign(row({ id: 1, manufacturer_id: 1 }), row({ id: 2, manufacturer_id: 2 }), 'manufacturer')).toBe(0);
  });
});

describe('functionLines — remaining branches', () => {
  it('labels on-demand capture and falls back to plain "Capturing"', () => {
    expect(functionLines(monitor({ capturing: 'Ondemand', analysing: 'None', recording: 'None' })))
      .toEqual(['Capturing: On Demand']);
    // Capturing but neither analysing nor recording: the fallback line.
    expect(functionLines(monitor({ analysing: 'None', recording: 'None' }))).toEqual(['Capturing']);
    // `capturing` absent entirely reads as offline.
    expect(functionLines(monitor({ capturing: undefined }))).toEqual(['Offline']);
  });
});

describe('sortRows / searchRows / pageSlice edges', () => {
  it('does not mutate the input array', () => {
    const input = [row({ id: 2 }), row({ id: 1 })];
    const before = input.map((r) => r.monitor.id);
    sortRows(input, 'id', 'asc');
    expect(input.map((r) => r.monitor.id)).toEqual(before);
  });

  it('trims and lower-cases the search query', () => {
    const rows = [row({ id: 1, name: 'Front Door' }), row({ id: 2, name: 'Driveway' })];
    expect(searchRows(rows, '  FRONT ').map((r) => r.monitor.id)).toEqual([1]);
    expect(searchRows(rows, '   ')).toBe(rows);
    expect(searchRows(rows, 'nothing-matches')).toEqual([]);
  });

  it('returns an empty slice past the last page and the whole list for size <= 0', () => {
    expect(pageSlice([1, 2, 3], 9, 2)).toEqual([]);
    expect(pageSlice([1, 2, 3], 1, -1)).toEqual([1, 2, 3]);
    expect(pageSlice([], 1, 25)).toEqual([]);
  });

  it('totals an empty list to all zeroes', () => {
    const t = totalsFor([]);
    expect(t.events).toEqual({ count: 0, disk: 0 });
    expect(t.archived).toEqual({ count: 0, disk: 0 });
    expect(t.zones).toBe(0);
  });
});

describe('exportColumns — every value function', () => {
  const runtime: MonitorRuntime = {
    monitorId: 1, status: 'Connected', captureFps: 10.5, analysisFps: 5, captureFpsRaw: '0', analysisFpsRaw: '5', bandwidth: 2048, updatedOn: '',
  };
  const full = row(
    { id: 7, name: 'Front', manufacturer_id: 1, model_id: 2, zone_count: 3, sequence: 4, width: 640, height: 480 },
    {
      total_events: 30, hour_events: 1, day_events: 2, week_events: 3, month_events: 4, archived_events: 5,
    },
    runtime,
  );
  const ctx = {
    manufacturerName: () => 'Axis',
    modelName: () => 'P3245',
  };

  it('renders every column for a fully populated row', () => {
    const cols = exportColumns(ctx);
    const out = Object.fromEntries(cols.map((c) => [c.key, c.value(full)]));
    expect(out).toEqual({
      id: 7,
      name: 'Front',
      manufacturer: 'Axis',
      model: 'P3245',
      function: 'Analysing: Always Recording: On Motion',
      status: 'Connected',
      capture_fps: 10.5,
      source: '10.0.0.1',
      resolution: '640x480',
      events: 30,
      hour: 1,
      day: 2,
      week: 3,
      month: 4,
      archived: 5,
      zones: 3,
      sequence: 4,
    });
  });

  it('falls back to Unknown / blank when runtime, lookups and sequence are absent', () => {
    const bare = row({ id: 8, zone_count: undefined, sequence: null });
    const out = Object.fromEntries(exportColumns().map((c) => [c.key, c.value(bare)]));
    expect(out.status).toBe('Unknown');
    expect(out.capture_fps).toBe('');
    expect(out.manufacturer).toBe('');
    expect(out.model).toBe('');
    expect(out.zones).toBe(0);
    expect(out.sequence).toBe('');
  });

  it('quotes newline-bearing CSV cells and emits a header-only file for no rows', () => {
    const cols = exportColumns().filter((c) => c.key === 'name');
    expect(rowsToCsv([row({ name: 'line1\nline2' })], cols).split('\n')).toEqual([
      'Name', '"line1', 'line2"',
    ]);
    expect(rowsToCsv([], cols)).toBe('Name');
    expect(rowsToJson([], cols)).toBe('[]');
  });
});

describe('downloadText', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('creates an object URL, clicks a download anchor and revokes the URL', () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => 'blob:zm/1');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(Object.create(URL), { createObjectURL, revokeObjectURL }));

    // The anchor is in the document only between appendChild and remove(),
    // so grab it from inside the click.
    let clicked: HTMLAnchorElement | null = null;
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => { clicked = document.querySelector('a[download]'); });

    try {
      downloadText('console.csv', 'Id,Name\n1,Front', 'text/csv;charset=utf-8');

      expect(createObjectURL).toHaveBeenCalledOnce();
      expect((createObjectURL.mock.calls[0] as unknown as [Blob])[0].type).toBe('text/csv;charset=utf-8');
      expect(click).toHaveBeenCalledOnce();
      expect(clicked!.download).toBe('console.csv');
      expect(clicked!.getAttribute('href')).toBe('blob:zm/1');
      // The anchor is removed again, so nothing is left in the document.
      expect(document.querySelector('a[download]')).toBeNull();

      expect(revokeObjectURL).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1000);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:zm/1');
    } finally {
      click.mockRestore();
      vi.useRealTimers();
    }
  });
});
