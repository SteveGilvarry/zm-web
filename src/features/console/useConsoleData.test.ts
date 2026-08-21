/**
 * `useConsoleData` is the one fan-out both Console skins sit on: eight
 * queries plus the shared monitor-status poll, folded into a single object
 * with safe defaults. These tests pin the request set, the defaults before
 * anything resolves, the derived histogram, and the fact that only the
 * monitors query is allowed to fail the page.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createElement, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import { lookupSummary, useConsoleData } from './useConsoleData';

const paged = (items: unknown[]) =>
  HttpResponse.json({ items, total: items.length, per_page: 100, current_page: 1, last_page: 1 });

/** Every path the hook touches, in the order it declares them. */
let seen: string[] = [];
const record = (path: string) => { seen.push(path); };

const MONITORS = [
  { id: 1, name: 'Front Door', capturing: 'Always', analysing: 'Always', recording: 'OnMotion', orientation: 'ROTATE_90', width: 1920, height: 1080 },
  { id: 2, name: 'Driveway', capturing: 'None', analysing: 'None', recording: 'None', orientation: 'Rotate0', width: 640, height: 480 },
];
const SUMMARIES = [
  {
    monitor_id: 1,
    total_events: 30, total_event_disk_space: 1000,
    hour_events: 2, hour_event_disk_space: 10,
    day_events: 5, day_event_disk_space: 20,
    week_events: 9, week_event_disk_space: 30,
    month_events: 20, month_event_disk_space: 40,
    archived_events: 1, archived_event_disk_space: 50,
  },
];
const STATUSES = [
  { monitor_id: 1, status: 'Connected', capture_fps: '10.50', analysis_fps: '5.00', capture_bandwidth: 2048, updated_on: '2026-08-21T07:00:00Z' },
  { monitor_id: 2, status: 'NotRunning', capture_fps: 'n/a', analysis_fps: '', capture_bandwidth: 0, updated_on: '2026-08-21T07:00:00Z' },
];

function happyPath() {
  server.use(
    http.get('/api/v3/monitors', () => { record('/monitors'); return paged(MONITORS); }),
    http.get('/api/v3/live/sessions', () => { record('/live/sessions'); return HttpResponse.json([1]); }),
    http.get('/api/v3/events', ({ request }) => {
      const q = new URL(request.url).searchParams;
      // The 10-row "recent" query and the 1000-row 24h query hit the same path.
      record(q.get('page_size') === '1000' ? '/events?last24h' : '/events?recent');
      if (q.get('page_size') === '1000') {
        return paged([
          { id: 9, monitor_id: 1, name: 'Event 9', start_date_time: '2026-08-21T07:00:00Z', end_date_time: '2026-08-21T07:00:30Z', length: '30.00' },
          { id: 8, monitor_id: 1, name: 'Event 8', start_date_time: '2026-08-21T05:30:00Z', end_date_time: '2026-08-21T05:30:30Z', length: '30.00' },
          { id: 7, monitor_id: 2, name: 'Event 7', start_date_time: '2026-08-21T06:59:00Z', end_date_time: '2026-08-21T06:59:30Z', length: '30.00' },
        ]);
      }
      return paged([{ id: 9, monitor_id: 1, name: 'Event 9', start_date_time: '2026-08-21T07:00:00Z', end_date_time: '2026-08-21T07:00:30Z', length: '30.00' }]);
    }),
    http.get('/api/v3/events/counts/:hours', ({ params }) => {
      record(`/events/counts/${params.hours}`);
      return HttpResponse.json({ hours: Number(params.hours), counts: [{ count: 4, date: '2026-08-21T06:00:00Z' }, { count: 6, date: '2026-08-21T07:00:00Z' }] });
    }),
    http.get('/api/v3/daemons', () => {
      record('/daemons');
      return HttpResponse.json({ daemons: [{ id: 'zmstats.pl', name: 'zmstats.pl', state: 'running', pid: 12, uptime_seconds: 60 }] });
    }),
    http.get('/api/v3/system/status', () => {
      record('/system/status');
      return HttpResponse.json({ running: true, daemons: [], stats: { cpu_load: 1.2, cpu_usage_percent: 15, total_mem: 16e9, free_mem: 8e9, total_swap: 0, free_swap: 0, total_disk: 1e12, used_disk: 5e11, free_disk: 5e11, disk_usage_percent: 50 } });
    }),
    http.get('/api/v3/event-summaries', () => { record('/event-summaries'); return paged(SUMMARIES); }),
    http.get('/api/v3/monitor-status', () => { record('/monitor-status'); return paged(STATUSES); }),
  );
}

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({ accessToken: 't', refreshToken: 't', user: null, isAuthenticated: true });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => { server.resetHandlers(); seen = []; });
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

function wrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

describe('useConsoleData', () => {
  it('fans out to every console endpoint exactly once', async () => {
    happyPath();
    const { result } = renderHook(() => useConsoleData(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.monitors).toHaveLength(2));
    await waitFor(() => expect(seen).toHaveLength(9));

    expect([...seen].sort()).toEqual([
      '/daemons',
      '/event-summaries',
      '/events/counts/24',
      '/events?last24h',
      '/events?recent',
      '/live/sessions',
      '/monitor-status',
      '/monitors',
      '/system/status',
    ]);
  });

  it('exposes every slice the console renders from', async () => {
    happyPath();
    const { result } = renderHook(() => useConsoleData(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.summariesByMonitor).toHaveLength(1));

    // Monitor enums are canonicalised on the way in (ROTATE_90 -> Rotate90).
    expect(result.current.monitors.map((m) => m.name)).toEqual(['Front Door', 'Driveway']);
    expect(result.current.monitors[0].orientation).toBe('Rotate90');

    expect(result.current.liveSessions).toEqual([1]);
    expect(result.current.events.map((e) => e.id)).toEqual([9]);
    // The 24h card sums the hourly buckets rather than trusting a total field.
    expect(result.current.eventCount24h).toBe(10);
    expect(result.current.daemons.map((d) => d.name)).toEqual(['zmstats.pl']);
    expect(result.current.isSystemRunning).toBe(true);
    expect(result.current.systemStats?.disk_usage_percent).toBe(50);
    expect(result.current.summariesByMonitor[0].total_events).toBe(30);
    expect(result.current.isError).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('buckets the last-24h events per monitor, anchored on the freshest event', async () => {
    happyPath();
    const { result } = renderHook(() => useConsoleData(), { wrapper: wrapper() });
    await waitFor(() => expect(Object.keys(result.current.hourlyByMonitor)).toHaveLength(2));

    // Anchor is 07:00 (event 9): monitor 1 has one event now and one 1.5h back.
    expect(result.current.hourlyByMonitor[1][0]).toBe(1);
    expect(result.current.hourlyByMonitor[1][1]).toBe(1);
    expect(result.current.hourlyByMonitor[1].reduce((a, b) => a + b, 0)).toBe(2);
    // Monitor 2's single event is inside the same hour as the anchor.
    expect(result.current.hourlyByMonitor[2][0]).toBe(1);
  });

  it('parses the monitor-status rows into the runtime map, zeroing unparseable fps', async () => {
    happyPath();
    const { result } = renderHook(() => useConsoleData(), { wrapper: wrapper() });
    await waitFor(() => expect(Object.keys(result.current.runtimeById)).toHaveLength(2));

    expect(result.current.runtimeById[1]).toMatchObject({
      monitorId: 1, status: 'Connected', captureFps: 10.5, analysisFps: 5, bandwidth: 2048,
    });
    // `capture_fps: 'n/a'` and `analysis_fps: ''` must not become NaN.
    expect(result.current.runtimeById[2]).toMatchObject({
      monitorId: 2, status: 'NotRunning', captureFps: 0, analysisFps: 0, bandwidth: 0,
    });
  });

  it('starts with empty collections rather than undefined', () => {
    happyPath();
    const { result } = renderHook(() => useConsoleData(), { wrapper: wrapper() });
    expect(result.current.monitors).toEqual([]);
    expect(result.current.liveSessions).toEqual([]);
    expect(result.current.events).toEqual([]);
    expect(result.current.daemons).toEqual([]);
    expect(result.current.summariesByMonitor).toEqual([]);
    expect(result.current.hourlyByMonitor).toEqual({});
    expect(result.current.eventCount24h).toBe(0);
    expect(result.current.isSystemRunning).toBeUndefined();
    expect(result.current.systemStats).toBeUndefined();
    expect(result.current.loading.monitors).toBe(true);
    expect(result.current.loading.events).toBe(true);
  });

  it('flags isError only for the monitors query', async () => {
    happyPath();
    server.use(
      http.get('/api/v3/monitors', () =>
        HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'monitors table locked' }, { status: 500 })),
    );
    const { result } = renderHook(() => useConsoleData(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeTruthy();
    expect(result.current.monitors).toEqual([]);
  });

  it('survives the backend being unreachable', async () => {
    happyPath();
    server.use(http.get('/api/v3/monitors', () => HttpResponse.error()));
    const { result } = renderHook(() => useConsoleData(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.monitors).toEqual([]);
  });

  it('keeps rendering when a secondary query fails', async () => {
    happyPath();
    server.use(
      http.get('/api/v3/event-summaries', () =>
        HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'nope' }, { status: 500 })),
      http.get('/api/v3/daemons', () => HttpResponse.error()),
    );
    const { result } = renderHook(() => useConsoleData(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.monitors).toHaveLength(2));
    await waitFor(() => expect(result.current.loading.events).toBe(false));

    expect(result.current.isError).toBe(false);
    expect(result.current.summariesByMonitor).toEqual([]);
    expect(result.current.daemons).toEqual([]);
  });

  it('refetch pulls the monitor list again', async () => {
    happyPath();
    const { result } = renderHook(() => useConsoleData(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.monitors).toHaveLength(2));
    const before = seen.filter((p) => p === '/monitors').length;

    result.current.refetch();
    await waitFor(() =>
      expect(seen.filter((p) => p === '/monitors').length).toBe(before + 1));
  });

  it('issues nothing while signed out', async () => {
    happyPath();
    useAuthStore.setState({ isAuthenticated: false });
    try {
      const { result } = renderHook(() => useConsoleData(), { wrapper: wrapper() });
      await new Promise((r) => setTimeout(r, 30));
      expect(seen).toEqual([]);
      expect(result.current.monitors).toEqual([]);
    } finally {
      useAuthStore.setState({ isAuthenticated: true });
    }
  });
});

describe('lookupSummary', () => {
  it('returns the matching row', () => {
    expect(lookupSummary(SUMMARIES, 1).total_events).toBe(30);
  });

  it('returns a zeroed row stamped with the monitor id when absent', () => {
    const row = lookupSummary(SUMMARIES, 42);
    expect(row.monitor_id).toBe(42);
    expect(row.total_events).toBe(0);
    expect(row.archived_event_disk_space).toBe(0);
  });

  it('tolerates undefined and non-array input from a stale cache', () => {
    expect(lookupSummary(undefined, 7).monitor_id).toBe(7);
    expect(lookupSummary({} as unknown as typeof SUMMARIES, 7).total_events).toBe(0);
  });

  it('hands back a fresh object each time so callers cannot poison the blank', () => {
    const a = lookupSummary([], 1);
    a.total_events = 99;
    expect(lookupSummary([], 1).total_events).toBe(0);
  });
});
