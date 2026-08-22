/**
 * The hook that wires the server's locale into the shared formatters: blank
 * patterns fall back to locale defaults, a strftime pattern wins, and the
 * server's timezone renders the server's clock.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createElement, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import { viewerTimeZone } from '@/lib/datetime';
import type { LocaleResponse } from '@/api/locale';

const { useDateTimeFormat } = await import('./useDateTimeFormat');

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({ accessToken: 't', refreshToken: 't', user: null, isAuthenticated: true });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => { server.resetHandlers(); vi.restoreAllMocks(); });
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

/** `GET /system/locale` — one request for zone + the three patterns. */
function stubLocale(locale: Partial<LocaleResponse>) {
  server.use(http.get('/api/v3/system/locale', () =>
    HttpResponse.json({
      timezone: null,
      utc_offset: '+00:00',
      utc_offset_seconds: 0,
      date_format: '',
      datetime_format: '',
      time_format: '',
      ...locale,
    } satisfies LocaleResponse)));
}

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

const STAMP = '2026-08-21T06:40:00Z';

describe('useDateTimeFormat', () => {
  it('falls back to locale defaults in the viewer zone when every pattern is blank', async () => {
    stubLocale({});
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

  it('honours the strftime patterns the server reports', async () => {
    stubLocale({
      timezone: 'UTC',
      date_format: '%Y-%m-%d',
      time_format: '%H:%M:%S',
      datetime_format: '%Y-%m-%d %H:%M:%S',
    });
    const { result } = renderHook(() => useDateTimeFormat(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.timeZone).toBe('UTC'));
    expect(result.current.formatDate(STAMP)).toBe('2026-08-21');
    expect(result.current.formatTime(STAMP)).toBe('06:40:00');
    expect(result.current.formatDateTime(STAMP)).toBe('2026-08-21 06:40:00');
  });

  it('reads the locale once for every caller on the page', async () => {
    let hits = 0;
    server.use(http.get('/api/v3/system/locale', () => {
      hits += 1;
      return HttpResponse.json({ timezone: 'UTC', utc_offset: '+00:00', utc_offset_seconds: 0 });
    }));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const shared = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children);

    const a = renderHook(() => useDateTimeFormat(), { wrapper: shared });
    const b = renderHook(() => useDateTimeFormat(), { wrapper: shared });
    await waitFor(() => expect(a.result.current.timeZone).toBe('UTC'));
    await waitFor(() => expect(b.result.current.timeZone).toBe('UTC'));
    expect(hits).toBe(1);
  });

  it('flags a server zone that differs from the viewer, and passes it through', async () => {
    const other = viewerTimeZone() === 'Australia/Sydney' ? 'America/New_York' : 'Australia/Sydney';
    stubLocale({ timezone: other });
    const { result } = renderHook(() => useDateTimeFormat(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.timeZone).toBe(other));
    expect(result.current.showsServerZone).toBe(true);
  });

  it('renders nothing for a null or unparsable timestamp', async () => {
    stubLocale({});
    const { result } = renderHook(() => useDateTimeFormat(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.formatDateTime(STAMP)).not.toBe(''));
    expect(result.current.formatDate(null)).toBe('');
    expect(result.current.formatTime('')).toBe('');
    expect(result.current.formatDateTime('not a date')).toBe('');
  });

  it('keeps the locale-default formatters when the locale route is missing', async () => {
    server.use(http.get('/api/v3/system/locale', () =>
      HttpResponse.json({ kind: 'NOT_FOUND_ERROR' }, { status: 404 })));
    const { result } = renderHook(() => useDateTimeFormat(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.formatDateTime(STAMP)).not.toBe(''));
    expect(result.current.timeZone).toBeUndefined();
    expect(result.current.showsServerZone).toBe(false);
  });
});
