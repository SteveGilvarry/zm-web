/**
 * The `useReviewEvents` branches the first suite doesn't reach: the page cap,
 * the hook's query gating, and events with a missing (rather than
 * unparsable) `start_date_time`.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import type { ZmEvent } from '@/types';
import {
  eventEndMs,
  fetchReviewEvents,
  findEventAt,
  useReviewEvents,
  REVIEW_MAX_PAGES,
  REVIEW_PAGE_SIZE,
} from './useReviewEvents';

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

const ev = (id: number, start: string | null, end: string | null = null): ZmEvent =>
  ({ id, monitor_id: 1, name: `Event-${id}`, start_date_time: start, end_date_time: end } as unknown as ZmEvent);

const RANGE_START = new Date('2026-08-21T00:00:00Z');
const RANGE_END = new Date('2026-08-21T12:00:00Z');

describe('fetchReviewEvents — bounds', () => {
  it('stops at REVIEW_MAX_PAGES even when the server keeps claiming more', async () => {
    let hits = 0;
    server.use(
      http.get('/api/v3/events', ({ request }) => {
        hits += 1;
        const page = Number(new URL(request.url).searchParams.get('page'));
        return HttpResponse.json({
          items: [ev(page, `2026-08-21T00:00:0${page % 10}Z`)],
          total: 100_000, per_page: REVIEW_PAGE_SIZE, current_page: page, last_page: 9_999,
        });
      }),
    );
    const events = await fetchReviewEvents(1, RANGE_START.toISOString(), RANGE_END.toISOString());
    expect(hits).toBe(REVIEW_MAX_PAGES);
    expect(events).toHaveLength(REVIEW_MAX_PAGES);
  });

  it('stops early on an empty page even if last_page says otherwise', async () => {
    let hits = 0;
    server.use(
      http.get('/api/v3/events', () => {
        hits += 1;
        return HttpResponse.json({
          items: [], total: 0, per_page: REVIEW_PAGE_SIZE, current_page: 1, last_page: 5,
        });
      }),
    );
    expect(await fetchReviewEvents(1, 'a', 'b')).toEqual([]);
    expect(hits).toBe(1);
  });

  it('sends the window as start_time / end_time bounds', async () => {
    let seen: URLSearchParams | null = null;
    server.use(
      http.get('/api/v3/events', ({ request }) => {
        seen = new URL(request.url).searchParams;
        return HttpResponse.json({ items: [], total: 0, per_page: 500, current_page: 1, last_page: 1 });
      }),
    );
    await fetchReviewEvents(7, RANGE_START.toISOString(), RANGE_END.toISOString());
    expect(seen!.get('monitor_id')).toBe('7');
    expect(seen!.get('start_time')).toBe(RANGE_START.toISOString());
    expect(seen!.get('end_time')).toBe(RANGE_END.toISOString());
  });
});

describe('useReviewEvents — query gating', () => {
  it('returns the monitor\'s events once loaded', async () => {
    server.use(
      http.get('/api/v3/events', () => HttpResponse.json({
        items: [ev(1, '2026-08-21T02:00:00Z', '2026-08-21T02:05:00Z')],
        total: 1, per_page: 500, current_page: 1, last_page: 1,
      })),
    );
    const { result } = renderHook(
      () => useReviewEvents(1, RANGE_START, RANGE_END),
      { wrapper: makeWrapper() },
    );
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    expect(result.current.isLoading).toBe(false);
  });

  it('never queries for NaN monitor ids', () => {
    // No handler registered — a request would blow up `onUnhandledRequest: 'error'`.
    const { result } = renderHook(
      () => useReviewEvents(Number.NaN, RANGE_START, RANGE_END),
      { wrapper: makeWrapper() },
    );
    expect(result.current.events).toEqual([]);
  });

  it('never queries while signed out', () => {
    useAuthStore.setState({ isAuthenticated: false });
    try {
      const { result } = renderHook(
        () => useReviewEvents(1, RANGE_START, RANGE_END),
        { wrapper: makeWrapper() },
      );
      expect(result.current.events).toEqual([]);
    } finally {
      useAuthStore.setState({ isAuthenticated: true });
    }
  });

  it('reports an empty list when the backend 500s', async () => {
    server.use(
      http.get('/api/v3/events', () =>
        HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'boom' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(
      () => useReviewEvents(1, RANGE_START, RANGE_END),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.events).toEqual([]);
  });

  it('reports an empty list when the network is unreachable', async () => {
    server.use(http.get('/api/v3/events', () => HttpResponse.error()));
    const { result } = renderHook(
      () => useReviewEvents(1, RANGE_START, RANGE_END),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.events).toEqual([]);
  });
});

describe('eventEndMs / findEventAt — missing timestamps', () => {
  const now = Date.parse('2026-08-21T10:00:00Z');

  it('an event with no start time has no end', () => {
    expect(eventEndMs(ev(1, null), now)).toBeNull();
    expect(eventEndMs(ev(1, ''), now)).toBeNull();
  });

  it('findEventAt skips rows with no start time', () => {
    const events = [ev(1, null), ev(2, ''), ev(3, '2026-08-21T09:00:00Z', '2026-08-21T09:30:00Z')];
    expect(findEventAt(events, new Date('2026-08-21T09:10:00Z'), now)?.id).toBe(3);
    expect(findEventAt([ev(1, null), ev(2, '')], new Date('2026-08-21T09:10:00Z'), now)).toBeNull();
  });

  it('an unparsable end time falls back to the start', () => {
    expect(eventEndMs(ev(1, '2026-08-21T09:00:00Z', 'not-a-date'), now))
      .toBe(Date.parse('2026-08-21T09:00:00Z'));
  });

  it('an end time before the start never rewinds past it', () => {
    expect(eventEndMs(ev(1, '2026-08-21T09:00:00Z', '2026-08-21T08:00:00Z'), now))
      .toBe(Date.parse('2026-08-21T09:00:00Z'));
  });

  it('an open event that began in the future ends at its own start, not before', () => {
    expect(eventEndMs(ev(1, '2026-08-21T11:00:00Z'), now))
      .toBe(Date.parse('2026-08-21T11:00:00Z'));
  });

  it('defaults `nowMs` to the real clock', () => {
    vi.setSystemTime(new Date('2026-08-21T10:00:00Z'));
    try {
      expect(eventEndMs(ev(1, '2026-08-21T09:00:00Z'))).toBe(now);
      expect(findEventAt([ev(1, '2026-08-21T09:00:00Z')], new Date('2026-08-21T09:30:00Z'))?.id).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
