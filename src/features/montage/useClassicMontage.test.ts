import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import type { Monitor } from '@/types';
import { useAuthStore } from '@/stores/auth';
import { presetColumnsFromName, useClassicMontage } from './useClassicMontage';
import { serialisePositions } from './layoutFormat';
import { gridLayout } from './mosaic';

vi.mock('@tanstack/react-router', () => ({ useSearch: () => ({}), useNavigate: () => vi.fn() }));

const m = (id: number): Monitor =>
  ({ id, name: `Cam ${id}`, capturing: 'Always', width: 1920, height: 1080, orientation: 'Rotate0' }) as unknown as Monitor;

describe('presetColumnsFromName', () => {
  it('reads "N Wide" and nothing else', () => {
    expect(presetColumnsFromName('4 Wide')).toBe(4);
    expect(presetColumnsFromName(' 12 wide ')).toBe(12);
    expect(presetColumnsFromName('Front of house')).toBeNull();
  });
});

const savedPositions = serialisePositions(gridLayout(2, 1, [3, 1]), 'outside');
const server = setupServer(
  http.get('/api/v3/montage_layouts', () =>
    HttpResponse.json({
      items: [
        { id: 12, name: 'Test1', user_id: 1, positions: savedPositions },
        { id: 2, name: '1 Wide', user_id: 0, positions: null },
      ],
      total: 2, per_page: 200, current_page: 1, last_page: 1,
    })),
);
beforeAll(() => {
  useAuthStore.setState({ accessToken: 't', refreshToken: 't', user: null, isAuthenticated: true });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
}

describe('useClassicMontage', () => {
  const monitors = [m(1), m(2), m(3)];

  it('lists presets then saved layouts, and starts on Auto', async () => {
    const { result } = renderHook(() => useClassicMontage(monitors), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.layoutOptions.some((o) => o.value === 'saved:12')).toBe(true));
    expect(result.current.layoutOptions[0]).toEqual({ value: 'preset:auto', label: 'Auto' });
    expect(result.current.layoutOptions.some((o) => o.label === '1 Wide' && o.value.startsWith('preset:'))).toBe(true);
    // Preset rows from the backend (null positions) are not repeated.
    expect(result.current.layoutOptions.filter((o) => o.label === '1 Wide')).toHaveLength(1);
    expect(result.current.columns).toBe(3);
    expect(result.current.isSavedLayout).toBe(false);
  });

  it('a saved layout fixes the monitor order, with unnamed cameras after', async () => {
    const { result } = renderHook(() => useClassicMontage(monitors), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.layoutOptions.some((o) => o.value === 'saved:12')).toBe(true));
    act(() => result.current.setLayoutId('saved:12'));
    expect(result.current.monitors.map((x) => x.id)).toEqual([3, 1, 2]);
    expect(result.current.isSavedLayout).toBe(true);
  });

  it('Edit Layout reorders by drag and Cancel discards the draft', async () => {
    const { result } = renderHook(() => useClassicMontage(monitors), { wrapper: wrapper() });
    act(() => result.current.beginEdit());
    act(() => result.current.reorder(3, 1));
    expect(result.current.monitors.map((x) => x.id)).toEqual([3, 1, 2]);
    act(() => result.current.cancelEdit());
    expect(result.current.editMode).toBe(false);
    expect(result.current.monitors.map((x) => x.id)).toEqual([1, 2, 3]);
  });

  it('"N Wide" presets set the column count', async () => {
    const { result } = renderHook(() => useClassicMontage(monitors), { wrapper: wrapper() });
    act(() => result.current.setLayoutId('preset:4w'));
    expect(result.current.columns).toBe(4);
  });
});
