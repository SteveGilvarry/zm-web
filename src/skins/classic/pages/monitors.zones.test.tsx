/**
 * Zones — classic skin (legacy `?view=zones&mid=`). Covers the picture +
 * polygon overlay, the Name / Type / Area / Mark table, the Mark checkboxes
 * driving DELETE, the permission gate on the verbs, and the failure states.
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

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
  useParams: () => ({}),
  Link: ({ children, to, ...rest }: { children: ReactNode; to?: string; [k: string]: unknown }) => (
    <a href={to ?? '#'} {...rest}>{children}</a>
  ),
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

/**
 * Zone coords are "x,y x,y …" in view space; `area` is ZoneMinder's own
 * stored `Zones.Area`, which is what the Area column prints — the polygon is
 * never recounted here.
 */
const ZONES = [
  makeZone({
    id: 11, monitor_id: 7, name: 'All', type: 'Active', units: 'Percent',
    coords: '0,0 1920,0 1920,1080 0,1080', num_coords: 4, area: 2_073_600,
  }),
  makeZone({
    id: 12, monitor_id: 7, name: 'Porch', type: 'Exclusive', units: 'Pixels',
    coords: '0,0 960,0 960,540 0,540', num_coords: 4, area: 518_400,
    min_alarm_pixels: 3456, max_alarm_pixels: 691_200,
  }),
];

const server = setupServer();
const deleted: string[] = [];

function stubOk(zones = ZONES, monitor: Record<string, unknown> = MONITOR) {
  server.use(
    http.get('/api/v3/monitors/:id', () => HttpResponse.json(monitor)),
    http.get('/api/v3/monitors/:id/zones', () => HttpResponse.json(paged(zones))),
    http.get('/api/v3/zone-presets', () => HttpResponse.json(paged([]))),
    http.delete('/api/v3/zones/:id', ({ params }) => {
      deleted.push(String(params.id));
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

beforeAll(() => { server.listen({ onUnhandledRequest: 'error' }); });
beforeEach(() => {
  useAuthStore.setState({
    accessToken: 't', refreshToken: 't', isAuthenticated: true, user: ADMIN,
  });
});
afterEach(() => {
  server.resetHandlers();
  deleted.length = 0;
  useToastStore.getState().clear();
  vi.restoreAllMocks();
});
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

async function mount(monitorId = 7) {
  const { default: Page } = await import('./monitors.zones');
  return renderWithProviders(<Page monitorId={monitorId} />);
}

describe('ClassicMonitorZonesPage', () => {
  it('renders a row per zone with its type and the backend\'s area', async () => {
    stubOk();
    await mount();

    const table = await screen.findByRole('table', { name: 'Zones' });
    expect(await within(table).findByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(within(table).getByRole('button', { name: 'Porch' })).toBeInTheDocument();
    expect(within(table).getByText('Exclusive')).toBeInTheDocument();

    // Zones.Area straight from the API, plus its share of the 1920x1080 frame.
    expect(within(table).getByText('2,073,600 / 100.00')).toBeInTheDocument();
    expect(within(table).getByText('518,400 / 25.00')).toBeInTheDocument();

    // The picture carries one polygon per zone, titled with the zone name.
    const svg = screen.getByRole('img', { name: 'Zone outlines' });
    const polygons = [...svg.querySelectorAll('polygon')];
    expect(polygons.map((p) => p.querySelector('title')?.textContent)).toEqual(['All', 'Porch']);
    expect(polygons[0].getAttribute('points')).toBe('0,0 1920,0 1920,1080 0,1080');
    expect(screen.getByText('Front Door (id=7)')).toBeInTheDocument();
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

  it('marks all zones, then Delete confirms and DELETEs each marked zone', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    stubOk();
    const user = userEvent.setup();
    await mount();

    const del = await screen.findByRole('button', { name: 'Delete' });
    expect(del).toBeDisabled();

    await user.click(await screen.findByRole('checkbox', { name: 'Mark all zones' }));
    expect(screen.getByRole('checkbox', { name: 'Mark All' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Mark Porch' })).toBeChecked();
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

  it('opens the polygon editor from a zone name and closes it again with Done', async () => {
    stubOk();
    const user = userEvent.setup();
    await mount();

    await user.click(await screen.findByRole('button', { name: 'All' }));
    expect(await screen.findByText('Edit zone')).toBeInTheDocument();
    expect(screen.queryByTestId('zones-picture')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.getByTestId('zones-picture')).toBeInTheDocument());
  });

  it('shows the opened zone\'s legacy motion settings, read-only', async () => {
    stubOk();
    const user = userEvent.setup();
    await mount();

    await user.click(await screen.findByRole('button', { name: 'Porch' }));

    const settings = await screen.findByRole('table', { name: 'Motion settings' });
    expect(screen.getByText(
      'Motion settings are read-only: the API accepts only the zone name and polygon.',
    )).toBeInTheDocument();

    const row = (label: string) =>
      within(settings).getByText(label).closest('tr') as HTMLTableRowElement;
    expect(within(row('Check Method')).getByText('Blobs')).toBeInTheDocument();
    expect(within(row('Min/Max Pixel Threshold')).getByText('25 / —')).toBeInTheDocument();
    expect(within(row('Filter Width/Height')).getByText('3 / 3')).toBeInTheDocument();
    expect(within(row('Zone Area')).getByText('518,400')).toBeInTheDocument();
    // Pixels units, so the alarmed area is a raw pixel count.
    expect(within(row('Min/Max Alarmed Area')).getByText('3,456 / 691,200')).toBeInTheDocument();
    expect(within(row('Min/Max Blobs')).getByText('1 / —')).toBeInTheDocument();
    expect(within(row('Overload Frame Ignore Count')).getByText('0')).toBeInTheDocument();

    // AlarmRGB 0xff0000 paints a real swatch next to its hex.
    const swatch = within(settings).getByTestId('zone-alarm-swatch');
    expect(swatch).toHaveStyle({ backgroundColor: '#ff0000' });
    expect(within(row('Alarm Colour')).getByText('#ff0000')).toBeInTheDocument();

    // Nothing here is editable — the API takes name + polygon only.
    expect(within(settings).queryAllByRole('textbox')).toHaveLength(0);
    expect(within(settings).queryAllByRole('spinbutton')).toHaveLength(0);
  });

  it('shows percent thresholds and an em dash for the settings the backend left null', async () => {
    stubOk([
      makeZone({
        id: 11, monitor_id: 7, name: 'All', units: 'Percent', area: 9926,
        min_alarm_pixels: 0.05, max_alarm_pixels: 75.06,
        max_pixel_threshold: null, alarm_rgb: null, min_blobs: null, max_blobs: null,
      }),
    ]);
    const user = userEvent.setup();
    await mount();

    await user.click(await screen.findByRole('button', { name: 'All' }));
    const settings = await screen.findByRole('table', { name: 'Motion settings' });

    expect(within(settings).getByText('0.05% / 75.06%')).toBeInTheDocument();
    expect(within(settings).getByText('— / —')).toBeInTheDocument();
    // No colour → no swatch at all, just the dash.
    expect(within(settings).queryByTestId('zone-alarm-swatch')).toBeNull();
  });

  it('shows no settings table until a zone is opened', async () => {
    stubOk();
    const user = userEvent.setup();
    await mount();

    await screen.findByRole('button', { name: 'All' });
    expect(screen.queryByRole('table', { name: 'Motion settings' })).toBeNull();

    // A brand-new zone has no stored settings either.
    await user.click(screen.getByRole('button', { name: 'Add New Zone' }));
    expect(screen.queryByRole('table', { name: 'Motion settings' })).toBeNull();
  });

  it('opens the editor in "new" mode from Add New Zone', async () => {
    stubOk();
    const user = userEvent.setup();
    await mount();

    await user.click(await screen.findByRole('button', { name: 'Add New Zone' }));
    // Add New Zone seeds the editor's draft straight away — one click, as in
    // legacy, so the heading and the draft's name field both read "New zone".
    expect(await screen.findByDisplayValue('New zone')).toBeInTheDocument();
    expect(screen.getAllByText('New zone').length).toBeGreaterThan(0);
  });

  it('flags a zone whose polygon runs outside the frame', async () => {
    stubOk([
      { ...ZONES[0], id: 13, name: 'Overshoot', coords: '0,0 4000,0 4000,4000 0,4000', num_coords: 4 },
    ]);
    await mount();

    expect(await screen.findByLabelText('Zone extends outside the frame')).toBeInTheDocument();
  });

  it('hides Add New Zone and Delete from a monitors:View user', async () => {
    useAuthStore.setState({ user: VIEWER });
    stubOk();
    await mount();

    await screen.findByRole('button', { name: 'All' });
    expect(screen.queryByRole('button', { name: 'Add New Zone' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('renders the backend error instead of an empty table', async () => {
    server.use(
      http.get('/api/v3/monitors/:id', () => HttpResponse.json(MONITOR)),
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
      http.get('/api/v3/monitors/:id/zones', () => HttpResponse.json(paged([]))),
    );
    await mount(999);

    expect(await screen.findByText('Monitor not found')).toBeInTheDocument();
  });
});
