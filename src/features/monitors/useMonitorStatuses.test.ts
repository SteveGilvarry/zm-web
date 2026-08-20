import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import {
  formatBandwidth, formatFps, parseRuntime, runtimeTone, summarizeRuntime,
  useMonitorStatus, useMonitorStatuses,
} from './useMonitorStatuses';

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({ accessToken: 'test', refreshToken: 'test', user: null, isAuthenticated: true });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
}

const rows = [
  { monitor_id: 1, status: 'Connected', capture_fps: '10.89', analysis_fps: '0.00', capture_bandwidth: 1427762, updated_on: 'x' },
  { monitor_id: 2, status: 'NotRunning', capture_fps: '0.00', analysis_fps: '0.00', capture_bandwidth: 0, updated_on: 'x' },
];

describe('parseRuntime / runtimeTone', () => {
  it('parses the decimal-string fps fields to numbers', () => {
    const r = parseRuntime(rows[0]);
    expect(r.captureFps).toBeCloseTo(10.89);
    expect(r.analysisFps).toBe(0);
    expect(r.bandwidth).toBe(1427762);
  });

  it('maps statuses to tones like the legacy console lens', () => {
    expect(runtimeTone('Connected')).toBe('ok');
    expect(runtimeTone('Signal')).toBe('ok');
    expect(runtimeTone('Running')).toBe('warn');
    expect(runtimeTone('NotRunning')).toBe('down');
    expect(runtimeTone('Unknown')).toBe('unknown');
    expect(runtimeTone(undefined)).toBe('unknown');
  });
});

describe('formatters', () => {
  it('formats fps with one decimal', () => {
    expect(formatFps(10.89, 'en-US')).toBe('10.9 fps');
    expect(formatFps(0, 'en-US')).toBe('0.0 fps');
  });

  it('formats bandwidth in binary units', () => {
    expect(formatBandwidth(0)).toBe('0 B/s');
    expect(formatBandwidth(512, 'en-US')).toBe('512 B/s');
    expect(formatBandwidth(6312, 'en-US')).toBe('6.2 KB/s');
    expect(formatBandwidth(1427762, 'en-US')).toBe('1.4 MB/s');
  });
});

describe('summarizeRuntime', () => {
  it('sums bandwidth and fps and counts monitors per tone, including missing rows', () => {
    const byId = Object.fromEntries(rows.map((r) => [r.monitor_id, parseRuntime(r)]));
    const t = summarizeRuntime(byId, [1, 2, 3]);
    expect(t.bandwidth).toBe(1427762);
    expect(t.captureFps).toBeCloseTo(10.89);
    expect(t.byTone).toEqual({ ok: 1, warn: 0, down: 1, unknown: 1 });
  });
});

describe('useMonitorStatuses', () => {
  it('polls /monitor-status and indexes rows by monitor id', async () => {
    server.use(http.get('/api/v3/monitor-status', () =>
      HttpResponse.json({ items: rows, total: 2, per_page: 1000, current_page: 1, last_page: 1 })));
    const { result } = renderHook(() => useMonitorStatuses(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.list).toHaveLength(2));
    expect(result.current.byId[2].status).toBe('NotRunning');
  });

  it('useMonitorStatus selects one monitor from the shared poll', async () => {
    server.use(http.get('/api/v3/monitor-status', () =>
      HttpResponse.json({ items: rows, total: 2, per_page: 1000, current_page: 1, last_page: 1 })));
    const { result } = renderHook(() => useMonitorStatus(1), { wrapper: wrapper() });
    await waitFor(() => expect(result.current?.status).toBe('Connected'));
  });
});
