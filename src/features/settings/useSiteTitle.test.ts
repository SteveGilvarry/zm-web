import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth';
import { formatSiteTitle, useSiteTitle } from './useSiteTitle';

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({ accessToken: 't', refreshToken: 't', user: null, isAuthenticated: true });
  server.listen({ onUnhandledRequest: 'warn' });
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

function seed(values: Record<string, string>) {
  server.use(
    http.get('/api/v3/configs/:name', ({ params }) => {
      const name = String(params.name);
      if (!(name in values)) return HttpResponse.json({ message: 'not found' }, { status: 404 });
      return HttpResponse.json({ id: 1, name, value: values[name], type: 'string', category: 'web', readonly: 0, private: 0, system: 0 });
    }),
  );
}

describe('formatSiteTitle', () => {
  it('matches legacy xhtmlHeaders: prefix - view', () => {
    expect(formatSiteTitle('ZM', 'Events')).toBe('ZM - Events');
    expect(formatSiteTitle('  ', 'Events')).toBe('ZM - Events');
    expect(formatSiteTitle('Site')).toBe('Site');
  });
});

describe('useSiteTitle', () => {
  it('falls back to ZoneMinder / ZM until the configs load, then applies them to document.title', async () => {
    seed({ ZM_WEB_TITLE: 'Farm Cameras', ZM_WEB_TITLE_PREFIX: 'Farm' });
    const { result } = renderHook(() => useSiteTitle('Console'), { wrapper });
    expect(result.current.title).toBe('ZoneMinder');
    expect(document.title).toBe('ZM - Console');
    await waitFor(() => expect(result.current.title).toBe('Farm Cameras'));
    expect(result.current.prefix).toBe('Farm');
    expect(document.title).toBe('Farm - Console');
  });

  it('leaves document.title alone without a page name', async () => {
    document.title = 'untouched';
    seed({ ZM_WEB_TITLE: 'X', ZM_WEB_TITLE_PREFIX: 'Y' });
    const { result } = renderHook(() => useSiteTitle(), { wrapper });
    await waitFor(() => expect(result.current.prefix).toBe('Y'));
    expect(document.title).toBe('untouched');
  });
});
