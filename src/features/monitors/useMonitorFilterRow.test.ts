import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import type { Monitor } from '@/types';
import { useAuthStore } from '@/stores/auth';
import { useMonitorFilterStore } from '@/stores/monitorFilter';
import { useMonitorFilterRowStore } from '@/stores/monitorFilterRow';
import type { MonitorRuntime } from './useMonitorStatuses';
import {
  applyLocalFilters, expandGroupIds, groupDropdownOptions, matchesText, monitorSource, useMonitorFilterRow,
} from './useMonitorFilterRow';
import type { Group } from '@/api/groups';

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
    1: { monitorId: 1, status: 'Connected', captureFps: 10, analysisFps: 0, captureFpsRaw: '0', analysisFpsRaw: '0', bandwidth: 0, updatedOn: '' },
    2: { monitorId: 2, status: 'NotRunning', captureFps: 0, analysisFps: 0, captureFpsRaw: '0', analysisFpsRaw: '0', bandwidth: 0, updatedOn: '' },
  };
  const list = [m({ id: 1, name: 'Front' }), m({ id: 2, name: 'Back', host: '10.0.0.2' }), m({ id: 3, name: 'Side' })];

  it('filters by runtime status, treating a missing row as Not Running (legacy COALESCE)', () => {
    expect(applyLocalFilters(list, { name: '', source: '', status: 'Connected' }, runtime).map((x) => x.id)).toEqual([1]);
    expect(applyLocalFilters(list, { name: '', source: '', status: 'NotRunning' }, runtime).map((x) => x.id)).toEqual([2, 3]);
    expect(applyLocalFilters(list, { name: '', source: '', status: 'Unknown' }, runtime)).toEqual([]);
  });
  it('ORs the statuses within the multi-select', () => {
    expect(applyLocalFilters(list, { name: '', source: '', status: 'Connected,NotRunning' }, runtime).map((x) => x.id))
      .toEqual([1, 2, 3]);
  });
  it('matches Source against the full Path as well as the host', () => {
    const cams = [
      m({ id: 1, host: '10.0.0.1', path: 'rtsp://10.0.0.1:554/Streaming/Channels/101' }),
      m({ id: 2, host: '10.0.0.2', path: 'rtsp://10.0.0.2:554/h264' }),
    ];
    expect(applyLocalFilters(cams, { name: '', source: 'Channels/101', status: '' }, runtime).map((x) => x.id)).toEqual([1]);
    expect(applyLocalFilters(cams, { name: '', source: '0\\.2$', status: '' }, runtime).map((x) => x.id)).toEqual([2]);
  });
  it('keeps deleted monitors out unless Deleted is picked, and adds them beside real statuses', () => {
    const withDeleted = [...list, m({ id: 9, name: 'Gone', deleted: true })];
    const ids = (status: string) => applyLocalFilters(withDeleted, { name: '', source: '', status }, runtime).map((x) => x.id);
    expect(ids('')).toEqual([1, 2, 3]);
    expect(ids('Deleted')).toEqual([9]);
    expect(ids('Connected,Deleted')).toEqual([1, 9]);
  });
  it('ANDs name and source', () => {
    expect(applyLocalFilters(list, { name: '^B', source: '0\\.2$', status: '' }, runtime).map((x) => x.id)).toEqual([2]);
    expect(applyLocalFilters(list, { name: '^B', source: '0\\.1$', status: '' }, runtime)).toEqual([]);
  });
});

describe('group dropdown', () => {
  const groups: Group[] = [
    { id: 1, name: 'outside', parent_id: null },
    { id: 2, name: 'Yard', parent_id: 1 },
    { id: 3, name: 'Gate', parent_id: 2 },
    { id: 4, name: 'Drive', parent_id: 1 },
    { id: 5, name: 'Indoors', parent_id: null },
    { id: 6, name: 'Orphan', parent_id: 99 },
  ];
  it('orders by lower-cased name with children under their parent, depth from the root', () => {
    expect(groupDropdownOptions(groups).map((g) => `${g.depth}:${g.name}`))
      .toEqual(['0:Indoors', '0:Orphan', '0:outside', '1:Drive', '1:Yard', '2:Gate']);
  });
  it('adds the direct children of a picked group, one level down like Group::get_group_sql', () => {
    expect(expandGroupIds([1], groups).sort()).toEqual([1, 2, 4]);
    expect(expandGroupIds([], groups)).toEqual([]);
  });
});

const server = setupServer(
  http.get('/api/v3/servers', () => HttpResponse.json({ items: [], total: 0, per_page: 200, current_page: 1, last_page: 1 })),
  http.get('/api/v3/storage', () => HttpResponse.json({ items: [], total: 0, per_page: 200, current_page: 1, last_page: 1 })),
  http.get('/api/v3/groups', () => HttpResponse.json({ items: [{ id: 7, name: 'Yard' }], total: 1, per_page: 200, current_page: 1, last_page: 1 })),
  http.get('/api/v3/groups-monitors', () => HttpResponse.json({ items: [{ id: 1, group_id: 7, monitor_id: 2 }], total: 1, per_page: 1000, current_page: 1, last_page: 1 })),
);
beforeAll(() => {
  useAuthStore.setState({ accessToken: 't', refreshToken: 't', user: null, isAuthenticated: true });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  server.resetHandlers();
  useMonitorFilterStore.getState().reset();
  useMonitorFilterRowStore.getState().reset();
});
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

  it('carries a multi-select\'s whole selection, OR-combined', async () => {
    const wide = [
      m({ id: 1, name: 'Front', capturing: 'Always' }),
      m({ id: 2, name: 'Back', capturing: 'None' }),
      m({ id: 3, name: 'Side', capturing: 'Ondemand' }),
    ];
    const { result } = renderHook(() => useMonitorFilterRow(wide), { wrapper: wrapper() });

    act(() => result.current.setMulti('capturing', ['None', 'Ondemand']));
    expect(useMonitorFilterStore.getState().capturing).toEqual(['None', 'Ondemand']);
    expect(result.current.valuesMulti.capturing).toEqual(['None', 'Ondemand']);
    expect(result.current.filtered.map((x) => x.id)).toEqual([2, 3]);

    act(() => result.current.setMulti('monitorId', ['1', '3']));
    expect(result.current.values.monitorId).toBe('1,3');
    expect(result.current.filtered.map((x) => x.id)).toEqual([3]);
  });

  it('filters on Server and Storage, several at a time', async () => {
    const wide = [
      m({ id: 1, server_id: 1, storage_id: 1 }),
      m({ id: 2, server_id: 2, storage_id: 1 }),
      m({ id: 3, server_id: null, storage_id: 2 }),
    ];
    const { result } = renderHook(() => useMonitorFilterRow(wide), { wrapper: wrapper() });

    act(() => result.current.setMulti('serverId', ['1', '2']));
    expect(result.current.filtered.map((x) => x.id)).toEqual([1, 2]);

    act(() => result.current.clear('serverId'));
    act(() => result.current.setMulti('storageId', ['2']));
    expect(result.current.filtered.map((x) => x.id)).toEqual([3]);
  });

  it('offers the servers and storage areas the box has', async () => {
    server.use(
      http.get('/api/v3/servers', () => HttpResponse.json({
        items: [{ id: 1, name: 'zm1' }, { id: 2, name: 'zm2' }],
        total: 2, per_page: 200, current_page: 1, last_page: 1,
      })),
      http.get('/api/v3/storage', () => HttpResponse.json({
        items: [{ id: 1, name: 'Default' }],
        total: 1, per_page: 200, current_page: 1, last_page: 1,
      })),
    );
    const { result } = renderHook(() => useMonitorFilterRow(list), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.servers).toHaveLength(2));
    expect(result.current.storages.map((s) => s.name)).toEqual(['Default']);
  });

  it('fetches with include_deleted only while the Status select holds Deleted', async () => {
    const calls: string[] = [];
    server.use(http.get('/api/v3/monitors', ({ request }) => {
      calls.push(new URL(request.url).search);
      return HttpResponse.json({
        items: [m({ id: 1, name: 'Front' }), m({ id: 9, name: 'Gone', deleted: true })],
        total: 2, per_page: 500, current_page: 1, last_page: 1,
      });
    }));
    const { result } = renderHook(() => useMonitorFilterRow(list), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.groups).toHaveLength(1));

    // Every other status, and none, asks nothing of /monitors.
    for (const status of ['Unknown', 'NotRunning', 'Running', 'Connected']) {
      act(() => result.current.setMulti('status', [status]));
    }
    act(() => result.current.clear('status'));
    expect(calls).toEqual([]);

    act(() => result.current.setMulti('status', ['Deleted']));
    await waitFor(() => expect(result.current.filtered.map((x) => x.id)).toEqual([9]));
    expect(calls).toHaveLength(1);
    expect(new URLSearchParams(calls[0]).get('include_deleted')).toBe('true');
  });

  it('includes a picked group\'s child groups', async () => {
    server.use(
      http.get('/api/v3/groups', () => HttpResponse.json({
        items: [{ id: 7, name: 'Yard', parent_id: null }, { id: 8, name: 'Gate', parent_id: 7 }],
        total: 2, per_page: 200, current_page: 1, last_page: 1,
      })),
      http.get('/api/v3/groups-monitors', () => HttpResponse.json({
        items: [{ id: 1, group_id: 8, monitor_id: 1 }],
        total: 1, per_page: 1000, current_page: 1, last_page: 1,
      })),
    );
    const { result } = renderHook(() => useMonitorFilterRow(list), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.groupOptions).toHaveLength(2));
    act(() => result.current.set('groupId', '7'));
    await waitFor(() => expect(result.current.filtered.map((x) => x.id)).toEqual([1]));
  });

  it('offers in the Monitor select only what the other fields let through', async () => {
    const { result } = renderHook(() => useMonitorFilterRow(list), { wrapper: wrapper() });
    act(() => result.current.set('name', 'back'));
    expect(result.current.monitorOptions.map((x) => x.id)).toEqual([2]);
  });

  it('ignores a Monitor selection none of which survives the other fields', async () => {
    const { result } = renderHook(() => useMonitorFilterRow(list), { wrapper: wrapper() });
    act(() => result.current.set('monitorId', '1'));
    expect(result.current.filtered.map((x) => x.id)).toEqual([1]);
    act(() => result.current.set('name', 'back'));
    expect(result.current.filtered.map((x) => x.id)).toEqual([2]);
  });

  it('keeps Name, Source, Status, Server and Storage across a remount, as legacy cookies do', async () => {
    const first = renderHook(() => useMonitorFilterRow(list), { wrapper: wrapper() });
    act(() => {
      first.result.current.set('name', 'front');
      first.result.current.set('source', '10\\.0');
      first.result.current.setMulti('status', ['Connected']);
      first.result.current.setMulti('serverId', ['2']);
      first.result.current.setMulti('storageId', ['3']);
    });
    first.unmount();
    const second = renderHook(() => useMonitorFilterRow(list), { wrapper: wrapper() });
    expect(second.result.current.values).toMatchObject({
      name: 'front', source: '10\\.0', status: 'Connected', serverId: '2', storageId: '3',
    });
    expect(JSON.parse(sessionStorage.getItem('zm-monitor-filter-row') ?? '{}').state.name).toBe('front');
  });

  it('polls /monitor-status itself for a page that passes no runtime, only once a status is picked', async () => {
    let polls = 0;
    server.use(http.get('/api/v3/monitor-status', () => {
      polls++;
      return HttpResponse.json({
        items: [{ monitor_id: 1, status: 'Connected', capture_fps: '5', analysis_fps: '0', capture_bandwidth: 0, updated_on: '' }],
        total: 1, per_page: 1000, current_page: 1, last_page: 1,
      });
    }));
    const { result } = renderHook(() => useMonitorFilterRow(list), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.groups).toHaveLength(1));
    expect(polls).toBe(0);
    act(() => result.current.setMulti('status', ['Connected']));
    await waitFor(() => expect(result.current.filtered.map((x) => x.id)).toEqual([1]));
    expect(polls).toBeGreaterThan(0);
  });

  it('clear() empties one field only', async () => {
    const { result } = renderHook(() => useMonitorFilterRow(list), { wrapper: wrapper() });
    act(() => { result.current.set('recording', 'Always'); result.current.set('source', '10'); });
    act(() => result.current.clear('recording'));
    expect(result.current.values.recording).toBe('');
    expect(result.current.values.source).toBe('10');
  });
});
