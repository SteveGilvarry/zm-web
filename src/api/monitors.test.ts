import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  getMonitors,
  getMonitor,
  updateMonitor,
  deleteMonitor,
  startLiveStream,
  stopLiveStream,
  getLiveStats,
  getLiveSessions,
  getMonitorSnapshotUrl,
  getHlsPlaylistUrl,
  canonicalEnum,
  MONITOR_ENUMS,
} from './monitors';
import { useAuthStore } from '@/stores/auth';
import { isDeleted } from '@/types';

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

describe('getMonitors', () => {
  it('GETs /monitors and returns the paginated wrapper', async () => {
    server.use(
      http.get('/api/v3/monitors', () => HttpResponse.json({
        items: [{ id: 1, name: 'Front' }],
        total: 1, per_page: 20, current_page: 1, last_page: 1,
      })),
    );
    const out = await getMonitors({ page: 1, page_size: 20 });
    expect(out.items).toHaveLength(1);
    expect(out.total).toBe(1);
  });
});

describe('monitor enums come back ready to write (zm-api#18)', () => {
  // Values exactly as the dev box returns them: the request spelling, and
  // `deleted` as a JSON boolean. No client-side normalisation left.
  const raw = {
    id: 1, name: 'HIKVISION', orientation: 'Rotate90', event_close_mode: 'System',
    default_codec: 'Auto', rtsp2_web_type: 'WebRtc', output_container: null,
    capturing: 'Always', decoding: 'Ondemand', analysing: 'None', recording: 'Always',
    type: 'Ffmpeg', function: 'Monitor', importance: 'Normal', deleted: false,
  };

  it('passes reads through untouched', async () => {
    server.use(
      http.get('/api/v3/monitors', () => HttpResponse.json({
        items: [raw, { ...raw, id: 2, orientation: 'Rotate270' }],
        total: 2, per_page: 20, current_page: 1, last_page: 1,
      })),
      http.get('/api/v3/monitors/1', () => HttpResponse.json(raw)),
    );
    const page = await getMonitors();
    expect(page.items.map((m) => m.orientation)).toEqual(['Rotate90', 'Rotate270']);
    const one = await getMonitor(1);
    expect(one.rtsp2_web_type).toBe('WebRtc');
    expect(one.event_close_mode).toBe('System');
    expect(isDeleted(one)).toBe(false);
  });

  it('canonicalEnum still folds the loose spellings the camera presets use', () => {
    expect(canonicalEnum('FLIP_HORI', ['FlipHori'])).toBe('FlipHori');
    expect(canonicalEnum('WebRTC', MONITOR_ENUMS.rtsp2_web_type)).toBe('WebRtc');
    expect(canonicalEnum('Sideways', ['Rotate0'])).toBe('Sideways');
  });
});

describe('getMonitor', () => {
  it('GETs /monitors/{id}', async () => {
    let receivedId: string | undefined;
    server.use(
      http.get('/api/v3/monitors/:id', ({ params }) => {
        receivedId = params.id as string;
        return HttpResponse.json({ id: 7, name: 'Garage' });
      }),
    );
    const out = await getMonitor(7);
    expect(receivedId).toBe('7');
    expect(out.name).toBe('Garage');
  });
});

describe('updateMonitor', () => {
  it('PATCHes /monitors/{id} with the partial body', async () => {
    let body: unknown = null;
    let method: string | undefined;
    server.use(
      http.patch('/api/v3/monitors/3', async ({ request }) => {
        method = request.method;
        body = await request.json();
        return HttpResponse.json({ id: 3, name: 'Renamed' });
      }),
    );
    const out = await updateMonitor(3, { name: 'Renamed' });
    expect(method).toBe('PATCH');
    expect(body).toEqual({ name: 'Renamed' });
    expect(out.id).toBe(3);
  });
});

describe('deleteMonitor', () => {
  it('DELETEs /monitors/{id}', async () => {
    let deletedId: string | undefined;
    server.use(
      http.delete('/api/v3/monitors/:id', ({ params }) => {
        deletedId = params.id as string;
        return HttpResponse.json({}, { status: 204 });
      }),
    );
    await deleteMonitor(11);
    expect(deletedId).toBe('11');
  });
});

describe('startLiveStream / stopLiveStream', () => {
  it('startLiveStream POSTs to /live/{id}/start with an Auth header and JSON body', async () => {
    let body: unknown = null;
    let authHeader: string | null = null;
    server.use(
      http.post('/api/v3/live/5/start', async ({ request }) => {
        authHeader = request.headers.get('authorization');
        body = await request.json();
        return HttpResponse.json({ monitor_id: 5, status: 'started' });
      }),
    );
    const out = await startLiveStream(5, { enable_hls: true });
    expect(authHeader).toMatch(/^Bearer /);
    expect(body).toEqual({ enable_hls: true });
    expect(out.status).toBe('started');
  });

  it('startLiveStream maps 409 (already running) to a successful already_running response', async () => {
    server.use(
      http.post('/api/v3/live/5/start', () =>
        HttpResponse.json({ error_message: 'Live stream already exists for monitor 5' }, { status: 409 }),
      ),
    );
    const out = await startLiveStream(5, { enable_webrtc: true });
    expect(out).toEqual({ monitor_id: 5, status: 'already_running' });
  });

  it('startLiveStream refreshes the token on 401 and retries like every other call', async () => {
    const seen: string[] = [];
    server.use(
      http.post('/api/v3/live/5/start', ({ request }) => {
        const auth = request.headers.get('authorization') ?? '';
        seen.push(auth);
        if (auth !== 'Bearer fresh') {
          return HttpResponse.json({ error_message: 'expired' }, { status: 401 });
        }
        return HttpResponse.json({ monitor_id: 5, status: 'started' });
      }),
      http.post('/api/v3/auth/refresh', () =>
        HttpResponse.json({ access_token: 'fresh', refresh_token: 'fresh-r', expire_in: 3600, token_type: 'Bearer' }),
      ),
    );
    const out = await startLiveStream(5, { enable_webrtc: true });
    expect(out.status).toBe('started');
    expect(seen).toEqual(['Bearer test', 'Bearer fresh']);
    // Put the store back the way the suite expects it.
    useAuthStore.setState({ accessToken: 'test', refreshToken: 'test', isAuthenticated: true });
  });

  it('stopLiveStream tolerates 404 (already stopped) without throwing', async () => {
    server.use(
      http.delete('/api/v3/live/5/stop', () =>
        HttpResponse.json({ error: 'not running' }, { status: 404 }),
      ),
    );
    await expect(stopLiveStream(5)).resolves.toBeUndefined();
  });
});

describe('getLiveStats / getLiveSessions', () => {
  it('getLiveStats GETs /live/{id}/stats', async () => {
    server.use(
      http.get('/api/v3/live/9/stats', () =>
        HttpResponse.json({ active_clients: 2 }),
      ),
    );
    const out = await getLiveStats(9);
    expect(out).toEqual({ active_clients: 2 });
  });

  it('getLiveSessions returns the bare number array', async () => {
    server.use(
      http.get('/api/v3/live/sessions', () => HttpResponse.json([1, 2, 3])),
    );
    const out = await getLiveSessions();
    expect(out).toEqual([1, 2, 3]);
  });
});

describe('URL helpers (pure)', () => {
  it('getMonitorSnapshotUrl appends an encoded token when provided', () => {
    expect(getMonitorSnapshotUrl(4)).toBe('/api/v3/monitors/4/snapshot');
    expect(getMonitorSnapshotUrl(4, 'a/b+c')).toBe(
      '/api/v3/monitors/4/snapshot?token=a%2Fb%2Bc',
    );
  });

  it('getHlsPlaylistUrl returns bare URL by default, raw-token URL when asked', () => {
    expect(getHlsPlaylistUrl(2)).toBe('/api/v3/live/2/hls/master.m3u8');
    // withToken=true uses the auth store's token unencoded (base64url-safe).
    const withTok = getHlsPlaylistUrl(2, true);
    expect(withTok.startsWith('/api/v3/live/2/hls/master.m3u8?token=')).toBe(true);
  });
});
