import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  listMonitorsPermissions,
  getMonitorPermission,
  createMonitorPermission,
  updateMonitorPermission,
  deleteMonitorPermission,
} from './monitorsPermissions';
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

describe('listMonitorsPermissions', () => {
  it('GETs /monitors-permissions with pagination', async () => {
    let url = '';
    server.use(
      http.get('/api/v3/monitors-permissions', ({ request }) => {
        url = request.url;
        return HttpResponse.json({
          items: [{ id: 1, monitor_id: 4, user_id: 5, permission: 'Edit' }],
          total: 1, per_page: 1000, current_page: 1, last_page: 1,
        });
      }),
    );
    const out = await listMonitorsPermissions({ page: 1, page_size: 1000 });
    expect(url).toContain('page_size=1000');
    expect(out.items[0].monitor_id).toBe(4);
  });
});

describe('getMonitorPermission', () => {
  it('GETs /monitors-permissions/{id}', async () => {
    let id: string | undefined;
    server.use(
      http.get('/api/v3/monitors-permissions/:id', ({ params }) => {
        id = params.id as string;
        return HttpResponse.json({ id: 5, monitor_id: 1, user_id: 2, permission: 'View' });
      }),
    );
    const out = await getMonitorPermission(5);
    expect(id).toBe('5');
    expect(out.permission).toBe('View');
  });
});

describe('createMonitorPermission', () => {
  it('POSTs the monitor_id, user_id and permission', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/v3/monitors-permissions', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: 8, monitor_id: 1, user_id: 2, permission: 'None' });
      }),
    );
    const out = await createMonitorPermission({ monitor_id: 1, user_id: 2, permission: 'None' });
    expect(body).toEqual({ monitor_id: 1, user_id: 2, permission: 'None' });
    expect(out.id).toBe(8);
  });
});

describe('updateMonitorPermission', () => {
  it('PATCHes /monitors-permissions/{id} with permission only', async () => {
    let body: unknown = null;
    let method: string | undefined;
    server.use(
      http.patch('/api/v3/monitors-permissions/3', async ({ request }) => {
        method = request.method;
        body = await request.json();
        return HttpResponse.json({ id: 3, monitor_id: 1, user_id: 2, permission: 'Edit' });
      }),
    );
    const out = await updateMonitorPermission(3, 'Edit');
    expect(method).toBe('PATCH');
    expect(body).toEqual({ permission: 'Edit' });
    expect(out.permission).toBe('Edit');
  });
});

describe('deleteMonitorPermission', () => {
  it('DELETEs /monitors-permissions/{id}', async () => {
    let id: string | undefined;
    server.use(
      http.delete('/api/v3/monitors-permissions/:id', ({ params }) => {
        id = params.id as string;
        return HttpResponse.json({}, { status: 204 });
      }),
    );
    await deleteMonitorPermission(15);
    expect(id).toBe('15');
  });
});
