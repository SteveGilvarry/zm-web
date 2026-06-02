import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  listReports,
  getReport,
  createReport,
  updateReport,
  deleteReport,
} from './reports';
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

describe('listReports / getReport', () => {
  it('listReports GETs /reports', async () => {
    server.use(
      http.get('/api/v3/reports', () => HttpResponse.json({
        items: [{ id: 1, name: 'Weekly' }],
        total: 1, per_page: 20, current_page: 1, last_page: 1,
      })),
    );
    const out = await listReports();
    expect(out.items[0].name).toBe('Weekly');
  });

  it('getReport GETs /reports/{id}', async () => {
    let id: string | undefined;
    server.use(
      http.get('/api/v3/reports/:id', ({ params }) => {
        id = params.id as string;
        return HttpResponse.json({ id: 4, name: 'Daily' });
      }),
    );
    const out = await getReport(4);
    expect(id).toBe('4');
    expect(out.name).toBe('Daily');
  });
});

describe('createReport / updateReport / deleteReport', () => {
  it('createReport POSTs the payload', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/v3/reports', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: 42, name: 'New' });
      }),
    );
    const out = await createReport({
      name: 'New',
      start_date_time: '2026-06-01T00:00:00Z',
      end_date_time: '2026-06-02T00:00:00Z',
    });
    expect(body).toEqual({
      name: 'New',
      start_date_time: '2026-06-01T00:00:00Z',
      end_date_time: '2026-06-02T00:00:00Z',
    });
    expect(out.id).toBe(42);
  });

  it('updateReport PATCHes the partial body', async () => {
    let body: unknown = null;
    let method: string | undefined;
    server.use(
      http.patch('/api/v3/reports/3', async ({ request }) => {
        method = request.method;
        body = await request.json();
        return HttpResponse.json({ id: 3, name: 'Renamed' });
      }),
    );
    await updateReport(3, { name: 'Renamed' });
    expect(method).toBe('PATCH');
    expect(body).toEqual({ name: 'Renamed' });
  });

  it('deleteReport DELETEs /reports/{id}', async () => {
    let id: string | undefined;
    server.use(
      http.delete('/api/v3/reports/:id', ({ params }) => {
        id = params.id as string;
        return HttpResponse.json({}, { status: 204 });
      }),
    );
    await deleteReport(9);
    expect(id).toBe('9');
  });
});
