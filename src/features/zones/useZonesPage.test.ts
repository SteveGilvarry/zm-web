import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useZonesPage, zoneViewDimensions } from './useZonesPage';

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

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('zoneViewDimensions', () => {
  it('keeps width x height for unrotated cameras', () => {
    expect(zoneViewDimensions({ width: 1920, height: 1080, orientation: 'ROTATE_0' }))
      .toEqual({ width: 1920, height: 1080 });
    expect(zoneViewDimensions({ width: 1920, height: 1080, orientation: '' }))
      .toEqual({ width: 1920, height: 1080 });
    expect(zoneViewDimensions({ width: 1920, height: 1080, orientation: 'FLIP_HORI' }))
      .toEqual({ width: 1920, height: 1080 });
  });

  it('swaps them for ROTATE_90 and ROTATE_270 so the editor matches the ZM view', () => {
    expect(zoneViewDimensions({ width: 1920, height: 1080, orientation: 'ROTATE_90' }))
      .toEqual({ width: 1080, height: 1920 });
    expect(zoneViewDimensions({ width: 1920, height: 1080, orientation: 'ROTATE_270' }))
      .toEqual({ width: 1080, height: 1920 });
  });
});

describe('useZonesPage', () => {
  it('loads the monitor and exposes rotated view dimensions', async () => {
    server.use(
      http.get('/api/v3/monitors/3', () => HttpResponse.json({
        id: 3, name: 'Stairs', width: 1280, height: 720, orientation: 'ROTATE_90', capturing: 'Always',
      })),
    );
    const { result } = renderHook(() => useZonesPage(3), { wrapper: makeWrapper() });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.view).toBeNull();
    await waitFor(() => expect(result.current.monitor?.name).toBe('Stairs'));
    expect(result.current.view).toEqual({ width: 720, height: 1280 });
    expect(result.current.hasDimensions).toBe(true);
  });

  it('reports missing dimensions when the monitor has none', async () => {
    server.use(
      http.get('/api/v3/monitors/4', () => HttpResponse.json({
        id: 4, name: 'Blank', width: 0, height: 0, orientation: 'ROTATE_0', capturing: 'None',
      })),
    );
    const { result } = renderHook(() => useZonesPage(4), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.monitor).toBeDefined());
    expect(result.current.hasDimensions).toBe(false);
  });
});
