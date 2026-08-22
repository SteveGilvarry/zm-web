/**
 * Watch — modern skin (`/monitors/$monitorId`), through the real router.
 *
 * This is the biggest page in the skin and the one that fans out the most:
 * the stage and its overlays, the mode/protocol controls, the PTZ surface,
 * the zone editor, the recent-events rail and the full monitor editor all
 * hang off one route. Everything below is driven by URL, and every write is
 * asserted as an outgoing request (method, path, JSON body).
 *
 * The two stream hooks are replaced with fakes: the real ones own a shared
 * WebRTC session and an hls.js instance, neither of which jsdom can drive,
 * and both already have their own tests. The fakes let a test pin the
 * connection state so the connecting / live / failed overlays are reachable.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';

import { renderRoute } from '@/test/renderRoute';
import { setupMockServer, server, db } from '@/test/msw/server';
import { makeMonitor, makePtzCapabilities } from '@/test/fixtures';
import { useToastStore } from '@/components/common/toastStore';
import type { StreamConnectionState } from '@/types';

const { streamCalls, stream } = vi.hoisted(() => ({
  streamCalls: [] as string[],
  stream: { state: 'idle' as StreamConnectionState, error: null as string | null, hasAudio: false },
}));

function fakeStream(kind: 'webrtc' | 'hls') {
  const videoRef = { current: null as HTMLVideoElement | null };
  return () => ({
    videoRef,
    state: stream.state,
    error: stream.error,
    hasAudio: stream.hasAudio,
    start: () => streamCalls.push(`${kind}:start`),
    stop: () => streamCalls.push(`${kind}:stop`),
    pause: () => streamCalls.push(`${kind}:pause`),
  });
}
vi.mock('@/hooks/useWebRtcStream', () => ({ useWebRtcStream: fakeStream('webrtc') }));
vi.mock('@/hooks/useHlsStream', () => ({ useHlsStream: fakeStream('hls') }));

setupMockServer();

beforeEach(() => {
  streamCalls.length = 0;
  stream.state = 'idle';
  stream.error = null;
  stream.hasAudio = false;
  // jsdom implements neither, and the stage mounts a <video> on every render.
  HTMLMediaElement.prototype.load = () => {};
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  HTMLElement.prototype.setPointerCapture ??= function () {};
  HTMLElement.prototype.releasePointerCapture ??= function () {};
});

// Toasts live in a module-level store the shell renders as role="alert",
// so an error raised by one test would otherwise be found by the next.
afterEach(() => useToastStore.getState().clear());

/** The page is a lazy chunk; the header <h1> is the first thing it names. */
async function findWatch(name: string) {
  return screen.findByRole('heading', { name, level: 1 }, { timeout: 5_000 });
}

/**
 * A capturing monitor auto-starts its stream ~150 ms after the record lands.
 * Tests that count transport calls wait that out first, otherwise the timer
 * lands in the middle of their assertion.
 */
async function settleAutoStart() {
  await waitFor(() => expect(streamCalls).toContain('webrtc:start'), { timeout: 3_000 });
  streamCalls.length = 0;
}

describe('modern Watch page', () => {
  it('renders the stage, info cards and side panels for a monitor', async () => {
    const { router } = renderRoute('/monitors/1');

    await findWatch('Front Door');
    expect(router.state.location.pathname).toBe('/monitors/1');
    expect(router.state.location.search).toEqual({});

    // Breadcrumb back to the list (the sidebar has its own Monitors link).
    const main = screen.getByRole('main');
    expect(within(main).getByRole('link', { name: 'Monitors' })).toHaveAttribute(
      'href',
      '/monitors',
    );

    // Info cards — resolution, type and storage come straight off the record.
    expect(screen.getByText('1920x1080')).toBeInTheDocument();
    expect(screen.getByText('4 bit color')).toBeInTheDocument();
    expect(screen.getByText('Ffmpeg')).toBeInTheDocument();
    expect(screen.getByText('ID: 1')).toBeInTheDocument();
    expect(screen.getByText('Server: Local')).toBeInTheDocument();

    // Panels.
    for (const panel of ['Controls', 'Status', 'Connection', 'Recent Events', 'Motion zones']) {
      expect(screen.getByRole('heading', { name: panel })).toBeInTheDocument();
    }
    expect(screen.getByText('rtsp://camera.local:554/stream1')).toBeInTheDocument();
    expect(screen.getByText('Event-')).toBeInTheDocument();

    // Nothing is playing yet.
    expect(screen.getByText('Stream not active')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Stream' })).toBeInTheDocument();
  });

  it('lists this monitor recent events and links to each one', async () => {
    renderRoute('/monitors/1');
    await findWatch('Front Door');

    const events = screen.getByRole('heading', { name: 'Recent Events' }).closest('div')
      ?.parentElement?.parentElement as HTMLElement;
    expect(within(events).getByRole('link', { name: 'View all' })).toHaveAttribute(
      'href',
      '/events?monitor_id=1',
    );
    expect(screen.getByRole('link', { name: /Event-101/ })).toHaveAttribute('href', '/events/101');
    expect(screen.getByRole('link', { name: /Event-103/ })).toHaveAttribute('href', '/events/103');
  });

  it('says so when the monitor has no events yet', async () => {
    db.events = [];
    renderRoute('/monitors/1');

    await findWatch('Front Door');
    expect(screen.getByText('No recent events')).toBeInTheDocument();
  });

  it('shows the loading skeleton while the monitor record is in flight', async () => {
    server.use(
      http.get('/api/v3/monitors/:id', async () => {
        await delay('infinite');
        return HttpResponse.json({});
      }),
    );
    renderRoute('/monitors/1');

    await findWatch('Loading...');
    expect(screen.queryByRole('heading', { name: 'Controls' })).toBeNull();
  });

  it('shows the not-found state for a monitor id that does not exist', async () => {
    renderRoute('/monitors/999');

    await findWatch('Monitor Not Found');
    expect(
      screen.getByRole('heading', { name: 'Monitor Not Found', level: 2 }),
    ).toBeInTheDocument();
    expect(screen.getByText('The requested monitor could not be found.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Monitors' })).toHaveAttribute(
      'href',
      '/monitors',
    );
  });

  it('falls back to the not-found state when the monitor query 500s', async () => {
    server.use(
      http.get('/api/v3/monitors/:id', () =>
        HttpResponse.json({ error_message: 'boom' }, { status: 500 }),
      ),
    );
    renderRoute('/monitors/1');

    await findWatch('Monitor Not Found');
    expect(screen.queryByRole('heading', { name: 'Controls' })).toBeNull();
  });

  it('offers Start instead of the stage controls for a disabled monitor', async () => {
    db.monitors = [makeMonitor({ id: 1, name: 'Front Door', capturing: 'None' })];
    renderRoute('/monitors/1');

    await findWatch('Front Door');
    expect(screen.getByText('Monitor is disabled')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start Stream' })).toBeNull();
    expect(screen.getByRole('button', { name: /Download Image/ })).toBeDisabled();
    // The alarm verbs need a capturing monitor.
    expect(screen.queryByRole('button', { name: 'Force Alarm' })).toBeNull();
  });

  /* ----- stage overlays ------------------------------------------------- */

  it('starts the active stream from the stage button', async () => {
    const user = userEvent.setup();
    renderRoute('/monitors/1');

    await findWatch('Front Door');
    streamCalls.length = 0;
    await user.click(screen.getByRole('button', { name: 'Start Stream' }));
    expect(streamCalls).toContain('webrtc:start');
  });

  it('paints the connecting overlay while the transport negotiates', async () => {
    stream.state = 'signaling';
    renderRoute('/monitors/1');

    await findWatch('Front Door');
    expect(screen.getByText('Negotiating...')).toBeInTheDocument();
    expect(screen.getByText('WebRTC stream')).toBeInTheDocument();
  });

  it('paints the live overlay with the protocol, runtime and stop control', async () => {
    stream.state = 'connected';
    const user = userEvent.setup();
    renderRoute('/monitors/1');

    await findWatch('Front Door');
    expect(screen.getByText(/LIVE/)).toBeInTheDocument();
    const runtime = await screen.findByTestId('watch-runtime');
    await waitFor(() => expect(runtime).toHaveTextContent('Connected'));
    expect(runtime).toHaveTextContent('Capture: 15.0 fps');
    expect(runtime).toHaveTextContent('Analysis: 5.0 fps');

    await settleAutoStart();
    await user.click(screen.getByRole('button', { name: 'Stop' }));
    expect(streamCalls).toEqual(['webrtc:stop']);
  });

  it('offers Retry when the stream failed', async () => {
    stream.state = 'failed';
    stream.error = 'ICE failed';
    const user = userEvent.setup();
    renderRoute('/monitors/1');

    await findWatch('Front Door');
    expect(screen.getByText('ICE failed')).toBeInTheDocument();
    streamCalls.length = 0;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    // Retry drops the transport and re-arms it after a short delay.
    await waitFor(() => expect(streamCalls).toEqual(['webrtc:stop', 'webrtc:start']));
  });

  it('shows a non-fatal stream error as a banner over a running stage', async () => {
    stream.state = 'connected';
    stream.error = 'segment 12 dropped';
    renderRoute('/monitors/1');

    await findWatch('Front Door');
    expect(screen.getByText('segment 12 dropped')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('offers mute and fullscreen only when the stream carries audio', async () => {
    stream.state = 'connected';
    renderRoute('/monitors/1');
    await findWatch('Front Door');
    expect(screen.getByRole('button', { name: 'Fullscreen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(Mute|Unmute)$/ })).toBeNull();
  });

  it('unmutes the video element from the stage control', async () => {
    stream.state = 'connected';
    stream.hasAudio = true;
    const user = userEvent.setup();
    renderRoute('/monitors/1');

    await findWatch('Front Door');
    await user.click(screen.getByRole('button', { name: 'Unmute' }));
    expect(await screen.findByRole('button', { name: 'Mute' })).toBeInTheDocument();
  });

  /* ----- controls ------------------------------------------------------- */

  it('switches the transport between WebRTC and HLS', async () => {
    const user = userEvent.setup();
    renderRoute('/monitors/1');

    await findWatch('Front Door');
    const webrtc = screen.getByRole('button', { name: 'WebRTC' });
    const hls = screen.getByRole('button', { name: 'HLS' });
    expect(webrtc).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Low latency (~500ms)')).toBeInTheDocument();

    await user.click(hls);
    await waitFor(() => expect(hls).toHaveAttribute('aria-pressed', 'true'));
    expect(webrtc).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Universal compatibility (~3-6s delay)')).toBeInTheDocument();

    // Re-clicking the active protocol is a no-op: nothing is torn down.
    streamCalls.length = 0;
    await user.click(hls);
    expect(streamCalls).not.toContain('hls:stop');

    await user.click(webrtc);
    await waitFor(() => expect(webrtc).toHaveAttribute('aria-pressed', 'true'));
  });

  it('tears the running stream down when the transport changes', async () => {
    stream.state = 'connected';
    const user = userEvent.setup();
    renderRoute('/monitors/1');

    await findWatch('Front Door');
    await settleAutoStart();
    await user.click(screen.getByRole('button', { name: 'HLS' }));
    expect(streamCalls).toContain('webrtc:stop');
  });

  it('swaps the stage for stills and stops the stream on the way', async () => {
    stream.state = 'connected';
    const user = userEvent.setup();
    renderRoute('/monitors/1');

    await findWatch('Front Door');
    const stills = screen.getByRole('button', { name: 'Stills' });
    expect(screen.getByRole('button', { name: 'Stream' })).toHaveAttribute('aria-pressed', 'true');

    await settleAutoStart();
    await user.click(stills);
    await waitFor(() => expect(stills).toHaveAttribute('aria-pressed', 'true'));
    expect(streamCalls).toContain('webrtc:stop');
    expect(screen.queryByText(/LIVE/)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Stream' }));
    await waitFor(() => expect(stills).toHaveAttribute('aria-pressed', 'false'));
  });

  it('sizes the stage from the legacy Scale select', async () => {
    const user = userEvent.setup();
    renderRoute('/monitors/1');

    await findWatch('Front Door');
    const scale = screen.getByRole('combobox', { name: 'Scale' });
    expect(scale).toHaveValue('0');
    expect(within(scale).getByRole('option', { name: 'Auto' })).toBeInTheDocument();
    expect(within(scale).getByRole('option', { name: 'Actual' })).toBeInTheDocument();
    expect(within(scale).getByRole('option', { name: 'Fit to width' })).toBeInTheDocument();
    expect(within(scale).getByRole('option', { name: 'Max 640px' })).toBeInTheDocument();

    await user.selectOptions(scale, '640px');
    expect(scale).toHaveValue('640px');
  });

  it('PATCHes the monitor when a capture or recording mode is picked', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.patch('/api/v3/monitors/:id', async ({ request, params }) => {
        bodies.push({ id: params.id, body: await request.json() });
        return HttpResponse.json(db.monitors[0]);
      }),
    );
    const user = userEvent.setup();
    renderRoute('/monitors/1');

    await findWatch('Front Door');
    await user.click(screen.getByRole('button', { name: 'On Demand' }));
    await waitFor(() => expect(bodies).toEqual([{ id: '1', body: { capturing: 'Ondemand' } }]));

    await user.click(screen.getByRole('button', { name: 'On Motion' }));
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toEqual({ id: '1', body: { recording: 'OnMotion' } });

    // "None" is the first option of three mode groups, so scope to the
    // Analysing block by its own label.
    const label = screen.getAllByText('Analysing').find((el) => el.tagName === 'LABEL');
    await user.click(within(label!.parentElement!).getByRole('button', { name: 'None' }));
    await waitFor(() => expect(bodies).toHaveLength(3));
    expect(bodies[2]).toEqual({ id: '1', body: { analysing: 'None' } });
  });

  it('downloads the current snapshot as a JPEG', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    URL.createObjectURL = vi.fn(() => 'blob:snapshot');
    URL.revokeObjectURL = vi.fn();
    const user = userEvent.setup();
    renderRoute('/monitors/1');

    await findWatch('Front Door');
    await user.click(screen.getByRole('button', { name: /Download Image/ }));
    // fetch → blob → object URL → anchor click, four awaits deep. A loaded
    // CI runner takes longer than testing-library's 1s default; this failed
    // there while passing locally (job 96995130483).
    await waitFor(() => {
      expect(click).toHaveBeenCalledOnce();
      expect(URL.createObjectURL).toHaveBeenCalledOnce();
    }, { timeout: 5000 });
  });

  it('surfaces a failed snapshot download without breaking the page', async () => {
    server.use(
      http.get('/api/v3/monitors/:id/snapshot', () => new HttpResponse(null, { status: 503 })),
    );
    const user = userEvent.setup();
    renderRoute('/monitors/1');

    await findWatch('Front Door');
    await user.click(screen.getByRole('button', { name: /Download Image/ }));
    expect(await screen.findByText('Snapshot unavailable (503)')).toBeInTheDocument();
  });

  /* ----- alarm ---------------------------------------------------------- */

  it('forces and cancels an alarm through PATCH /monitors/1/alarm', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const bodies: unknown[] = [];
    server.use(
      http.patch('/api/v3/monitors/:id/alarm', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(db.monitors[0]);
      }),
    );
    const user = userEvent.setup();
    renderRoute('/monitors/1');

    await findWatch('Front Door');
    const force = await screen.findByRole('button', { name: 'Force Alarm' });
    await waitFor(() => expect(bodies).toEqual([{ action: 'status' }]));

    await user.click(force);
    expect(confirm).toHaveBeenCalledWith(
      'Force alarm on "Front Door"? This creates an event right now.',
    );
    await waitFor(() =>
      expect(bodies).toContainEqual({ action: 'on', cause: 'API', score: 100 }),
    );
    expect(await screen.findByRole('button', { name: 'Alarm forced' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel Alarm' }));
    await waitFor(() => expect(bodies).toContainEqual({ action: 'cancel' }));
  });

  it('does not force an alarm when the confirmation is dismissed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const bodies: unknown[] = [];
    server.use(
      http.patch('/api/v3/monitors/:id/alarm', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(db.monitors[0]);
      }),
    );
    const user = userEvent.setup();
    renderRoute('/monitors/1');

    await findWatch('Front Door');
    await waitFor(() => expect(bodies).toEqual([{ action: 'status' }]));
    await user.click(screen.getByRole('button', { name: 'Force Alarm' }));
    expect(bodies).toEqual([{ action: 'status' }]);
  });

  it('reports an alarm command that the backend rejects', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    server.use(
      http.patch('/api/v3/monitors/:id/alarm', async ({ request }) => {
        const body = (await request.json()) as { action: string };
        if (body.action === 'status') return HttpResponse.json(db.monitors[0]);
        return HttpResponse.json({ error_message: 'shm not mapped' }, { status: 400 });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/monitors/1');

    await findWatch('Front Door');
    const force = await screen.findByRole('button', { name: 'Force Alarm' });
    await waitFor(() => expect(force).toBeEnabled());
    await user.click(force);

    // The inline banner sits in the page; the toast is separate chrome.
    const alert = await within(screen.getByRole('main')).findByRole('alert');
    expect(alert).toHaveTextContent('shm not mapped');
  });

  /* ----- PTZ ------------------------------------------------------------ */

  it('mounts no PTZ surface when the camera has no control profile', async () => {
    // What the backend answers for a monitor with `controllable = 0`.
    server.use(
      http.get('/api/v3/ptz/monitors/:id/capabilities', () =>
        HttpResponse.json({ error_message: 'Monitor 1 has no PTZ control configured' }, { status: 400 }),
      ),
    );
    renderRoute('/monitors/1');

    await findWatch('Front Door');
    // Wait for a panel that shares the same paint, then assert the absence.
    expect(screen.getByRole('heading', { name: 'Controls' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Camera control' })).toBeNull(),
    );
    expect(screen.queryByRole('button', { name: 'Move up' })).toBeNull();
  });

  it('renders the PTZ panel and its protocol badge for a controllable camera', async () => {
    renderRoute('/monitors/2');

    await findWatch('Driveway');
    const heading = await screen.findByRole('heading', { name: 'Camera control' });
    expect(heading).toBeInTheDocument();
    expect(screen.getByText('onvif')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move up' })).toBeInTheDocument();
  });

  it('hides the PTZ surface from a user without control permission', async () => {
    renderRoute('/monitors/2', { perms: { control: 'None' } });

    await findWatch('Driveway');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Controls' })).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'Camera control' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Move up' })).toBeNull();
  });

  it('sends a continuous pan as move/up then move/stop', async () => {
    const calls: Array<{ path: string; body: unknown }> = [];
    server.use(
      http.post('/api/v3/ptz/monitors/:id/*', async ({ request }) => {
        calls.push({ path: new URL(request.url).pathname, body: await request.json() });
        return HttpResponse.json({ success: true });
      }),
    );
    renderRoute('/monitors/2');

    const up = await screen.findByRole('button', { name: 'Move up' }, { timeout: 5_000 });
    fireEvent.pointerDown(up, { pointerId: 1 });
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({
      path: '/api/v3/ptz/monitors/2/move/up',
      body: { pan_speed: 50, tilt_speed: 50 },
    });

    fireEvent.pointerUp(up, { pointerId: 1 });
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1].path).toBe('/api/v3/ptz/monitors/2/move/stop');
  });

  it('sends zoom, home and preset commands to their own endpoints', async () => {
    const paths: string[] = [];
    server.use(
      http.post('/api/v3/ptz/monitors/:id/*', async ({ request }) => {
        paths.push(new URL(request.url).pathname);
        return HttpResponse.json({ success: true });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/monitors/2');

    const closer = await screen.findByRole('button', { name: /Closer/ }, { timeout: 5_000 });
    fireEvent.pointerDown(closer, { pointerId: 1 });
    await waitFor(() => expect(paths).toContain('/api/v3/ptz/monitors/2/zoom/in'));

    await user.click(screen.getByRole('button', { name: 'Home' }));
    await waitFor(() => expect(paths).toContain('/api/v3/ptz/monitors/2/home'));

    await user.click(screen.getByRole('button', { name: /Go to preset 3/ }));
    await waitFor(() => expect(paths).toContain('/api/v3/ptz/monitors/2/presets/3/goto'));
  });

  it('surfaces a rejected PTZ command inline', async () => {
    server.use(
      http.post('/api/v3/ptz/monitors/:id/*', () =>
        HttpResponse.json({ error_message: 'camera unreachable' }, { status: 502 }),
      ),
    );
    renderRoute('/monitors/2');

    const up = await screen.findByRole('button', { name: 'Move up' }, { timeout: 5_000 });
    fireEvent.pointerDown(up, { pointerId: 1 });
    expect(await screen.findByRole('alert')).toHaveTextContent(/camera unreachable/);
  });

  /* ----- zones ---------------------------------------------------------- */

  it('draws the zone editor in the camera view space', async () => {
    renderRoute('/monitors/1');

    await findWatch('Front Door');
    expect(screen.getByRole('heading', { name: 'Motion zones' })).toBeInTheDocument();
    expect(document.querySelector('svg[viewBox="0 0 1920 1080"]')).not.toBeNull();
    expect(await screen.findByRole('button', { name: /All/ })).toBeInTheDocument();
  });

  it('drops the zone panel when the monitor has no frame size', async () => {
    db.monitors = [makeMonitor({ id: 1, name: 'Front Door', width: 0, height: 0 })];
    renderRoute('/monitors/1');

    await findWatch('Front Door');
    expect(screen.queryByRole('heading', { name: 'Motion zones' })).toBeNull();
  });

  /* ----- permissions ---------------------------------------------------- */

  it('hides the edit affordances from a monitors:View user', async () => {
    renderRoute('/monitors/1', { perms: { monitors: 'View' } });

    await findWatch('Front Door');
    expect(screen.queryByRole('button', { name: 'Edit configuration' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Force Alarm' })).toBeNull();
    // The zone editor is replaced by the standard note, not simply dropped.
    expect(screen.getByRole('heading', { name: 'Motion zones' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'You do not have permission to view this.',
    );
    expect(screen.queryByRole('button', { name: 'New' })).toBeNull();
    // Viewing the stream is a different permission — the stage stays.
    expect(screen.getByRole('button', { name: 'Start Stream' })).toBeInTheDocument();
  });

  /* ----- monitor editor ------------------------------------------------- */

  it('opens the editor on load for ?edit=true and keeps the param in the URL', async () => {
    const { router } = renderRoute('/monitors/1?edit=true');

    expect(await screen.findByRole('heading', { name: 'Edit · Front Door' }, { timeout: 5_000 }))
      .toBeInTheDocument();
    expect(router.state.location.search).toEqual({ edit: true });
  });

  it('accepts the legacy ?edit=1 spelling', async () => {
    const { router } = renderRoute('/monitors/1?edit=1');

    await screen.findByRole('heading', { name: 'Edit · Front Door' }, { timeout: 5_000 });
    expect(router.state.location.search).toEqual({ edit: true });
  });

  it('opens and closes the editor from the toolbar', async () => {
    const user = userEvent.setup();
    renderRoute('/monitors/1');

    await findWatch('Front Door');
    await user.click(screen.getByRole('button', { name: 'Edit configuration' }));
    expect(await screen.findByRole('heading', { name: 'Edit · Front Door' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Edit · Front Door' })).toBeNull(),
    );
  });

  it('saves the editor diff as PATCH /monitors/1 with only the changed keys', async () => {
    let body: unknown;
    let path: string | undefined;
    server.use(
      http.patch('/api/v3/monitors/:id', async ({ request }) => {
        path = new URL(request.url).pathname;
        body = await request.json();
        return HttpResponse.json(db.monitors[0]);
      }),
    );
    const user = userEvent.setup();
    renderRoute('/monitors/1?edit=true');

    await screen.findByRole('heading', { name: 'Edit · Front Door' }, { timeout: 5_000 });
    const name = screen.getByDisplayValue('Front Door');
    await user.clear(name);
    await user.type(name, 'Back Gate');

    await user.click(screen.getByRole('button', { name: /^Save 1$/ }));
    await waitFor(() => expect(path).toBe('/api/v3/monitors/1'));
    expect(body).toEqual({ name: 'Back Gate' });
    expect(await screen.findByText('No pending changes')).toBeInTheDocument();
  });
});

describe('modern Watch page — portrait layout', () => {
  it('puts the panels beside the stage for a tall camera', async () => {
    db.monitors = [
      makeMonitor({ id: 1, name: 'Front Door', width: 1080, height: 1920 }),
      ...db.monitors.slice(1),
    ];
    stream.state = 'connected';
    renderRoute('/monitors/1');

    await screen.findByRole('heading', { name: 'Front Door', level: 1 }, { timeout: 5_000 });
    // The narrow stage drops the Capture/Analysis pair for the fps alone.
    const runtime = await screen.findByTestId('watch-runtime');
    await waitFor(() => expect(runtime).toHaveTextContent('15.0 fps'));
    expect(runtime).not.toHaveTextContent('Capture:');
    // Every panel still renders, just in the side column.
    expect(screen.getByRole('heading', { name: 'Controls' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Motion zones' })).toBeInTheDocument();
  });
});

describe('modern Watch page — PTZ capability gaps', () => {
  it('drops the clusters the camera cannot do', async () => {
    server.use(
      http.get('/api/v3/ptz/monitors/:id/capabilities', ({ params }) =>
        HttpResponse.json(
          makePtzCapabilities({
            monitor_id: Number(params.id),
            zoom: {
              can: false, can_abs: false, can_rel: false, can_con: false, can_auto: false,
              range: { min: null, max: null },
              speed: { min: null, max: null },
              step: { min: null, max: null },
            },
            presets: { has_presets: false, num_presets: 0, can_set_presets: false, has_home_preset: false },
          }),
        ),
      ),
    );
    renderRoute('/monitors/2');

    await screen.findByRole('heading', { name: 'Camera control' }, { timeout: 5_000 });
    expect(screen.queryByRole('button', { name: /Closer/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Go to preset/ })).toBeNull();
    // Focus is still advertised.
    expect(screen.getByRole('button', { name: /Near/ })).toBeInTheDocument();
  });
});
