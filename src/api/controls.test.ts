import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  listControls, getControl, createControl, updateControl, deleteControl,
  summarizeCapabilities, type Control,
} from './controls';
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

const sample: Control = {
  id: 1, name: 'Hikvision PTZ', type: 'Local', protocol: 'hikvision',
  can_pan: 1, can_tilt: 1, can_zoom: 1, can_move: 1, can_move_abs: 1, can_move_rel: 1, can_move_con: 1, can_move_diag: 0, can_move_map: 0,
  can_auto_zoom: 0, can_zoom_abs: 1, can_zoom_rel: 1, can_zoom_con: 1, has_zoom_speed: 1,
  can_focus: 1, can_auto_focus: 1, can_focus_abs: 0, can_focus_rel: 1, can_focus_con: 1, has_focus_speed: 0,
  can_iris: 0, can_auto_iris: 0, can_iris_abs: 0, can_iris_rel: 0, can_iris_con: 0, has_iris_speed: 0,
  can_gain: 0, can_auto_gain: 0, can_gain_abs: 0, can_gain_rel: 0, can_gain_con: 0, has_gain_speed: 0,
  can_white: 0, can_auto_white: 0, can_white_abs: 0, can_white_rel: 0, can_white_con: 0, has_white_speed: 0,
  has_presets: 1, num_presets: 8, has_home_preset: 1, can_set_presets: 1,
  has_pan_speed: 1, has_turbo_pan: 0, has_tilt_speed: 1, has_turbo_tilt: 0,
  can_wake: 0, can_sleep: 0, can_reset: 0, can_reboot: 0,
  can_auto_scan: 0, num_scan_paths: 0,
};

describe('listControls', () => {
  it('GETs /controls with default pagination', async () => {
    let url = '';
    server.use(http.get('/api/v3/controls', ({ request }) => {
      url = request.url;
      return HttpResponse.json({
        items: [sample], total: 1, per_page: 200, current_page: 1, last_page: 1,
      });
    }));
    const out = await listControls();
    expect(out.items).toHaveLength(1);
    expect(url).toMatch(/page=1/);
    expect(url).toMatch(/page_size=200/);
  });
});

describe('getControl', () => {
  it('GETs /controls/{id}', async () => {
    server.use(http.get('/api/v3/controls/7', () => HttpResponse.json({ ...sample, id: 7 })));
    const out = await getControl(7);
    expect(out.id).toBe(7);
  });
});

describe('createControl', () => {
  it('POSTs the payload to /controls', async () => {
    let body: Record<string, unknown> = {};
    server.use(http.post('/api/v3/controls', async ({ request }) => {
      body = await request.json() as Record<string, unknown>;
      return HttpResponse.json({ ...sample, id: 42 });
    }));
    // Strip id (CreateControlPayload is Omit<Control, 'id'>)
    const { id, ...payload } = sample;
    void id;
    const out = await createControl(payload);
    expect(body.name).toBe('Hikvision PTZ');
    expect(out.id).toBe(42);
  });
});

describe('updateControl', () => {
  it('PATCHes /controls/{id} with a partial payload', async () => {
    let body: Record<string, unknown> = {};
    server.use(http.patch('/api/v3/controls/1', async ({ request }) => {
      body = await request.json() as Record<string, unknown>;
      return HttpResponse.json({ ...sample, name: 'Renamed' });
    }));
    await updateControl(1, { name: 'Renamed' });
    expect(body).toEqual({ name: 'Renamed' });
  });
});

describe('deleteControl', () => {
  it('DELETEs /controls/{id}', async () => {
    let hit = false;
    server.use(http.delete('/api/v3/controls/1', () => {
      hit = true;
      return new HttpResponse(null, { status: 204 });
    }));
    await deleteControl(1);
    expect(hit).toBe(true);
  });
});

describe('summarizeCapabilities', () => {
  it('joins Pan/Tilt when both present', () => {
    expect(summarizeCapabilities(sample)).toMatch(/Pan\/Tilt/);
  });

  it('emits "View only" when no capabilities are set', () => {
    const dummy: Control = { ...sample,
      can_pan: 0, can_tilt: 0, can_zoom: 0, can_focus: 0, has_presets: 0 };
    expect(summarizeCapabilities(dummy)).toBe('View only');
  });

  it('reports the preset count when has_presets is set', () => {
    expect(summarizeCapabilities(sample)).toMatch(/Presets \(8\)/);
  });

  it('emits just "Pan" when can_pan but not can_tilt', () => {
    const onePan: Control = { ...sample, can_tilt: 0, can_zoom: 0, can_focus: 0, has_presets: 0 };
    expect(summarizeCapabilities(onePan)).toBe('Pan');
  });
});
