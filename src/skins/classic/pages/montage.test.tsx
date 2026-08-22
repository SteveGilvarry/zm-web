/**
 * Montage page (classic skin) — legacy `?view=montage`: the filter row, the
 * settings band (status position / Player / Width-Height-Scale / Layout with
 * Edit-Save-Delete) and the flat wall of capturing monitors underneath.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/components/common/toastStore';
import { useMonitorFilterStore } from '@/stores/monitorFilter';
import { useMontageStore } from '@/stores/montage';
import { serialisePositions } from '@/features/montage/layoutFormat';
import { gridLayout } from '@/features/montage/mosaic';
import type { UserClaims } from '@/types';

let mockSearch: Record<string, unknown> = {};
vi.mock('@tanstack/react-router', () => ({
  useSearch: () => mockSearch,
  useNavigate: () => vi.fn(),
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

// StreamCell drags in hls.js / WebRTC; a sentinel keeps the test on the wall.
const streamProps: Array<Record<string, unknown>> = [];
vi.mock('@/components/common/StreamCell', () => ({
  StreamCell: (props: { monitorId: number; protocol: string }) => {
    streamProps.push(props);
    return <div data-testid={`stream-${props.monitorId}`} data-protocol={props.protocol} />;
  },
}));

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
beforeEach(() => { signIn(); });
afterEach(() => {
  server.resetHandlers();
  mockSearch = {};
  streamProps.length = 0;
  useToastStore.getState().clear();
  useMonitorFilterStore.getState().reset();
  useMontageStore.setState({ protocol: 'webrtc', statusPosition: 'inside' });
});
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

function paged<T>(items: T[]) {
  return { items, total: items.length, per_page: 200, current_page: 1, last_page: 1 };
}

const mon = (id: number, over: Record<string, unknown> = {}) => ({
  id, name: `Cam ${id}`, width: 1920, height: 1080, orientation: 'ROTATE_0',
  type: 'Ffmpeg', capturing: 'Always', analysing: 'Always', recording: 'OnMotion',
  enabled: 1, host: `10.0.0.${id}`, web_colour: '#ffffff', ...over,
});

const MONITORS = [mon(1), mon(2), mon(3), mon(4, { capturing: 'None' })];

const STATUSES = [
  { monitor_id: 1, status: 'Connected', capture_fps: '10.5', analysis_fps: '5.0', capture_bandwidth: 2048, updated_on: '2026-08-21T06:00:00Z' },
];

const SAVED_POSITIONS = serialisePositions(gridLayout(2, 2, [3, 1, 2]), 'outside');

function stub({
  monitors = MONITORS,
  layouts = [{ id: 12, name: 'Night wall', user_id: 7, positions: SAVED_POSITIONS }],
  groups = [{ id: 5, name: 'Outside', parent_id: null }],
}: { monitors?: unknown[]; layouts?: unknown[]; groups?: unknown[] } = {}) {
  server.use(
    http.get('/api/v3/monitors', () => HttpResponse.json(paged(monitors))),
    http.get('/api/v3/monitor-status', () => HttpResponse.json(paged(STATUSES))),
    http.get('/api/v3/montage_layouts', () => HttpResponse.json(paged(layouts))),
    http.get('/api/v3/groups', () => HttpResponse.json(paged(groups))),
    http.get('/api/v3/groups-monitors', () => HttpResponse.json(paged([{ id: 1, group_id: 5, monitor_id: 1 }]))),
  );
}

async function mount() {
  const { default: Page } = await import('./montage');
  return renderWithProviders(<Page />);
}

describe('ClassicMontagePage', () => {
  it('walls the capturing monitors only, in an Auto grid', async () => {
    stub();
    await mount();

    const grid = await screen.findByTestId('montage-classic-grid');
    // 3 capturing monitors → autoColumns(3) === 3.
    expect(grid.getAttribute('data-columns')).toBe('3');
    expect(screen.getByTestId('montage-classic-cell-1')).toBeInTheDocument();
    expect(screen.getByTestId('montage-classic-cell-3')).toBeInTheDocument();
    // Cam 4 is `capturing: 'None'` — legacy never walls it.
    expect(screen.queryByTestId('montage-classic-cell-4')).toBeNull();
  });

  it('renders the legacy settings band', async () => {
    stub();
    await mount();

    await screen.findByTestId('montage-classic-grid');
    expect(screen.getByRole('group', { name: 'Monitor filter bar' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Stage size' })).toBeInTheDocument();
    expect(screen.getByLabelText('Monitor status position')).toBeInTheDocument();
    expect(screen.getByLabelText('Player')).toBeInTheDocument();
    expect(screen.getByLabelText('Layout')).toBeInTheDocument();
    expect(screen.getByLabelText('Width')).toBeInTheDocument();
    expect(screen.getByLabelText('Height')).toBeInTheDocument();
  });

  it('narrows the wall through the filter row', async () => {
    const user = userEvent.setup();
    stub();
    await mount();

    await screen.findByTestId('montage-classic-cell-2');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Monitor' }), '2');

    await waitFor(() => expect(screen.queryByTestId('montage-classic-cell-1')).toBeNull());
    expect(screen.getByTestId('montage-classic-cell-2')).toBeInTheDocument();

    // The (×) clears it again.
    await user.click(screen.getByRole('button', { name: 'Clear monitor' }));
    await waitFor(() => expect(screen.getByTestId('montage-classic-cell-1')).toBeInTheDocument());
  });

  it('shows the empty state when nothing is capturing', async () => {
    stub({ monitors: [mon(1, { capturing: 'None' })] });
    await mount();

    expect(await screen.findByText('No monitors to display.')).toBeInTheDocument();
    expect(screen.queryByTestId('montage-classic-grid')).toBeNull();
  });

  it('renders the backend error instead of an empty wall', async () => {
    server.use(
      http.get('/api/v3/monitors', () =>
        HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'monitors table locked' }, { status: 500 })),
      http.get('/api/v3/monitor-status', () => HttpResponse.json(paged([]))),
      http.get('/api/v3/montage_layouts', () => HttpResponse.json(paged([]))),
      http.get('/api/v3/groups', () => HttpResponse.json(paged([]))),
      http.get('/api/v3/groups-monitors', () => HttpResponse.json(paged([]))),
    );
    await mount();

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server.');
  });

  it('says "no permission" for a stream-None user', async () => {
    signIn(perms({ stream: 'None' }));
    stub();
    await mount();

    expect(await screen.findByText('You do not have permission to view this.')).toBeInTheDocument();
    expect(screen.queryByTestId('montage-classic-grid')).toBeNull();
  });

  it('hides the layout verbs for a system-View user', async () => {
    signIn(perms({ system: 'View' }));
    stub();
    await mount();

    await screen.findByTestId('montage-classic-grid');
    expect(screen.queryByRole('button', { name: 'Edit Layout' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete layout' })).toBeNull();
    // The read-only controls are still there.
    expect(screen.getByLabelText('Layout')).toBeInTheDocument();
  });

  it('lists presets then saved layouts and re-columns the wall on choice', async () => {
    const user = userEvent.setup();
    stub();
    await mount();

    const select = await screen.findByRole('combobox', { name: 'Layout' });
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Night wall' })).toBeInTheDocument());
    const labels = within(select).getAllByRole('option').map((o) => o.textContent);
    expect(labels[0]).toBe('Auto');
    expect(labels).toContain('4 Wide');
    expect(labels[labels.length - 1]).toBe('Night wall');

    await user.selectOptions(select, 'preset:4w');
    await waitFor(() => expect(screen.getByTestId('montage-classic-grid').getAttribute('data-columns')).toBe('4'));
  });

  it('a saved layout fixes the cell order', async () => {
    const user = userEvent.setup();
    stub();
    await mount();

    const select = await screen.findByRole('combobox', { name: 'Layout' });
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Night wall' })).toBeInTheDocument());
    await user.selectOptions(select, 'saved:12');

    await waitFor(() => {
      const ids = within(screen.getByTestId('montage-classic-grid'))
        .getAllByTestId(/^montage-classic-cell-/)
        .map((el) => el.getAttribute('data-testid'));
      expect(ids).toEqual([
        'montage-classic-cell-3', 'montage-classic-cell-1', 'montage-classic-cell-2',
      ]);
    });
  });

  it('POSTs the arrangement when Save Layout is confirmed', async () => {
    const user = userEvent.setup();
    stub();
    vi.spyOn(window, 'prompt').mockReturnValue('  Morning wall  ');
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post('/api/v3/montage_layouts', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 44, name: 'Morning wall', user_id: 7, positions: SAVED_POSITIONS });
      }),
    );
    await mount();

    await screen.findByTestId('montage-classic-grid');
    await user.click(screen.getByRole('button', { name: 'Edit Layout' }));
    await user.click(await screen.findByRole('button', { name: 'Save Layout' }));

    await waitFor(() => expect(body).toBeDefined());
    expect(body!.name).toBe('Morning wall');
    expect(body!.user_id).toBe(7);
    expect(JSON.parse(String(body!.positions))).toMatchObject({ dashboard: { version: 1 } });

    // Edit mode closes again once the layout is stored.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Layout' })).toBeInTheDocument());
  });

  it('does not POST when the layout-name prompt is cancelled', async () => {
    const user = userEvent.setup();
    stub();
    vi.spyOn(window, 'prompt').mockReturnValue(null);
    const posts: unknown[] = [];
    server.use(http.post('/api/v3/montage_layouts', async ({ request }) => {
      posts.push(await request.json());
      return HttpResponse.json({ id: 44, name: 'x', user_id: 7, positions: SAVED_POSITIONS });
    }));
    await mount();

    await screen.findByTestId('montage-classic-grid');
    await user.click(screen.getByRole('button', { name: 'Edit Layout' }));
    await user.click(await screen.findByRole('button', { name: 'Save Layout' }));

    await new Promise((r) => setTimeout(r, 20));
    expect(posts).toEqual([]);
  });

  it('Cancel leaves edit mode without saving', async () => {
    const user = userEvent.setup();
    stub();
    await mount();

    await screen.findByTestId('montage-classic-grid');
    await user.click(screen.getByRole('button', { name: 'Edit Layout' }));
    expect(await screen.findByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('button', { name: 'Edit Layout' })).toBeInTheDocument();
  });

  it('Delete layout is disabled on a preset and DELETEs a saved one after confirm', async () => {
    const user = userEvent.setup();
    stub();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const deleted: string[] = [];
    server.use(
      http.delete('/api/v3/montage_layouts/:id', ({ params }) => {
        deleted.push(String(params.id));
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await mount();

    const select = await screen.findByRole('combobox', { name: 'Layout' });
    expect(screen.getByRole('button', { name: 'Delete layout' })).toBeDisabled();

    await waitFor(() => expect(within(select).getByRole('option', { name: 'Night wall' })).toBeInTheDocument());
    await user.selectOptions(select, 'saved:12');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete layout' })).toBeEnabled());

    await user.click(screen.getByRole('button', { name: 'Delete layout' }));
    await waitFor(() => expect(deleted).toEqual(['12']));
  });

  it('switches the player protocol into every cell', async () => {
    const user = userEvent.setup();
    stub();
    await mount();

    await screen.findByTestId('montage-classic-grid');
    expect(screen.getByTestId('stream-1').getAttribute('data-protocol')).toBe('webrtc');

    await user.selectOptions(screen.getByRole('combobox', { name: 'Player' }), 'hls');
    await waitFor(() => expect(screen.getByTestId('stream-1').getAttribute('data-protocol')).toBe('hls'));
  });

  it('moves the runtime caption outside the image when asked', async () => {
    const user = userEvent.setup();
    stub();
    await mount();

    await screen.findByTestId('montage-classic-grid');
    expect(screen.queryByTestId('montage-classic-status-1')).toBeNull();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Monitor status position' }), 'outside');
    const caption = await screen.findByTestId('montage-classic-status-1');
    expect(caption).toHaveTextContent('Connected');
    expect(caption).toHaveTextContent('10.5 fps');
  });

  it('applies ?group= from the URL to the shared filter', async () => {
    mockSearch = { group: 5 };
    stub();
    await mount();

    // Only monitor 1 is in group 5.
    await waitFor(() => expect(screen.getByTestId('montage-classic-cell-1')).toBeInTheDocument());
    expect(screen.queryByTestId('montage-classic-cell-2')).toBeNull();
    expect(useMonitorFilterStore.getState().groupIds).toEqual([5]);
  });
});
