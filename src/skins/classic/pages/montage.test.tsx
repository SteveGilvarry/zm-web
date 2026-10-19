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
import { pickChosen } from '@/test/chosen';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/components/common/toastStore';
import { useMonitorFilterStore } from '@/stores/monitorFilter';
import { useMonitorFilterRowStore } from '@/stores/monitorFilterRow';
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
  useMonitorFilterRowStore.getState().reset();
  useMontageStore.setState({
    protocol: 'webrtc', statusPosition: 'inside', showZones: false,
    montageRatio: 'auto', montageRatioById: {}, classicLayoutId: 'preset:auto',
  });
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
    http.get('/api/v3/me', () => new HttpResponse(null, { status: 404 })),
    http.get('/api/v3/servers', () => HttpResponse.json(paged([]))),
    http.get('/api/v3/storage', () => HttpResponse.json(paged([]))),
    http.get('/api/v3/monitor-status', () => HttpResponse.json(paged(STATUSES))),
    http.get('/api/v3/montage_layouts', () => HttpResponse.json(paged(layouts))),
    http.get('/api/v3/groups', () => HttpResponse.json(paged(groups))),
    http.get('/api/v3/groups-monitors', () => HttpResponse.json(paged([{ id: 1, group_id: 5, monitor_id: 1 }]))),
    http.get('/api/v3/monitors/:id/zones', ({ params }) => HttpResponse.json(paged([
      { id: Number(params.id) * 10, monitor_id: Number(params.id), name: 'Whole', type: 'Active', coords: '0,0 1919,0 1919,1079 0,1079' },
    ]))),
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

  it('draws the zone polygons over the wall once Show Zones is on', async () => {
    const user = userEvent.setup();
    stub();
    await mount();
    await screen.findByTestId('montage-classic-grid');
    expect(screen.queryAllByTestId('zones-overlay')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Show Zones' }));
    await waitFor(() => expect(screen.getAllByTestId('zones-overlay').length).toBe(3));
    expect(useMontageStore.getState().showZones).toBe(true);
  });

  it('full-screens the wall, not the whole page', async () => {
    const user = userEvent.setup();
    stub();
    await mount();
    const grid = await screen.findByTestId('montage-classic-grid');
    const wall = grid.closest('div[class*="flex-1"]')!;
    const request = vi.fn().mockResolvedValue(undefined);
    (wall as HTMLElement).requestFullscreen = request;

    await user.click(screen.getByRole('button', { name: 'Fullscreen' }));
    expect(request).toHaveBeenCalled();
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
    // Legacy montage.php has no Fit button — that lives on Montage Review.
    expect(screen.queryByRole('button', { name: 'Fit' })).toBeNull();
  });

  it('narrows the wall through the filter row', async () => {
    const user = userEvent.setup();
    stub();
    await mount();

    await screen.findByTestId('montage-classic-cell-2');
    await pickChosen(user, 'Monitor', /^2 /);

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

  it('lets a system-View user save their own layout but not delete one', async () => {
    const user = userEvent.setup();
    signIn(perms({ system: 'View' }));
    stub();
    const deleted: string[] = [];
    server.use(http.delete('/api/v3/montage_layouts/:id', ({ params }) => {
      deleted.push(String(params.id));
      return new HttpResponse(null, { status: 204 });
    }));
    await mount();

    await screen.findByTestId('montage-classic-grid');
    // Legacy `save_layout` is open to any user; only `delete_layout` calls
    // `enoperm()`. The button is still there, and answers with that modal.
    expect(screen.getByRole('button', { name: 'Edit Layout' })).toBeInTheDocument();
    const select = screen.getByRole('combobox', { name: 'Layout' });
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Night wall' })).toBeInTheDocument());
    await user.selectOptions(select, 'saved:12');
    await user.click(screen.getByRole('button', { name: 'Delete layout' }));

    const dialog = await screen.findByRole('dialog', { name: 'ZoneMinder Error' });
    expect(dialog).toHaveTextContent('You do not have permissions to access this resource.');
    await user.click(within(dialog).getAllByRole('button', { name: 'Close' }).at(-1)!);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(deleted).toEqual([]);
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

  it('the Ratio select shapes every tile', async () => {
    const user = userEvent.setup();
    stub();
    await mount();

    const cell = await screen.findByTestId('montage-classic-cell-1');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Ratio' }), '4:3');
    await waitFor(() => expect(cell.style.aspectRatio).toBe(`${4 / 3} / 1`));

    // `real` hands the camera its own shape back.
    await user.selectOptions(screen.getByRole('combobox', { name: 'Ratio' }), 'real');
    await waitFor(() => expect(cell.style.aspectRatio).toBe('1920 / 1080'));
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
    // Legacy shows an inline Name field, not a prompt(); it opens empty.
    const nameField = await screen.findByRole('textbox', { name: 'Layout name' });
    expect(nameField).toHaveValue('');
    expect(nameField).toHaveAttribute('placeholder', 'Enter new name for layout if desired');
    await user.type(nameField, 'Morning wall');
    await user.click(await screen.findByRole('button', { name: 'Save' }));

    await waitFor(() => expect(body).toBeDefined());
    expect(body!.name).toBe('Morning wall');
    expect(body!.user_id).toBe(7);
    expect(JSON.parse(String(body!.positions))).toMatchObject({ dashboard: { version: 1 } });

    // Edit mode closes again once the layout is stored.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Layout' })).toBeInTheDocument());
  });

  it('Save with the Name empty overwrites the selected layout instead of adding one', async () => {
    const user = userEvent.setup();
    stub();
    const posts: unknown[] = [];
    const patches: Array<{ id: string; body: Record<string, unknown> }> = [];
    server.use(
      http.post('/api/v3/montage_layouts', async ({ request }) => {
        posts.push(await request.json());
        return HttpResponse.json({ id: 44, name: 'x', user_id: 7, positions: SAVED_POSITIONS });
      }),
      http.patch('/api/v3/montage_layouts/:id', async ({ params, request }) => {
        patches.push({ id: String(params.id), body: (await request.json()) as Record<string, unknown> });
        return HttpResponse.json({ id: 12, name: 'Night wall', user_id: 7, positions: SAVED_POSITIONS });
      }),
    );
    await mount();

    const select = await screen.findByRole('combobox', { name: 'Layout' });
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Night wall' })).toBeInTheDocument());
    await user.selectOptions(select, 'saved:12');
    await user.click(screen.getByRole('button', { name: 'Edit Layout' }));
    // The layout is this user's: no "you may not edit" notice.
    expect(screen.queryByRole('alert')).toBeNull();
    await user.click(await screen.findByRole('button', { name: 'Save' }));

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].id).toBe('12');
    expect(patches[0].body).not.toHaveProperty('name');
    expect(JSON.parse(String(patches[0].body.positions))).toHaveProperty('gridStack');
    expect(posts).toEqual([]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Layout' })).toBeInTheDocument());
  });

  it('Edit Layout on a preset says it cannot be overwritten, and an empty Save is refused', async () => {
    const user = userEvent.setup();
    stub();
    await mount();

    await screen.findByTestId('montage-classic-grid');
    await user.click(screen.getByRole('button', { name: 'Edit Layout' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You may not edit this layout, but you can create a new one from it. Please give it a name.');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/cannot edit the built in layouts/));
  });

  it('Edit Layout resizes a tile on the 48-column canvas and saves its gridStack', async () => {
    const user = userEvent.setup();
    stub();
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post('/api/v3/montage_layouts', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 45, name: 'Wide left', user_id: 7, positions: SAVED_POSITIONS });
      }),
    );
    await mount();

    const grid = await screen.findByTestId('montage-classic-grid');
    await user.click(screen.getByRole('button', { name: 'Edit Layout' }));
    // Three tiles, 16 columns each, until a handle is dragged.
    expect(grid).toHaveAttribute('data-columns', '48');
    const handle = await screen.findByRole('slider', { name: 'Width of Cam 1 in grid columns' });
    expect(handle).toHaveAttribute('aria-valuenow', '16');
    // Keyboard resize — jsdom lays nothing out, so a pointer drag has no
    // column width to measure against; the handle takes arrow keys too.
    await user.click(handle);
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}');
    await waitFor(() => expect(screen.getByTestId('montage-classic-cell-1')).toHaveStyle({ gridColumn: '1 / span 24' }));

    await user.type(await screen.findByRole('textbox', { name: 'Layout name' }), 'Wide left');
    await user.click(await screen.findByRole('button', { name: 'Save' }));

    await waitFor(() => expect(body).toBeDefined());
    const positions = JSON.parse(String(body!.positions));
    expect(positions.gridStack).toEqual([
      { id: '1', x: 0, y: 0, w: 24, h: 100 },
      { id: '2', x: 24, y: 0, w: 16, h: 100 },
      { id: '3', x: 0, y: 100, w: 16, h: 100 },
    ]);
  });

  it('refuses a name that collides with a built-in layout', async () => {
    const user = userEvent.setup();
    stub();
    const posts: unknown[] = [];
    server.use(http.post('/api/v3/montage_layouts', async ({ request }) => {
      posts.push(await request.json());
      return HttpResponse.json({ id: 44, name: 'x', user_id: 7, positions: SAVED_POSITIONS });
    }));
    await mount();

    await screen.findByTestId('montage-classic-grid');
    await user.click(screen.getByRole('button', { name: 'Edit Layout' }));
    // Legacy `save_layout` refuses ZM_PRESET_LAYOUT_NAMES outright.
    await user.type(await screen.findByRole('textbox', { name: 'Layout name' }), '4 Wide');
    await user.click(await screen.findByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/conflicts with the built in layouts/i));
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
    // Legacy's Bootstrap delconfirm modal, not window.confirm.
    const dialog = await screen.findByRole('dialog', { name: 'Delete Confirmation' });
    expect(dialog).toHaveTextContent('Are you sure you wish to delete current layout?');
    expect(deleted).toEqual([]);
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleted).toEqual(['12']));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
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

describe('ClassicMontagePage — old-format layouts', () => {
  it('lists a pre-2024 layout and opens Error reading Layout when it is chosen', async () => {
    const user = userEvent.setup();
    stub({ layouts: [
      { id: 12, name: 'Night wall', user_id: 7, positions: SAVED_POSITIONS },
      { id: 15, name: 'Old wall', user_id: 7, positions: '{ "mId1":{"width":"50%"} }' },
    ] });
    await mount();

    const select = await screen.findByRole('combobox', { name: 'Layout' });
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Old wall' })).toBeInTheDocument());
    await user.selectOptions(select, 'saved:15');
    const dialog = await screen.findByRole('dialog', { name: 'Error reading Layout' });
    expect(dialog).toHaveTextContent('It is necessary to place monitors again and resave the Layout.');
    await user.click(within(dialog).getAllByRole('button', { name: 'Close' }).at(-1)!);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByTestId('montage-classic-grid')).toHaveAttribute('data-columns', '4');
  });
});

describe('ClassicMontagePage — viewing timeout', () => {
  it('stops every stream after ZM_WEB_VIEWING_TIMEOUT and asks, then starts them again', async () => {
    const user = userEvent.setup();
    stub();
    server.use(http.get('/api/v3/configs', () => HttpResponse.json(paged([
      { id: 1, name: 'ZM_WEB_VIEWING_TIMEOUT', value: '1' },
    ]))));
    await mount();
    await screen.findByTestId('stream-1');

    const dialog = await screen.findByRole('dialog', { name: 'Are you still watching?' }, { timeout: 3000 });
    expect(screen.queryByTestId('stream-1')).toBeNull();
    expect(screen.getByTestId('montage-classic-stopped-1')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Yes' }));
    await waitFor(() => expect(screen.getByTestId('stream-1')).toBeInTheDocument());
  });
});

describe('ClassicMontagePage — header flip and URL params', () => {
  afterEach(() => { useMontageStore.setState({ montagePanelOpen: true }); });

  it('the #mfbflip icon folds the filter + controls panel and remembers it', async () => {
    const user = userEvent.setup();
    stub();
    await mount();

    await screen.findByTestId('montage-classic-grid');
    const flip = screen.getByRole('button', { name: 'Hide filters' });
    expect(flip).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('combobox', { name: 'Layout' })).toBeInTheDocument();

    await user.click(flip);
    expect(screen.queryByRole('combobox', { name: 'Layout' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Show filters' })).toHaveAttribute('aria-expanded', 'false');
    expect(useMontageStore.getState().montagePanelOpen).toBe(false);
    // The wall stays.
    expect(screen.getByTestId('montage-classic-grid')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show filters' }));
    expect(screen.getByRole('combobox', { name: 'Layout' })).toBeInTheDocument();
  });

  it('?header=0 leaves the whole band out (kiosk)', async () => {
    mockSearch = { header: '0' };
    stub();
    await mount();

    await screen.findByTestId('montage-classic-grid');
    expect(screen.queryByRole('button', { name: 'Hide filters' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Layout' })).toBeNull();
  });

  it('?layout= selects that MontageLayouts row once the list loads', async () => {
    mockSearch = { layout: 12 };
    stub();
    await mount();

    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Layout' })).toHaveValue('saved:12'));
    expect(useMontageStore.getState().classicLayoutId).toBe('saved:12');
  });

  it('?layout= naming a legacy preset row picks the built-in preset', async () => {
    mockSearch = { layout: 3 };
    stub({ layouts: [
      { id: 3, name: '4 Wide', user_id: 0, positions: '{ "default":{"float":"left", "width":"25%"} }' },
      { id: 12, name: 'Night wall', user_id: 7, positions: SAVED_POSITIONS },
    ] });
    await mount();

    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Layout' })).toHaveValue('preset:4w'));
  });

  it('?show_zones=1 and ?status_position= override the saved choices', async () => {
    mockSearch = { show_zones: 1, status_position: 'outsideImgBottom' };
    stub();
    await mount();

    await screen.findByTestId('montage-classic-grid');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Show Zones' })).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByRole('combobox', { name: 'Monitor status position' })).toHaveValue('outside');
    expect(await screen.findByTestId('montage-classic-status-1')).toBeInTheDocument();
  });
});
