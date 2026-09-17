/**
 * Integration-style tests for the events.detail page. Same harness
 * pattern as audit and groups: mock the router so we can render the
 * page body directly, and back the data fetches with MSW.
 *
 * Covers the P22 playback parity additions: replay-mode selector,
 * scale selector, codec hint, prev/next navigation, zones overlay,
 * stats panel, and the Download Video tooltip.
 */
import { describe, expect, it, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import { useEventPlaybackStore } from '@/stores/eventPlayback';

// Mock router primitives BEFORE the page module is imported; the page
// receives its event id as a prop (the route parses it), so only
// `useNavigate` and `Link` need shims.
const mockNavigate = vi.fn();
let mockSearch: Record<string, unknown> = {};
let currentEventId = '100';

vi.mock('@tanstack/react-router', () => {
  return {
    // The detail route carries the list's filter + sort; the page under test
    // gets an empty one unless a case overrides it.
    useSearch: () => mockSearch,
    useNavigate: () => mockNavigate,
    Link: ({
      children, to, params, ...rest
    }: {
      children: React.ReactNode;
      to?: string;
      params?: Record<string, string>;
      [k: string]: unknown;
    }) => {
      const resolved = to && params
        ? Object.entries(params).reduce(
            (acc, [k, v]) => acc.replace(`$${k}`, String(v)),
            to,
          )
        : (to ?? '#');
      return (
        <a href={resolved} {...rest}>
          {children}
        </a>
      );
    },
  };
});

vi.mock('@/skins/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const server = setupServer();

beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', isAuthenticated: true,
    // No `perms` claim → every feature reads as Edit (pre-RBAC token).
    user: { user: 'admin', iat: 0, exp: 0 } as never,
  });
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  mockNavigate.mockReset();
  currentEventId = '100';
  // Reset session-store between tests so cross-test bleed doesn't change
  // the dropdown defaults.
  useEventPlaybackStore.setState({
    replayMode: 'none', scaleByMonitor: {}, showZones: false, showStats: false, rate: 1,
    navScope: null,
  });
  mockSearch = {};
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

interface EventFixture {
  id: number;
  monitor_id: number;
  default_video?: string;
  archived?: number;
  width?: number;
  height?: number;
  length?: number;
  frames?: number;
  alarm_frames?: number;
  tot_score?: number;
  avg_score?: number;
  max_score?: number;
  disk_space?: number;
  name?: string;
  cause?: string;
  start_date_time?: string;
  end_date_time?: string;
  orientation?: string;
}

function makeEvent(over: EventFixture): Record<string, unknown> {
  return {
    id: over.id,
    monitor_id: over.monitor_id,
    storage_id: 1,
    name: over.name ?? `Event ${over.id}`,
    cause: over.cause ?? 'Motion',
    start_date_time: over.start_date_time ?? '2026-06-02T12:00:00Z',
    end_date_time:   over.end_date_time   ?? '2026-06-02T12:01:00Z',
    width: over.width ?? 1920,
    height: over.height ?? 1080,
    length: over.length ?? 60,
    frames: over.frames ?? 100,
    alarm_frames: over.alarm_frames ?? 5,
    default_video: over.default_video ?? '100-video.mp4',
    tot_score: over.tot_score ?? 50,
    avg_score: over.avg_score ?? 10,
    max_score: over.max_score ?? 25,
    archived: over.archived ?? 0,
    videoed: 1, uploaded: 0, emailed: 0, messaged: 0, executed: 0,
    notes: null, state_id: 1, orientation: over.orientation ?? 'Rotate0',
    disk_space: over.disk_space ?? 12_582_912,
    scheme: 'Medium', locked: 0, tags: [],
  };
}

function stubBase(opts?: {
  event?: ReturnType<typeof makeEvent>;
  neighbors?: Array<ReturnType<typeof makeEvent>>;
}) {
  const event = opts?.event ?? makeEvent({ id: 100, monitor_id: 1 });
  const eventId = (event as { id: number }).id;
  const neighbors = opts?.neighbors ?? [
    makeEvent({ id: 99,  monitor_id: 1 }),
    event,
    makeEvent({ id: 101, monitor_id: 1 }),
  ];
  server.use(
    http.get('/api/v3/events/:id', ({ params }) => {
      const wanted = Number(params.id);
      // The opts.event always wins for its own id so the test's
      // overrides survive the neighborhood-list bake.
      if (wanted === eventId) return HttpResponse.json(event);
      const match = neighbors.find((e) => (e as { id: number }).id === wanted) ?? event;
      return HttpResponse.json(match);
    }),
    http.get('/api/v3/events', () =>
      HttpResponse.json({
        items: neighbors,
        total: neighbors.length, per_page: 100, current_page: 1, last_page: 1,
      }),
    ),
    http.get('/api/v3/monitors/:id', ({ params }) =>
      HttpResponse.json({ id: Number(params.id), name: `Monitor ${params.id}`, width: 1920, height: 1080 }),
    ),
    http.get('/api/v3/monitors/:id/zones', () =>
      HttpResponse.json({
        items: [], total: 0, per_page: 50, current_page: 1, last_page: 1,
      }),
    ),
    http.get('/api/v3/frames', () =>
      HttpResponse.json({
        items: [], total: 0, per_page: 500, current_page: 1, last_page: 1,
      }),
    ),
    http.get('/api/v3/tags', () =>
      HttpResponse.json({
        items: [], total: 0, per_page: 100, current_page: 1, last_page: 1,
      }),
    ),
    http.get('/api/v3/storage', () =>
      HttpResponse.json({
        items: [{ id: 1, name: 'Default', path: '/var/cache/zoneminder/events', type: 'local', enabled: 1 }],
        total: 1, per_page: 100, current_page: 1, last_page: 1,
      }),
    ),
    http.get('/api/v3/event-data', () =>
      HttpResponse.json({ items: [], total: 0, per_page: 200, current_page: 1, last_page: 1 }),
    ),
  );
}

async function mount() {
  const { default: Page } = await import('./events.detail');
  return renderWithProviders(<Page eventId={parseInt(currentEventId, 10)} />);
}

describe('EventDetailPage — playback toolbar', () => {
  it('renders the replay mode selector with the four legacy modes', async () => {
    stubBase();
    await mount();
    await waitFor(() => expect(screen.getByText('Event 100')).toBeInTheDocument());

    const select = screen.getByLabelText(/replay mode/i) as HTMLSelectElement;
    expect(select.value).toBe('none');
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toEqual(['none', 'single', 'all', 'gapless']);
  });

  it('persists the replay-mode change to the playback store', async () => {
    stubBase();
    const user = userEvent.setup();
    await mount();
    await waitFor(() => expect(screen.getByText('Event 100')).toBeInTheDocument());

    await user.selectOptions(screen.getByLabelText(/replay mode/i), 'gapless');
    expect(useEventPlaybackStore.getState().replayMode).toBe('gapless');
  });

  it('renders the legacy scale list: Auto, Actual, Fit to width and the pixel caps', async () => {
    stubBase();
    await mount();
    await waitFor(() => expect(screen.getByText('Event 100')).toBeInTheDocument());

    const select = screen.getByLabelText(/^scale$/i) as HTMLSelectElement;
    const labels = Array.from(select.options).map((o) => o.textContent?.trim());
    expect(labels).toEqual([
      'Auto', 'Actual', 'Fit to width',
      'Max 480px', 'Max 640px', 'Max 800px', 'Max 1024px', 'Max 1280px', 'Max 1600px',
    ]);
  });

  it('renders the codec hint badge with the event default_video', async () => {
    stubBase({ event: makeEvent({ id: 100, monitor_id: 1, default_video: 'my-event.h264.mp4' }) });
    await mount();

    await waitFor(() => {
      const badge = screen.getByTestId('codec-hint');
      expect(badge.textContent).toMatch(/my-event\.h264\.mp4/);
    });
  });

  it('falls back to "Unknown" when default_video is empty', async () => {
    stubBase({ event: makeEvent({ id: 100, monitor_id: 1, default_video: '' }) });
    await mount();
    await waitFor(() => {
      expect(screen.getByTestId('codec-hint').textContent).toMatch(/unknown/i);
    });
  });
});

describe('EventDetailPage — prev/next navigation', () => {
  it('disables Prev on the first event in the neighborhood', async () => {
    currentEventId = '99';
    stubBase({
      event: makeEvent({ id: 99, monitor_id: 1 }),
      neighbors: [
        makeEvent({ id: 99,  monitor_id: 1 }),
        makeEvent({ id: 100, monitor_id: 1 }),
      ],
    });
    await mount();
    await waitFor(() => expect(screen.getByText('Event 99')).toBeInTheDocument());

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /previous event/i })).toBeDisabled();
    });
    expect(screen.getByRole('button', { name: /next event/i })).toBeEnabled();
  });

  it('disables Next on the last event in the neighborhood', async () => {
    currentEventId = '101';
    stubBase({
      event: makeEvent({ id: 101, monitor_id: 1 }),
      neighbors: [
        makeEvent({ id: 100, monitor_id: 1 }),
        makeEvent({ id: 101, monitor_id: 1 }),
      ],
    });
    await mount();
    await waitFor(() => expect(screen.getByText('Event 101')).toBeInTheDocument());

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /next event/i })).toBeDisabled();
    });
    expect(screen.getByRole('button', { name: /previous event/i })).toBeEnabled();
  });

  it('navigates to the next event id when Next is clicked', async () => {
    stubBase();
    const user = userEvent.setup();
    await mount();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /next event/i })).toBeEnabled();
    });

    await user.click(screen.getByRole('button', { name: /next event/i }));
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/events/$eventId',
      params: { eventId: '101' },
      search: {},
    });
  });

  it('navigates to the previous event id when Prev is clicked', async () => {
    stubBase();
    const user = userEvent.setup();
    await mount();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /previous event/i })).toBeEnabled();
    });

    await user.click(screen.getByRole('button', { name: /previous event/i }));
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/events/$eventId',
      params: { eventId: '99' },
      search: {},
    });
  });
});

describe('EventDetailPage — time-bounded neighbours', () => {
  it('asks the backend for neighbours by start time around the current event, not page 1 by id', async () => {
    const queries: URLSearchParams[] = [];
    stubBase();
    server.use(
      http.get('/api/v3/events', ({ request }) => {
        queries.push(new URL(request.url).searchParams);
        return HttpResponse.json({
          items: [makeEvent({ id: 100, monitor_id: 1 })],
          total: 1, per_page: 10, current_page: 1, last_page: 1,
        });
      }),
    );
    await mount();
    await waitFor(() => expect(queries.length).toBeGreaterThanOrEqual(2));

    const next = queries.find((q) => q.get('direction') === 'asc');
    const prev = queries.find((q) => q.get('direction') === 'desc');
    expect(next?.get('sort')).toBe('start_time');
    expect(next?.get('start_time')).toBe('2026-06-02T12:00:00Z');
    expect(next?.get('monitor_id')).toBe('1');
    expect(prev?.get('sort')).toBe('start_time');
    expect(prev?.get('end_time')).toBe('2026-06-02T12:00:00Z');
    expect(queries.every((q) => q.get('sort') !== 'id')).toBe(true);
  });

  it('walks every monitor when the list was unfiltered', async () => {
    useEventPlaybackStore.setState({ navScope: { monitorId: null } });
    const queries: URLSearchParams[] = [];
    stubBase();
    server.use(
      http.get('/api/v3/events', ({ request }) => {
        queries.push(new URL(request.url).searchParams);
        return HttpResponse.json({ items: [], total: 0, per_page: 10, current_page: 1, last_page: 1 });
      }),
    );
    await mount();
    await waitFor(() => expect(queries.length).toBeGreaterThanOrEqual(2));
    expect(queries.every((q) => !q.has('monitor_id'))).toBe(true);
    useEventPlaybackStore.setState({ navScope: null });
  });
});

describe('EventDetailPage — keyboard shortcuts', () => {
  it('← and → navigate, Space toggles playback, Delete opens the confirm dialog', async () => {
    stubBase();
    const user = userEvent.setup();
    await mount();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /next event/i })).toBeEnabled();
    });

    await user.keyboard('{ArrowRight}');
    expect(mockNavigate).toHaveBeenLastCalledWith({ to: '/events/$eventId', params: { eventId: '101' }, search: {} });
    await user.keyboard('{ArrowLeft}');
    expect(mockNavigate).toHaveBeenLastCalledWith({ to: '/events/$eventId', params: { eventId: '99' }, search: {} });

    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    await user.keyboard(' ');
    expect(play).toHaveBeenCalled();
    play.mockRestore();

    await user.keyboard('{Delete}');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/delete event #100/i)).toBeInTheDocument();
  });

  it('ignores shortcuts while typing in a form control', async () => {
    stubBase();
    const user = userEvent.setup();
    await mount();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /next event/i })).toBeEnabled();
    });
    await user.click(screen.getByLabelText(/replay mode/i));
    await user.keyboard('{ArrowRight}');
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('EventDetailPage — actions', () => {
  it('Archive PATCHes archived=true and Unarchive the reverse', async () => {
    const bodies: unknown[] = [];
    stubBase();
    server.use(
      http.patch('/api/v3/events/:id', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(makeEvent({ id: 100, monitor_id: 1, archived: 1 }));
      }),
    );
    const user = userEvent.setup();
    await mount();
    await user.click(await screen.findByRole('button', { name: /^archive$/i }));
    await waitFor(() => expect(bodies).toEqual([{ archived: true }]));
  });

  it('Edit saves name / cause / notes through PATCH', async () => {
    const bodies: unknown[] = [];
    stubBase();
    server.use(
      http.patch('/api/v3/events/:id', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(makeEvent({ id: 100, monitor_id: 1 }));
      }),
    );
    const user = userEvent.setup();
    await mount();
    await user.click(await screen.findByRole('button', { name: /^edit$/i }));
    const name = screen.getByLabelText(/event name/i);
    await user.clear(name);
    await user.type(name, 'Parcel at door');
    await user.type(screen.getByLabelText(/event notes/i), 'courier');
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(bodies).toEqual([
      { name: 'Parcel at door', cause: 'Motion', notes: 'courier' },
    ]));
    await waitFor(() => expect(screen.queryByTestId('event-edit-form')).toBeNull());
  });

  it('Delete confirms, DELETEs and plays the next event', async () => {
    let deleted: string | undefined;
    stubBase();
    server.use(
      http.delete('/api/v3/events/:id', ({ params }) => {
        deleted = String(params.id);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    await mount();
    await user.click(await screen.findByRole('button', { name: /delete event/i }));
    await user.click(await screen.findByRole('button', { name: /^delete$/i }));
    await waitFor(() => expect(deleted).toBe('100'));
    // Legacy `streamNext(true)`: the next event, not back to the list.
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({
      to: '/events/$eventId', params: { eventId: '101' }, search: {},
    }));
  });

  it('shows the delete error inside the dialog instead of closing it', async () => {
    stubBase();
    server.use(
      http.delete('/api/v3/events/:id', () =>
        HttpResponse.json({ kind: 'FORBIDDEN', error_message: 'event is locked' }, { status: 403 }),
      ),
    );
    const user = userEvent.setup();
    await mount();
    await user.click(await screen.findByRole('button', { name: /delete event/i }));
    await user.click(await screen.findByRole('button', { name: /^delete$/i }));
    expect(await screen.findByText(/event is locked/)).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('EventDetailPage — playback speed', () => {
  it('offers the legacy -16x … Stop … 16x list and applies a forward choice to the <video>', async () => {
    stubBase();
    const user = userEvent.setup();
    const { container } = await mount();
    const select = await screen.findByLabelText(/playback speed/i) as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      '-16x', '-10x', '-5x', '-2x', '-1x', '-1/2x', '-1/4x', 'Stop',
      '1/4x', '1/2x', '1x', '2x', '5x', '10x', '16x',
    ]);
    await user.selectOptions(select, '5');
    expect(useEventPlaybackStore.getState().rate).toBe(5);
    await waitFor(() => expect(container.querySelector('video')!.playbackRate).toBe(5));
  });
});

describe('EventDetailPage — storage and event data', () => {
  it('shows the storage name from /storage', async () => {
    stubBase();
    await mount();
    await waitFor(() => expect(screen.getByTestId('event-storage').textContent).toBe('Default'));
  });

  it('labels storage id 0 as the implicit Default store', async () => {
    const ev = { ...makeEvent({ id: 100, monitor_id: 1 }), storage_id: 0 };
    stubBase({ event: ev });
    await mount();
    await waitFor(() => expect(screen.getByTestId('event-storage').textContent).toBe('Default'));
  });

  it('renders Event_Data rows when the backend has some', async () => {
    stubBase();
    server.use(
      http.get('/api/v3/event-data', () =>
        HttpResponse.json({
          items: [
            { id: 1, event_id: 100, monitor_id: 1, frame_id: 12, timestamp: '2026-06-02T12:00:05Z', data: 'person 0.91' },
          ],
          total: 1, per_page: 200, current_page: 1, last_page: 1,
        }),
      ),
    );
    await mount();
    const table = await screen.findByTestId('event-data-table');
    expect(table.textContent).toMatch(/#12/);
    expect(table.textContent).toMatch(/person 0\.91/);
  });
});

describe('EventDetailPage — zones overlay toggle', () => {
  it('does not render the zones SVG by default', async () => {
    stubBase();
    await mount();
    await waitFor(() => expect(screen.getByText('Event 100')).toBeInTheDocument());

    expect(screen.queryByTestId('zones-overlay')).toBeNull();
  });

  it('renders the zones SVG after toggling Show Zones', async () => {
    // Set up base handlers first; then add the zones override so it
    // takes priority (MSW resolves most-recent first).
    stubBase();
    server.use(
      http.get('/api/v3/monitors/:id/zones', () =>
        HttpResponse.json({
          items: [
            { id: 1, monitor_id: 1, name: 'Driveway', type: 'Active', units: 'Pixels',
              coords: '0,0 1920,0 1920,1080 0,1080', num_coords: 4 },
          ],
          total: 1, per_page: 50, current_page: 1, last_page: 1,
        }),
      ),
    );
    const user = userEvent.setup();
    await mount();
    await waitFor(() => expect(screen.getByText('Event 100')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /show zones/i }));
    await waitFor(() => {
      expect(screen.getByTestId('zones-overlay')).toBeInTheDocument();
      expect(screen.getByTestId('zone-1')).toBeInTheDocument();
    });
  });
});

describe('EventDetailPage — stats panel toggle', () => {
  it('does not render the stats panel by default', async () => {
    stubBase();
    await mount();
    await waitFor(() => expect(screen.getByText('Event 100')).toBeInTheDocument());

    expect(screen.queryByTestId('event-stats-panel')).toBeNull();
  });

  it('renders alarm-frames, max-score, and disk-space when Stats is toggled on', async () => {
    stubBase({
      event: makeEvent({
        id: 100, monitor_id: 1,
        alarm_frames: 42, max_score: 99, disk_space: 1024 * 1024 * 25,
      }),
    });
    const user = userEvent.setup();
    await mount();
    await waitFor(() => expect(screen.getByText('Event 100')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /^stats$/i }));

    const panel = await screen.findByTestId('event-stats-panel');
    expect(panel.textContent).toMatch(/42/);
    expect(panel.textContent).toMatch(/99/);
    expect(panel.textContent).toMatch(/25\.0 MB/);
  });
});

describe('EventDetailPage — Download Video button', () => {
  it('renders a download link pointing at the events/{id}/stream/video.mp4 endpoint', async () => {
    stubBase();
    await mount();
    await waitFor(() => expect(screen.getByText('Event 100')).toBeInTheDocument());

    const link = screen.getByRole('link', { name: /download video/i });
    // Codec-aware playback (commit 7e1c4c3) moved the download to the
    // Range-supported HLS-adjacent endpoint: /events/{id}/stream/video.mp4.
    expect(link.getAttribute('href')).toMatch(/\/api\/v3\/events\/100\/stream\/video\.mp4/);
    // Legacy titles the button with the stored file name.
    expect(link.getAttribute('title') ?? '').toBe('Download 100-video.mp4');
  });
});

describe('EventDetailPage — rotated-camera playback', () => {
  // Regression: the event detail page used to hardcode useSwappedRotation=false
  // assuming the backend's stored mp4 carried a rotation side-data tag the
  // browser would honour. In practice the HLS path strips it and Safari has
  // historically ignored it even when present, so rotated cameras played
  // back as landscape pixels squished into a portrait container. The
  // dashboard now applies the same swap-dimensions transform StreamCell
  // uses for live streams.

  it('applies a rotate(90deg) transform to the <video> when orientation=Rotate90', async () => {
    stubBase({
      event: makeEvent({
        id: 100, monitor_id: 1, orientation: 'Rotate90',
        width: 2160, height: 3840, // post-rotation portrait dims from backend
      }),
    });
    const { container } = await mount();
    await waitFor(() => expect(screen.getByText('Event 100')).toBeInTheDocument());

    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(video!.style.transform).toContain('rotate(90deg)');
    // Swap-dimensions footprint: element wider than container width, then
    // rotated to land back on the portrait box.
    expect(video!.style.width).toBe('177.7778%');
    expect(video!.style.height).toBe('56.25%');
    expect(video!.style.position).toBe('absolute');
  });

  it('applies a rotate(270deg) transform for Rotate270', async () => {
    stubBase({
      event: makeEvent({
        id: 100, monitor_id: 2, orientation: 'Rotate270',
        width: 720, height: 1280,
      }),
    });
    const { container } = await mount();
    await waitFor(() => expect(screen.getByText('Event 100')).toBeInTheDocument());

    const video = container.querySelector('video')!;
    expect(video.style.transform).toContain('rotate(270deg)');
  });

  it('accepts the backend ROTATE_90 string variant (underscore + upper)', async () => {
    stubBase({
      event: makeEvent({
        id: 100, monitor_id: 1, orientation: 'ROTATE_90',
        width: 2160, height: 3840,
      }),
    });
    const { container } = await mount();
    await waitFor(() => expect(screen.getByText('Event 100')).toBeInTheDocument());

    const video = container.querySelector('video')!;
    expect(video.style.transform).toContain('rotate(90deg)');
  });

  it('does NOT rotate when orientation=Rotate0', async () => {
    stubBase({
      event: makeEvent({
        id: 100, monitor_id: 1, orientation: 'Rotate0',
        width: 1920, height: 1080,
      }),
    });
    const { container } = await mount();
    await waitFor(() => expect(screen.getByText('Event 100')).toBeInTheDocument());

    const video = container.querySelector('video')!;
    expect(video.style.transform).toBe('');
    expect(video.style.position).toBe('');
  });

  it('applies the simple rotate(180deg) for Rotate180 (no swap needed)', async () => {
    stubBase({
      event: makeEvent({
        id: 100, monitor_id: 1, orientation: 'Rotate180',
        width: 1920, height: 1080,
      }),
    });
    const { container } = await mount();
    await waitFor(() => expect(screen.getByText('Event 100')).toBeInTheDocument());

    const video = container.querySelector('video')!;
    expect(video.style.transform).toContain('rotate(180deg)');
    // 180° preserves the bounding box, so no absolute positioning swap.
    expect(video.style.position).toBe('');
  });
});

/**
 * Prev / Next follow the set the operator was looking at. Most specific
 * first: an explicit id list from the list's View button, then the list's
 * page + sort carried in this URL, then neighbours by time.
 */
describe('EventDetailPage — list-context navigation', () => {
  /** `/events` paged by the `page` query param, two rows to a page. */
  function stubPages(pages: Record<number, number[]>) {
    const lastPage = Math.max(...Object.keys(pages).map(Number));
    server.use(
      http.get('/api/v3/events', ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page') ?? 1);
        const ids = pages[page] ?? [];
        return HttpResponse.json({
          items: ids.map((id) => makeEvent({ id, monitor_id: 1 })),
          total: 6, per_page: 2, current_page: page, last_page: lastPage,
        });
      }),
    );
  }

  it('takes the rows either side of this one in the list page the URL names', async () => {
    const user = userEvent.setup();
    stubBase();
    stubPages({ 1: [97, 98], 2: [99, 100], 3: [101, 102] });
    mockSearch = { page: 2, page_size: 2, sort: 'start_time', dir: 'asc' };
    await mount();

    await waitFor(() => expect(screen.getByRole('button', { name: /next event/i })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: /next event/i }));
    expect(mockNavigate).toHaveBeenLastCalledWith(expect.objectContaining({
      params: { eventId: '101' },
    }));
    await user.click(screen.getByRole('button', { name: /previous event/i }));
    expect(mockNavigate).toHaveBeenLastCalledWith(expect.objectContaining({
      params: { eventId: '99' },
    }));
  });

  it('keeps Prev timewise earlier when the list is sorted newest first', async () => {
    const user = userEvent.setup();
    stubBase();
    stubPages({ 1: [102, 101], 2: [100, 99], 3: [98, 97] });
    mockSearch = { page: 2, page_size: 2, sort: 'start_time', dir: 'desc' };
    await mount();

    // Row below in a descending list is the earlier event, so it is Prev.
    await waitFor(() => expect(screen.getByRole('button', { name: /previous event/i })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: /previous event/i }));
    expect(mockNavigate).toHaveBeenLastCalledWith(expect.objectContaining({
      params: { eventId: '99' },
    }));
    await user.click(screen.getByRole('button', { name: /next event/i }));
    expect(mockNavigate).toHaveBeenLastCalledWith(expect.objectContaining({
      params: { eventId: '101' },
    }));
  });

  it('follows the list order for a column legacy does not force ascending', async () => {
    const user = userEvent.setup();
    stubBase();
    stubPages({ 1: [99, 100], 2: [101, 102] });
    mockSearch = { page: 1, page_size: 2, sort: 'max_score', dir: 'desc' };
    await mount();

    await waitFor(() => expect(screen.getByRole('button', { name: /next event/i })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: /next event/i }));
    expect(mockNavigate).toHaveBeenLastCalledWith(expect.objectContaining({
      params: { eventId: '101' },
    }));
  });

  it('carries the list context on to the event it navigates to', async () => {
    const user = userEvent.setup();
    stubBase();
    stubPages({ 1: [99, 100], 2: [101, 102] });
    mockSearch = { page: 1, page_size: 2, sort: 'start_time', dir: 'asc', cause: 'Motion' };
    await mount();

    await waitFor(() => expect(screen.getByRole('button', { name: /next event/i })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: /next event/i }));
    expect(mockNavigate).toHaveBeenLastCalledWith(expect.objectContaining({
      search: mockSearch,
    }));
  });

  it('walks an explicit id list from the list’s View button first', async () => {
    const user = userEvent.setup();
    stubBase();
    stubPages({ 1: [99, 100], 2: [101, 102] });
    mockSearch = { page: 1, page_size: 2, sort: 'start_time', dir: 'asc' };
    useEventPlaybackStore.setState({ navScope: { monitorId: null, ids: [42, 100, 77] } });
    await mount();

    await waitFor(() => expect(screen.getByRole('button', { name: /next event/i })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: /next event/i }));
    expect(mockNavigate).toHaveBeenLastCalledWith(expect.objectContaining({
      params: { eventId: '77' },
    }));
    await user.click(screen.getByRole('button', { name: /previous event/i }));
    expect(mockNavigate).toHaveBeenLastCalledWith(expect.objectContaining({
      params: { eventId: '42' },
    }));
  });

  it('plays on arrival when the run was started with autoplay', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    stubBase();
    useEventPlaybackStore.setState({ navScope: { monitorId: null, ids: [100, 101], autoplay: true } });
    await mount();

    await waitFor(() => expect(play).toHaveBeenCalled());
    play.mockRestore();
  });

  it('does not autoplay without the flag', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    stubBase();
    await mount();
    await waitFor(() => expect(screen.getByText('Event 100')).toBeInTheDocument());
    expect(play).not.toHaveBeenCalled();
    play.mockRestore();
  });
});

describe('EventDetailPage — transport and toolbar parity', () => {
  it('steps by Length / Frames seconds while paused, and not while playing', async () => {
    const user = userEvent.setup();
    stubBase({ event: makeEvent({ id: 100, monitor_id: 1, length: 60, frames: 120 }) });
    await mount();
    const video = await screen.findByText('Event 100').then(() => document.querySelector('video')!);

    await user.click(screen.getByRole('button', { name: /step forward/i }));
    expect(video.currentTime).toBeCloseTo(0.5, 5);

    fireEvent.play(video);
    await waitFor(() => expect(screen.getByRole('button', { name: /step forward/i })).toBeDisabled());
    expect(screen.getByRole('button', { name: /step back/i })).toBeDisabled();
  });

  it('shows "No more events" when a replay run reaches the end', async () => {
    stubBase({ neighbors: [makeEvent({ id: 100, monitor_id: 1 })] });
    useEventPlaybackStore.setState({ replayMode: 'gapless' });
    await mount();
    await screen.findByText('Event 100');

    fireEvent.ended(document.querySelector('video')!);
    expect(await screen.findByTestId('event-replay-message')).toHaveTextContent('No more events');
  });

  it('hides Download and blocks Delete for an archived event', async () => {
    stubBase({ event: makeEvent({ id: 100, monitor_id: 1, archived: 1, default_video: '' }) });
    await mount();
    await screen.findByText('Event 100');

    expect(screen.queryByRole('link', { name: /download video/i })).toBeNull();
    const del = screen.getByRole('button', { name: /delete event/i });
    expect(del).toBeDisabled();
    expect(del).toHaveAttribute('title', 'You cannot delete an archived event.');
  });

  it('hides the Zones toggle without System View', async () => {
    useAuthStore.setState({
      accessToken: 'test', refreshToken: 'test', isAuthenticated: true,
      user: { user: 'op', iat: 0, exp: 0, perms: { events: 'Edit', system: 'None' } } as never,
    });
    stubBase();
    await mount();
    await screen.findByText('Event 100');

    expect(screen.queryByRole('button', { name: /show zones/i })).toBeNull();
    useAuthStore.setState({ user: { user: 'admin', iat: 0, exp: 0 } as never });
  });
});

describe('EventDetailPage — overlay, status line and codec', () => {
  it('puts the legacy hover controls over the picture', async () => {
    const user = userEvent.setup();
    stubBase();
    await mount();
    await screen.findByText('Event 100');

    const overlay = screen.getByTestId('player-overlay-controls');
    expect(within(overlay).getByRole('link', { name: 'Open watch page' }))
      .toHaveAttribute('href', '/monitors/1');
    expect(within(overlay).getByRole('button', { name: 'Zoom OUT' })).toBeDisabled();

    await user.click(within(overlay).getByRole('button', { name: 'Zoom IN' }));
    expect(screen.getByTestId('event-replay-status')).toHaveTextContent('Zoom: 1.3x');
  });

  it('reads Mode and Progress off the transport', async () => {
    stubBase();
    await mount();
    await screen.findByText('Event 100');
    const video = document.querySelector('video')!;

    expect(screen.getByTestId('event-replay-status')).toHaveTextContent('Mode: Paused');

    Object.defineProperty(video, 'duration', { value: 60, configurable: true });
    fireEvent.loadedMetadata(video);
    video.currentTime = 7;
    fireEvent.timeUpdate(video);
    fireEvent.play(video);

    await waitFor(() => {
      const status = screen.getByTestId('event-replay-status');
      expect(status).toHaveTextContent('Mode: Replay');
      expect(status).toHaveTextContent('Progress: 7s');
    });
  });

  it('forces the container from the Codec select', async () => {
    const user = userEvent.setup();
    stubBase();
    await mount();
    await screen.findByText('Event 100');

    const select = screen.getByLabelText('Codec') as HTMLSelectElement;
    expect(screen.getByRole('option', { name: /MJPEG/ })).toBeDisabled();

    await user.selectOptions(select, 'mp4hls');
    expect(useEventPlaybackStore.getState().codec).toBe('mp4hls');
  });
});
