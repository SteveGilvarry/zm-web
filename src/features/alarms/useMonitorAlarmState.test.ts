import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw/http';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import { ALARM_STATE_POLL_MS, ALARM_STATE_RECHECK_MS, useMonitorAlarmState } from './useMonitorAlarmState';

const server = setupServer();
const reads = { count: 0, body: {} as Record<string, unknown> };
beforeAll(() => {
  useAuthStore.setState({ accessToken: 't', refreshToken: 't', user: null, isAuthenticated: true });
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  server.resetHandlers();
  vi.useRealTimers();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

function stub(body: Record<string, unknown>) {
  reads.count = 0;
  reads.body = body;
  server.use(http.get('/api/v3/monitor-status/4', () => {
    reads.count += 1;
    return HttpResponse.json({ monitor_id: 4, status: 'Connected', ...reads.body });
  }));
}

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe('useMonitorAlarmState', () => {
  it('polls every 2 s while zmc reports a state, and stops in a hidden tab', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stub({ alarm_state: 'idle', alarms_disabled: false, analysing: true });
    const { result } = renderHook(() => useMonitorAlarmState(4, true), { wrapper });
    await waitFor(() => expect(result.current.state).toBe('idle'));
    expect(result.current.analysing).toBe(true);
    const first = reads.count;
    await act(() => vi.advanceTimersByTimeAsync(ALARM_STATE_POLL_MS + 100));
    expect(reads.count).toBe(first + 1);

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await act(() => vi.advanceTimersByTimeAsync(10));
    const hidden = reads.count;
    await act(() => vi.advanceTimersByTimeAsync(ALARM_STATE_POLL_MS * 3));
    expect(reads.count).toBe(hidden);
  });

  it('only checks back now and then while the state is absent', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stub({});
    const { result } = renderHook(() => useMonitorAlarmState(4, true), { wrapper });
    await waitFor(() => expect(reads.count).toBe(1));
    expect(result.current.state).toBeNull();
    expect(result.current.alarmsDisabled).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(ALARM_STATE_POLL_MS * 3));
    expect(reads.count).toBe(1);
    await act(() => vi.advanceTimersByTimeAsync(ALARM_STATE_RECHECK_MS));
    expect(reads.count).toBe(2);
  });

  it('calls onStart going into an alarm and onEnd coming out', async () => {
    stub({ alarm_state: 'idle' });
    const onStart = vi.fn();
    const onEnd = vi.fn();
    const { result } = renderHook(() => useMonitorAlarmState(4, true, { onStart, onEnd }), { wrapper });
    await waitFor(() => expect(result.current.state).toBe('idle'));
    expect(onStart).not.toHaveBeenCalled();

    reads.body = { alarm_state: 'alarm' };
    act(() => result.current.refetch());
    await waitFor(() => expect(onStart).toHaveBeenCalledTimes(1));

    reads.body = { alarm_state: 'alert' };
    act(() => result.current.refetch());
    await waitFor(() => expect(result.current.state).toBe('alert'));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onEnd).not.toHaveBeenCalled();

    reads.body = { alarm_state: 'idle' };
    act(() => result.current.refetch());
    await waitFor(() => expect(onEnd).toHaveBeenCalledTimes(1));
  });

  it('asks nothing while disabled', async () => {
    stub({ alarm_state: 'idle' });
    const { result } = renderHook(() => useMonitorAlarmState(4, false), { wrapper });
    await new Promise((r) => setTimeout(r, 30));
    expect(reads.count).toBe(0);
    expect(result.current.state).toBeNull();
  });
});
