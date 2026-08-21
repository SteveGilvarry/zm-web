/**
 * Watch — classic skin (legacy `?view=watch&mid=`). Covers the header, the
 * action row and its permission gate, the Stream/Stills toggle, the transport
 * row, the PTZ column appearing only for a controllable camera, the alarm
 * verbs and the per-monitor events table underneath.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/components/common/toastStore';
import type { UserClaims } from '@/types';

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
  useParams: () => ({}),
  Link: ({ children, to, search, ...rest }: {
    children: ReactNode; to?: string; search?: Record<string, unknown>; [k: string]: unknown;
  }) => {
    const qs = search
      ? `?${new URLSearchParams(Object.entries(search).map(([k, v]) => [k, String(v)])).toString()}`
      : '';
    return <a href={`${to ?? '#'}${qs}`} {...rest}>{children}</a>;
  },
}));

vi.mock('@/skins/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

/**
 * Both stream hooks are always mounted; the page only ever calls the active
 * one. Replace them with controllable fakes so no WebSocket / hls.js runs.
 */
const { streamCalls, streamState } = vi.hoisted(() => ({
  streamCalls: [] as string[],
  streamState: { value: 'idle' as string, hasAudio: false },
}));
function fakeStream(kind: string) {
  return () => ({
    videoRef: { current: null },
    state: streamState.value,
    error: streamState.value === 'failed' ? 'ICE failed' : null,
    hasAudio: streamState.hasAudio,
    start: () => streamCalls.push(`${kind}:start`),
    stop: () => streamCalls.push(`${kind}:stop`),
  });
}
vi.mock('@/hooks/useWebRtcStream', () => ({ useWebRtcStream: fakeStream('webrtc') }));
vi.mock('@/hooks/useHlsStream', () => ({ useHlsStream: fakeStream('hls') }));

const ADMIN = {
  iat: 0, exp: 0, user: 'admin',
  perms: {
    stream: 'Edit', events: 'Edit', control: 'Edit', monitors: 'Edit',
    groups: 'Edit', devices: 'Edit', snapshots: 'Edit', system: 'Edit',
  },
} as unknown as UserClaims;

const VIEWER = {
  iat: 0, exp: 0, user: 'viewer',
  perms: {
    stream: 'View', events: 'View', control: 'None', monitors: 'View',
    groups: 'View', devices: 'None', snapshots: 'None', system: 'None',
  },
} as unknown as UserClaims;

const NO_STREAM = {
  iat: 0, exp: 0, user: 'nostream',
  perms: {
    stream: 'None', events: 'View', control: 'None', monitors: 'View',
    groups: 'None', devices: 'None', snapshots: 'None', system: 'None',
  },
} as unknown as UserClaims;

const paged = <T,>(items: T[], over: Record<string, number> = {}) => ({
  items, total: items.length, per_page: 25, current_page: 1, last_page: 1, ...over,
});

const MONITOR = {
  id: 3,
  name: 'Driveway',
  width: 1280,
  height: 720,
  orientation: 'ROTATE_0',
  capturing: 'Always',
  analysing: 'Always',
  recording: 'OnMotion',
  type: 'Ffmpeg',
  enabled: 1,
  decoding_enabled: 1,
  onvif_event_listener: 0,
  method: 'system',
  storage_id: 1,
};

const STATUS = {
  monitor_id: 3,
  status: 'Connected',
  capture_fps: '10.00',
  analysis_fps: '5.00',
  capture_bandwidth: 2048,
  updated_on: '2026-08-21T07:00:00Z',
};

const EVENT = {
  id: 900,
  monitor_id: 3,
  name: 'Event 900',
  start_date_time: '2026-08-21T06:40:00Z',
  end_date_time: '2026-08-21T06:40:30Z',
  length: '30.00',
  frames: 300,
  alarm_frames: 12,
  tot_score: 480,
  avg_score: 40,
  max_score: 92,
  archived: 0,
  cause: 'Motion',
  notes: '',
};

const AXIS = { has_control: false, min: null, max: null, has_speed: false, has_auto: false };
const CAPS = {
  control_id: 4,
  name: 'ONVIF PTZ',
  protocol: 'ONVIF',
  pan_tilt: {
    can_pan: true, can_tilt: true, has_pan_speed: true, has_tilt_speed: true,
    has_diagonal: true, has_turbo: false,
  },
  zoom: { ...AXIS, has_control: true },
  focus: AXIS,
  iris: AXIS,
  gain: AXIS,
  white_balance: AXIS,
  presets: { has_presets: false, num_presets: 0, has_home: false },
  power: { can_wake: false, can_sleep: false, can_reset: false, can_reboot: false },
  scan: { can_zoom_con: false, has_scan: false, num_scan_paths: 0 },
};

const server = setupServer();
const alarmCalls: unknown[] = [];
const deletedEvents: string[] = [];

/** `ptz: 'none'` makes the camera non-controllable (backend answers 400). */
function stubOk(opts: { ptz?: 'ready' | 'none'; events?: unknown[]; monitor?: Record<string, unknown> } = {}) {
  const { ptz = 'none', events = [EVENT], monitor = MONITOR } = opts;
  server.use(
    http.get('/api/v3/ptz/monitors/:id/capabilities', () =>
      ptz === 'ready'
        ? HttpResponse.json(CAPS)
        : HttpResponse.json({ kind: 'BAD_REQUEST', error_message: 'Monitor 3 has no PTZ control configured' }, { status: 400 })),
    http.get('/api/v3/monitors/:id', () => HttpResponse.json(monitor)),
    http.get('/api/v3/monitor-status', () => HttpResponse.json(paged([STATUS]))),
    http.get('/api/v3/events', () => HttpResponse.json(paged(events))),
    http.get('/api/v3/configs/:name', ({ params }) =>
      HttpResponse.json({ name: params.name, value: params.name === 'ZM_WEB_EVENTS_PER_PAGE' ? '25' : '1' })),
    http.patch('/api/v3/monitors/:id/alarm', async ({ request }) => {
      alarmCalls.push(await request.json());
      return HttpResponse.json(monitor);
    }),
    http.delete('/api/v3/events/:id', ({ params }) => {
      deletedEvents.push(String(params.id));
      return new HttpResponse(null, { status: 204 });
    }),
    // Lookups the monitor editor dialog pulls in when it opens.
    http.get('/api/v3/monitors', () => HttpResponse.json(paged([monitor]))),
    http.get('/api/v3/manufacturers', () => HttpResponse.json(paged([]))),
    http.get('/api/v3/models', () => HttpResponse.json(paged([]))),
    http.get('/api/v3/servers', () => HttpResponse.json(paged([]))),
    http.get('/api/v3/groups', () => HttpResponse.json(paged([]))),
    http.get('/api/v3/groups-monitors', () => HttpResponse.json(paged([]))),
    http.get('/api/v3/storage', () => HttpResponse.json(paged([]))),
  );
}

beforeAll(() => {
  // jsdom has no matchMedia; useWatchPage subscribes to the desktop breakpoint.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: true, media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    }),
  });
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  streamState.value = 'idle';
  streamState.hasAudio = false;
  useAuthStore.setState({ accessToken: 't', refreshToken: 't', isAuthenticated: true, user: ADMIN });
});
afterEach(() => {
  server.resetHandlers();
  streamCalls.length = 0;
  alarmCalls.length = 0;
  deletedEvents.length = 0;
  useToastStore.getState().clear();
  vi.restoreAllMocks();
});
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

async function mount(monitorId = 3) {
  const { default: Page } = await import('./monitors.watch');
  return renderWithProviders(<Page monitorId={monitorId} />);
}

describe('ClassicMonitorWatchPage', () => {
  it('renders the legacy header, status line and transport row', async () => {
    stubOk();
    await mount();

    expect(await screen.findByRole('heading', { name: 'Monitor - 3 - Driveway' })).toBeInTheDocument();
    expect(screen.getByTestId('watch-stage')).toBeInTheDocument();

    const runtime = await screen.findByTestId('watch-runtime');
    // The shared /monitor-status poll drives the legacy "State:" line.
    await waitFor(() => expect(runtime).toHaveTextContent(/State: Connected/));
    expect(runtime).toHaveTextContent('Driveway (id=3)');
    expect(runtime).toHaveTextContent('WebRTC');

    // Transport verbs.
    expect(screen.getByRole('button', { name: 'Stop' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled();
    expect(screen.getByRole('combobox', { name: 'Player' })).toHaveValue('webrtc');
    expect(screen.getByText('1280×720')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All Events' })).toHaveAttribute('href', '/events?monitor_id=3');
  });

  it('starts the active stream from the stage button', async () => {
    stubOk();
    const user = userEvent.setup();
    await mount();

    await user.click(await screen.findByRole('button', { name: 'Start Stream' }));
    expect(streamCalls).toContain('webrtc:start');
  });

  it('stops the active stream from the transport row', async () => {
    streamState.value = 'connected';
    stubOk();
    const user = userEvent.setup();
    await mount();

    await user.click(await screen.findByRole('button', { name: 'Stop' }));
    expect(streamCalls).toContain('webrtc:stop');
  });

  it('switches the player to HLS and reports it in the status line', async () => {
    stubOk();
    const user = userEvent.setup();
    await mount();

    await user.selectOptions(await screen.findByRole('combobox', { name: 'Player' }), 'hls');
    await waitFor(() => expect(screen.getByTestId('watch-runtime')).toHaveTextContent('HLS'));
  });

  it('swaps the stage for a refreshing snapshot in Stills mode', async () => {
    stubOk();
    const user = userEvent.setup();
    await mount();

    const stills = await screen.findByRole('button', { name: 'Stills' });
    expect(stills).toHaveAttribute('aria-pressed', 'false');
    await user.click(stills);

    await waitFor(() => expect(stills).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByTestId('watch-runtime')).toHaveTextContent('Stills');
    // Transport is meaningless without a stream.
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
  });

  it('offers Retry and the error text when the stream failed', async () => {
    streamState.value = 'failed';
    stubOk();
    await mount();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('ICE failed');
    expect(within(alert).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('hides the mute toggle when the stream carries no audio', async () => {
    stubOk();
    await mount();
    await screen.findByRole('heading', { name: 'Monitor - 3 - Driveway' });
    expect(screen.queryByRole('button', { name: /^(Mute|Unmute)$/ })).toBeNull();
  });

  it('shows the mute toggle when the stream carries audio', async () => {
    streamState.value = 'connected';
    streamState.hasAudio = true;
    stubOk();
    await mount();
    expect(await screen.findByRole('button', { name: 'Unmute' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('forces an alarm through PATCH /monitors/:id/alarm after confirming', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    stubOk();
    const user = userEvent.setup();
    await mount();

    const force = await screen.findByRole('button', { name: 'Force Alarm' });
    // Enabled only once the status probe has answered.
    await waitFor(() => expect(force).toBeEnabled());
    await user.click(force);

    expect(confirm).toHaveBeenCalledOnce();
    await waitFor(() => expect(alarmCalls).toContainEqual({ action: 'on', cause: 'API', score: 100 }));
    expect(await screen.findByRole('button', { name: 'Alarm forced' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel Alarm' }));
    await waitFor(() => expect(alarmCalls).toContainEqual({ action: 'cancel' }));
  });

  it('does not force an alarm when the confirmation is dismissed', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    stubOk();
    const user = userEvent.setup();
    await mount();

    const force = await screen.findByRole('button', { name: 'Force Alarm' });
    await waitFor(() => expect(force).toBeEnabled());
    // The 'status' probe already ran; ignore it when counting.
    alarmCalls.length = 0;
    await user.click(force);

    expect(confirm).toHaveBeenCalledOnce();
    expect(alarmCalls).toEqual([]);
  });

  it('omits the PTZ column for a camera with no control configured', async () => {
    stubOk({ ptz: 'none' });
    await mount();
    await screen.findByRole('heading', { name: 'Monitor - 3 - Driveway' });
    expect(screen.queryByRole('complementary', { name: 'Camera control' })).toBeNull();
  });

  it('renders the PTZ column for a controllable camera', async () => {
    stubOk({ ptz: 'ready' });
    await mount();
    const aside = await screen.findByRole('complementary', { name: 'Camera control' });
    expect(within(aside).getByText('ONVIF')).toBeInTheDocument();
  });

  it('lists this monitor events and deletes the selected ones', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    stubOk();
    const user = userEvent.setup();
    await mount();

    expect(await screen.findByRole('link', { name: '900' })).toBeInTheDocument();

    const del = screen.getAllByRole('button', { name: 'Delete' })[0];
    expect(del).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'Select event 900' }));
    await waitFor(() => expect(del).toBeEnabled());
    await user.click(del);
    await waitFor(() => expect(deletedEvents).toEqual(['900']));
  });

  it('shows the legacy empty message when the monitor has no events', async () => {
    stubOk({ events: [] });
    await mount();
    expect(await screen.findByText('No matching records found')).toBeInTheDocument();
  });

  it('hides the edit verbs from a monitors:View user', async () => {
    useAuthStore.setState({ user: VIEWER });
    stubOk();
    await mount();

    await screen.findByRole('heading', { name: 'Monitor - 3 - Driveway' });
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Force Alarm' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit monitor' })).toBeNull();
    // Download Image is not permission-gated.
    expect(screen.getByRole('button', { name: 'Download Image' })).toBeInTheDocument();
  });

  it('replaces the stage with the no-permission note for a stream:None user', async () => {
    useAuthStore.setState({ user: NO_STREAM });
    stubOk();
    await mount();

    await screen.findByRole('heading', { name: 'Monitor - 3 - Driveway' });
    expect(screen.queryByTestId('watch-stage')).toBeNull();
    expect(screen.getByText('You do not have permission to view this.')).toBeInTheDocument();
  });

  it('says the monitor is disabled when capturing is None', async () => {
    stubOk({ monitor: { ...MONITOR, capturing: 'None' } });
    await mount();

    expect(await screen.findByText('Monitor is disabled')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Download Image' })).toBeDisabled();
  });

  it('opens the monitor editor from the Edit verb', async () => {
    stubOk();
    const user = userEvent.setup();
    await mount();

    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    // The editor is a full-screen overlay, not a dialog role — assert its heading.
    expect(await screen.findByRole('heading', { name: 'Edit · Driveway' })).toBeInTheDocument();
  });

  it('shows the not-found state when the monitor does not exist', async () => {
    server.use(
      http.get('/api/v3/monitors/:id/ptz/capabilities', () =>
        HttpResponse.json({ kind: 'BAD_REQUEST', error_message: 'no ptz' }, { status: 400 })),
      http.get('/api/v3/monitors/:id', () =>
        HttpResponse.json({ kind: 'NOT_FOUND', error_message: 'no such monitor' }, { status: 404 })),
      http.get('/api/v3/monitor-status', () => HttpResponse.json(paged([]))),
      http.get('/api/v3/events', () => HttpResponse.json(paged([]))),
      http.get('/api/v3/configs/:name', ({ params }) => HttpResponse.json({ name: params.name, value: '1' })),
    );
    await mount(404);

    expect(await screen.findByText(/Monitor not found/i)).toBeInTheDocument();
  });

  it('surfaces an unreachable backend on the events table', async () => {
    stubOk();
    server.use(http.get('/api/v3/events', () => HttpResponse.error()));
    await mount();

    await screen.findByRole('heading', { name: 'Monitor - 3 - Driveway' });
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Cannot reach the server.'));
  });
});
