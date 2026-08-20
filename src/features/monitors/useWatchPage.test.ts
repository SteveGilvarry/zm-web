import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useWatchPage } from './useWatchPage';

// Both stream hooks are always mounted; stub them with inert results whose
// start/stop we can observe.
const { webrtcStream, hlsStream } = vi.hoisted(() => {
  const mk = () => ({
    videoRef: { current: null as HTMLVideoElement | null },
    state: 'idle' as const,
    error: null,
    start: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    hasAudio: false,
  });
  return { webrtcStream: mk(), hlsStream: mk() };
});
vi.mock('@/hooks/useWebRtcStream', () => ({ useWebRtcStream: () => webrtcStream }));
vi.mock('@/hooks/useHlsStream', () => ({ useHlsStream: () => hlsStream }));
vi.mock('@/features/ptz/usePtz', () => ({
  usePtzCapabilities: () => ({ status: 'no-ptz', message: 'Monitor 7 has no PTZ control configured' }),
}));

const server = setupServer();
beforeAll(() => {
  // jsdom has no matchMedia; the hook reads it for the wide-viewport flag.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }),
  });
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
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

const monitor = {
  id: 7, name: 'Gate', capturing: 'Always', analysing: 'Always', recording: 'OnMotion',
  width: 1920, height: 1080, orientation: 'ROTATE_0', type: 'Ffmpeg', enabled: 1,
};

const alarmCalls: unknown[] = [];

function stubMonitor(overrides: Partial<typeof monitor> = {}) {
  alarmCalls.length = 0;
  server.use(
    http.get('/api/v3/monitors/7', () => HttpResponse.json({ ...monitor, ...overrides })),
    http.get('/api/v3/monitor-status', () =>
      HttpResponse.json({
        items: [{ monitor_id: 7, status: 'Connected', capture_fps: '12.50', analysis_fps: '1.00', capture_bandwidth: 2048, updated_on: 'x' }],
        total: 1, per_page: 1000, current_page: 1, last_page: 1,
      }),
    ),
    http.patch('/api/v3/monitors/7/alarm', async ({ request }) => {
      const body = await request.json();
      alarmCalls.push(body);
      return HttpResponse.json({ ...monitor, ...overrides });
    }),
    http.get('/api/v3/events', () =>
      HttpResponse.json({
        items: [{ id: 101, name: 'Event-101', monitor_id: 7, start_date_time: '2026-08-21T01:00:00' }],
        total: 1, per_page: 5, current_page: 1, last_page: 1,
      }),
    ),
  );
}

describe('useWatchPage', () => {
  it('loads the monitor and its recent events, defaulting to WebRTC', async () => {
    stubMonitor();
    const { result } = renderHook(() => useWatchPage(7), { wrapper: makeWrapper() });
    expect(result.current.monitorLoading).toBe(true);
    await waitFor(() => expect(result.current.monitor?.name).toBe('Gate'));
    await waitFor(() => expect(result.current.events.map((e) => e.id)).toEqual([101]));
    expect(result.current.protocol).toBe('webrtc');
    expect(result.current.activeStream).toBe(webrtcStream);
    expect(result.current.isActive).toBe(false);
    expect(result.current.isWide).toBe(true);
    expect(result.current.ptzState.status).toBe('no-ptz');
  });

  it('auto-starts the stream once a capturing monitor has loaded', async () => {
    stubMonitor();
    renderHook(() => useWatchPage(7), { wrapper: makeWrapper() });
    await waitFor(() => expect(webrtcStream.start).toHaveBeenCalledTimes(1));
    expect(hlsStream.start).not.toHaveBeenCalled();
  });

  it('does not auto-start when the monitor is not capturing', async () => {
    stubMonitor({ capturing: 'None' });
    const { result } = renderHook(() => useWatchPage(7), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.monitor).toBeDefined());
    await new Promise((r) => setTimeout(r, 250));
    expect(webrtcStream.start).not.toHaveBeenCalled();
  });

  it('switches protocol and routes stop/start to the active stream', async () => {
    stubMonitor();
    const { result } = renderHook(() => useWatchPage(7), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.monitor).toBeDefined());

    act(() => result.current.stopStream());
    expect(webrtcStream.stop).toHaveBeenCalledTimes(1);

    act(() => result.current.changeProtocol('hls'));
    expect(result.current.protocol).toBe('hls');
    expect(result.current.activeStream).toBe(hlsStream);
    // Idle stream: switching does not call stop again.
    expect(webrtcStream.stop).toHaveBeenCalledTimes(1);

    act(() => result.current.startStream());
    expect(hlsStream.start).toHaveBeenCalled();
  });

  it('exposes runtime status from the shared /monitor-status poll', async () => {
    stubMonitor();
    const { result } = renderHook(() => useWatchPage(7), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.runtime?.status).toBe('Connected'));
    expect(result.current.runtime?.captureFps).toBe(12.5);
  });

  it('probes the alarm endpoint on load, then forces and cancels through it', async () => {
    stubMonitor();
    const { result } = renderHook(() => useWatchPage(7), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.alarm.available).toBe(true));
    expect(alarmCalls).toEqual([{ action: 'status' }]);
    expect(result.current.alarm.forced).toBe(false);

    act(() => result.current.alarm.force());
    await waitFor(() => expect(result.current.alarm.forced).toBe(true));
    expect(alarmCalls[1]).toEqual({ action: 'on', cause: 'API', score: 100 });

    act(() => result.current.alarm.cancel());
    await waitFor(() => expect(result.current.alarm.forced).toBe(false));
    expect(alarmCalls[2]).toEqual({ action: 'cancel' });
    expect(result.current.alarm.error).toBeNull();
  });

  it('surfaces an alarm failure instead of pretending it worked', async () => {
    stubMonitor();
    server.use(
      http.patch('/api/v3/monitors/7/alarm', async ({ request }) => {
        const body = (await request.json()) as { action: string };
        if (body.action === 'status') return HttpResponse.json(monitor);
        return HttpResponse.json({ error_message: 'shared memory unavailable' }, { status: 503 });
      }),
    );
    const { result } = renderHook(() => useWatchPage(7), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.alarm.available).toBe(true));
    act(() => result.current.alarm.force());
    await waitFor(() => expect(result.current.alarm.error).toBe('shared memory unavailable'));
    expect(result.current.alarm.forced).toBe(false);
  });

  it('does not probe the alarm endpoint for a monitor that is not capturing', async () => {
    stubMonitor({ capturing: 'None' });
    const { result } = renderHook(() => useWatchPage(7), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.monitor).toBeDefined());
    await new Promise((r) => setTimeout(r, 50));
    expect(alarmCalls).toEqual([]);
    expect(result.current.alarm.available).toBe(false);
  });

  it('opens and closes the config editor', async () => {
    stubMonitor();
    const { result } = renderHook(() => useWatchPage(7), { wrapper: makeWrapper() });
    expect(result.current.editorOpen).toBe(false);
    act(() => result.current.openEditor());
    expect(result.current.editorOpen).toBe(true);
    act(() => result.current.closeEditor());
    expect(result.current.editorOpen).toBe(false);
  });
});
