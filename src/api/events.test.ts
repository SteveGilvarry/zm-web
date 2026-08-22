import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  EVENT_SORT_FIELDS,
  getEventCounts,
  getEventCountsByMonitor,
  getEvents,
  isEventSortField,
  legacySortFieldToApi,
} from './events';
import { useAuthStore } from '@/stores/auth';

/**
 * API client tests use MSW so we exercise the real fetch + handleResponse
 * code path without touching the backend. Each test pins a specific
 * response shape to verify the wrappers parse / unwrap correctly.
 */
const server = setupServer();

beforeAll(() => {
  // Seed an access token so the authedFetch helper attaches Authorization;
  // tests that watch the request can verify it.
  useAuthStore.setState({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    user: null,
    isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

describe('getEvents', () => {
  it('returns the paginated wrapper as-is', async () => {
    server.use(
      http.get('/api/v3/events', () => HttpResponse.json({
        items: [{ id: 1, monitor_id: 1 }],
        total: 1, per_page: 20, current_page: 1, last_page: 1,
      })),
    );
    const out = await getEvents({ page: 1, page_size: 20 });
    expect(out.items).toHaveLength(1);
    expect(out.total).toBe(1);
  });

  it('serialises start_time / end_time as query params', async () => {
    let capturedUrl = '';
    server.use(
      http.get('/api/v3/events', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ items: [], total: 0, per_page: 20, current_page: 1, last_page: 1 });
      }),
    );
    await getEvents({ start_time: '2026-05-01T00:00:00Z' });
    expect(capturedUrl).toContain('start_time=2026-05-01T00');
  });

  it('sends the substring and tag filters zm-api#20 added', async () => {
    let params = new URLSearchParams();
    server.use(
      http.get('/api/v3/events', ({ request }) => {
        params = new URL(request.url).searchParams;
        return HttpResponse.json({ items: [], total: 0, per_page: 20, current_page: 1, last_page: 1 });
      }),
    );
    await getEvents({
      name: 'Front', cause: 'Motion', notes: 'parcel', tag_id: '1,4',
      sort: 'cause', direction: 'desc',
    });
    expect(params.get('name')).toBe('Front');
    expect(params.get('cause')).toBe('Motion');
    expect(params.get('notes')).toBe('parcel');
    expect(params.get('tag_id')).toBe('1,4');
    expect(params.get('sort')).toBe('cause');
    expect(params.get('direction')).toBe('desc');
  });

  it('omits filters the caller left undefined', async () => {
    let params = new URLSearchParams();
    server.use(
      http.get('/api/v3/events', ({ request }) => {
        params = new URL(request.url).searchParams;
        return HttpResponse.json({ items: [], total: 0, per_page: 20, current_page: 1, last_page: 1 });
      }),
    );
    await getEvents({ monitor_id: 2 });
    expect([...params.keys()]).toEqual(['monitor_id']);
  });
});

describe('EventSortField', () => {
  it('accepts the five columns zm-api#20 added', () => {
    for (const f of ['name', 'cause', 'monitor_id', 'notes', 'frames']) {
      expect(isEventSortField(f)).toBe(true);
      expect(EVENT_SORT_FIELDS).toContain(f);
    }
    expect(isEventSortField('disk_space')).toBe(false);
  });

  it('maps the legacy sort-field names onto them', () => {
    expect(legacySortFieldToApi('Name')).toBe('name');
    expect(legacySortFieldToApi('Cause')).toBe('cause');
    expect(legacySortFieldToApi('Frames')).toBe('frames');
    expect(legacySortFieldToApi('MonitorName')).toBe('monitor_id');
    // Still no backend column for these two.
    expect(legacySortFieldToApi('DiskSpace')).toBe('start_time');
  });
});

describe('getEventCounts', () => {
  it('sums hourly counts into a total + hourly array', async () => {
    server.use(
      http.get('/api/v3/events/counts/24', () => HttpResponse.json({
        counts: [
          { date: '2026-05-24T00:00:00Z', count: 5 },
          { date: '2026-05-24T01:00:00Z', count: 3 },
        ],
        hours: 24,
      })),
    );
    const out = await getEventCounts(24);
    expect(out.total).toBe(8);
    expect(out.hourly).toHaveLength(2);
  });
});

describe('getEventCountsByMonitor', () => {
  it('unwraps the .counts array from the wrapper response', async () => {
    server.use(
      http.get('/api/v3/events/counts-by-monitor/24', () => HttpResponse.json({
        counts: [
          { monitor_id: 1, count: 12 },
          { monitor_id: 2, count: 5 },
        ],
        hours: 24,
      })),
    );
    const out = await getEventCountsByMonitor(24);
    expect(Array.isArray(out)).toBe(true);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ monitor_id: 1, count: 12 });
  });

  it('returns an empty array when the wrapper is missing the .counts field', async () => {
    server.use(
      http.get('/api/v3/events/counts-by-monitor/24', () => HttpResponse.json({})),
    );
    const out = await getEventCountsByMonitor(24);
    expect(out).toEqual([]);
  });

  // Note: the documented backend bug is a 500 with a SQL error; we don't
  // mask that — the wrapper just propagates the error so the UI degrades
  // to 0 counts naturally via lookupCount.
  it('lets backend errors propagate (degraded UI, not silent zeroing)', async () => {
    server.use(
      http.get('/api/v3/events/counts-by-monitor/24', () =>
        HttpResponse.json(
          { kind: 'DATABASE_ERROR', error_message: 'no column found' },
          { status: 500 },
        ),
      ),
    );
    await expect(getEventCountsByMonitor(24)).rejects.toBeDefined();
  });
});
