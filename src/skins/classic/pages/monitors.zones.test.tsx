/**
 * Zones — classic skin. Legacy `?view=zones&mid=`: the picture + polygon
 * overlay, its status line and buttons, the Name / Type / Area / Mark table,
 * the Mark checkboxes driving DELETE, the permission gate and the failure
 * states. Legacy `?view=zone&mid=&zid=` (`?zid=` here): the header verbs,
 * legacy's settings rows, validation, the point table, the player select and
 * the object-size tool.
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
import { makeZone } from '@/test/fixtures';

const navigate = vi.fn();
/** What `useSearch` answers — the `?zid=` a test lands on. */
let routeSearch: Record<string, unknown> = {};

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useSearch: () => routeSearch,
  useParams: () => ({}),
  useCanGoBack: () => false,
  Link: ({ children, to, ...rest }: { children: ReactNode; to?: string; [k: string]: unknown }) => {
    // Router-only props have no meaning on an <a>.
    delete rest.params;
    delete rest.search;
    return <a href={to ?? '#'} {...rest}>{children}</a>;
  },
}));

vi.mock('@/skins/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

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

const paged = <T,>(items: T[]) => ({
  items, total: items.length, per_page: 100, current_page: 1, last_page: 1,
});

const MONITOR = {
  id: 7,
  name: 'Front Door',
  width: 1920,
  height: 1080,
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

const ZONES = [
  makeZone({
    id: 11, monitor_id: 7, name: 'All', type: 'Active', units: 'Percent',
    coords: '0,0 1920,0 1920,1080 0,1080', num_coords: 4, area: 2_073_600,
  }),
  makeZone({
    id: 12, monitor_id: 7, name: 'Porch', type: 'Exclusive', units: 'Pixels',
    coords: '0,0 960,0 960,540 0,540', num_coords: 4, area: 518_400,
    min_alarm_pixels: 3456, max_alarm_pixels: 345_600,
    min_filter_pixels: 3000, max_filter_pixels: null,
    min_blob_pixels: 2000, max_blob_pixels: null,
  }),
];

const server = setupServer();
const deleted: string[] = [];

function stubOk(zones = ZONES, monitor: Record<string, unknown> = MONITOR) {
  server.use(
    http.get('/api/v3/monitors/:id', () => HttpResponse.json(monitor)),
    http.get('/api/v3/monitors/:id/zones', () => HttpResponse.json(paged(zones))),
    http.get('/api/v3/zone-presets', () => HttpResponse.json(paged([
      { id: 1, name: 'Default', type: 'Active', units: 'Percent', check_method: 'Blobs' },
    ]))),
    http.get('/api/v3/monitor-status', () => HttpResponse.json(paged([
      { monitor_id: 7, status: 'Connected', capture_fps: '39.62', analysis_fps: '0', capture_bandwidth: 0, updated_on: '2026-10-18T00:00:00Z' },
    ]))),
    http.delete('/api/v3/zones/:id', ({ params }) => {
      deleted.push(String(params.id));
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

/** Captures the one write the zone view makes. */
function captureSave() {
  const sent: { method: string; url: string; body: Record<string, unknown> }[] = [];
  server.use(
    http.put('/api/v3/zones/:id', async ({ request, params }) => {
      sent.push({ method: 'PUT', url: `/zones/${params.id}`, body: await request.json() as Record<string, unknown> });
      return HttpResponse.json(ZONES[1]);
    }),
    http.post('/api/v3/monitors/:id/zones', async ({ request }) => {
      sent.push({ method: 'POST', url: '/monitors/7/zones', body: await request.json() as Record<string, unknown> });
      return HttpResponse.json(ZONES[1], { status: 201 });
    }),
  );
  return sent;
}

beforeAll(() => { server.listen({ onUnhandledRequest: 'error' }); });
beforeEach(() => {
  useAuthStore.setState({
    accessToken: 't', refreshToken: 't', isAuthenticated: true, user: ADMIN,
  });
  routeSearch = {};
});
afterEach(() => {
  server.resetHandlers();
  deleted.length = 0;
  useToastStore.getState().clear();
  vi.restoreAllMocks();
  window.localStorage.clear();
});
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

async function mount(monitorId = 7) {
  const { default: Page } = await import('./monitors.zones');
  return renderWithProviders(<Page monitorId={monitorId} />);
}

/** Opens a zone from the table and waits for legacy's zone page. */
async function openZone(user: ReturnType<typeof userEvent.setup>, name: string) {
  await mount();
  await user.click(await screen.findByRole('button', { name }));
  return screen.findByRole('table', { name: 'Zone settings' });
}

describe('ClassicMonitorZonesPage — the zones list', () => {
  it('renders a row per zone with its type and its measured area', async () => {
    stubOk();
    await mount();

    const table = await screen.findByRole('table', { name: 'Zones' });
    expect(await within(table).findByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(within(table).getByRole('button', { name: 'Porch' })).toBeInTheDocument();
    expect(within(table).getByText('Exclusive')).toBeInTheDocument();

    // The polygon's area, plus its share of the 1920x1080 frame.
    expect(within(table).getByText('2,073,600 / 100.00')).toBeInTheDocument();
    expect(within(table).getByText('518,400 / 25.00')).toBeInTheDocument();

    // The picture carries one polygon per zone, titled with the zone name.
    const svg = screen.getByRole('img', { name: 'Zone outlines' });
    const polygons = [...svg.querySelectorAll('polygon')];
    expect(polygons.map((p) => p.querySelector('title')?.textContent)).toEqual(['All', 'Porch']);
    expect(polygons[0].getAttribute('points')).toBe('0,0 1920,0 1920,1080 0,1080');
  });

  it('lists the zones largest first, as legacy\'s ORDER BY Area DESC does', async () => {
    stubOk([ZONES[1], ZONES[0]]);
    await mount();
    const table = await screen.findByRole('table', { name: 'Zones' });
    await within(table).findByRole('button', { name: 'All' });
    expect(within(table).getAllByRole('button').map((b) => b.textContent)).toEqual(['All', 'Porch']);
  });

  it('prints legacy\'s status line under the picture: name, state, capture rate', async () => {
    stubOk();
    await mount();
    const status = await screen.findByTestId('zones-stream-status');
    expect(status).toHaveTextContent('Front Door (id=7)');
    await waitFor(() => expect(status).toHaveTextContent('State: Connected'));
    expect(status).toHaveTextContent('39.62 fps');
  });

  it('puts legacy\'s three buttons over the picture', async () => {
    stubOk();
    await mount();
    const picture = await screen.findByTestId('zones-picture');
    expect(within(picture).getByRole('button', { name: 'Open full screen' })).toBeInTheDocument();
    expect(within(picture).getByRole('link', { name: 'Open watch page' })).toBeInTheDocument();
    expect(within(picture).getByRole('link', { name: 'Edit monitor' })).toBeInTheDocument();
  });

  it('heads the page as legacy does: Back, Refresh, then "Zones"', async () => {
    stubOk();
    await mount();
    expect(await screen.findByRole('heading', { name: 'Zones' })).toBeInTheDocument();
    // Nothing to go back to in this test's history, so Back is greyed, as
    // legacy greys it without a referrer.
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });

  it('swaps the frame size for a rotated camera', async () => {
    stubOk(ZONES, { ...MONITOR, orientation: 'ROTATE_90' });
    await mount();

    const svg = await screen.findByRole('img', { name: 'Zone outlines' });
    // View space is height x width once rotation is applied.
    expect(svg.getAttribute('viewBox')).toBe('0 0 1080 1920');
  });

  it('labels every legacy zone type', async () => {
    stubOk([
      { ...ZONES[0], id: 21, name: 'A', type: 'Active' },
      { ...ZONES[0], id: 22, name: 'B', type: 'Inclusive' },
      { ...ZONES[0], id: 23, name: 'C', type: 'Exclusive' },
      { ...ZONES[0], id: 24, name: 'D', type: 'Preclusive' },
      { ...ZONES[0], id: 25, name: 'E', type: 'Inactive' },
      { ...ZONES[0], id: 26, name: 'F', type: 'Privacy' },
      // An unknown type from a newer backend is echoed verbatim.
      { ...ZONES[0], id: 27, name: 'G', type: 'Experimental' },
    ]);
    await mount();

    const table = await screen.findByRole('table', { name: 'Zones' });
    for (const label of ['Active', 'Inclusive', 'Exclusive', 'Preclusive', 'Inactive', 'Privacy', 'Experimental']) {
      expect(within(table).getByText(label)).toBeInTheDocument();
    }
  });

  it('shows "No zones defined" when the monitor has none', async () => {
    stubOk([]);
    await mount();

    expect(await screen.findByText('No zones defined')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'All' })).toBeNull();
  });

  it('has a Mark box per zone and no mark-all, as legacy; Delete confirms and DELETEs each marked zone', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    stubOk();
    const user = userEvent.setup();
    await mount();

    const del = await screen.findByRole('button', { name: 'Delete' });
    expect(del).toBeDisabled();
    expect(screen.queryByRole('checkbox', { name: 'Mark all zones' })).toBeNull();

    await user.click(await screen.findByRole('checkbox', { name: 'Mark All' }));
    await user.click(screen.getByRole('checkbox', { name: 'Mark Porch' }));
    expect(del).toBeEnabled();

    await user.click(del);
    expect(confirm).toHaveBeenCalledOnce();
    await waitFor(() => expect(deleted.sort()).toEqual(['11', '12']));
  });

  it('does not delete when the confirmation is dismissed', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    stubOk();
    const user = userEvent.setup();
    await mount();

    await user.click(await screen.findByRole('checkbox', { name: 'Mark Porch' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(confirm).toHaveBeenCalledOnce();
    expect(deleted).toEqual([]);
  });

  it('toggling one mark off clears it again', async () => {
    stubOk();
    const user = userEvent.setup();
    await mount();

    const mark = await screen.findByRole('checkbox', { name: 'Mark Porch' });
    await user.click(mark);
    expect(mark).toBeChecked();
    await user.click(mark);
    expect(mark).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  it('flags a zone whose polygon runs outside the frame, with legacy\'s tooltip', async () => {
    stubOk([
      { ...ZONES[0], id: 13, name: 'Overshoot', coords: '0,0 4000,0 4000,4000 0,4000', num_coords: 4 },
    ]);
    await mount();

    const icon = await screen.findByLabelText('Zone extends outside the frame');
    expect(icon.parentElement).toHaveAttribute(
      'title',
      'Zone coordinates extend beyond image dimensions (1920x1080). Points have been clamped.',
    );
  });

  it('greys the verbs and marks for a monitors:View user', async () => {
    useAuthStore.setState({ user: VIEWER });
    stubOk();
    await mount();

    await screen.findByRole('button', { name: 'All' });
    expect(screen.queryByRole('button', { name: 'Add New Zone' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Mark All' })).toBeDisabled();
  });

  it('renders the backend error instead of an empty table', async () => {
    server.use(
      http.get('/api/v3/monitors/:id', () => HttpResponse.json(MONITOR)),
      http.get('/api/v3/monitor-status', () => HttpResponse.json(paged([]))),
      http.get('/api/v3/monitors/:id/zones', () =>
        HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'zones table locked' }, { status: 500 })),
    );
    await mount();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Cannot reach the server|Failed to load/);
    expect(screen.queryByRole('table', { name: 'Zones' })).toBeNull();
  });

  it('reports an unreachable server when the request never lands', async () => {
    server.use(
      http.get('/api/v3/monitors/:id', () => HttpResponse.json(MONITOR)),
      http.get('/api/v3/monitor-status', () => HttpResponse.json(paged([]))),
      http.get('/api/v3/monitors/:id/zones', () => HttpResponse.error()),
    );
    await mount();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Cannot reach the server.');
  });

  it('says the monitor was not found when the id resolves to nothing', async () => {
    server.use(
      http.get('/api/v3/monitors/:id', () =>
        HttpResponse.json({ kind: 'NOT_FOUND', error_message: 'no such monitor' }, { status: 404 })),
      http.get('/api/v3/monitor-status', () => HttpResponse.json(paged([]))),
      http.get('/api/v3/monitors/:id/zones', () => HttpResponse.json(paged([]))),
    );
    await mount(999);

    expect(await screen.findByText('Monitor not found')).toBeInTheDocument();
  });
});

describe('ClassicMonitorZonesPage — legacy\'s zone page', () => {
  it('opens from a zone name and asks the router for ?zid=', async () => {
    stubOk();
    const user = userEvent.setup();
    await openZone(user, 'Porch');
    expect(navigate).toHaveBeenCalled();
    const arg = navigate.mock.calls.at(-1)![0] as { search: (prev: Record<string, unknown>) => Record<string, unknown> };
    expect(arg.search({})).toEqual({ zid: 12 });
    expect(screen.getByRole('heading', { name: 'Monitor Front Door - Zone Porch' })).toBeInTheDocument();
    expect(screen.queryByTestId('zones-picture')).toBeNull();
  });

  it('opens straight from ?zid= in the URL', async () => {
    stubOk();
    routeSearch = { zid: 12 };
    await mount();
    expect(await screen.findByRole('heading', { name: 'Monitor Front Door - Zone Porch' })).toBeInTheDocument();
  });

  it('opens a zone by clicking its polygon on the picture, as legacy does', async () => {
    stubOk();
    const user = userEvent.setup();
    await mount();

    await waitFor(() => expect(screen.getByTestId('zones-picture')).toBeInTheDocument());
    await user.click(screen.getByTestId('zone-polygon-12'));
    expect(await screen.findByRole('heading', { name: 'Monitor Front Door - Zone Porch' })).toBeInTheDocument();
  });

  it('lays the settings out in legacy\'s rows and wording', async () => {
    stubOk();
    const user = userEvent.setup();
    const settings = await openZone(user, 'Porch');
    const labels = within(settings).getAllByRole('rowheader').map((th) => th.textContent);
    expect(labels).toEqual([
      'Name', 'Type', 'Preset', 'Alarm Colour (Red/Green/Blue)', 'Alarm Check Method',
      'Min/Max Pixel Threshold (0-255)', 'Filter Width/Height (pixels)', 'Zone Area',
      'Min/Max Alarmed Area', 'Min/Max Filtered Area', 'Min/Max Blob Area', 'Min/Max Blobs',
      'Overload Frame Ignore Count', 'Extend Alarm Frame Count',
    ]);
    // Legacy prints the check-method enum as it is.
    expect(within(settings).getByRole('option', { name: 'AlarmedPixels' })).toBeInTheDocument();
    expect(within(settings).getByRole('option', { name: 'Choose Preset' })).toBeInTheDocument();
    // No Units control: legacy sends a hidden Percent.
    expect(screen.queryByText('Units')).toBeNull();
  });

  it('shows the zone\'s values, each area threshold as % of the zone beside its pixels', async () => {
    stubOk();
    const user = userEvent.setup();
    const settings = await openZone(user, 'Porch');

    expect(within(settings).getByLabelText('Name')).toHaveValue('Porch');
    expect(within(settings).getByLabelText('Check Method')).toHaveValue('Blobs');
    expect(within(settings).getByLabelText('Red')).toHaveValue(255);
    expect(within(settings).getByLabelText('Green')).toHaveValue(0);
    // 960×540 = 518,400 px, a quarter of the frame.
    expect(within(settings).getByTestId('zone-area-percent')).toHaveTextContent('25%');
    expect(within(settings).getByTestId('zone-area-pixels')).toHaveTextContent('518400 px');
    expect(within(settings).getByLabelText('Min/Max Alarmed Area (min) (px)')).toHaveValue(3456);
    expect(within(settings).getByLabelText('Min/Max Alarmed Area (min) (%)')).toHaveValue(0.67);
    expect(within(settings).getByLabelText('Min/Max Alarmed Area (max) (%)')).toHaveValue(66.67);
  });

  it('splits the point table across two columns, as legacy does', async () => {
    stubOk();
    const user = userEvent.setup();
    await openZone(user, 'Porch');
    const tables = screen.getAllByRole('table', { name: 'Points' });
    expect(tables).toHaveLength(2);
    // Points 1 and 3 on the left, 2 and 4 on the right.
    expect(within(tables[0]).getByLabelText('Point 1 X')).toBeInTheDocument();
    expect(within(tables[0]).getByLabelText('Point 3 X')).toBeInTheDocument();
    expect(within(tables[1]).getByLabelText('Point 2 X')).toBeInTheDocument();
  });

  it('puts Save, Reset and Cancel in the header; Reset waits for a change and undoes it', async () => {
    stubOk();
    const user = userEvent.setup();
    const settings = await openZone(user, 'Porch');
    const reset = screen.getByRole('button', { name: 'Reset' });
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(reset).toBeDisabled();

    const name = within(settings).getByLabelText('Name');
    await user.type(name, ' 2');
    expect(reset).toBeEnabled();
    await user.click(reset);
    expect(name).toHaveValue('Porch');
    expect(reset).toBeDisabled();
  });

  it('Refresh drops the edits and fetches the zone again, as legacy\'s reload does', async () => {
    stubOk();
    let fetches = 0;
    server.use(http.get('/api/v3/monitors/:id/zones', () => {
      fetches += 1;
      return HttpResponse.json(paged(ZONES));
    }));
    const user = userEvent.setup();
    const settings = await openZone(user, 'Porch');
    const before = fetches;
    await user.type(within(settings).getByLabelText('Name'), ' 2');
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(within(settings).getByLabelText('Name')).toHaveValue('Porch');
    await waitFor(() => expect(fetches).toBeGreaterThan(before));
  });

  it('Cancel goes back to the zones list without saving', async () => {
    stubOk();
    const sent = captureSave();
    const user = userEvent.setup();
    await openZone(user, 'Porch');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('table', { name: 'Zones' })).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it('saves through PUT /zones/{id}, then goes back to the zones list as 1.39.41 does', async () => {
    stubOk();
    const sent = captureSave();
    const user = userEvent.setup();
    const settings = await openZone(user, 'Porch');
    const name = within(settings).getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Front porch');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({
      method: 'PUT',
      url: '/zones/12',
      body: { name: 'Front porch', type: 'Exclusive', units: 'Percent', coords: '0,0 960,0 960,540 0,540', min_alarm_pixels: 3456 },
    });
    expect(await screen.findByRole('table', { name: 'Zones' })).toBeInTheDocument();
  });

  it('refuses to save what validateForm refuses, listing why', async () => {
    stubOk();
    const sent = captureSave();
    const user = userEvent.setup();
    const settings = await openZone(user, 'Porch');
    const min = within(settings).getByLabelText('Min/Max Filtered Area (min) (px)');
    await user.clear(min);
    await user.type(min, '5000');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('alert', { name: 'Cannot save the zone' })).toHaveTextContent(
      'Minimum filter area should be less than or equal to minimum alarm area',
    );
    expect(sent).toHaveLength(0);
  });

  it('opens a new zone from Add New Zone, named "New", and creates it', async () => {
    stubOk();
    const sent = captureSave();
    const user = userEvent.setup();
    await mount();
    await user.click(await screen.findByRole('button', { name: 'Add New Zone' }));
    expect(await screen.findByRole('heading', { name: 'Monitor Front Door - Zone New' })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Type'), 'Inactive');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({
      method: 'POST',
      body: { name: 'New', type: 'Inactive', units: 'Percent', coords: '0,0 1919,0 1919,1079 0,1079' },
    });
  });

  it('alerts that capture restarts after saving a Privacy zone, as legacy does', async () => {
    stubOk();
    const sent = captureSave();
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();
    await openZone(user, 'Porch');
    await user.selectOptions(screen.getByLabelText('Type'), 'Privacy');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    await waitFor(() => expect(alert).toHaveBeenCalledWith(
      'Capture process for this monitor will be restarted for the Privacy zone changes to take effect.',
    ));
  });

  it('greys Save for a monitors:View user', async () => {
    useAuthStore.setState({ user: VIEWER });
    stubOk();
    const user = userEvent.setup();
    await openZone(user, 'Porch');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('offers the players zm-api can serve and remembers the choice', async () => {
    stubOk();
    const user = userEvent.setup();
    await openZone(user, 'Porch');
    const player = screen.getByLabelText('Player');
    expect([...(player as HTMLSelectElement).options].map((o) => o.textContent))
      .toEqual(['Auto', 'Still images', 'WebRTC', 'HLS']);
    await user.selectOptions(player, 'stills');
    expect(window.localStorage.getItem('zmZonePlayer')).toBe('stills');
  });

  it('measures an object typed in by size and derives the thresholds, with undo', async () => {
    stubOk();
    const user = userEvent.setup();
    const settings = await openZone(user, 'Porch');
    expect(screen.queryByRole('table', { name: 'Rectangle measurement' })).toBeNull();

    await user.click(screen.getByRole('button', {
      name: 'Drag a box around the smallest object that should trigger an alarm, or type its size below',
    }));
    const rect = screen.getByRole('table', { name: 'Rectangle measurement' });
    await user.type(within(rect).getByLabelText('Object width in pixels'), '100');
    await user.type(within(rect).getByLabelText('Object height in pixels'), '80');
    await user.click(within(rect).getByRole('button', { name: 'Apply' }));

    // 8,000 px box: 25% alarms, 70% of that filters, 86% of that is the blob.
    expect(within(settings).getByLabelText('Min/Max Alarmed Area (min) (px)')).toHaveValue(2000);
    expect(within(settings).getByLabelText('Min/Max Filtered Area (min) (px)')).toHaveValue(1400);
    expect(within(settings).getByLabelText('Min/Max Blob Area (min) (px)')).toHaveValue(1204);
    expect(within(settings).getByLabelText('Min/Max Alarmed Area (max) (px)')).toHaveValue(null);
    expect(screen.getByTestId('zone-measure-box')).toHaveTextContent('100×80 = 8,000 px');

    await user.click(screen.getByRole('button', { name: 'Undo the last object measurement' }));
    expect(within(settings).getByLabelText('Min/Max Alarmed Area (min) (px)')).toHaveValue(3456);
    expect(within(settings).getByLabelText('Min/Max Alarmed Area (max) (px)')).toHaveValue(345600);
  });

  it('refuses to measure for a zone that detects nothing', async () => {
    stubOk();
    const user = userEvent.setup();
    await openZone(user, 'Porch');
    await user.selectOptions(screen.getByLabelText('Type'), 'Privacy');
    await user.click(screen.getByRole('button', {
      name: 'Drag a box around the smallest object that should trigger an alarm, or type its size below',
    }));
    expect(screen.getByRole('alert')).toHaveTextContent('Object measuring does not apply to Inactive or Privacy zones');
  });
});
