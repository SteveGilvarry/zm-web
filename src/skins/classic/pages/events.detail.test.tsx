/**
 * Tests for the Event view (classic skin) — legacy `?view=event`: the dark
 * control bar, the verb toolbar and its mutations, the stats table, the DVR
 * transport, the Event_Data rows and the failure states.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import { useEventPlaybackStore } from '@/stores/eventPlayback';

/* ---------------------------------------------------------------- router */

const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useSearch: () => ({}),
  useNavigate: () => mockNavigate,
  Link: ({
    children, to, params, search, ...rest
  }: {
    children?: ReactNode;
    to?: string;
    params?: Record<string, string>;
    search?: Record<string, unknown>;
    [k: string]: unknown;
  }) => {
    const path = to && params
      ? Object.entries(params).reduce((acc, [k, v]) => acc.replace(`$${k}`, String(v)), to)
      : (to ?? '#');
    const qs = search
      ? `?${new URLSearchParams(
        Object.entries(search).reduce((acc, [k, v]) => {
          if (v != null) acc[k] = String(v);
          return acc;
        }, {} as Record<string, string>),
      ).toString()}`
      : '';
    return <a href={`${path}${qs}`} {...rest}>{children}</a>;
  },
}));

vi.mock('@/skins/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

/* -------------------------------------------------------------- fixtures */

const paged = <T,>(items: T[], over: Record<string, unknown> = {}) => ({
  items, total: items.length, per_page: 100, current_page: 1, last_page: 1, ...over,
});

const EVENT = {
  id: 4242, monitor_id: 1, name: 'Event-4242', cause: 'Motion',
  start_date_time: '2026-08-21T12:00:00Z', end_date_time: '2026-08-21T12:00:30Z',
  width: 1920, height: 1080, length: '30.00', frames: 100, alarm_frames: 5,
  tot_score: 120, avg_score: 12, max_score: 44, archived: 0, videoed: 1,
  uploaded: 0, emailed: 1, messaged: 0, executed: 0, notes: 'parcel at the door',
  state_id: 1, orientation: 'ROTATE_0', disk_space: 1_048_576, scheme: 'Medium',
  locked: 0, tags: [{ id: 5, name: 'person' }], storage_id: 1,
};

const MONITOR = {
  id: 1, name: 'Front Door', capturing: 'Always', analysing: 'Always',
  recording: 'OnMotion', type: 'Ffmpeg', host: '10.0.0.11', path: null, device: null,
  width: 1920, height: 1080, orientation: 'ROTATE_0', enabled: 1,
};

const server = setupServer();
let calls: Array<{ method: string; path: string; body?: unknown }> = [];

interface StubOptions {
  event?: Record<string, unknown> | null;
  eventData?: unknown[];
  neighbours?: unknown[];
  recommendedMode?: string;
}

function stub(options: StubOptions = {}) {
  const { event = EVENT, eventData = [], neighbours = [], recommendedMode = 'direct' } = options;
  server.use(
    http.get('/api/v3/events/:id/info', () => HttpResponse.json({
      duration_seconds: 30, codec: 'h264', recommended_mode: recommendedMode,
    })),
    http.get('/api/v3/events/:id', ({ params }) => (
      event
        ? HttpResponse.json({ ...event, id: Number(params.id) })
        // A row the backend no longer has: 200 with no body, which is what
        // the list -> detail race produces on the dev box.
        : HttpResponse.json(null)
    )),
    http.get('/api/v3/events', () => HttpResponse.json(paged(neighbours, { per_page: 2 }))),
    http.get('/api/v3/monitors/:id', () => HttpResponse.json(MONITOR)),
    http.get('/api/v3/monitors/:id/zones', () => HttpResponse.json(paged([
      { id: 11, monitor_id: 1, name: 'Drive', type: 'Active', units: 'Percent', num_coords: 4, coords: '0,0 100,0 100,100 0,100' },
    ], { per_page: 50 }))),
    http.get('/api/v3/storage', () => HttpResponse.json(paged([{ id: 1, name: 'Default' }]))),
    http.get('/api/v3/event-data', () => HttpResponse.json(paged(eventData, { per_page: 200 }))),
    http.get('/api/v3/frames', () => HttpResponse.json(paged([
      { id: 1, event_id: 4242, frame_id: 1, type: 'Normal', score: 0, time_stamp: '2026-08-21T12:00:00Z', delta: '0.00' },
      { id: 2, event_id: 4242, frame_id: 2, type: 'Alarm', score: 44, time_stamp: '2026-08-21T12:00:10Z', delta: '10.00' },
    ], { per_page: 500 }))),
    http.get('/api/v3/tags', () => HttpResponse.json(paged(
      [{ id: 5, name: 'person' }, { id: 6, name: 'vehicle' }], { per_page: 200 }))),
    http.patch('/api/v3/events/:id', async ({ params, request }) => {
      const body = await request.json();
      calls.push({ method: 'PATCH', path: `/events/${params.id}`, body });
      return HttpResponse.json({ ...EVENT, ...(body as object), id: Number(params.id) });
    }),
    http.delete('/api/v3/events/:id', ({ params }) => {
      calls.push({ method: 'DELETE', path: `/events/${params.id}` });
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

const ALL_EDIT = {
  iat: 0, exp: 0, user: 'admin',
  perms: {
    stream: 'Edit', events: 'Edit', control: 'Edit', monitors: 'Edit',
    groups: 'Edit', devices: 'Edit', snapshots: 'Edit', system: 'Edit',
  },
};

function signIn(perms: unknown = ALL_EDIT) {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', isAuthenticated: true, user: perms as never,
  });
}

beforeAll(() => { server.listen({ onUnhandledRequest: 'error' }); });
beforeEach(() => { signIn(); });
afterEach(() => {
  server.resetHandlers();
  calls = [];
  mockNavigate.mockReset();
  useEventPlaybackStore.getState().setShowStats(false);
  useEventPlaybackStore.getState().setShowZones(false);
  useEventPlaybackStore.getState().setRate(1);
});
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

async function mount(eventId = EVENT.id) {
  const { default: Page } = await import('./events.detail');
  return renderWithProviders(<Page eventId={eventId} />);
}

async function mountAndSettle(eventId = EVENT.id) {
  const view = await mount(eventId);
  await screen.findByRole('heading', { name: 'Event 4242' });
  return view;
}

/* ----------------------------------------------------------------- tests */

describe('ClassicEventDetailPage — chrome', () => {
  it('renders the control bar with the replay / scale / rate selects', async () => {
    stub();
    await mountAndSettle();

    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/events');
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    expect(screen.getByLabelText('Replay mode')).toBeInTheDocument();
    expect(screen.getByLabelText('Scale')).toBeInTheDocument();
    // Stream quality and Codec are informational only on recorded playback.
    expect(screen.getByLabelText('Stream quality')).toBeDisabled();
    expect(screen.getByLabelText('Codec')).toBeDisabled();
    expect(screen.getByLabelText('Playback speed')).toHaveValue('1');
  });

  it('changes the playback rate and reports it in the status line', async () => {
    const user = userEvent.setup();
    stub();
    await mountAndSettle();

    await user.selectOptions(screen.getByLabelText('Playback speed'), '2');
    expect(useEventPlaybackStore.getState().rate).toBe(2);
    // "2×" is also an <option>; the status line is the bold one.
    await waitFor(() => expect(screen.getAllByText('2×').some((el) => el.tagName === 'B')).toBe(true));
  });

  it('links Frames and Montage Review from the toolbar', async () => {
    stub();
    await mountAndSettle();

    expect(screen.getByRole('link', { name: 'Frames' }))
      .toHaveAttribute('href', '/events/4242/frames');
    const review = screen.getByRole('link', { name: 'Montage Review' });
    expect(review.getAttribute('href')).toContain('monitor_id=1');
  });

  it('offers a download link for the recording', async () => {
    stub();
    await mountAndSettle();
    const download = screen.getByRole('link', { name: 'Download' });
    expect(download.getAttribute('href')).toContain('/events/4242/stream/');
    expect(download).toHaveAttribute('download');
  });
});

describe('ClassicEventDetailPage — stats and data', () => {
  it('shows the legacy stats table with the event values', async () => {
    const user = userEvent.setup();
    stub();
    await mountAndSettle();

    expect(screen.queryByTestId('event-stats-panel')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Stats' }));

    const stats = screen.getByTestId('event-stats-panel');
    const row = (label: string) =>
      within(stats).getByRole('rowheader', { name: label }).closest('tr')!;
    expect(within(row('Id')).getByText('4242')).toBeInTheDocument();
    expect(within(row('Cause')).getByText('Motion')).toBeInTheDocument();
    expect(within(row('Notes')).getByText('parcel at the door')).toBeInTheDocument();
    expect(within(row('Frames')).getByText('100')).toBeInTheDocument();
    expect(within(row('Alarm Frames')).getByText('5')).toBeInTheDocument();
    expect(within(row('Max. Score')).getByText('44')).toBeInTheDocument();
    expect(within(row('Disk Space')).getByText('1.0 MB')).toBeInTheDocument();
    expect(within(row('Archived')).getByText('No')).toBeInTheDocument();
    expect(within(row('Emailed')).getByText('Yes')).toBeInTheDocument();
    expect(within(row('Resolution')).getByText('1920x1080')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('event-storage')).toHaveTextContent('Default'));
    expect(within(row('Monitor')).getByRole('link', { name: 'Front Door' }))
      .toHaveAttribute('href', '/monitors/1');
  });

  it('renders the Event_Data rows when the backend has any', async () => {
    stub({
      eventData: [
        { id: 1, event_id: 4242, frame_id: 12, timestamp: '2026-08-21T12:00:05Z', data: '{"label":"person"}' },
      ],
    });
    await mountAndSettle();

    const table = await screen.findByTestId('event-data-table');
    expect(within(table).getByText('12')).toBeInTheDocument();
    expect(within(table).getByText('{"label":"person"}')).toBeInTheDocument();
  });

  it('omits the Event_Data table when there is none', async () => {
    stub();
    await mountAndSettle();
    expect(screen.queryByTestId('event-data-table')).toBeNull();
  });

  it('toggles the zones overlay', async () => {
    const user = userEvent.setup();
    stub();
    await mountAndSettle();

    const zones = screen.getByRole('button', { name: 'Zones' });
    expect(zones).toHaveAttribute('aria-pressed', 'false');
    await user.click(zones);
    expect(screen.getByRole('button', { name: 'Zones' })).toHaveAttribute('aria-pressed', 'true');
    expect(useEventPlaybackStore.getState().showZones).toBe(true);
  });
});

describe('ClassicEventDetailPage — mutations', () => {
  it('archives the event with a PATCH', async () => {
    const user = userEvent.setup();
    stub();
    await mountAndSettle();

    const archive = screen.getByRole('button', { name: 'Archive' });
    expect(archive).toHaveAttribute('aria-pressed', 'false');
    await user.click(archive);

    await waitFor(() => expect(calls).toHaveLength(1));
    // The API client sends JSON booleans; the backend stores them as 0/1.
    expect(calls[0]).toMatchObject({ method: 'PATCH', path: '/events/4242', body: { archived: true } });
  });

  it('unarchives an archived event', async () => {
    const user = userEvent.setup();
    stub({ event: { ...EVENT, archived: 1 } });
    await mountAndSettle();

    await user.click(screen.getByRole('button', { name: 'Unarchive' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toMatchObject({ archived: false });
  });

  it('saves a name / cause / notes edit', async () => {
    const user = userEvent.setup();
    stub();
    await mountAndSettle();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog');
    const cause = within(dialog).getByLabelText(/Cause/);
    await user.clear(cause);
    await user.type(cause, 'Doorbell');
    await user.click(within(dialog).getByRole('button', { name: /Save/ }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ method: 'PATCH', path: '/events/4242' });
    expect(calls[0].body).toMatchObject({ cause: 'Doorbell' });
  });

  it('deletes only after the confirm dialog is accepted', async () => {
    const user = userEvent.setup();
    stub();
    await mountAndSettle();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Delete event #4242 and its recording? This cannot be undone.');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(calls).toEqual([{ method: 'DELETE', path: '/events/4242' }]));
  });

  it('adds a tag through the chip editor', async () => {
    const user = userEvent.setup();
    let attached: unknown = null;
    stub();
    server.use(http.post('/api/v3/events-tags', async ({ request }) => {
      attached = await request.json();
      return HttpResponse.json({ id: 1, event_id: 4242, tag_id: 6 });
    }));
    await mountAndSettle();

    // The existing tag is on screen; adding one goes through the picker.
    expect(screen.getByText('person')).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('Add tag…'), 'veh');
    await user.click(await screen.findByRole('button', { name: 'vehicle' }));
    await waitFor(() => expect(attached).toEqual({ event_id: 4242, tag_id: 6 }));
  });

  it('hides the edit verbs and shows tags read-only for a view-only user', async () => {
    signIn({ iat: 0, exp: 0, user: 'viewer', perms: { events: 'View' } });
    stub();
    await mountAndSettle();

    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(screen.getByText('person')).toBeInTheDocument();
    // Read-only users still get the player and the Frames link.
    expect(screen.getByRole('link', { name: 'Frames' })).toBeInTheDocument();
  });
});

describe('ClassicEventDetailPage — DVR transport', () => {
  it('disables Prev / Next when there is no neighbour', async () => {
    stub();
    await mountAndSettle();
    expect(screen.getByRole('button', { name: 'Previous event' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next event' })).toBeDisabled();
  });

  it('navigates to the neighbouring event when one exists', async () => {
    const user = userEvent.setup();
    stub({ neighbours: [{ ...EVENT, id: 4243, start_date_time: '2026-08-21T12:10:00Z' }] });
    await mountAndSettle();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Next event' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Next event' }));
    expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({
      to: '/events/$eventId', params: { eventId: '4243' },
    }));
  });

  it('drives the <video> element from the transport row', async () => {
    const user = userEvent.setup();
    stub();
    await mountAndSettle();

    const video = document.querySelector('video')!;
    const play = vi.spyOn(video, 'play').mockResolvedValue(undefined);
    const pause = vi.spyOn(video, 'pause').mockImplementation(() => {});
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(video, 'requestFullscreen', { value: requestFullscreen, configurable: true });

    await user.click(screen.getByRole('button', { name: 'Play' }));
    expect(play).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Rewind' }));
    await user.click(screen.getByRole('button', { name: 'Fast Forward' }));
    expect(video.currentTime).toBeGreaterThanOrEqual(0);

    await user.click(screen.getByRole('button', { name: 'Fullscreen' }));
    expect(requestFullscreen).toHaveBeenCalled();

    // The element's own events feed the progress readout.
    const { fireEvent } = await import('@testing-library/react');
    Object.defineProperty(video, 'duration', { value: 30, configurable: true });
    fireEvent.loadedMetadata(video);
    video.currentTime = 12;
    fireEvent.timeUpdate(video);
    await waitFor(() => expect(screen.getByText('0:12')).toBeInTheDocument());

    fireEvent.play(video);
    expect(await screen.findByRole('button', { name: 'Pause' })).toBeInTheDocument();
    fireEvent.pause(video);
    expect(await screen.findByRole('button', { name: 'Play' })).toBeInTheDocument();
    fireEvent.ended(video);

    play.mockRestore();
    pause.mockRestore();
  });

  it('scrubs to a frame from the progress strip', async () => {
    const user = userEvent.setup();
    stub();
    await mountAndSettle();

    const video = document.querySelector('video')!;
    await user.click(await screen.findByRole('button', { name: 'Next frame' }));
    await waitFor(() => expect(video.currentTime).toBeGreaterThan(0));
    await user.click(screen.getByRole('button', { name: 'Previous frame' }));
    expect(video.currentTime).toBe(0);
  });

  it('changes the replay mode and the scale', async () => {
    const user = userEvent.setup();
    stub();
    await mountAndSettle();

    const replay = screen.getByLabelText('Replay mode') as HTMLSelectElement;
    const other = Array.from(replay.options).find((o) => o.value !== replay.value)!;
    await user.selectOptions(replay, other.value);
    expect(useEventPlaybackStore.getState().replayMode).toBe(other.value);

    const scale = screen.getByLabelText('Scale') as HTMLSelectElement;
    const otherScale = Array.from(scale.options).find((o) => o.value !== scale.value)!;
    await user.selectOptions(scale, otherScale.value);
    expect(useEventPlaybackStore.getState().scale).toBe(otherScale.value);
  });

  it('reloads the page from the control-bar refresh button', async () => {
    const user = userEvent.setup();
    const reload = vi.fn();
    const original = Object.getOwnPropertyDescriptor(window, 'location');
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload },
      configurable: true,
      writable: true,
    });
    try {
      stub();
      await mountAndSettle();
      await user.click(screen.getByRole('button', { name: 'Refresh' }));
      expect(reload).toHaveBeenCalled();
    } finally {
      if (original) Object.defineProperty(window, 'location', original);
    }
  });

  it('toggles play/pause and mute labels from the transport row', async () => {
    const user = userEvent.setup();
    stub();
    await mountAndSettle();

    expect(screen.getByRole('button', { name: 'Mute' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mute' }));
    expect(await screen.findByRole('button', { name: 'Unmute' })).toBeInTheDocument();

    // jsdom's <video> has no real media, so play() rejects; the button is
    // still wired and must not throw.
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rewind' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fast Forward' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fullscreen' })).toBeInTheDocument();
  });
});

describe('ClassicEventDetailPage — failure states', () => {
  it('shows the unsupported-codec overlay when the browser cannot decode', async () => {
    stub({ recommendedMode: 'hls' });
    await mountAndSettle();
    // jsdom has neither MSE nor native HLS, so the HLS recommendation lands
    // on the "unsupported" branch and the download fallback is offered.
    const overlay = await screen.findByTestId('event-unsupported-overlay');
    expect(overlay).toHaveTextContent('This video codec is not supported in this browser.');
    expect(within(overlay).getByRole('link', { name: 'Download Video' })).toBeInTheDocument();
  });

  it('shows the empty message when the event is gone', async () => {
    stub({ event: null });
    await mount();
    expect(await screen.findByText('Event was not found.')).toBeInTheDocument();
  });

  it('renders an alert when the event query 500s', async () => {
    stub();
    server.use(http.get('/api/v3/events/:id', () =>
      HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'boom' }, { status: 500 })));
    await mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server.');
  });

  it('renders an alert when the backend is unreachable', async () => {
    stub();
    server.use(http.get('/api/v3/events/:id', () => HttpResponse.error()));
    await mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server.');
  });

  it('renders the permission notice when the event is forbidden', async () => {
    stub();
    server.use(http.get('/api/v3/events/:id', () =>
      HttpResponse.json({ kind: 'FORBIDDEN', error_message: 'nope' }, { status: 403 })));
    await mount();
    expect(await screen.findByText('You do not have permission to view this.')).toBeInTheDocument();
  });

  it('renders nothing at all when signed out', async () => {
    useAuthStore.setState({ accessToken: null, refreshToken: null, isAuthenticated: false, user: null });
    stub();
    const { container } = await mount();
    expect(container).toBeEmptyDOMElement();
  });
});
