import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import type { Monitor } from '@/types';
import { useAuthStore } from '@/stores/auth';
import { useMonitorFilterStore } from '@/stores/monitorFilter';
import type { MonitorRuntime } from './useMonitorStatuses';
import { applyLocalFilters, matchesText, monitorSource, useMonitorFilterRow } from './useMonitorFilterRow';

vi.mock('@tanstack/react-router', () => ({ useSearch: () => ({}), useNavigate: () => vi.fn() }));

const m = (over: Partial<Monitor>): Monitor => ({
  id: 1, name: 'Cam', capturing: 'Always', analysing: 'Always', recording: 'OnMotion',
  host: '10.0.0.1', type: 'Ffmpeg', device: '/dev/video0', path: 'rtsp://x',
  ...over,
} as unknown as Monitor);

describe('matchesText — "text or regular expression"', () => {
  it('treats the pattern as a case-insensitive regex', () => {
    expect(matchesText('^fr.nt', 'Front Door')).toBe(true);
    expect(matchesText('door$', 'Front Door')).toBe(true);
    expect(matchesText('garage', 'Front Door')).toBe(false);
  });
  it('falls back to a substring match when the regex does not compile', () => {
    expect(matchesText('(unclosed', 'a (unclosed b')).toBe(true);
    expect(matchesText('(unclosed', 'nothing')).toBe(false);
  });
  it('matches everything when empty', () => {
    expect(matchesText('', null)).toBe(true);
  });
});

describe('monitorSource', () => {
  it('uses the device for Local cameras and the host otherwise', () => {
    expect(monitorSource(m({ type: 'Local' }))).toBe('/dev/video0');
    expect(monitorSource(m({ type: 'Ffmpeg' }))).toBe('10.0.0.1');
    expect(monitorSource(m({ host: null, path: 'rtsp://user:pw@192.168.0.225:554/Streaming/Channels/101' }))).toBe('192.168.0.225');
    expect(monitorSource(m({ host: null, path: 'not a url' }))).toBe('not a url');
    expect(monitorSource(m({ host: null, path: null }))).toBe('');
  });
});

describe('applyLocalFilters', () => {
  const runtime: Record<number, MonitorRuntime> = {
    1: { monitorId: 1, status: 'Connected', captureFps: 10, analysisFps: 0, bandwidth: 0, updatedOn: '' },
    2: { monitorId: 2, status: 'NotRunning', captureFps: 0, analysisFps: 0, bandwidth: 0, updatedOn: '' },
  };
  const list = [m({ id: 1, name: 'Front' }), m({ id: 2, name: 'Back', host: '10.0.0.2' }), m({ id: 3, name: 'Side' })];

  it('filters by runtime status, treating a missing row as Unknown', () => {
    expect(applyLocalFilters(list, { name: '', source: '', status: 'Connected' }, runtime).map((x) => x.id)).toEqual([1]);
    expect(applyLocalFilters(list, { name: '', source: '', status: 'Unknown' }, runtime).map((x) => x.id)).toEqual([3]);
  });
  it('ANDs name and source', () => {
    expect(applyLocalFilters(list, { name: '^B', source: '0\\.2$', status: '' }, runtime).map((x) => x.id)).toEqual([2]);
    expect(applyLocalFilters(list, { name: '^B', source: '0\\.1$', status: '' }, runtime)).toEqual([]);
  });
});

const server = setupServer(
  http.get('/api/v3/groups', () => HttpResponse.json({ items: [{ id: 7, name: 'Yard' }], total: 1, per_page: 200, current_page: 1, last_page: 1 })),
  http.get('/api/v3/groups-monitors', () => HttpResponse.json({ items: [{ id: 1, group_id: 7, monitor_id: 2 }], total: 1, per_page: 1000, current_page: 1, last_page: 1 })),
);
beforeAll(() => {
  useAuthStore.setState({ accessToken: 't', refreshToken: 't', user: null, isAuthenticated: true });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => { server.resetHandlers(); useMonitorFilterStore.getState().reset(); });
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
}

describe('useMonitorFilterRow', () => {
  const list = [m({ id: 1, name: 'Front' }), m({ id: 2, name: 'Back', capturing: 'None' })];

  it('binds Group / Capturing / Monitor to the shared store and Name to local state', async () => {
    const { result } = renderHook(() => useMonitorFilterRow(list), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.groups).toHaveLength(1));
    expect(result.current.filtered).toHaveLength(2);

    act(() => result.current.set('capturing', 'None'));
    expect(useMonitorFilterStore.getState().capturing).toEqual(['None']);
    expect(result.current.values.capturing).toBe('None');
    expect(result.current.filtered.map((x) => x.id)).toEqual([2]);

    act(() => result.current.set('groupId', '7'));
    expect(useMonitorFilterStore.getState().groupIds).toEqual([7]);
    expect(result.current.filtered.map((x) => x.id)).toEqual([2]);

    act(() => result.current.set('name', 'front'));
    expect(useMonitorFilterStore.getState().groupIds).toEqual([7]); // untouched
    expect(result.current.filtered).toEqual([]);
    expect(result.current.activeCount).toBe(3);

    act(() => result.current.reset());
    expect(result.current.activeCount).toBe(0);
    expect(result.current.filtered).toHaveLength(2);
  });

  it('clear() empties one field only', async () => {
    const { result } = renderHook(() => useMonitorFilterRow(list), { wrapper: wrapper() });
    act(() => { result.current.set('recording', 'Always'); result.current.set('source', '10'); });
    act(() => result.current.clear('recording'));
    expect(result.current.values.recording).toBe('');
    expect(result.current.values.source).toBe('10');
  });
});
