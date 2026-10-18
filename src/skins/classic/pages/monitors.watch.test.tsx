/**
 * Watch — classic skin (legacy `?view=watch&mid=`, 1.39.41). Covers the
 * header row and what it no longer carries, the stage's hover block and
 * zoom gestures, the status line, the transport row (Stop / Pause / Play),
 * the PTZ toggle and column, the cycle sidebar, the hidden-tab stop, the
 * alarm toggle and the per-monitor events table underneath.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/components/common/toastStore';
import { useUiStore } from '@/stores/ui';
import { useWatchPrefsStore } from '@/stores/watchPrefs';
import type { UserClaims } from '@/types';

const { routeSearch } = vi.hoisted(() => ({ routeSearch: { value: {} as Record<string, unknown> } }));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useSearch: () => routeSearch.value,
  useParams: () => ({}),
  // jsdom starts with a single history entry, so Back is greyed as legacy
  // greys it on a page nothing linked to.
  useCanGoBack: () => false,
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
function stubOk(opts: {
  ptz?: 'ready' | 'none';
  events?: unknown[];
  monitor?: Record<string, unknown>;
  /** `ZM_*` rows the page reads through the shared config table. */
  configs?: Record<string, string>;
  /** Extra monitors for the cycle sidebar's rotation. */
  monitors?: unknown[];
} = {}) {
  const { ptz = 'none', events = [EVENT], configs = {} } = opts;
  // `Monitors.Controllable` is what the page gates the capability request on,
  // exactly as legacy gates its control panel, so it tracks `ptz` here.
  const monitor = { controllable: ptz === 'ready' ? 1 : 0, ...(opts.monitor ?? MONITOR) };
  const monitors = opts.monitors ?? [monitor];
  server.use(
    http.get('/api/v3/configs', () => HttpResponse.json(paged(
      Object.entries({ ZM_WEB_EVENTS_PER_PAGE: '25', ...configs }).map(([name, value], i) => ({
        id: i + 1, name, value, type: 'string', category: 'web', readonly: 0, private: 0, system: 0,
      })),
      { per_page: 1000 },
    ))),
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
    http.get('/api/v3/monitors', () => HttpResponse.json(paged(monitors))),
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
  useUiStore.setState({ classicCycleSidebarOpen: false, classicMonitorFilterBarOpen: true });
  useWatchPrefsStore.setState(useWatchPrefsStore.getInitialState());
  routeSearch.value = {};
  vi.restoreAllMocks();
});
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

async function mount(monitorId = 3) {
  const { default: Page } = await import('./monitors.watch');
  return renderWithProviders(<Page monitorId={monitorId} />);
}

/** Wait for the page to render: the status line carries the name, as legacy's does. */
const ready = () => screen.findByText('Driveway (id=3)');

describe('ClassicMonitorWatchPage', () => {
  it('renders the 1.39.41 header row and nothing it dropped', async () => {
    stubOk();
    await mount();
    await ready();

    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Force Alarm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Toggle cycle sidebar' })).toBeInTheDocument();
    // Not controllable: the toggle is there, greyed, with legacy's title.
    expect(screen.getByRole('button', { name: 'PTZ Not available' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Scale' })).toHaveValue('0');
    expect(screen.getByRole('combobox', { name: 'Player' })).toHaveValue('webrtc');

    // Commented out or never emitted by watch.php in 1.39.41.
    for (const name of ['Stream', 'Stills', 'Download Image', 'Cancel Alarm', 'Cycle']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
    expect(screen.queryByRole('combobox', { name: 'Width' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Height' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Monitor' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Monitor - 3 - Driveway' })).toBeNull();
    // One Fullscreen in the transport row; the stage has its own "Open full screen".
    expect(screen.getAllByRole('button', { name: 'Fullscreen' })).toHaveLength(1);
    expect(screen.queryByText('1280×720')).toBeNull();
    // `ZM - <Name> - Feed`.
    await waitFor(() => expect(document.title).toBe('ZM - Driveway - Feed'));
  });

  it('draws the legacy status line: name, state, viewing and capturing fps', async () => {
    stubOk();
    await mount();
    const runtime = await screen.findByTestId('watch-runtime');
    await waitFor(() => expect(runtime).toHaveTextContent(/State: Connected/));
    expect(runtime).toHaveTextContent('Driveway (id=3)');
    expect(runtime).toHaveTextContent('WebRTC');
    expect(within(runtime).getByTitle('Capturing FPS')).toHaveTextContent('10.0 fps');
    // Nothing painted yet, so the viewing readout is blank as legacy's is.
    expect(within(runtime).getByTitle('Viewing FPS')).toHaveTextContent(/^\s*fps$/);
    expect(runtime).not.toHaveTextContent(/Analysis/);
  });

  it('starts the stream on load and from Play', async () => {
    stubOk();
    const user = userEvent.setup();
    await mount();
    await ready();
    await waitFor(() => expect(streamCalls).toContain('webrtc:start'));
    streamCalls.length = 0;
    expect(screen.getByRole('button', { name: 'Stop' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Play' }));
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

  it('pauses the picture without dropping the session, and Play resumes it', async () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    streamState.value = 'connected';
    stubOk();
    const user = userEvent.setup();
    await mount();

    await user.click(await screen.findByRole('button', { name: 'Pause' }));
    expect(pause).toHaveBeenCalled();
    expect(streamCalls).not.toContain('webrtc:stop');
    streamCalls.length = 0;

    await user.click(screen.getByRole('button', { name: 'Play' }));
    expect(play).toHaveBeenCalled();
    // Resuming is a local play(), not a new session.
    expect(streamCalls).not.toContain('webrtc:start');
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('links All Events to this monitor sorted by start time ascending', async () => {
    stubOk();
    await mount();
    await ready();
    expect(screen.getByRole('link', { name: 'All Events' }))
      .toHaveAttribute('href', '/events?monitor_id=3&sort=start_time&dir=asc');
  });

  it('switches the player to HLS, says so in the stream info, and remembers it', async () => {
    stubOk();
    const user = userEvent.setup();
    const view = await mount();

    await user.selectOptions(await screen.findByRole('combobox', { name: 'Player' }), 'hls');
    await waitFor(() => expect(screen.getByTestId('watch-stream-info')).toHaveTextContent('HLS'));
    expect(useWatchPrefsStore.getState().player).toBe('hls');

    view.unmount();
    await mount();
    expect(await screen.findByRole('combobox', { name: 'Player' })).toHaveValue('hls');
  });

  it('remembers the Scale per monitor', async () => {
    stubOk();
    const user = userEvent.setup();
    await mount();
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Scale' }), '640px');
    expect(useWatchPrefsStore.getState().scaleByMonitor['3']).toBe('640px');
  });

  it('offers Retry and the error text when the stream failed', async () => {
    streamState.value = 'failed';
    stubOk();
    await mount();

    const alert = await screen.findByTestId('stream-error');
    expect(alert).toHaveTextContent('ICE failed');
    expect(within(alert).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('greys the volume slider and mute icon while the stream has no audio', async () => {
    stubOk();
    await mount();
    await ready();
    expect(screen.getByRole('slider', { name: 'Volume' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Unmute' })).toBeDisabled();
  });

  it('drives the volume slider and the mute icon when the stream carries audio', async () => {
    streamState.value = 'connected';
    streamState.hasAudio = true;
    stubOk();
    await mount();
    const slider = await screen.findByRole('slider', { name: 'Volume' });
    expect(slider).toBeEnabled();
    fireEvent.change(slider, { target: { value: '40' } });
    // Moving the slider off zero unmutes, and both stick for the next visit.
    await waitFor(() => expect(useWatchPrefsStore.getState().volume).toBeCloseTo(0.4));
    expect(useWatchPrefsStore.getState().muted).toBe(false);
    expect(screen.getByRole('button', { name: 'Mute' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('forces an alarm with one button and no confirmation, which then cancels it', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    stubOk();
    const user = userEvent.setup();
    await mount();

    const force = await screen.findByRole('button', { name: 'Force Alarm' });
    // Enabled only once the status probe has answered.
    await waitFor(() => expect(force).toBeEnabled());
    await user.click(force);

    expect(confirm).not.toHaveBeenCalled();
    await waitFor(() => expect(alarmCalls).toContainEqual({ action: 'on', cause: 'API', score: 100 }));
    const cancel = await screen.findByRole('button', { name: 'Cancel Forced Alarm' });
    await user.click(cancel);
    await waitFor(() => expect(alarmCalls).toContainEqual({ action: 'cancel' }));
    expect(await screen.findByRole('button', { name: 'Force Alarm' })).toBeInTheDocument();
  });

  it('omits the PTZ column for a camera with no control configured', async () => {
    stubOk({ ptz: 'none' });
    await mount();
    await ready();
    expect(screen.queryByRole('complementary', { name: 'Camera control' })).toBeNull();
  });

  it('shows the PTZ column by default and the PTZ toggle folds it away, remembered', async () => {
    stubOk({ ptz: 'ready' });
    const user = userEvent.setup();
    const view = await mount();
    expect(await screen.findByRole('complementary', { name: 'Camera control' })).toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: 'Toggle PTZ Controls' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await user.click(toggle);
    expect(screen.queryByRole('complementary', { name: 'Camera control' })).toBeNull();
    expect(useWatchPrefsStore.getState().ptzShow).toBe(false);

    view.unmount();
    await mount();
    await ready();
    await screen.findByRole('button', { name: 'Toggle PTZ Controls' });
    expect(screen.queryByRole('complementary', { name: 'Camera control' })).toBeNull();
  });

  it('lists this monitor events in the legacy watch shape and deletes from the row icon', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    stubOk({ events: [{ ...EVENT, notes: 'Motion: Zone 1' }] });
    const user = userEvent.setup();
    await mount();

    expect(await screen.findByRole('link', { name: '900' })).toBeInTheDocument();
    // Legacy `#eventList` columns: Notes in, Archived/Monitor/Total Score/Storage out, no sort, no pager.
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toContain('Notes');
    expect(headers).toContain('Delete');
    expect(headers).not.toContain('Archived');
    expect(headers).not.toContain('Monitor');
    expect(headers).not.toContain('Total Score');
    expect(headers).not.toContain('Storage');
    expect(screen.getByText('Motion: Zone 1')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Select event 900' })).toBeNull();
    expect(screen.queryByRole('button', { name: /sort/i })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Delete event 900' }));
    await waitFor(() => expect(deletedEvents).toEqual(['900']));
  });

  it('hides the events table from a user without events:View', async () => {
    useAuthStore.setState({ user: { ...ADMIN, perms: { ...ADMIN.perms, events: 'None' } } as UserClaims });
    stubOk();
    await mount();
    await ready();
    expect(screen.queryByRole('heading', { name: 'Events' })).toBeNull();
  });

  it('shows the PTZ column to a control:View user', async () => {
    useAuthStore.setState({ user: { ...VIEWER, perms: { ...VIEWER.perms, control: 'View' } } as UserClaims });
    stubOk({ ptz: 'ready' });
    await mount();
    expect(await screen.findByRole('complementary', { name: 'Camera control' })).toBeInTheDocument();
  });

  it('greys the PTZ toggle for a user without control:View', async () => {
    useAuthStore.setState({ user: VIEWER });
    stubOk({ ptz: 'ready' });
    await mount();
    await ready();
    expect(await screen.findByRole('button', { name: 'PTZ Not available' })).toBeDisabled();
    expect(screen.queryByRole('complementary', { name: 'Camera control' })).toBeNull();
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

    await ready();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Force Alarm' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit monitor' })).toBeNull();
  });

  it('replaces the stage with the no-permission note for a stream:None user', async () => {
    useAuthStore.setState({ user: NO_STREAM });
    stubOk();
    await mount();

    await ready();
    expect(screen.queryByTestId('watch-stage')).toBeNull();
    expect(screen.getByText('You do not have permission to view this.')).toBeInTheDocument();
  });

  it('says the monitor is disabled when capturing is None', async () => {
    stubOk({ monitor: { ...MONITOR, capturing: 'None' } });
    await mount();

    expect(await screen.findByText('Monitor is disabled')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
  });

  it('opens the monitor editor from the Edit square', async () => {
    stubOk();
    const user = userEvent.setup();
    await mount();

    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    // The editor is a full-screen overlay, not a dialog role — assert its heading.
    expect(await screen.findByRole('heading', { name: 'Edit · Driveway' })).toBeInTheDocument();
  });

  it('shows the filter bar open by default and folds it behind the flip icon', async () => {
    const user = userEvent.setup();
    stubOk();
    await mount();
    await ready();
    expect(screen.getByRole('group', { name: 'Monitor filter bar' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hide filters' }));
    expect(screen.queryByRole('group', { name: 'Monitor filter bar' })).toBeNull();
    expect(useUiStore.getState().classicMonitorFilterBarOpen).toBe(false);
  });

  it('shows the not-found state when the monitor does not exist', async () => {
    server.use(
      http.get('/api/v3/monitors/:id/ptz/capabilities', () =>
        HttpResponse.json({ kind: 'BAD_REQUEST', error_message: 'no ptz' }, { status: 400 })),
      http.get('/api/v3/monitors/:id', () =>
        HttpResponse.json({ kind: 'NOT_FOUND', error_message: 'no such monitor' }, { status: 404 })),
      http.get('/api/v3/monitors', () => HttpResponse.json(paged([]))),
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

    await ready();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Cannot reach the server.'));
  });
});

/* ------------------------------------------------------------------ */

describe('ClassicMonitorWatchPage — stage', () => {
  it('puts the legacy hover block over the picture: zoom in/out, full screen, watch, edit', async () => {
    stubOk();
    await mount();
    await ready();
    const block = screen.getByTestId('watch-stage-buttons');
    for (const name of ['Zoom IN', 'Zoom OUT', 'Open full screen', 'Edit monitor']) {
      expect(within(block).getByRole('button', { name })).toBeInTheDocument();
    }
    expect(within(block).getByRole('link', { name: 'Open watch page' })).toHaveAttribute('href', '/monitors/$monitorId');
    // Legacy hides `#zoomOutBtn` unless "Use old ZoomPan" is ticked.
    expect(screen.queryByRole('button', { name: 'Zoom Out' })).toBeNull();
  });

  it('steps the digital zoom with Zoom IN / Zoom OUT, and ctrl+Zoom OUT resets it', async () => {
    stubOk();
    const user = userEvent.setup();
    await mount();
    await ready();
    const runtime = screen.getByTestId('watch-runtime');
    expect(runtime).not.toHaveTextContent(/Zoom:/);

    await user.click(screen.getByRole('button', { name: 'Zoom IN' }));
    await user.click(screen.getByRole('button', { name: 'Zoom IN' }));
    // 1.3² ≈ 1.69, to one decimal like legacy.
    expect(runtime).toHaveTextContent('Zoom: 1.7x');
    await user.click(screen.getByRole('button', { name: 'Zoom OUT' }));
    expect(runtime).toHaveTextContent('Zoom: 1.3x');

    await user.click(screen.getByRole('button', { name: 'Zoom IN' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom OUT' }), { ctrlKey: true });
    await waitFor(() => expect(runtime).not.toHaveTextContent(/Zoom:/));
  });

  it('zooms on a trackpad pinch and on shift + wheel, but not on a plain wheel', async () => {
    stubOk();
    await mount();
    await ready();
    const runtime = screen.getByTestId('watch-runtime');
    const layer = screen.getByTestId('watch-zoom');

    fireEvent.wheel(layer, { deltaY: -100, clientX: 0, clientY: 0 });
    expect(runtime).not.toHaveTextContent(/Zoom:/);

    fireEvent.wheel(layer, { shiftKey: true, deltaY: -100, clientX: 0, clientY: 0 });
    await waitFor(() => expect(runtime).toHaveTextContent('Zoom: 1.3x'));

    // exp(100/200) ≈ 1.65 on top of 1.3.
    fireEvent.wheel(layer, { ctrlKey: true, deltaY: -100, clientX: 0, clientY: 0 });
    await waitFor(() => expect(runtime).toHaveTextContent('Zoom: 2.1x'));
  });

  it('fullscreens the picture on a double-click, and from the hover block', async () => {
    const request = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { configurable: true, value: request });
    stubOk();
    const user = userEvent.setup();
    await mount();
    await ready();
    const stage = screen.getByTestId('watch-stage');

    fireEvent.doubleClick(screen.getByTestId('watch-zoom'));
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.contexts[0]).toBe(stage);

    await user.click(screen.getByRole('button', { name: 'Open full screen' }));
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.contexts[1]).toBe(stage);
    delete (HTMLElement.prototype as { requestFullscreen?: unknown }).requestFullscreen;
  });

  it('opens the editor from the hover block', async () => {
    stubOk();
    const user = userEvent.setup();
    await mount();
    await ready();
    await user.click(screen.getByRole('button', { name: 'Edit monitor' }));
    expect(await screen.findByRole('heading', { name: 'Edit · Driveway' })).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */

const SIBLINGS = [
  MONITOR,
  { ...MONITOR, id: 4, name: 'Back Gate' },
  { ...MONITOR, id: 5, name: 'Side Path' },
];

describe('ClassicMonitorWatchPage — cycle sidebar', () => {
  it('is hidden until the cycle toggle asks for it, and the choice sticks', async () => {
    const user = userEvent.setup();
    stubOk({ monitors: SIBLINGS });
    const view = await mount();
    await ready();
    expect(screen.queryByTestId('watch-cycle-sidebar')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Toggle cycle sidebar' }));
    expect(await screen.findByTestId('watch-cycle-sidebar')).toBeInTheDocument();
    expect(useUiStore.getState().classicCycleSidebarOpen).toBe(true);

    view.unmount();
    await mount();
    expect(await screen.findByTestId('watch-cycle-sidebar')).toBeInTheDocument();
  });

  it('offers the legacy periods, and opens paused without cycle=true', async () => {
    useUiStore.setState({ classicCycleSidebarOpen: true });
    stubOk({ monitors: SIBLINGS, configs: { ZM_WEB_REFRESH_CYCLE: '45' } });
    await mount();

    const sidebar = await screen.findByTestId('watch-cycle-sidebar');
    const period = within(sidebar).getByRole('combobox', { name: 'Cycle period' });
    await waitFor(() => expect(
      [...(period as HTMLSelectElement).options].map((o) => o.textContent),
    ).toEqual(['5 seconds', '10 seconds', '30 seconds', '1 minute', '2 minutes', '5 minutes', '45 seconds']));
    // `ZM_WEB_REFRESH_CYCLE` is the starting period, as legacy selects it.
    await waitFor(() => expect(period).toHaveValue('45'));

    // Showing the sidebar does not start the rotation.
    for (const name of ['Previous Monitor', 'Play Cycle', 'Next Monitor']) {
      expect(within(sidebar).getByRole('button', { name })).toBeInTheDocument();
    }
    expect(within(sidebar).getByTestId('seconds-to-cycle')).toHaveTextContent('');
    // Nav pills: every capturing monitor, the current one marked.
    const pills = within(sidebar).getAllByRole('button', { name: /Driveway|Back Gate|Side Path/ });
    expect(pills.map((b) => b.textContent)).toEqual(['Driveway', 'Back Gate', 'Side Path']);
    expect(pills[0]).toHaveAttribute('aria-current', 'true');
  });

  it('opens with the rotation running on cycle=true, and a pill click stops it', async () => {
    routeSearch.value = { cycle: true };
    streamState.value = 'connected';
    const user = userEvent.setup();
    stubOk({ monitors: SIBLINGS });
    await mount();

    const sidebar = await screen.findByTestId('watch-cycle-sidebar');
    expect(within(sidebar).getByRole('button', { name: 'Pause Cycle' })).toBeInTheDocument();
    expect(within(sidebar).getByTestId('seconds-to-cycle')).toHaveTextContent(/\d+/);

    await user.click(within(sidebar).getByRole('button', { name: 'Back Gate' }));
    expect(within(sidebar).getByRole('button', { name: 'Play Cycle' })).toBeInTheDocument();
  });

  it('pauses the rotation from a transport click, as legacy #dvrControls does', async () => {
    routeSearch.value = { cycle: true };
    streamState.value = 'connected';
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    const user = userEvent.setup();
    stubOk({ monitors: SIBLINGS });
    await mount();
    const sidebar = await screen.findByTestId('watch-cycle-sidebar');
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    expect(within(sidebar).getByRole('button', { name: 'Play Cycle' })).toBeInTheDocument();
  });

  it('saves the period like zmCyclePeriod', async () => {
    useUiStore.setState({ classicCycleSidebarOpen: true });
    const user = userEvent.setup();
    stubOk({ monitors: SIBLINGS });
    await mount();
    const sidebar = await screen.findByTestId('watch-cycle-sidebar');
    await user.selectOptions(within(sidebar).getByRole('combobox', { name: 'Cycle period' }), '60');
    expect(useWatchPrefsStore.getState().cyclePeriodS).toBe(60);
  });
});

describe('ClassicMonitorWatchPage — idle timeout and hidden tab', () => {
  it('stops the stream and asks whether anyone is watching after ZM_WEB_VIEWING_TIMEOUT', async () => {
    const user = userEvent.setup();
    streamState.value = 'connected';
    stubOk({ configs: { ZM_WEB_VIEWING_TIMEOUT: '1' } });
    await mount();
    await ready();

    const dialog = await screen.findByRole('dialog', { name: 'Are you still watching?' }, { timeout: 4000 });
    expect(within(dialog).getByText('Video paused. Continue watching?')).toBeInTheDocument();
    expect(streamCalls).toContain('webrtc:stop');

    await user.click(within(dialog).getByRole('button', { name: 'Yes' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Are you still watching?' })).toBeNull());
    expect(streamCalls.filter((c) => c === 'webrtc:start').length).toBeGreaterThan(0);
  });

  it('never asks with the setting off', async () => {
    streamState.value = 'connected';
    stubOk();
    await mount();
    await ready();
    await new Promise((r) => setTimeout(r, 1200));
    expect(screen.queryByRole('dialog', { name: 'Are you still watching?' })).toBeNull();
  });

  it('lets go of the stream after 15 s in a hidden tab and picks it back up on return', async () => {
    streamState.value = 'connected';
    stubOk();
    await mount();
    await ready();
    streamCalls.length = 0;

    let visibility: DocumentVisibilityState = 'hidden';
    const spy = vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    vi.useFakeTimers();
    try {
      act(() => { document.dispatchEvent(new Event('visibilitychange')); });
      act(() => { vi.advanceTimersByTime(14_000); });
      expect(streamCalls).not.toContain('webrtc:stop');
      act(() => { vi.advanceTimersByTime(1_500); });
      expect(streamCalls).toContain('webrtc:stop');

      visibility = 'visible';
      act(() => { document.dispatchEvent(new Event('visibilitychange')); });
      expect(streamCalls.at(-1)).toBe('webrtc:start');
    } finally {
      vi.useRealTimers();
      spy.mockRestore();
    }
  });
});
