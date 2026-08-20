import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { useAuthStore } from '@/stores/auth';
import { fetchLatestServerStats, latestPerServer, serverStatusTone, summarizeStat } from './serverStats';
import type { ServerStat } from '@/api/system';

const row = (over: Partial<ServerStat>): ServerStat => ({
  id: 1, server_id: 0, time_stamp: '2026-08-19T21:51:09+00:00', ...over,
});

describe('latestPerServer', () => {
  it('keeps the newest sample for each server, treating null server_id as 0', () => {
    const m = latestPerServer([
      row({ id: 1, server_id: null, time_stamp: '2026-08-19T21:51:09+00:00', cpu_load: '1.0' }),
      row({ id: 2, server_id: 0, time_stamp: '2026-08-19T21:53:09+00:00', cpu_load: '2.0' }),
      row({ id: 3, server_id: 4, time_stamp: '2026-08-19T21:52:09+00:00', cpu_load: '3.0' }),
      row({ id: 4, server_id: 0, time_stamp: '2026-08-19T21:52:09+00:00', cpu_load: '9.9' }),
    ]);
    expect(m.get(0)?.cpu_load).toBe('2.0');
    expect(m.get(4)?.cpu_load).toBe('3.0');
    expect(m.size).toBe(2);
  });
});

describe('summarizeStat', () => {
  it('reads the string percentages and derives memory use', () => {
    const s = summarizeStat(row({ cpu_load: '1.7', cpu_usage_percent: '40.2', total_mem: 1000, free_mem: 250 }));
    expect(s).toMatchObject({ cpuLoad: 1.7, cpuPercent: 40.2, memPercent: 75 });
  });
  it('nulls what is missing', () => {
    expect(summarizeStat(row({}))).toMatchObject({ cpuLoad: null, cpuPercent: null, memPercent: null });
  });
});

describe('fetchLatestServerStats', () => {
  const server = setupServer();
  beforeAll(() => {
    useAuthStore.setState({ accessToken: 't', refreshToken: 't', user: null, isAuthenticated: true });
    server.listen({ onUnhandledRequest: 'error' });
  });
  afterEach(() => server.resetHandlers());
  afterAll(() => {
    server.close();
    useAuthStore.getState().clearAuth();
  });

  it('reads the total, then fetches the last page', async () => {
    const calls: string[] = [];
    server.use(
      http.get('/api/v3/server-stats', ({ request }) => {
        const u = new URL(request.url);
        calls.push(u.search);
        const page = Number(u.searchParams.get('page'));
        const size = Number(u.searchParams.get('page_size'));
        const items = page === 8 ? [row({ id: 1441, cpu_load: '1.7' })] : [row({ id: 1 })];
        return HttpResponse.json({ items, total: 1441, per_page: size, current_page: page, last_page: Math.ceil(1441 / size) });
      }),
    );
    const m = await fetchLatestServerStats(200);
    expect(calls).toEqual(['?page=1&page_size=1', '?page=8&page_size=200']);
    expect(m.get(0)?.id).toBe(1441);
  });

  it('stops after the first call when there are no samples', async () => {
    let calls = 0;
    server.use(http.get('/api/v3/server-stats', () => {
      calls += 1;
      return HttpResponse.json({ items: [], total: 0, per_page: 1, current_page: 1, last_page: 1 });
    }));
    expect((await fetchLatestServerStats()).size).toBe(0);
    expect(calls).toBe(1);
  });
});

describe('serverStatusTone', () => {
  it('maps the Servers.Status enum and older spellings', () => {
    expect(serverStatusTone('Running')).toBe('ok');
    expect(serverStatusTone('NotRunning')).toBe('down');
    expect(serverStatusTone('not_running')).toBe('down');
    expect(serverStatusTone('')).toBe('unknown');
  });
});
