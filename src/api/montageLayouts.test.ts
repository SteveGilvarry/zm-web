import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  listMontageLayouts,
  createMontageLayout,
  updateMontageLayout,
  deleteMontageLayout,
} from './montageLayouts';
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

describe('listMontageLayouts', () => {
  it('GETs /montage_layouts', async () => {
    server.use(
      http.get('/api/v3/montage_layouts', () => HttpResponse.json({
        items: [{ id: 1, name: 'Grid', positions: '[]', user_id: 1 }],
        total: 1, per_page: 20, current_page: 1, last_page: 1,
      })),
    );
    const out = await listMontageLayouts();
    expect(out.items[0].name).toBe('Grid');
  });
});

describe('createMontageLayout', () => {
  it('POSTs name + positions + user_id', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/v3/montage_layouts', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: 99, name: 'Grid', positions: '[]', user_id: 1 });
      }),
    );
    const out = await createMontageLayout({ name: 'Grid', positions: '[]', user_id: 1 });
    expect(body).toEqual({ name: 'Grid', positions: '[]', user_id: 1 });
    expect(out.id).toBe(99);
  });
});

describe('updateMontageLayout', () => {
  it('PATCHes /montage_layouts/{id} with the partial body', async () => {
    let body: unknown = null;
    let method: string | undefined;
    server.use(
      http.patch('/api/v3/montage_layouts/3', async ({ request }) => {
        method = request.method;
        body = await request.json();
        return HttpResponse.json({ id: 3, name: 'Renamed', positions: '[]', user_id: 1 });
      }),
    );
    await updateMontageLayout(3, { name: 'Renamed' });
    expect(method).toBe('PATCH');
    expect(body).toEqual({ name: 'Renamed' });
  });
});

describe('deleteMontageLayout', () => {
  it('DELETEs /montage_layouts/{id}', async () => {
    let id: string | undefined;
    server.use(
      http.delete('/api/v3/montage_layouts/:id', ({ params }) => {
        id = params.id as string;
        return HttpResponse.json({}, { status: 204 });
      }),
    );
    await deleteMontageLayout(7);
    expect(id).toBe('7');
  });
});
