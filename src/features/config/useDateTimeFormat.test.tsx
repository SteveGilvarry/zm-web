/**
 * The hook that wires ZoneMinder's four date/time config rows into the
 * shared formatters: blank config falls back to locale defaults, a strftime
 * pattern wins, and `ZM_TIMEZONE` renders the server's clock.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createElement, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import { viewerTimeZone } from '@/lib/datetime';

const { useDateTimeFormat } = await import('./useDateTimeFormat');

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({ accessToken: 't', refreshToken: 't', user: null, isAuthenticated: true });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => { server.resetHandlers(); vi.restoreAllMocks(); });
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

/** Config reads answer `{ name, value }` with `value` always a string. */
function stubConfigs(values: Record<string, string>) {
  server.use(http.get('/api/v3/configs/:name', ({ params }) =>
    HttpResponse.json({ name: String(params.name), value: values[String(params.name)] ?? '' })));
}

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

const STAMP = '2026-08-21T06:40:00Z';

describe('useDateTimeFormat', () => {
  it('falls back to locale defaults in the viewer zone when every pattern is blank', async () => {
    stubConfigs({});
    const { result } = renderHook(() => useDateTimeFormat(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.formatDateTime(STAMP)).not.toBe(''));
    expect(result.current.timeZone).toBeUndefined();
    expect(result.current.showsServerZone).toBe(false);
    // Medium Intl date style in the UI locale — no strftime involved.
    const formatted = result.current.formatDate(STAMP);
    expect(formatted).toMatch(/2026/);
    expect(formatted).toMatch(/Aug/);
    expect(formatted).not.toMatch(/%/);
  });

  it('honours the strftime patterns from Options', async () => {
    stubConfigs({
      ZM_DATE_FORMAT_PATTERN: '%Y-%m-%d',
      ZM_TIME_FORMAT_PATTERN: '%H:%M:%S',
      ZM_DATETIME_FORMAT_PATTERN: '%Y-%m-%d %H:%M:%S',
      ZM_TIMEZONE: 'UTC',
    });
    const { result } = renderHook(() => useDateTimeFormat(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.timeZone).toBe('UTC'));
    expect(result.current.formatDate(STAMP)).toBe('2026-08-21');
    expect(result.current.formatTime(STAMP)).toBe('06:40:00');
    expect(result.current.formatDateTime(STAMP)).toBe('2026-08-21 06:40:00');
  });

  it('flags a server zone that differs from the viewer, and passes it through', async () => {
    const other = viewerTimeZone() === 'Australia/Sydney' ? 'America/New_York' : 'Australia/Sydney';
    stubConfigs({ ZM_TIMEZONE: other });
    const { result } = renderHook(() => useDateTimeFormat(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.timeZone).toBe(other));
    expect(result.current.showsServerZone).toBe(true);
  });

  it('renders nothing for a null or unparsable timestamp', async () => {
    stubConfigs({});
    const { result } = renderHook(() => useDateTimeFormat(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.formatDateTime(STAMP)).not.toBe(''));
    expect(result.current.formatDate(null)).toBe('');
    expect(result.current.formatTime('')).toBe('');
    expect(result.current.formatDateTime('not a date')).toBe('');
  });

  it('keeps the locale-default formatters when the config endpoint is down', async () => {
    server.use(http.get('/api/v3/configs/:name', () => HttpResponse.error()));
    const { result } = renderHook(() => useDateTimeFormat(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.formatDateTime(STAMP)).not.toBe(''));
    expect(result.current.timeZone).toBeUndefined();
    expect(result.current.showsServerZone).toBe(false);
  });
});
