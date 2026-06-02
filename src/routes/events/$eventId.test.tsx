/**
 * Integration-style tests for the /events/$eventId route. Same harness
 * pattern as /audit and /groups: mock the router so we can render the
 * page body directly, and back the data fetches with MSW.
 *
 * Covers the P22 playback parity additions: replay-mode selector,
 * scale selector, codec hint, prev/next navigation, zones overlay,
 * stats panel, and the Download Video tooltip.
 */
import { describe, expect, it, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import { useEventPlaybackStore } from '@/stores/eventPlayback';

// Mock router primitives BEFORE the route module is imported so that
// `createFileRoute('/events/$eventId')` returns our shim and the
// component's `Route.useParams()` call resolves to a controllable id.
const mockNavigate = vi.fn();
let currentEventId = '100';

vi.mock('@tanstack/react-router', () => {
  return {
    createFileRoute: () => (cfg: { component: React.ComponentType }) => ({
      ...cfg,
      useParams: () => ({ eventId: currentEventId }),
    }),
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
    accessToken: 'test', refreshToken: 'test', user: null, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  mockNavigate.mockReset();
  currentEventId = '100';
  // Reset session-store between tests so cross-test bleed doesn't change
  // the dropdown defaults.
  useEventPlaybackStore.setState({
    replayMode: 'single', scale: 'auto', showZones: false, showStats: false,
  });
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
    notes: null, state_id: 1, orientation: 'Rotate0',
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
  );
}

async function mount() {
  const mod = await import('./$eventId');
  const Page = (mod.Route as unknown as { component: React.ComponentType }).component;
  return renderWithProviders(<Page />);
}

describe('EventDetailPage — playback toolbar', () => {
  it('renders the replay mode selector with three options', async () => {
    stubBase();
    await mount();
    await waitFor(() => expect(screen.getByText('Event 100')).toBeInTheDocument());

    const select = screen.getByLabelText(/replay mode/i) as HTMLSelectElement;
    expect(select.value).toBe('single');
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toEqual(['single', 'all', 'gapless']);
  });

  it('persists the replay-mode change to the playback store', async () => {
    stubBase();
    const user = userEvent.setup();
    await mount();
    await waitFor(() => expect(screen.getByText('Event 100')).toBeInTheDocument());

    await user.selectOptions(screen.getByLabelText(/replay mode/i), 'gapless');
    expect(useEventPlaybackStore.getState().replayMode).toBe('gapless');
  });

  it('renders the scale selector with all seven options', async () => {
    stubBase();
    await mount();
    await waitFor(() => expect(screen.getByText('Event 100')).toBeInTheDocument());

    const select = screen.getByLabelText(/^scale$/i) as HTMLSelectElement;
    const labels = Array.from(select.options).map((o) => o.textContent?.trim());
    expect(labels).toEqual(['Auto', '25%', '50%', '75%', '100%', '150%', '200%']);
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
    });
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
  it('renders a download link pointing at the events/{id}/video endpoint', async () => {
    stubBase();
    await mount();
    await waitFor(() => expect(screen.getByText('Event 100')).toBeInTheDocument());

    const link = screen.getByRole('link', { name: /download video/i });
    expect(link.getAttribute('href')).toMatch(/\/api\/v3\/events\/100\/video/);
    // Tooltip explains that the backend generates on demand.
    expect(link.getAttribute('title') ?? '').toMatch(/on demand/i);
  });
});
