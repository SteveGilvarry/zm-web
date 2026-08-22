import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { getMonitorStatuses, getMonitorStatus } from './monitorStatus';
import { useAuthStore } from '@/stores/auth';

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', user: null, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

const row = {
  monitor_id: 1, status: 'Connected', capture_fps: '10.89', analysis_fps: '0.00',
  capture_bandwidth: 1427762, updated_on: '2026-08-20T21:52:46+00:00',
};

describe('getMonitorStatuses', () => {
  it('GETs /monitor-status with paging params', async () => {
    let url: URL | undefined;
    server.use(
      http.get('/api/v3/monitor-status', ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json({ items: [row], total: 1, per_page: 500, current_page: 1, last_page: 1 });
      }),
    );
    const out = await getMonitorStatuses({ page: 1, page_size: 500 });
    expect(url?.searchParams.get('page_size')).toBe('500');
    expect(out.items[0].capture_fps).toBe('10.89');
  });
});

describe('getMonitorStatus', () => {
  it('GETs /monitor-status/{id}', async () => {
    server.use(http.get('/api/v3/monitor-status/1', () => HttpResponse.json(row)));
    const out = await getMonitorStatus(1);
    expect(out.status).toBe('Connected');
  });
});
