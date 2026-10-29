/**
 * Coverage for the console table helpers the first pass left untouched:
 * every `compareRows` branch (including the four name-lookup columns and
 * the five event buckets), the `pageSlice` edges, and `downloadText`'s
 * anchor dance.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Monitor } from '@/types';
import type { EventSummary } from '@/api/eventSummaries';
import type { MonitorRuntime } from '@/features/monitors/useMonitorStatuses';
import {
  compareRows, consoleStatus, downloadText, pageSlice,
  searchRows, sortRows, statusBreakdown, totalsFor, type ConsoleRow, type ConsoleSortKey,
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
    // 'Analysing: Always …' sorts ahead of 'Offline' (no status row).
    const live: MonitorRuntime = {
      monitorId: 1, status: 'Connected', captureFps: 10, analysisFps: 5, captureFpsRaw: '10.00', analysisFpsRaw: '5.00',
      bandwidth: 0, updatedOn: new Date().toISOString(),
    };
    expect(sign(row({ id: 1 }, {}, live), row({ id: 2 }), 'function')).toBe(-1);
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

describe('console status breakdown (console.php $status_counts)', () => {
  const rt = (status: string): MonitorRuntime => ({
    monitorId: 0, status, captureFps: 0, analysisFps: 0, captureFpsRaw: '0', analysisFpsRaw: '0', bandwidth: 0, updatedOn: '',
  });

  it('counts deleted, missing-row and WebSite monitors as legacy does', () => {
    expect(consoleStatus(monitor({ deleted: true } as Partial<Monitor>), rt('Connected'))).toBe('Deleted');
    expect(consoleStatus(monitor({}), undefined)).toBe('NotRunning');
    expect(consoleStatus(monitor({ type: 'WebSite' } as Partial<Monitor>), undefined)).toBe('Running');
    expect(consoleStatus(monitor({}), rt('Connected'))).toBe('Connected');
  });

  it('lists statuses by first appearance in sequence order, rounded like PHP round(x, 1)', () => {
    const rows = [
      row({ id: 1, sequence: 3 }, {}, rt('Connected')),
      row({ id: 2, sequence: 1 }, {}, rt('Running')),
      row({ id: 3, sequence: 2 }, {}, rt('Running')),
    ];
    expect(statusBreakdown(rows)).toEqual([
      { status: 'Running', pct: '66.7' },
      { status: 'Connected', pct: '33.3' },
    ]);
    expect(statusBreakdown([rows[0]])).toEqual([{ status: 'Connected', pct: '100' }]);
    expect(statusBreakdown([])).toEqual([]);
  });

  it('searches Path, Device, Host and the runtime Status too', () => {
    const rows = [
      row({ id: 1, path: 'rtsp://cam/Streaming/Channels/101', host: 'gate.local' } as Partial<Monitor>, {}, rt('Connected')),
      row({ id: 2, device: '/dev/video3', host: null } as Partial<Monitor>, {}, rt('NotRunning')),
    ];
    expect(searchRows(rows, 'channels/101').map((r) => r.monitor.id)).toEqual([1]);
    expect(searchRows(rows, 'gate.local').map((r) => r.monitor.id)).toEqual([1]);
    expect(searchRows(rows, 'video3').map((r) => r.monitor.id)).toEqual([2]);
    expect(searchRows(rows, 'notrunning').map((r) => r.monitor.id)).toEqual([2]);
  });
});
