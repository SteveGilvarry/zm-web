import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createMonitor, cloneMonitor, deleteMonitor, MONITOR_CREATE_DEFAULTS } from './monitors-crud';
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

describe('createMonitor — function → mode coercion', () => {
  it('Modect implies capturing=Always, recording=OnMotion, analysing=Always', async () => {
    let body: Record<string, unknown> = {};
    server.use(http.post('/api/v3/monitors', async ({ request }) => {
      body = await request.json() as Record<string, unknown>;
      return HttpResponse.json({ id: 99 });
    }));

    await createMonitor({ name: 'cam', function: 'Modect' });
    expect(body.function).toBe('Modect');
    expect(body.capturing).toBe('Always');
    expect(body.analysing).toBe('Always');
    expect(body.recording).toBe('OnMotion');
  });

  it("function=Record sets recording=Always", async () => {
    let body: Record<string, unknown> = {};
    server.use(http.post('/api/v3/monitors', async ({ request }) => {
      body = await request.json() as Record<string, unknown>;
      return HttpResponse.json({ id: 99 });
    }));
    await createMonitor({ name: 'cam', function: 'Record' });
    expect(body.recording).toBe('Always');
  });

  it("function=Monitor sets analysing=None and recording=None", async () => {
    let body: Record<string, unknown> = {};
    server.use(http.post('/api/v3/monitors', async ({ request }) => {
      body = await request.json() as Record<string, unknown>;
      return HttpResponse.json({ id: 99 });
    }));
    await createMonitor({ name: 'cam', function: 'Monitor' });
    expect(body.analysing).toBe('None');
    expect(body.recording).toBe('None');
  });

  it('payload contains every default field — backend requires all ~100', async () => {
    let body: Record<string, unknown> = {};
    server.use(http.post('/api/v3/monitors', async ({ request }) => {
      body = await request.json() as Record<string, unknown>;
      return HttpResponse.json({ id: 99 });
    }));
    await createMonitor({ name: 'cam' });

    // Random check: a few representative fields from MONITOR_CREATE_DEFAULTS
    // should all be present in the POST body.
    expect(body).toHaveProperty('section_length');
    expect(body).toHaveProperty('image_buffer_count');
    expect(body).toHaveProperty('default_codec');
    expect(body).toHaveProperty('signal_check_colour');
    // Sanity check: the spread didn't drop the user-supplied name.
    expect(body.name).toBe('cam');
  });
});

describe('cloneMonitor', () => {
  it('GETs the source, POSTs with name suffixed "(clone)"', async () => {
    let posted: Record<string, unknown> = {};
    server.use(
      http.get('/api/v3/monitors/5', () => HttpResponse.json({
        id: 5, name: 'Garage', sequence: 5,
        width: 1280, height: 720,
      })),
      http.post('/api/v3/monitors', async ({ request }) => {
        posted = await request.json() as Record<string, unknown>;
        return HttpResponse.json({ id: 6 });
      }),
    );

    await cloneMonitor(5);
    expect(posted.name).toBe('Garage (clone)');
    // id must NOT pass through to the clone — the backend assigns it.
    // sequence is reset to null (the defaults set it null; the source
    // value is destructured out so it doesn't override).
    expect(posted).not.toHaveProperty('id');
    expect(posted.sequence).toBeNull();
  });

  it('honours an explicit newName argument', async () => {
    let posted: Record<string, unknown> = {};
    server.use(
      http.get('/api/v3/monitors/5', () => HttpResponse.json({ id: 5, name: 'Garage' })),
      http.post('/api/v3/monitors', async ({ request }) => {
        posted = await request.json() as Record<string, unknown>;
        return HttpResponse.json({ id: 6 });
      }),
    );

    await cloneMonitor(5, 'Garage Copy');
    expect(posted.name).toBe('Garage Copy');
  });
});

describe('deleteMonitor', () => {
  it('DELETEs /monitors/{id}', async () => {
    let deletedId: string | undefined;
    server.use(http.delete('/api/v3/monitors/:id', ({ params }) => {
      deletedId = params.id as string;
      return HttpResponse.json({}, { status: 204 });
    }));
    await deleteMonitor(42);
    expect(deletedId).toBe('42');
  });
});

describe('MONITOR_CREATE_DEFAULTS', () => {
  it('exports a constant the create wrapper spreads from', () => {
    expect(MONITOR_CREATE_DEFAULTS).toHaveProperty('section_length');
    expect(MONITOR_CREATE_DEFAULTS).toHaveProperty('analysing');
  });
});
