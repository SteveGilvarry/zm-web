/**
 * Montage Review page (classic skin) — legacy `?view=montagereview`: the
 * filter row, the Date Time >= / <= window, Scale + Speed, the range toolbar
 * (`< Pan`, `In +`, `Out -`, 24/8/1 Hour, All Events, Live, Fit, `Pan >`),
 * the timeline and the per-monitor canvases.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/components/common/toastStore';
import { useMonitorFilterStore } from '@/stores/monitorFilter';
import { useMontageStore } from '@/stores/montage';
import type { UserClaims } from '@/types';

let mockSearch: Record<string, unknown> = {};
vi.mock('@tanstack/react-router', () => ({
  useSearch: () => mockSearch,
  useNavigate: () => vi.fn(),
  useRouter: () => ({ buildLocation: ({ to }: { to: string }) => ({ href: to }) }),
  Link: ({ children, to, params, ...rest }: {
    children: React.ReactNode; to?: string; params?: Record<string, string>; [k: string]: unknown;
  }) => {
    const href = to && params
      ? Object.entries(params).reduce((acc, [k, v]) => acc.replace(`$${k}`, String(v)), to)
      : (to ?? '#');
    return <a href={href} {...rest}>{children}</a>;
  },
}));

vi.mock('@/skins/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const streamProps: Array<Record<string, unknown>> = [];
vi.mock('@/components/common/StreamCell', () => ({
  StreamCell: (props: { monitorId: number; protocol: string }) => {
    streamProps.push(props);
    return <div data-testid={`live-${props.monitorId}`} data-protocol={props.protocol} />;
  },
}));

// jsdom has no media pipeline; the review cell drives play/pause directly.
beforeAll(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});

const perms = (over: Record<string, string> = {}) => ({
  iat: 0, exp: 0, uid: 7, user: 'admin',
  perms: {
    stream: 'Edit', events: 'Edit', control: 'Edit', monitors: 'Edit',
    groups: 'Edit', devices: 'Edit', snapshots: 'Edit', system: 'Edit', ...over,
  },
} as unknown as UserClaims);

function signIn(user: UserClaims = perms()) {
  useAuthStore.setState({ accessToken: 't', refreshToken: 't', user, isAuthenticated: true });
}

const server = setupServer();
beforeAll(() => { server.listen({ onUnhandledRequest: 'error' }); });
// Legacy opens fitted; the scaled sizing is what most of these assert, so
// each test opts into fit explicitly.
beforeEach(() => { signIn(); useMontageStore.setState({ reviewFit: false }); });
afterEach(() => {
  server.resetHandlers();
  mockSearch = {};
  streamProps.length = 0;
  useToastStore.getState().clear();
  useMonitorFilterStore.getState().reset();
  useMontageStore.setState({ reviewFit: false });
});
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

function paged<T>(items: T[], over: Record<string, number> = {}) {
  return { items, total: items.length, per_page: 500, current_page: 1, last_page: 1, ...over };
}

const mon = (id: number, over: Record<string, unknown> = {}) => ({
  id, name: `Cam ${id}`, width: 1920, height: 1080, orientation: 'ROTATE_0',
  type: 'Ffmpeg', capturing: 'Always', analysing: 'Always', recording: 'OnMotion',
  enabled: 1, host: `10.0.0.${id}`, web_colour: '#ff0000', ...over,
});

const MONITORS = [mon(1), mon(2), mon(3, { capturing: 'None' })];

/** One event an hour ago, inside the default 24 h window. */
const HOUR_AGO = new Date(Date.now() - 60 * 60 * 1000);
const EVENTS = [{
  id: 5150,
  monitor_id: 1,
  name: 'Event-5150',
  start_date_time: HOUR_AGO.toISOString(),
  end_date_time: new Date(HOUR_AGO.getTime() + 30_000).toISOString(),
  length: '30.00',
  max_score: 88,
  archived: 0,
}];

let eventRequests: URLSearchParams[] = [];

function stub({ monitors = MONITORS, events = EVENTS }: { monitors?: unknown[]; events?: unknown[] } = {}) {
  eventRequests = [];
  server.use(
    http.get('/api/v3/monitors', () => HttpResponse.json(paged(monitors, { per_page: 100 }))),
    http.get('/api/v3/monitor-status', () => HttpResponse.json(paged([]))),
    http.get('/api/v3/groups', () => HttpResponse.json(paged([{ id: 5, name: 'Outside', parent_id: null }]))),
    http.get('/api/v3/groups-monitors', () => HttpResponse.json(paged([{ id: 1, group_id: 5, monitor_id: 1 }]))),
    http.get('/api/v3/servers', () => HttpResponse.json(paged([]))),
    http.get('/api/v3/storage', () => HttpResponse.json(paged([]))),
    http.get('/api/v3/user_preferences', () => HttpResponse.json(paged([]))),
    http.get('/api/v3/tags', () => HttpResponse.json(paged([{ id: 4, name: 'Suspicious' }]))),
    http.get('/api/v3/events', ({ request }) => {
      const q = new URL(request.url).searchParams;
      eventRequests.push(q);
      const mine = (events as Array<{ monitor_id: number }>)
        .filter((e) => String(e.monitor_id) === q.get('monitor_id'));
      return HttpResponse.json(paged(mine));
    }),
  );
}

async function mount() {
  const { default: Page } = await import('./montagereview');
  return renderWithProviders(<Page />);
}

describe('ClassicMontageReviewPage — event filters', () => {
  it('sends Archive Status, Tags and Notes with the event queries', async () => {
    const user = userEvent.setup();
    stub();
    await mount();
    await screen.findByTestId('review-classic-grid');
    await waitFor(() => expect(eventRequests.length).toBeGreaterThan(0));
    expect(eventRequests[0].has('archived')).toBe(false);

    await user.selectOptions(screen.getByLabelText('Archive Status'), 'archived');
    await waitFor(() => expect(eventRequests.some((q) => q.get('archived') === 'true')).toBe(true));

    await user.selectOptions(await screen.findByLabelText('Tags'), '4');
    await waitFor(() => expect(eventRequests.some((q) => q.get('tag_id') === '4')).toBe(true));

    await user.selectOptions(screen.getByLabelText('Notes'), 'person');
    await waitFor(() => expect(eventRequests.some((q) => q.get('notes') === 'person')).toBe(true));
  });
});

describe('ClassicMontageReviewPage', () => {
  it('reviews every capturing monitor with the timeline above the canvases', async () => {
    stub();
    await mount();

    const grid = await screen.findByTestId('review-classic-grid');
    // Cam 3 is `capturing: 'None'` — never reviewable.
    expect(within(grid).getByTitle('1 Cam 1')).toBeInTheDocument();
    expect(within(grid).getByTitle('2 Cam 2')).toBeInTheDocument();
    expect(within(grid).queryByTitle('3 Cam 3')).toBeNull();

    expect(screen.getByText('Timeline')).toBeInTheDocument();
    // A recorded event shows as a bar on its monitor's track.
    expect(await screen.findByTitle(/^Event-5150 — /)).toBeInTheDocument();
  });

  it('asks the backend for each monitor over the window, oldest first', async () => {
    stub();
    await mount();

    await screen.findByTestId('review-classic-grid');
    await waitFor(() => expect(eventRequests.length).toBeGreaterThanOrEqual(2));
    const first = eventRequests[0];
    expect(first.get('sort')).toBe('start_time');
    expect(first.get('direction')).toBe('asc');
    expect(first.get('page_size')).toBe('500');
    expect(new Set(eventRequests.map((q) => q.get('monitor_id')))).toEqual(new Set(['1', '2']));
  });

  it('renders the legacy range toolbar with 24 Hour pressed', async () => {
    stub();
    await mount();

    const bar = await screen.findByRole('toolbar', { name: 'Review range' });
    expect(within(bar).getByRole('button', { name: '24 Hour' })).toHaveAttribute('aria-pressed', 'true');
    for (const name of ['< Pan', 'In +', 'Out -', '8 Hour', '1 Hour', 'All Events', 'Live', 'Pan >']) {
      expect(within(bar).getByRole('button', { name })).toBeInTheDocument();
    }
    // The default 24 h window spans exactly a day.
    const start = screen.getByLabelText('Date Time >=') as HTMLInputElement;
    const end = screen.getByLabelText('Date Time <=') as HTMLInputElement;
    const span = new Date(end.value).getTime() - new Date(start.value).getTime();
    expect(span).toBeCloseTo(24 * 3600_000, -4);
  });

  it('the 1 Hour preset narrows the window and takes the pressed state', async () => {
    const user = userEvent.setup();
    stub();
    await mount();

    const bar = await screen.findByRole('toolbar', { name: 'Review range' });
    await user.click(within(bar).getByRole('button', { name: '1 Hour' }));

    await waitFor(() => {
      const start = screen.getByLabelText('Date Time >=') as HTMLInputElement;
      const end = screen.getByLabelText('Date Time <=') as HTMLInputElement;
      const span = new Date(end.value).getTime() - new Date(start.value).getTime();
      expect(span).toBeCloseTo(3600_000, -4);
    });
    expect(within(bar).getByRole('button', { name: '1 Hour' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(bar).getByRole('button', { name: '24 Hour' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('Out - widens the window and Pan > slides it forward', async () => {
    const user = userEvent.setup();
    stub();
    await mount();

    const bar = await screen.findByRole('toolbar', { name: 'Review range' });
    const startInput = () => screen.getByLabelText('Date Time >=') as HTMLInputElement;
    const endInput = () => screen.getByLabelText('Date Time <=') as HTMLInputElement;
    const span = () => new Date(endInput().value).getTime() - new Date(startInput().value).getTime();

    const before = span();
    await user.click(within(bar).getByRole('button', { name: 'Out -' }));
    await waitFor(() => expect(span()).toBeGreaterThan(before));

    const startBefore = new Date(startInput().value).getTime();
    await user.click(within(bar).getByRole('button', { name: 'Pan >' }));
    await waitFor(() => expect(new Date(startInput().value).getTime()).toBeGreaterThan(startBefore));
  });

  it('editing the Date Time >= input switches to a custom range', async () => {
    stub();
    await mount();

    const bar = await screen.findByRole('toolbar', { name: 'Review range' });
    // Pull the start back first — an edit that would invert the window is refused.
    fireEvent.change(screen.getByLabelText('Date Time >='), { target: { value: '2026-08-20T06:00' } });
    fireEvent.change(screen.getByLabelText('Date Time <='), { target: { value: '2026-08-20T12:00' } });

    await waitFor(() => expect((screen.getByLabelText('Date Time >=') as HTMLInputElement).value)
      .toBe('2026-08-20T06:00'));
    expect((screen.getByLabelText('Date Time <=') as HTMLInputElement).value).toBe('2026-08-20T12:00');
    expect(within(bar).getByRole('button', { name: '24 Hour' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('ignores a Date Time edit that would invert the window', async () => {
    stub();
    await mount();

    await screen.findByTestId('review-classic-grid');
    const before = (screen.getByLabelText('Date Time <=') as HTMLInputElement).value;
    // An end before the start is refused outright.
    fireEvent.change(screen.getByLabelText('Date Time <='), { target: { value: '2020-01-01T00:00' } });

    await new Promise((r) => setTimeout(r, 20));
    expect((screen.getByLabelText('Date Time <=') as HTMLInputElement).value).toBe(before);
  });

  it('Live swaps the recordings for live cells and drops the timeline', async () => {
    const user = userEvent.setup();
    stub();
    await mount();

    const bar = await screen.findByRole('toolbar', { name: 'Review range' });
    await user.click(within(bar).getByRole('button', { name: 'Live' }));

    expect(await screen.findByTestId('live-1')).toBeInTheDocument();
    expect(screen.getByTestId('live-1').getAttribute('data-protocol')).toBe('hls');
    expect(screen.queryByText('Timeline')).toBeNull();
    // Panning a live window makes no sense.
    expect(within(bar).getByRole('button', { name: '< Pan' })).toBeDisabled();
    expect(within(bar).getByRole('button', { name: 'In +' })).toBeDisabled();
    // …and there is nothing to play back.
    expect(within(bar).queryByRole('button', { name: 'Play' })).toBeNull();
  });

  it('the speed slider is legacy\'s 13 steps, 0 = paused', async () => {
    stub();
    await mount();

    const speed = await screen.findByRole('slider', { name: 'Speed' });
    // 13 steps (0 … 50), opening at 1× — index 5.
    expect(speed).toHaveAttribute('max', '12');
    expect(screen.getByTestId('review-speed')).toHaveTextContent('1 fps');

    fireEvent.change(speed, { target: { value: '0' } });
    await waitFor(() => expect(screen.getByTestId('review-speed')).toHaveTextContent('0 fps'));

    fireEvent.change(speed, { target: { value: '12' } });
    await waitFor(() => expect(screen.getByTestId('review-speed')).toHaveTextContent('50 fps'));
  });

  it('In + narrows the window and < Pan slides it back', async () => {
    const user = userEvent.setup();
    stub();
    await mount();

    const bar = await screen.findByRole('toolbar', { name: 'Review range' });
    const startInput = () => screen.getByLabelText('Date Time >=') as HTMLInputElement;
    const endInput = () => screen.getByLabelText('Date Time <=') as HTMLInputElement;
    const span = () => new Date(endInput().value).getTime() - new Date(startInput().value).getTime();

    const before = span();
    await user.click(within(bar).getByRole('button', { name: 'In +' }));
    await waitFor(() => expect(span()).toBeLessThan(before));

    const startBefore = new Date(startInput().value).getTime();
    await user.click(within(bar).getByRole('button', { name: '< Pan' }));
    await waitFor(() => expect(new Date(startInput().value).getTime()).toBeLessThan(startBefore));
  });

  it('carries Scale and Speed', async () => {
    stub();
    await mount();

    await screen.findByTestId('review-classic-grid');
    const speed = screen.getByRole('slider', { name: 'Speed' });
    fireEvent.change(speed, { target: { value: '7' } }); // 2×
    await waitFor(() => expect(screen.getByTestId('review-speed')).toHaveTextContent('2 fps'));

    const scale = screen.getByRole('slider', { name: 'Scale' });
    expect(scale).toHaveAttribute('aria-valuetext', '1.00 x');
    // Halving the scale halves each cell's rendered width.
    const widthBefore = (screen.getByTitle('1 Cam 1') as HTMLElement).style.width;
    fireEvent.change(scale, { target: { value: '0.5' } });
    await waitFor(() => expect(scale).toHaveAttribute('aria-valuetext', '0.50 x'));
    expect((screen.getByTitle('1 Cam 1') as HTMLElement).style.width).not.toBe(widthBefore);
  });

  it('narrows the reviewed monitors through the filter row', async () => {
    const user = userEvent.setup();
    stub();
    await mount();

    await screen.findByTitle('2 Cam 2');
    await user.selectOptions(screen.getByRole('listbox', { name: 'Monitor' }), '1');

    await waitFor(() => expect(screen.queryByTitle('2 Cam 2')).toBeNull());
    expect(screen.getByTitle('1 Cam 1')).toBeInTheDocument();
  });

  it('shows the empty state once the filter row excludes everything', async () => {
    const user = userEvent.setup();
    stub();
    await mount();

    await screen.findByTitle('1 Cam 1');
    await user.selectOptions(screen.getByRole('listbox', { name: 'GroupId' }), '5');
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'nothing-matches-this');

    expect(await screen.findByText('Select one or more monitors to review.')).toBeInTheDocument();
  });

  it('renders the backend error instead of an empty grid', async () => {
    server.use(
      http.get('/api/v3/monitors', () =>
        HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'monitors table locked' }, { status: 500 })),
      http.get('/api/v3/monitor-status', () => HttpResponse.json(paged([]))),
      http.get('/api/v3/groups', () => HttpResponse.json(paged([]))),
      http.get('/api/v3/groups-monitors', () => HttpResponse.json(paged([]))),
    );
    await mount();

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server.');
    expect(screen.queryByTestId('review-classic-grid')).toBeNull();
  });

  it('reports a dead backend as unreachable', async () => {
    server.use(
      http.get('/api/v3/monitors', () => HttpResponse.error()),
      http.get('/api/v3/monitor-status', () => HttpResponse.json(paged([]))),
      http.get('/api/v3/groups', () => HttpResponse.json(paged([]))),
      http.get('/api/v3/groups-monitors', () => HttpResponse.json(paged([]))),
    );
    await mount();

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server.');
  });

  it('says "no permission" for an events-None user', async () => {
    signIn(perms({ events: 'None' }));
    stub();
    await mount();

    expect(await screen.findByText('You do not have permission to view this.')).toBeInTheDocument();
    expect(screen.queryByTestId('review-classic-grid')).toBeNull();
    // The timeline is outside the permission gate, so the toolbar still works.
    expect(screen.getByRole('toolbar', { name: 'Review range' })).toBeInTheDocument();
  });

  it('honours ?monitor_id= and the legacy min_time / max_time window', async () => {
    mockSearch = {
      monitor_id: 2,
      min_time: '2026-08-20 06:00:00',
      max_time: '2026-08-20 07:00:00',
    };
    stub();
    await mount();

    const grid = await screen.findByTestId('review-classic-grid');
    expect(within(grid).getByTitle('2 Cam 2')).toBeInTheDocument();
    expect(within(grid).queryByTitle('1 Cam 1')).toBeNull();

    expect((screen.getByLabelText('Date Time >=') as HTMLInputElement).value).toBe('2026-08-20T06:00');
    expect((screen.getByLabelText('Date Time <=') as HTMLInputElement).value).toBe('2026-08-20T07:00');
    // A URL window is a custom one — no preset is pressed.
    const bar = screen.getByRole('toolbar', { name: 'Review range' });
    expect(within(bar).getByRole('button', { name: '24 Hour' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('says "No Event" on a monitor that recorded nothing at the playhead', async () => {
    stub({ events: [] });
    await mount();

    await screen.findByTestId('review-classic-grid');
    await waitFor(() => expect(screen.getAllByText('No Event')).toHaveLength(2));
  });
});

describe('ClassicMontageReviewPage — Fit', () => {
  it('opens fitted: no Scale slider, and the button leaves fit mode', async () => {
    const user = userEvent.setup();
    useMontageStore.setState({ reviewFit: true });
    stub();
    await mount();
    await screen.findByTestId('review-classic-grid');

    // Legacy hides #ScaleDiv in fit mode and labels the button 'Scale'.
    expect(screen.queryByRole('slider', { name: 'Scale' })).toBeNull();
    const bar = screen.getByRole('toolbar', { name: 'Review range' });
    await user.click(within(bar).getByRole('button', { name: 'Scale' }));

    expect(screen.getByRole('slider', { name: 'Scale' })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Fit' })).toBeInTheDocument();
    expect(useMontageStore.getState().reviewFit).toBe(false);
  });

  it('honours legacy `?fit=1` over the stored preference', async () => {
    mockSearch = { fit: '1' };
    stub();
    await mount();
    await screen.findByTestId('review-classic-grid');

    expect(useMontageStore.getState().reviewFit).toBe(true);
    expect(screen.queryByRole('slider', { name: 'Scale' })).toBeNull();
  });

  it('packs the cells into the measured wall when fitted', async () => {
    useMontageStore.setState({ reviewFit: true });
    const innerHeight = window.innerHeight;
    Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 1200, height: 0, top: 200, left: 0, right: 1200, bottom: 200, x: 0, y: 200,
      toJSON: () => ({}),
    } as DOMRect);
    try {
      stub();
      await mount();
      const grid = await screen.findByTestId('review-classic-grid');
      await waitFor(() => expect(grid.getAttribute('data-fit')).toBe('true'));

      // 900 − 200 (wall top) − 16 (legacy's bottom gap) = 684.
      expect(grid.style.height).toBe('684px');
      const cell = within(grid).getByTitle('1 Cam 1');
      expect(cell.style.position).toBe('absolute');
      expect(parseFloat(cell.style.width)).toBeGreaterThan(0);
      expect(parseFloat(cell.style.height)).toBeGreaterThan(0);
      // Fitted cells are sized outright, not by aspect ratio.
      expect(cell.style.aspectRatio).toBe('');
    } finally {
      rect.mockRestore();
      Object.defineProperty(window, 'innerHeight', { value: innerHeight, configurable: true });
    }
  });

  it('All Events asks the API for each monitor\'s first and last event', async () => {
    const user = userEvent.setup();
    stub();
    await mount();
    await screen.findByTestId('review-classic-grid');

    const bar = screen.getByRole('toolbar', { name: 'Review range' });
    await user.click(within(bar).getByRole('button', { name: 'All Events' }));

    await waitFor(() => expect(eventRequests.some((q) => q.get('page_size') === '1' && q.get('direction') === 'desc')).toBe(true));
    expect(eventRequests.some((q) => q.get('page_size') === '1' && q.get('direction') === 'asc')).toBe(true);
  });
});
