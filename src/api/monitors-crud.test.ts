import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  createMonitor, cloneMonitor, deleteMonitor, toCreatePayload, MONITOR_CREATE_DEFAULTS,
} from './monitors-crud';
import { useAuthStore } from '@/stores/auth';
import type { Monitor } from '@/types';

let storageCalls = 0;
const server = setupServer(
  // Create/clone resolve a missing storage_id from the first storage area.
  http.get('/api/v3/storage', () => {
    storageCalls++;
    return HttpResponse.json({
      items: [{ id: 7, name: 'Default', path: '/var/cache/zoneminder/events', type: 'local', enabled: 1 }],
      total: 1, per_page: 1, current_page: 1, last_page: 1,
    });
  }),
);
beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', user: null, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'warn' });
});
afterEach(() => {
  server.resetHandlers();
  storageCalls = 0;
});
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

  it('function=None disables capturing too, so no daemon starts', async () => {
    let body: Record<string, unknown> = {};
    server.use(http.post('/api/v3/monitors', async ({ request }) => {
      body = await request.json() as Record<string, unknown>;
      return HttpResponse.json({ id: 99 });
    }));
    await createMonitor({ name: 'cam', function: 'None' });
    expect(body).toMatchObject({ capturing: 'None', analysing: 'None', recording: 'None' });
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

  it('fills storage_id from GET /storage when the caller gives none, and skips the lookup otherwise', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    server.use(http.post('/api/v3/monitors', async ({ request }) => {
      bodies.push(await request.json() as Record<string, unknown>);
      return HttpResponse.json({ id: 99 });
    }));

    await createMonitor({ name: 'cam' });
    expect(bodies[0].storage_id).toBe(7);
    expect(storageCalls).toBe(1);

    await createMonitor({ name: 'cam2', storage_id: 3 });
    expect(bodies[1].storage_id).toBe(3);
    expect(storageCalls).toBe(1);
  });

  it('fails with a readable message when no storage area exists', async () => {
    server.use(http.get('/api/v3/storage', () => HttpResponse.json({
      items: [], total: 0, per_page: 1, current_page: 1, last_page: 1,
    })));
    await expect(createMonitor({ name: 'cam' })).rejects.toThrow(/storage area/i);
  });
});

/**
 * Shaped like a live `GET /monitors/{id}` body: raw DB enum strings, integer
 * `deleted`, null container, ZoneMinder's -1 / 0 defaults the create
 * validator rejects, plus read-only keys the request schema does not know.
 */
const RAW_SOURCE = {
  id: 5, name: 'Garage', sequence: 5, zone_count: 2,
  width: 1280, height: 720, type: 'Ffmpeg', function: 'Monitor',
  orientation: 'ROTATE_90', event_close_mode: 'system', default_codec: 'auto',
  rtsp2_web_type: 'WebRTC', output_container: null, deleted: 0,
  brightness: -1, contrast: -1, hue: -1, colour: -1,
  image_buffer_count: 3, max_image_buffer_count: 0, stream_replay_buffer: 0,
  storage_id: 0, restream: 0, rtsp_user: null, method: 'rtpRtsp',
  // not in CreateMonitorRequest — must be dropped
  created_at: '2026-01-01T00:00:00Z', status: 'Connected',
} as unknown as Monitor;

describe('MONITOR_CREATE_DEFAULTS', () => {
  it('exports a constant the create wrapper spreads from', () => {
    expect(MONITOR_CREATE_DEFAULTS).toHaveProperty('section_length');
    expect(MONITOR_CREATE_DEFAULTS).toHaveProperty('analysing');
  });

  it('uses request-enum casing and only request keys', () => {
    expect(MONITOR_CREATE_DEFAULTS.orientation).toBe('Rotate0');
    expect(MONITOR_CREATE_DEFAULTS.rtsp2_web_type).toBe('Mse');
    expect(MONITOR_CREATE_DEFAULTS.deleted).toBe(false);
    expect(MONITOR_CREATE_DEFAULTS).toHaveProperty('restream', 0);
    expect(MONITOR_CREATE_DEFAULTS).not.toHaveProperty('enabled');
    expect(MONITOR_CREATE_DEFAULTS).not.toHaveProperty('janus_use_rtsp_restream');
    expect(MONITOR_CREATE_DEFAULTS).not.toHaveProperty('janus_rtsp_user');
  });

  it('stays above the backend minimums ZoneMinder itself violates (BT-20)', () => {
    for (const k of ['brightness', 'contrast', 'hue', 'colour'] as const) {
      expect(MONITOR_CREATE_DEFAULTS[k]).toBeGreaterThanOrEqual(0);
    }
    expect(MONITOR_CREATE_DEFAULTS.max_image_buffer_count).toBeGreaterThanOrEqual(1);
    expect(MONITOR_CREATE_DEFAULTS.stream_replay_buffer).toBeGreaterThanOrEqual(1);
  });
});

describe('toCreatePayload', () => {
  it('maps a GET body onto a CreateMonitorRequest the backend accepts', () => {
    const out = toCreatePayload(RAW_SOURCE) as unknown as Record<string, unknown>;

    // read-only / unknown keys gone, identity reset
    expect(out).not.toHaveProperty('id');
    expect(out).not.toHaveProperty('created_at');
    expect(out).not.toHaveProperty('status');
    expect(out.sequence).toBeNull();
    expect(out.deleted).toBe(false);

    // enum casing + required non-null container
    expect(out.orientation).toBe('Rotate90');
    expect(out.event_close_mode).toBe('System');
    expect(out.default_codec).toBe('Auto');
    expect(out.rtsp2_web_type).toBe('WebRtc');
    expect(out.output_container).toBe('Auto');

    // BT-20 floors
    expect(out.brightness).toBe(0);
    expect(out.colour).toBe(0);
    expect(out.max_image_buffer_count).toBe(MONITOR_CREATE_DEFAULTS.max_image_buffer_count);
    expect(out.stream_replay_buffer).toBe(MONITOR_CREATE_DEFAULTS.stream_replay_buffer);

    // source values that are fine pass through; defaults fill the gaps
    expect(out.width).toBe(1280);
    expect(out.image_buffer_count).toBe(3);
    expect(out.zone_count).toBe(2);
    expect(out.section_length).toBe(MONITOR_CREATE_DEFAULTS.section_length);
    expect(Object.keys(out).sort()).toEqual(Object.keys(MONITOR_CREATE_DEFAULTS).sort());
  });

  it('applies overrides last', () => {
    expect(toCreatePayload(RAW_SOURCE, { name: 'Copy' }).name).toBe('Copy');
  });
});

describe('cloneMonitor', () => {
  it('GETs the source, POSTs a create payload with name suffixed "(clone)"', async () => {
    let posted: Record<string, unknown> = {};
    server.use(
      http.get('/api/v3/monitors/5', () => HttpResponse.json(RAW_SOURCE)),
      http.post('/api/v3/monitors', async ({ request }) => {
        posted = await request.json() as Record<string, unknown>;
        return HttpResponse.json({ id: 6 });
      }),
    );

    await cloneMonitor(5);
    expect(posted.name).toBe('Garage (clone)');
    // id must NOT pass through to the clone — the backend assigns it; the
    // clone goes to the end of the sequence.
    expect(posted).not.toHaveProperty('id');
    expect(posted.sequence).toBeNull();
    // the GET body's raw casing / 0-1 deleted are converted
    expect(posted.orientation).toBe('Rotate90');
    expect(posted.deleted).toBe(false);
    // storage_id 0 on the source resolves to the first storage area
    expect(posted.storage_id).toBe(7);
  });

  it('keeps the source storage_id when it names a row', async () => {
    let posted: Record<string, unknown> = {};
    server.use(
      http.get('/api/v3/monitors/5', () => HttpResponse.json({ ...RAW_SOURCE, storage_id: 2 })),
      http.post('/api/v3/monitors', async ({ request }) => {
        posted = await request.json() as Record<string, unknown>;
        return HttpResponse.json({ id: 6 });
      }),
    );
    await cloneMonitor(5);
    expect(posted.storage_id).toBe(2);
    expect(storageCalls).toBe(0);
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

