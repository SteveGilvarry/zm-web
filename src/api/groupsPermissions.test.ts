import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  listGroupsPermissions,
  getGroupPermission,
  createGroupPermission,
  updateGroupPermission,
  deleteGroupPermission,
} from './groupsPermissions';
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

describe('listGroupsPermissions', () => {
  it('GETs /groups-permissions with pagination', async () => {
    let url = '';
    server.use(
      http.get('/api/v3/groups-permissions', ({ request }) => {
        url = request.url;
        return HttpResponse.json({
          items: [{ id: 1, group_id: 2, user_id: 3, permission: 'View' }],
          total: 1, per_page: 1000, current_page: 1, last_page: 1,
        });
      }),
    );
    const out = await listGroupsPermissions({ page: 1, page_size: 1000 });
    expect(url).toContain('page=1');
    expect(url).toContain('page_size=1000');
    expect(out.items[0].permission).toBe('View');
  });
});

describe('getGroupPermission', () => {
  it('GETs /groups-permissions/{id}', async () => {
    let id: string | undefined;
    server.use(
      http.get('/api/v3/groups-permissions/:id', ({ params }) => {
        id = params.id as string;
        return HttpResponse.json({ id: 7, group_id: 2, user_id: 3, permission: 'Edit' });
      }),
    );
    const out = await getGroupPermission(7);
    expect(id).toBe('7');
    expect(out.permission).toBe('Edit');
  });
});

describe('createGroupPermission', () => {
  it('POSTs the group_id, user_id and permission', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/v3/groups-permissions', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: 11, group_id: 4, user_id: 5, permission: 'Edit' });
      }),
    );
    const out = await createGroupPermission({ group_id: 4, user_id: 5, permission: 'Edit' });
    expect(body).toEqual({ group_id: 4, user_id: 5, permission: 'Edit' });
    expect(out.id).toBe(11);
  });
});

describe('updateGroupPermission', () => {
  it('PATCHes /groups-permissions/{id} with the new permission only', async () => {
    let body: unknown = null;
    let method: string | undefined;
    server.use(
      http.patch('/api/v3/groups-permissions/9', async ({ request }) => {
        method = request.method;
        body = await request.json();
        return HttpResponse.json({ id: 9, group_id: 2, user_id: 3, permission: 'None' });
      }),
    );
    const out = await updateGroupPermission(9, 'None');
    expect(method).toBe('PATCH');
    expect(body).toEqual({ permission: 'None' });
    expect(out.permission).toBe('None');
  });
});

describe('deleteGroupPermission', () => {
  it('DELETEs /groups-permissions/{id}', async () => {
    let id: string | undefined;
    server.use(
      http.delete('/api/v3/groups-permissions/:id', ({ params }) => {
        id = params.id as string;
        return HttpResponse.json({}, { status: 204 });
      }),
    );
    await deleteGroupPermission(12);
    expect(id).toBe('12');
  });
});
