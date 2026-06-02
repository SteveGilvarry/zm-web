import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createElement } from 'react';
import { usePtzCapabilities } from './usePtz';
import { useAuthStore } from '@/stores/auth';

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', user: null, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'warn' });
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

const minimalCaps = {
  control_id: 1,
  name: 'TestCam',
  protocol: 'Onvif',
  pan_tilt: {
    can_move: true, can_pan: true, can_tilt: true, can_move_diag: true,
    can_move_abs: false, can_move_con: true, can_move_rel: false, can_move_map: false,
    pan_range: { min: null, max: null }, pan_speed: { min: null, max: null },
    pan_step: { min: null, max: null }, pan_turbo: {},
    tilt_range: { min: null, max: null }, tilt_speed: { min: null, max: null },
    tilt_step: { min: null, max: null }, tilt_turbo: {},
  },
  zoom: {
    can: true, can_abs: false, can_rel: false, can_con: true, can_auto: false,
    range: { min: null, max: null }, speed: { min: null, max: null }, step: { min: null, max: null },
  },
  focus: {
    can: false, can_abs: false, can_rel: false, can_con: false, can_auto: false,
    range: { min: null, max: null }, speed: { min: null, max: null }, step: { min: null, max: null },
  },
  iris: {
    can: false, can_abs: false, can_rel: false, can_con: false, can_auto: false,
    range: { min: null, max: null }, speed: { min: null, max: null }, step: { min: null, max: null },
  },
  gain: {
    can: false, can_abs: false, can_rel: false, can_con: false, can_auto: false,
    range: { min: null, max: null }, speed: { min: null, max: null }, step: { min: null, max: null },
  },
  white_balance: {
    can: false, can_abs: false, can_rel: false, can_con: false, can_auto: false,
    range: { min: null, max: null }, speed: { min: null, max: null }, step: { min: null, max: null },
  },
  presets: { has_presets: false, num_presets: 0, can_set_presets: false, has_home_preset: false },
  power: { can_wake: false, can_sleep: false, can_reset: false, can_reboot: false },
  scan: { can_auto_scan: false, num_scan_paths: 0 },
};

describe('usePtzCapabilities — loading', () => {
  it('starts in the "loading" status before the request resolves', () => {
    server.use(
      http.get('/api/v3/ptz/monitors/1/capabilities', () =>
        HttpResponse.json(minimalCaps),
      ),
    );
    const { result } = renderHook(() => usePtzCapabilities(1), { wrapper: makeWrapper() });
    expect(result.current.status).toBe('loading');
  });
});

describe('usePtzCapabilities — success', () => {
  it('transitions to "ready" with the parsed capabilities once the GET resolves', async () => {
    server.use(
      http.get('/api/v3/ptz/monitors/1/capabilities', () =>
        HttpResponse.json(minimalCaps),
      ),
    );
    const { result } = renderHook(() => usePtzCapabilities(1), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    if (result.current.status !== 'ready') throw new Error('expected ready');
    expect(result.current.capabilities.name).toBe('TestCam');
    expect(result.current.capabilities.pan_tilt.can_move).toBe(true);
  });
});

describe('usePtzCapabilities — no-ptz signal', () => {
  it('maps a 400 + "no PTZ control configured" body to the "no-ptz" status', async () => {
    server.use(
      http.get('/api/v3/ptz/monitors/2/capabilities', () =>
        HttpResponse.json({
          error: 'BadRequest',
          message: 'Monitor 2 has no PTZ control configured',
        }, { status: 400 }),
      ),
    );
    const { result } = renderHook(() => usePtzCapabilities(2), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.status).toBe('no-ptz'));
    if (result.current.status !== 'no-ptz') throw new Error('expected no-ptz');
    expect(result.current.message).toMatch(/no PTZ control configured/);
  });
});

describe('usePtzCapabilities — generic failure', () => {
  it('maps non-400 backend errors to the "error" status with a message', async () => {
    server.use(
      http.get('/api/v3/ptz/monitors/3/capabilities', () =>
        HttpResponse.json({ error: 'Internal', message: 'boom' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => usePtzCapabilities(3), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.status).toBe('error'));
    if (result.current.status !== 'error') throw new Error('expected error');
    expect(result.current.message).toBeTruthy();
  });
});

describe('usePtzCapabilities — enabled gating', () => {
  it('stays "loading" and does not fetch when enabled=false', async () => {
    let hits = 0;
    server.use(
      http.get('/api/v3/ptz/monitors/4/capabilities', () => {
        hits += 1;
        return HttpResponse.json(minimalCaps);
      }),
    );
    const { result } = renderHook(
      () => usePtzCapabilities(4, /* enabled */ false),
      { wrapper: makeWrapper() },
    );
    // Give react-query a tick to potentially fire.
    await new Promise((r) => setTimeout(r, 30));
    expect(hits).toBe(0);
    expect(result.current.status).toBe('loading');
  });
});
