import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ptz } from './ptz';
import { useAuthStore } from '@/stores/auth';

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

describe('ptz.getProtocols / getCapabilities / getStatus', () => {
  it('getProtocols GETs /ptz/protocols', async () => {
    server.use(
      http.get('/api/v3/ptz/protocols', () => HttpResponse.json({
        protocols: [{ name: 'onvif', is_native: true, description: null }],
        native_protocols: ['onvif'],
        perl_fallback_enabled: false,
      })),
    );
    const out = await ptz.getProtocols();
    expect(out.protocols[0].name).toBe('onvif');
    expect(out.native_protocols).toEqual(['onvif']);
  });

  it('getStatus GETs /ptz/monitors/{id}/status', async () => {
    let id: string | undefined;
    server.use(
      http.get('/api/v3/ptz/monitors/:id/status', ({ params }) => {
        id = params.id as string;
        return HttpResponse.json({
          available: true,
          capabilities: {} as never,
          is_native: true,
          monitor_id: Number(params.id),
          position: { pan: 0, tilt: 0, zoom: 0 },
          protocol: 'onvif',
        });
      }),
    );
    const out = await ptz.getStatus(4);
    expect(id).toBe('4');
    expect(out.monitor_id).toBe(4);
    expect(out.protocol).toBe('onvif');
  });
});

describe('ptz.move / stopMove', () => {
  it('move POSTs /ptz/monitors/{id}/move/{dir} with the body', async () => {
    let body: unknown = null;
    let url = '';
    server.use(
      http.post('/api/v3/ptz/monitors/4/move/up-left', async ({ request }) => {
        url = request.url;
        body = await request.json();
        return HttpResponse.json({ success: true, message: 'ok' });
      }),
    );
    const out = await ptz.move(4, 'up-left', { pan_speed: 50, tilt_speed: 50, duration_ms: 200 });
    expect(url).toContain('/ptz/monitors/4/move/up-left');
    expect(body).toEqual({ pan_speed: 50, tilt_speed: 50, duration_ms: 200 });
    expect(out.success).toBe(true);
  });

  it('stopMove POSTs /move/stop with an empty body', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/v3/ptz/monitors/4/move/stop', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ success: true, message: 'stopped' });
      }),
    );
    await ptz.stopMove(4);
    expect(body).toEqual({});
  });
});

describe('ptz.zoom / focus', () => {
  it('zoom POSTs /zoom/{in|out} with body', async () => {
    let url = '';
    server.use(
      http.post('/api/v3/ptz/monitors/4/zoom/in', ({ request }) => {
        url = request.url;
        return HttpResponse.json({ success: true, message: 'ok' });
      }),
    );
    await ptz.zoom(4, 'in', { speed: 25 });
    expect(url).toContain('/zoom/in');
  });

  it('focus POSTs /focus/{near|far|auto}', async () => {
    let url = '';
    server.use(
      http.post('/api/v3/ptz/monitors/4/focus/auto', ({ request }) => {
        url = request.url;
        return HttpResponse.json({ success: true, message: 'ok' });
      }),
    );
    await ptz.focus(4, 'auto');
    expect(url).toContain('/focus/auto');
  });
});

describe('ptz.presets', () => {
  it('gotoPreset POSTs /presets/{n}/goto', async () => {
    let url = '';
    server.use(
      http.post('/api/v3/ptz/monitors/4/presets/3/goto', ({ request }) => {
        url = request.url;
        return HttpResponse.json({ success: true, message: 'ok' });
      }),
    );
    await ptz.gotoPreset(4, 3);
    expect(url).toContain('/presets/3/goto');
  });

  it('setPreset POSTs {name} (null when omitted)', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post('/api/v3/ptz/monitors/4/presets/3/set', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ success: true, message: 'ok' });
      }),
    );
    await ptz.setPreset(4, 3);
    expect(body).toEqual({ name: null });
    await ptz.setPreset(4, 3, 'Door');
    expect(body).toEqual({ name: 'Door' });
  });

  it('clearPreset DELETEs /presets/{n}', async () => {
    let presetId: string | undefined;
    server.use(
      http.delete('/api/v3/ptz/monitors/4/presets/:p', ({ params }) => {
        presetId = params.p as string;
        return HttpResponse.json({}, { status: 204 });
      }),
    );
    await ptz.clearPreset(4, 3);
    expect(presetId).toBe('3');
  });
});

describe('ptz.moveRelative / moveAbsolute', () => {
  it('moveRelative POSTs /relative with deltas', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/v3/ptz/monitors/4/relative', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ success: true, message: 'ok' });
      }),
    );
    await ptz.moveRelative(4, { pan_delta: 0.1, tilt_delta: -0.05 });
    expect(body).toEqual({ pan_delta: 0.1, tilt_delta: -0.05 });
  });
});
