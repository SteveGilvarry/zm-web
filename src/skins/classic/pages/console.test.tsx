/**
 * Integration tests for the Console page (classic skin) — the legacy
 * `?view=console` table: the monitor rows and their cells, the verb toolbar
 * and what each verb sends to the backend, column visibility, search, the
 * filter row, paging and the footer totals.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { configListHandler } from '@/test/msw/handlers';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import { useMonitorFilterStore } from '@/stores/monitorFilter';
import { useConsoleColumnsStore } from '@/features/console/consoleColumns';
import { useToastStore } from '@/components/common/toastStore';

/* ---------------------------------------------------------------- router */

let mockSearch: Record<string, unknown> = {};
const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useSearch: () => mockSearch,
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

const MONITORS = [
  {
    id: 1, name: 'Front Door', sequence: 1, capturing: 'Always', analysing: 'Always',
    recording: 'OnMotion', type: 'Ffmpeg', path: 'rtsp://10.0.0.11/h264', host: null,
    device: null, width: 1920, height: 1080, orientation: 'ROTATE_0', server_id: 1,
    storage_id: 1, manufacturer_id: 7, model_id: 9, zone_count: 2, onvif_event_listener: 0,
    enabled: 1, decoding_enabled: 1, method: 'system', function: 'Modect',
  },
  {
    id: 2, name: 'Driveway', sequence: 2, capturing: 'Always', analysing: 'None',
    recording: 'None', type: 'Ffmpeg', path: null, host: '10.0.0.12', device: null,
    width: 2560, height: 1440, orientation: 'ROTATE_90', server_id: null,
    storage_id: 1, manufacturer_id: null, model_id: null, zone_count: 1,
    onvif_event_listener: 0, enabled: 1, decoding_enabled: 1, method: 'system',
    function: 'Monitor',
  },
  {
    id: 3, name: 'Garage', sequence: 3, capturing: 'None', analysing: 'None',
    recording: 'None', type: 'Local', path: null, host: null, device: '/dev/video0',
    width: 640, height: 480, orientation: 'ROTATE_0', server_id: 1, storage_id: 1,
    manufacturer_id: null, model_id: null, zone_count: 0, onvif_event_listener: 0,
    enabled: 0, decoding_enabled: 0, method: 'system', function: 'None',
  },
];

const summary = (monitor_id: number, over: Record<string, number> = {}) => ({
  monitor_id,
  total_events: 0, total_event_disk_space: 0,
  hour_events: 0, hour_event_disk_space: 0,
  day_events: 0, day_event_disk_space: 0,
  week_events: 0, week_event_disk_space: 0,
  month_events: 0, month_event_disk_space: 0,
  archived_events: 0, archived_event_disk_space: 0,
  ...over,
});

const SUMMARIES = [
  summary(1, { total_events: 30, total_event_disk_space: 2_097_152, hour_events: 7, day_events: 12, archived_events: 3 }),
  summary(2, { total_events: 4, total_event_disk_space: 1_048_576, hour_events: 0, day_events: 1 }),
];

const STATUSES = [
  { monitor_id: 1, status: 'Connected', capture_fps: '10.00', analysis_fps: '5.00', capture_bandwidth: 2048, updated_on: '2026-08-21T00:00:00Z' },
  { monitor_id: 2, status: 'Running', capture_fps: '0.00', analysis_fps: '0.00', capture_bandwidth: 0, updated_on: '2026-08-21T00:00:00Z' },
];

const DEFAULT_CONFIGS: Record<string, string> = {
  ZM_WEB_EVENTS_PER_PAGE: '25',
  ZM_WEB_LIST_THUMBS: '1',
  ZM_WEB_ID_ON_CONSOLE: '1',
};

/* ---------------------------------------------------------------- server */

const server = setupServer();

/** Everything that hit the backend during a test, as `METHOD /path`. */
let calls: Array<{ method: string; path: string; body?: unknown }> = [];

interface StubOptions {
  monitors?: unknown[];
  summaries?: unknown[];
  statuses?: unknown[];
  servers?: unknown[];
  storage?: unknown[];
  configs?: Record<string, string>;
}

function stub(options: StubOptions = {}) {
  const {
    monitors = MONITORS, summaries = SUMMARIES, statuses = STATUSES,
    servers = [{ id: 1, name: 'edge-01' }],
    // Two storage areas: the legacy Storage column only appears when there
    // is more than one and the user can edit system settings.
    storage = [{ id: 1, name: 'Default' }, { id: 2, name: 'Archive' }],
    configs = {},
  } = options;
  const cfg = { ...DEFAULT_CONFIGS, ...configs };

  server.use(
    http.get('/api/v3/monitors', () => HttpResponse.json(paged(monitors))),
    http.get('/api/v3/live/sessions', () => HttpResponse.json([])),
    http.get('/api/v3/events', () => HttpResponse.json(paged([], { per_page: 10 }))),
    http.get('/api/v3/events/counts/:hours', () => HttpResponse.json({ counts: [], hours: 24 })),
    http.get('/api/v3/daemons', () => HttpResponse.json({ daemons: [] })),
    http.get('/api/v3/system/status', () => HttpResponse.json({ running: true, daemons: [] })),
    http.get('/api/v3/event-summaries', () => HttpResponse.json(paged(summaries, { per_page: 200 }))),
    http.get('/api/v3/monitor-status', () => HttpResponse.json(paged(statuses, { per_page: 1000 }))),
    http.get('/api/v3/groups', () => HttpResponse.json(paged([{ id: 3, name: 'Front Yard' }], { per_page: 200 }))),
    http.get('/api/v3/groups-monitors', () =>
      HttpResponse.json(paged([{ id: 1, group_id: 3, monitor_id: 1 }], { per_page: 1000 }))),
    http.get('/api/v3/servers', () => HttpResponse.json(paged(servers))),
    http.get('/api/v3/storage', () => HttpResponse.json(paged(storage))),
    http.get('/api/v3/manufacturers', () => HttpResponse.json(paged([{ id: 7, name: 'Hikvision' }], { per_page: 500 }))),
    http.get('/api/v3/models', () => HttpResponse.json(paged([{ id: 9, name: 'DS-2CD' }], { per_page: 500 }))),
    configListHandler(cfg),
    // Mutations
    http.get('/api/v3/monitors/:id', ({ params }) => {
      const m = MONITORS.find((x) => x.id === Number(params.id));
      return m ? HttpResponse.json(m) : HttpResponse.json({ kind: 'NOT_FOUND' }, { status: 404 });
    }),
    http.post('/api/v3/monitors', async ({ request }) => {
      calls.push({ method: 'POST', path: '/monitors', body: await request.json() });
      return HttpResponse.json({ ...MONITORS[0], id: 99, name: 'Front Door (clone)' });
    }),
    http.patch('/api/v3/monitors/:id', async ({ params, request }) => {
      calls.push({ method: 'PATCH', path: `/monitors/${params.id}`, body: await request.json() });
      return HttpResponse.json({ ...MONITORS[0], id: Number(params.id) });
    }),
    http.delete('/api/v3/monitors/:id', ({ params }) => {
      calls.push({ method: 'DELETE', path: `/monitors/${params.id}` });
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
    accessToken: 'test', refreshToken: 'test', isAuthenticated: true,
    user: perms as never,
  });
}

beforeAll(() => { server.listen({ onUnhandledRequest: 'error' }); });
beforeEach(() => { signIn(); });
afterEach(() => {
  server.resetHandlers();
  calls = [];
  mockSearch = {};
  mockNavigate.mockReset();
  useMonitorFilterStore.getState().reset();
  useConsoleColumnsStore.getState().reset();
  useToastStore.getState().clear();
});
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

async function mount() {
  const { default: Page } = await import('./console');
  return renderWithProviders(<Page />);
}

/** Wait for the three seeded monitors to be on screen. */
async function mountAndSettle() {
  const view = await mount();
  await screen.findByTestId('console-row-1');
  await waitFor(() => expect(screen.getByTestId('console-row-3')).toBeInTheDocument());
  return view;
}

/* ----------------------------------------------------------------- tests */

describe('ClassicConsolePage — table', () => {
  it('renders one row per monitor with the legacy cell contents', async () => {
    stub();
    await mountAndSettle();

    const row1 = screen.getByTestId('console-row-1');
    // Id + Name link to Watch.
    expect(within(row1).getByRole('link', { name: '1' })).toHaveAttribute('href', '/monitors/1');
    // The Name link carries the runtime lens as an <img>, so the link is
    // reached through it rather than by a bare name match.
    await waitFor(() =>
      expect(within(row1).getByRole('img', { name: 'Connected' }).closest('a'))
        .toHaveAttribute('href', '/monitors/1'));
    expect(row1).toHaveTextContent('Front Door');
    // Function cell: the legacy multi-line summary.
    expect(within(row1).getByText('Analysing: Always')).toBeInTheDocument();
    expect(within(row1).getByText('Recording: On Motion')).toBeInTheDocument();
    // Source cell links to the editor and shows the resolved host + geometry.
    expect(within(row1).getByRole('link', { name: '10.0.0.11' }))
      .toHaveAttribute('href', '/monitors/1?edit=true');
    expect(within(row1).getByText('1920x1080')).toBeInTheDocument();
    // Server / Storage names resolved from the lookup queries.
    await waitFor(() => expect(within(row1).getByText('edge-01')).toBeInTheDocument());
    expect(within(row1).getByText('Default')).toBeInTheDocument();
    // Events count links to a monitor-scoped events list; archived carries the flag.
    expect(within(row1).getByRole('link', { name: '30' })).toHaveAttribute('href', '/events?monitor_id=1');
    expect(within(row1).getByRole('link', { name: '3' })).toHaveAttribute('href', '/events?monitor_id=1&archived=true');
    // Zones cell links to the zone editor.
    expect(within(row1).getByRole('link', { name: '2' })).toHaveAttribute('href', '/monitors/1/zones');

    // A capturing-off monitor reads "Offline" and gets no thumbnail link.
    const row3 = screen.getByTestId('console-row-3');
    expect(within(row3).getByText('Offline')).toBeInTheDocument();
    expect(within(row3).queryByRole('link', { name: /Watch Garage/ })).toBeNull();
    // Local monitors show their device as the source.
    expect(within(row3).getByRole('link', { name: '/dev/video0' })).toBeInTheDocument();
  });

  it('shows the runtime lens label, per-monitor fps/bandwidth and the status pills', async () => {
    stub();
    await mountAndSettle();

    const row1 = screen.getByTestId('console-row-1');
    expect(within(row1).getByRole('img', { name: 'Connected' })).toBeInTheDocument();
    // ZoneMinder's formatting, not ours: the stored decimal echoed verbatim
    // and `human_filesize()` with a rate suffix — two places, no space,
    // lowercase k. Checked against 1.39.16 (`9.89 fps 1.43MB/s`).
    expect(within(row1).getByTestId('console-runtime-1')).toHaveTextContent('10.00 fps');
    expect(within(row1).getByTestId('console-runtime-1')).toHaveTextContent('2.00kB/s');

    // Garage is not capturing at all, so the lens reads Not Running.
    const row3 = screen.getByTestId('console-row-3');
    expect(within(row3).getByRole('img', { name: 'Not Running' })).toBeInTheDocument();

    const pills = screen.getByTestId('console-status-pills');
    expect(pills).toHaveTextContent('Capturing 33.3%');   // monitor 1 — Connected
    expect(pills).toHaveTextContent('Not Capturing 33.3%'); // monitor 2 — Running
    expect(pills).toHaveTextContent('Unknown 33.3%');     // monitor 3 — no row
  });

  it('totals the visible rows in the footer', async () => {
    stub();
    await mountAndSettle();

    const foot = screen.getByTestId('console-classic-table').querySelector('tfoot')!;
    expect(within(foot).getByText('Total: 3')).toBeInTheDocument();
    // 30 + 4 total events, 3 MB of disk between them.
    expect(within(foot).getByText('34')).toBeInTheDocument();
    expect(within(foot).getByText('3.00MB')).toBeInTheDocument();
    // Two footer cells read 3: archived events (3) and zones (2 + 1 + 0).
    expect(within(foot).getAllByText('3')).toHaveLength(2);
    // Runtime totals cell: aggregate bandwidth and fps.
    // Summed fps prints as PHP would: trailing zeros dropped, so 5 not 5.00.
    expect(within(foot).getByTestId('console-runtime-totals')).toHaveTextContent('2.00kB/s 10 fps / 5 fps');
  });

  it('sorts by a column header and flips direction on a second click', async () => {
    const user = userEvent.setup();
    stub();
    await mountAndSettle();

    const ids = () => screen.getAllByTestId(/^console-row-/).map((r) => r.dataset.testid);
    expect(ids()).toEqual(['console-row-1', 'console-row-2', 'console-row-3']);

    await user.click(screen.getByRole('button', { name: 'Name' }));
    expect(ids()).toEqual(['console-row-2', 'console-row-1', 'console-row-3']);
    expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute('aria-sort', 'ascending');

    await user.click(screen.getByRole('button', { name: 'Name' }));
    expect(ids()).toEqual(['console-row-3', 'console-row-1', 'console-row-2']);
    expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute('aria-sort', 'descending');

    // The dedicated reset button puts the sequence order back.
    await user.click(screen.getByRole('button', { name: 'Reset sort order' }));
    expect(ids()).toEqual(['console-row-1', 'console-row-2', 'console-row-3']);
  });
});

describe('ClassicConsolePage — search, filter row and paging', () => {
  it('narrows the rows with the search box', async () => {
    const user = userEvent.setup();
    stub();
    await mountAndSettle();

    await user.type(screen.getByRole('searchbox', { name: 'Search monitors' }), 'drive');
    await waitFor(() => expect(screen.queryByTestId('console-row-1')).toBeNull());
    expect(screen.getByTestId('console-row-2')).toBeInTheDocument();
    expect(screen.getByTestId('console-classic-table').querySelector('tfoot')).toHaveTextContent('Total: 1');
  });

  it('narrows the rows with the legacy filter row and can be hidden', async () => {
    const user = userEvent.setup();
    stub();
    await mountAndSettle();

    expect(screen.getByRole('group', { name: 'Monitor filter bar' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Recording'), 'OnMotion');
    await waitFor(() => expect(screen.queryByTestId('console-row-2')).toBeNull());
    expect(screen.getByTestId('console-row-1')).toBeInTheDocument();

    // Clearing the field with the × restores every row.
    await user.click(screen.getByRole('button', { name: 'Clear recording' }));
    await waitFor(() => expect(screen.getByTestId('console-row-2')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Hide filters' }));
    expect(screen.queryByRole('group', { name: 'Monitor filter bar' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Show filters' }));
    expect(screen.getByRole('group', { name: 'Monitor filter bar' })).toBeInTheDocument();
  });

  it('pages at ZM_WEB_EVENTS_PER_PAGE and honours the rows-per-page select', async () => {
    const user = userEvent.setup();
    stub({ configs: { ZM_WEB_EVENTS_PER_PAGE: '2' } });
    await mount();
    await screen.findByTestId('console-row-1');

    await waitFor(() => expect(screen.queryByTestId('console-row-3')).toBeNull());
    expect(screen.getByText('Showing 1 to 2 of 3 rows')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '2' }));
    await waitFor(() => expect(screen.getByTestId('console-row-3')).toBeInTheDocument());
    expect(screen.queryByTestId('console-row-1')).toBeNull();

    await user.selectOptions(screen.getByLabelText('Rows per page'), '10');
    await waitFor(() => expect(screen.getByTestId('console-row-1')).toBeInTheDocument());
    expect(screen.getByText('Showing 1 to 3 of 3 rows')).toBeInTheDocument();
  });
});

describe('ClassicConsolePage — columns and export', () => {
  it('hides a column from the Columns menu and restores it with Reset columns', async () => {
    const user = userEvent.setup();
    stub();
    await mountAndSettle();

    expect(screen.getByRole('columnheader', { name: /Source/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Columns' }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Source' }));
    await waitFor(() => expect(screen.queryByRole('columnheader', { name: /Source/ })).toBeNull());

    await user.click(screen.getByRole('menuitem', { name: 'Reset columns' }));
    await waitFor(() => expect(screen.getByRole('columnheader', { name: /Source/ })).toBeInTheDocument());
  });

  it('turning on a lookup column fetches its names', async () => {
    const user = userEvent.setup();
    stub();
    await mountAndSettle();

    await user.click(screen.getByRole('button', { name: 'Columns' }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Manufacturer' }));
    await waitFor(() =>
      expect(within(screen.getByTestId('console-row-1')).getByText('Hikvision')).toBeInTheDocument());
    // Monitor 2 has no manufacturer id — legacy shows an em dash.
    expect(within(screen.getByTestId('console-row-2')).getAllByText('—').length).toBeGreaterThan(0);
  });

  it('exports the rows as CSV and JSON', async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn(() => 'blob:console');
    const original = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true, writable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true, writable: true });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      stub();
      await mountAndSettle();

      await user.click(screen.getByRole('button', { name: 'Export' }));
      await user.click(screen.getByRole('menuitem', { name: 'Export CSV' }));
      expect(click).toHaveBeenCalledTimes(1);

      await user.click(screen.getByRole('menuitem', { name: 'Export JSON' }));
      expect(click).toHaveBeenCalledTimes(2);
      expect(createObjectURL).toHaveBeenCalledTimes(2);
    } finally {
      click.mockRestore();
      if (original) Object.defineProperty(URL, 'createObjectURL', original);
    }
  });
});

describe('ClassicConsolePage — verbs', () => {
  it('shows the edit verbs only with monitors:Edit', async () => {
    stub();
    await mountAndSettle();
    for (const name of ['Add', 'Clone', 'Edit', 'Delete', 'Select', 'Sort']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.getByRole('checkbox', { name: 'Select all monitors on this page' })).toBeInTheDocument();
  });

  it('hides the edit verbs and the selection column for a view-only user', async () => {
    signIn({ iat: 0, exp: 0, user: 'viewer', perms: { monitors: 'View' } });
    stub();
    await mountAndSettle();

    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Select all monitors on this page' })).toBeNull();
    // The read-only table is still there.
    expect(screen.getByTestId('console-classic-table')).toBeInTheDocument();
  });

  it('deletes the selected monitors after confirming', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    try {
      stub();
      await mountAndSettle();

      expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
      await user.click(screen.getByRole('checkbox', { name: 'Select Front Door' }));
      await user.click(screen.getByRole('checkbox', { name: 'Select Driveway' }));
      await user.click(screen.getByRole('button', { name: 'Delete' }));

      expect(confirm).toHaveBeenCalledWith(
        'Delete 2 monitors? Recorded events are kept until storage reclaims them.',
      );
      await waitFor(() => expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(2));
      expect(calls.map((c) => c.path).sort()).toEqual(['/monitors/1', '/monitors/2']);
    } finally {
      confirm.mockRestore();
    }
  });

  it('does not delete when the confirm is dismissed', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    try {
      stub();
      await mountAndSettle();
      await user.click(screen.getByRole('checkbox', { name: 'Select Front Door' }));
      await user.click(screen.getByRole('button', { name: 'Delete' }));
      expect(confirm).toHaveBeenCalled();
      expect(calls).toEqual([]);
    } finally {
      confirm.mockRestore();
    }
  });

  it('clones the first selected monitor through GET + POST /monitors', async () => {
    const user = userEvent.setup();
    stub();
    await mountAndSettle();

    await user.click(screen.getByRole('checkbox', { name: 'Select Front Door' }));
    await user.click(screen.getByRole('button', { name: 'Clone' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.path).toBe('/monitors');
    expect((post.body as { name: string }).name).toBe('Front Door (clone)');
    // No <Toaster> is mounted in this unit test, so assert the toast the
    // mutation queued rather than its rendered card.
    await waitFor(() => expect(useToastStore.getState().toasts.map((x) => x.message))
      .toContain('Cloned as "Front Door (clone)"'));
  });

  it('routes Edit to the monitor editor for the first selected row', async () => {
    const user = userEvent.setup();
    stub();
    await mountAndSettle();

    await user.click(screen.getByRole('checkbox', { name: 'Select Driveway' }));
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/monitors/$monitorId', params: { monitorId: '2' }, search: { edit: true },
    });
  });

  it('applies a bulk mode change through the Select dialog', async () => {
    const user = userEvent.setup();
    stub();
    await mountAndSettle();

    await user.click(screen.getByRole('checkbox', { name: 'Select Front Door' }));
    await user.click(screen.getByRole('button', { name: 'Select' }));

    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Analysing'), 'None');
    await user.click(within(dialog).getByRole('button', { name: /Apply/ }));

    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(patch.path).toBe('/monitors/1');
    expect(patch.body).toEqual({ analysing: 'None' });
  });

  it('toggling Sort mode makes the rows draggable and renumbers on drop', async () => {
    const user = userEvent.setup();
    stub();
    await mountAndSettle();

    const sortBtn = screen.getByRole('button', { name: 'Sort' });
    expect(sortBtn).toHaveAttribute('aria-pressed', 'false');
    await user.click(sortBtn);
    expect(sortBtn).toHaveAttribute('aria-pressed', 'true');

    const row1 = screen.getByTestId('console-row-1');
    const row3 = screen.getByTestId('console-row-3');
    expect(row1).toHaveAttribute('draggable', 'true');

    const dataTransfer = { effectAllowed: '', dropEffect: '', setData: vi.fn(), getData: () => '1' };
    await user.pointer({ keys: '[MouseLeft>]', target: row1 });
    // jsdom has no real drag; fire the handlers the row installs.
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.dragStart(row1, { dataTransfer });
    fireEvent.dragOver(row3, { dataTransfer });
    fireEvent.drop(row3, { dataTransfer });

    // Moving 1 to the end renumbers 2→1, 3→2, 1→3.
    await waitFor(() => expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(3));
    expect(calls.filter((c) => c.method === 'PATCH').map((c) => [c.path, c.body])).toEqual(
      expect.arrayContaining([
        ['/monitors/2', { sequence: 1 }],
        ['/monitors/3', { sequence: 2 }],
        ['/monitors/1', { sequence: 3 }],
      ]),
    );
  });

  it('opens the Add dialog from the toolbar and from ?new=true', async () => {
    const user = userEvent.setup();
    stub();
    await mountAndSettle();
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    // Same dialog, opened by the legacy deep link.
    screen.getByRole('dialog');
    mockSearch = { new: true };
  });

  it('refreshes the monitor list', async () => {
    const user = userEvent.setup();
    let monitorFetches = 0;
    stub();
    server.use(http.get('/api/v3/monitors', () => {
      monitorFetches += 1;
      return HttpResponse.json(paged(MONITORS));
    }));
    await mountAndSettle();
    const before = monitorFetches;
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(monitorFetches).toBeGreaterThan(before));
  });
});

describe('ClassicConsolePage — empty and failure states', () => {
  it('shows the legacy empty message when no monitor is configured', async () => {
    stub({ monitors: [], summaries: [], statuses: [] });
    await mount();
    expect(await screen.findByText('No matching records found')).toBeInTheDocument();
    expect(screen.queryByTestId('console-classic-table')).toBeNull();
  });

  it('renders an alert when the monitor list 500s', async () => {
    stub();
    server.use(http.get('/api/v3/monitors', () =>
      HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'monitors table locked' }, { status: 500 })));
    await mount();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Cannot reach the server.');
    expect(screen.queryByTestId('console-classic-table')).toBeNull();
  });

  it('renders an alert when the backend is unreachable', async () => {
    stub();
    server.use(http.get('/api/v3/monitors', () => HttpResponse.error()));
    await mount();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Cannot reach the server.');
  });

  it('renders the permission notice when the monitor list is forbidden', async () => {
    stub();
    server.use(http.get('/api/v3/monitors', () =>
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
