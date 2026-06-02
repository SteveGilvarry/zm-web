import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  listGroups,
  getGroup,
  createGroup,
  updateGroup,
  deleteGroup,
  listGroupMonitors,
  attachMonitorToGroup,
  detachMonitorFromGroup,
} from './groups';
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

describe('listGroups / getGroup', () => {
  it('listGroups GETs /groups', async () => {
    server.use(
      http.get('/api/v3/groups', () => HttpResponse.json({
        items: [{ id: 1, name: 'Outside' }],
        total: 1, per_page: 20, current_page: 1, last_page: 1,
      })),
    );
    const out = await listGroups();
    expect(out.items[0].name).toBe('Outside');
  });

  it('getGroup GETs /groups/{id}', async () => {
    let id: string | undefined;
    server.use(
      http.get('/api/v3/groups/:id', ({ params }) => {
        id = params.id as string;
        return HttpResponse.json({ id: 4, name: 'Indoor' });
      }),
    );
    const out = await getGroup(4);
    expect(id).toBe('4');
    expect(out.name).toBe('Indoor');
  });
});

describe('createGroup / updateGroup / deleteGroup', () => {
  it('createGroup defaults parent_id to null when not provided', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post('/api/v3/groups', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 5, name: 'New' });
      }),
    );
    await createGroup('New');
    expect(body).toEqual({ name: 'New', parent_id: null });
  });

  it('createGroup forwards the parentId when given', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post('/api/v3/groups', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 5, name: 'Child', parent_id: 2 });
      }),
    );
    await createGroup('Child', 2);
    expect(body).toEqual({ name: 'Child', parent_id: 2 });
  });

  it('updateGroup PUTs {name} to /groups/{id}', async () => {
    let body: unknown = null;
    server.use(
      http.put('/api/v3/groups/3', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: 3, name: 'Renamed' });
      }),
    );
    await updateGroup(3, 'Renamed');
    expect(body).toEqual({ name: 'Renamed' });
  });

  it('deleteGroup DELETEs /groups/{id}', async () => {
    let id: string | undefined;
    server.use(
      http.delete('/api/v3/groups/:id', ({ params }) => {
        id = params.id as string;
        return HttpResponse.json({}, { status: 204 });
      }),
    );
    await deleteGroup(8);
    expect(id).toBe('8');
  });
});

describe('group-monitor associations', () => {
  it('listGroupMonitors GETs /groups-monitors', async () => {
    server.use(
      http.get('/api/v3/groups-monitors', () => HttpResponse.json({
        items: [{ id: 1, group_id: 1, monitor_id: 4 }],
        total: 1, per_page: 20, current_page: 1, last_page: 1,
      })),
    );
    const out = await listGroupMonitors();
    expect(out.items).toHaveLength(1);
  });

  it('attachMonitorToGroup POSTs the association', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/v3/groups-monitors', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: 11, group_id: 1, monitor_id: 4 });
      }),
    );
    const out = await attachMonitorToGroup(1, 4);
    expect(body).toEqual({ group_id: 1, monitor_id: 4 });
    expect(out.id).toBe(11);
  });

  it('detachMonitorFromGroup DELETEs /groups-monitors/{id}', async () => {
    let id: string | undefined;
    server.use(
      http.delete('/api/v3/groups-monitors/:id', ({ params }) => {
        id = params.id as string;
        return HttpResponse.json({}, { status: 204 });
      }),
    );
    await detachMonitorFromGroup(11);
    expect(id).toBe('11');
  });
});
