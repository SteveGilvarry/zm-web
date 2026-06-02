import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { getConfigs, updateConfig } from './configs';
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

describe('getConfigs', () => {
  it('GETs /configs and returns paginated wrapper', async () => {
    server.use(
      http.get('/api/v3/configs', () => HttpResponse.json({
        items: [{ name: 'ZM_OPT_USE_AUTH', value: 'yes', category: 'system' }],
        total: 1, per_page: 20, current_page: 1, last_page: 1,
      })),
    );
    const out = await getConfigs({ page: 1, page_size: 20 });
    expect(out.items).toHaveLength(1);
    expect(out.total).toBe(1);
  });

  it('serialises the category filter as a query param', async () => {
    let capturedUrl = '';
    server.use(
      http.get('/api/v3/configs', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({
          items: [], total: 0, per_page: 20, current_page: 1, last_page: 1,
        });
      }),
    );
    await getConfigs({ category: 'system' });
    expect(capturedUrl).toContain('category=system');
  });
});

describe('updateConfig', () => {
  it('PUTs to /configs/{name} with a {value} body', async () => {
    let body: unknown = null;
    let method: string | undefined;
    server.use(
      http.put('/api/v3/configs/ZM_OPT_USE_AUTH', async ({ request }) => {
        method = request.method;
        body = await request.json();
        return HttpResponse.json({ name: 'ZM_OPT_USE_AUTH', value: 'no' });
      }),
    );
    const out = await updateConfig('ZM_OPT_USE_AUTH', 'no');
    expect(method).toBe('PUT');
    expect(body).toEqual({ value: 'no' });
    expect(out.value).toBe('no');
  });

  it('URL-encodes config names that contain reserved characters', async () => {
    let capturedUrl = '';
    server.use(
      http.put('/api/v3/configs/:name', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ name: 'a/b', value: '1' });
      }),
    );
    await updateConfig('a/b', '1');
    // '/' is encoded as %2F
    expect(capturedUrl).toContain('a%2Fb');
  });
});
