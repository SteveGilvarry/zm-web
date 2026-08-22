import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { useAuthStore } from '@/stores/auth';
import type { ZmEvent } from '@/types';
import { eventEndMs, fetchReviewEvents, findEventAt, REVIEW_PAGE_SIZE } from './useReviewEvents';

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

const ev = (id: number, start: string, end: string | null = null): ZmEvent =>
  ({ id, monitor_id: 1, start_date_time: start, end_date_time: end } as unknown as ZmEvent);

describe('fetchReviewEvents', () => {
  it('asks for a server-side start_time sort and follows every page', async () => {
    const seen: URL[] = [];
    server.use(
      http.get('/api/v3/events', ({ request }) => {
        const url = new URL(request.url);
        seen.push(url);
        const page = Number(url.searchParams.get('page'));
        return HttpResponse.json({
          items: [ev(page, `2026-08-21T0${page}:00:00Z`)],
          total: 3, per_page: REVIEW_PAGE_SIZE, current_page: page, last_page: 3,
        });
      }),
    );
    const events = await fetchReviewEvents(1, '2026-08-21T00:00:00Z', '2026-08-21T12:00:00Z');
    expect(events.map((e) => e.id)).toEqual([1, 2, 3]);
    expect(seen).toHaveLength(3);
    const first = seen[0].searchParams;
    expect(first.get('sort')).toBe('start_time');
    expect(first.get('direction')).toBe('asc');
    expect(first.get('monitor_id')).toBe('1');
    expect(first.get('page_size')).toBe(String(REVIEW_PAGE_SIZE));
    expect(seen.map((u) => u.searchParams.get('page'))).toEqual(['1', '2', '3']);
  });

  it('stops after a single page when last_page is 1', async () => {
    let hits = 0;
    server.use(
      http.get('/api/v3/events', () => {
        hits += 1;
        return HttpResponse.json({ items: [ev(1, '2026-08-21T01:00:00Z')], total: 1, per_page: 500, current_page: 1, last_page: 1 });
      }),
    );
    await fetchReviewEvents(1, 'a', 'b');
    expect(hits).toBe(1);
  });
});

describe('eventEndMs / findEventAt — in-progress events', () => {
  const now = Date.parse('2026-08-21T10:00:00Z');

  it('a closed event ends at end_date_time', () => {
    expect(eventEndMs(ev(1, '2026-08-21T09:00:00Z', '2026-08-21T09:05:00Z'), now))
      .toBe(Date.parse('2026-08-21T09:05:00Z'));
  });

  it('an open event (no end) runs up to now', () => {
    expect(eventEndMs(ev(1, '2026-08-21T09:00:00Z'), now)).toBe(now);
  });

  it('findEventAt uses the same rule, so an in-progress recording is found at any point since it began', () => {
    const events = [ev(1, '2026-08-21T09:00:00Z')];
    expect(findEventAt(events, new Date('2026-08-21T09:30:00Z'), now)?.id).toBe(1);
    expect(findEventAt(events, new Date('2026-08-21T08:59:00Z'), now)).toBeNull();
    expect(findEventAt(events, new Date('2026-08-21T10:00:01Z'), now)).toBeNull();
  });

  it('ignores events with an unparsable start', () => {
    expect(eventEndMs(ev(1, 'garbage'), now)).toBeNull();
    expect(findEventAt([ev(1, 'garbage')], new Date(now), now)).toBeNull();
  });
});
