import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { useAuthStore } from '@/stores/auth';
import { listSessions } from './sessions';

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({ accessToken: 'test', refreshToken: 'test', user: null, isAuthenticated: true });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

describe('listSessions', () => {
  it('pages the Sessions table', async () => {
    let search = '';
    server.use(http.get('*/api/v3/sessions', ({ request }) => {
      search = new URL(request.url).search;
      return HttpResponse.json({ items: [{ id: 'abc', access: 1760000000, data: 'username|s:5:"admin";' }], total: 1, per_page: 100, current_page: 1, last_page: 1 });
    }));
    const out = await listSessions({ page_size: 100 });
    expect(search).toBe('?page_size=100');
    expect(out.items[0].data).toContain('admin');
  });
});
