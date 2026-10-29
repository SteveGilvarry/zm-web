/**
 * Zones — modern skin (`/monitors/$monitorId/zones`), through the real
 * router. The route is the one that regressed when flat file routing nested
 * it under the Watch page, so it is mounted by URL rather than by importing
 * the component: breadcrumb, coverage readout, the zone table and picture,
 * `?zid=` opening the editor, the editor's create / update / delete request
 * shapes, and the `monitors:Edit` gate.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw/http';
import { delay } from 'msw/utils/delay';

import { renderRoute } from '@/test/renderRoute';
import { setupMockServer, server, db } from '@/test/msw/server';
import { makeMonitor, makeZone } from '@/test/fixtures';

setupMockServer();

/**
 * The page only paints once the monitor query has answered — and the page
 * itself is a lazy chunk, so the first paint of the file is a null fallback.
 */
async function findZonesPicture() {
  return screen.findByTestId('zones-picture', {}, { timeout: 5_000 });
}

/** The editor is up once its form is. */
async function findEditor() {
  return screen.findByLabelText('Check Method', {}, { timeout: 5_000 });
}

/** Fills the minimums `validateForm` wants for a Blobs zone. */
async function fillMinimums(user: ReturnType<typeof userEvent.setup>) {
  const set = async (label: string, value: string) => {
    const box = screen.getByLabelText(label);
    await user.clear(box);
    await user.type(box, value);
  };
  await set('Min/Max Pixel Threshold (min)', '25');
  await set('Filter width', '3');
  await set('Filter height', '3');
  await set('Min/Max Alarmed Area (min) (px)', '400');
  await set('Min/Max Filtered Area (min) (px)', '300');
  await set('Min/Max Blob Area (min) (px)', '200');
  await set('Min/Max Blobs (min)', '1');
}

const zonesTable = () => screen.getByRole('table', { name: 'Zones' });

describe('modern Zones page — the list', () => {
  it('renders the breadcrumb, coverage readout and the monitor zones', async () => {
    const { router } = renderRoute('/monitors/1/zones');

    await findZonesPicture();
    expect(router.state.location.pathname).toBe('/monitors/1/zones');

    // Breadcrumb: back to the monitor it belongs to, by name.
    const crumb = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumb).getByRole('link', { name: 'Front Door' })).toHaveAttribute('href', '/monitors/1');
    expect(within(crumb).getByText('Zones')).toHaveAttribute('aria-current', 'page');

    // The seeded zone covers the whole 1920x1080 frame.
    expect(screen.getByTestId('zones-coverage')).toHaveTextContent('1 zone · 100% covered');
    expect(within(zonesTable()).getByRole('button', { name: 'All' })).toBeInTheDocument();
  });

  it('counts every zone and sums the areas measured from the polygons', async () => {
    db.zones = [
      makeZone({ id: 1, monitor_id: 1, coords: '0,0 960,0 960,540 0,540', area: 518_400 }),
      makeZone({ id: 2, monitor_id: 1, name: 'Path', type: 'Exclusive', coords: '0,0 960,0 960,540 0,540', area: 518_400 }),
    ];
    renderRoute('/monitors/1/zones');

    await findZonesPicture();
    expect(screen.getByTestId('zones-coverage')).toHaveTextContent('2 zones · 50% covered');
    expect(within(zonesTable()).getByRole('button', { name: 'Path' })).toBeInTheDocument();
  });

  it('measures coverage from the polygon, not the stale stored Zones.Area', async () => {
    // The backend does not recompute Zones.Area when the coordinates change
    // (zm-api#43), so on the dev box every zone reports a four-digit area for
    // a full-frame polygon. Trusting it would print 0% over a whole camera.
    db.zones = [makeZone({ id: 1, monitor_id: 1, coords: '0,0 1920,0 1920,1080 0,1080', area: 1_036 })];
    renderRoute('/monitors/1/zones');

    await findZonesPicture();
    expect(screen.getByText(/100% covered/)).toBeInTheDocument();
  });

  it('lists the zones largest first, as legacy does', async () => {
    db.zones = [
      makeZone({ id: 1, monitor_id: 1, name: 'Small', coords: '0,0 100,0 100,100 0,100' }),
      makeZone({ id: 2, monitor_id: 1, name: 'Large', coords: '0,0 1000,0 1000,1000 0,1000' }),
      makeZone({ id: 3, monitor_id: 1, name: 'Medium', coords: '0,0 500,0 500,500 0,500' }),
    ];
    renderRoute('/monitors/1/zones');
    await findZonesPicture();
    const names = within(zonesTable()).getAllByRole('button').map((b) => b.textContent);
    expect(names).toEqual(['Large', 'Medium', 'Small']);
    // Area in pixels and as a share of the frame.
    expect(within(zonesTable()).getByText('1,000,000')).toBeInTheDocument();
  });

  it('flags a zone whose polygon runs outside the frame', async () => {
    db.zones = [makeZone({ id: 1, monitor_id: 1, name: 'Wide', coords: '0,0 2500,0 2500,1079 0,1079' })];
    renderRoute('/monitors/1/zones');
    await findZonesPicture();
    expect(within(zonesTable()).getByLabelText('Zone extends outside the frame')).toBeInTheDocument();
  });

  it('shows the monitor\'s state and capture rate under the picture', async () => {
    renderRoute('/monitors/1/zones');
    await findZonesPicture();
    const status = screen.getByTestId('zones-stream-status');
    expect(status).toHaveTextContent('Front Door');
    await waitFor(() => expect(status).toHaveTextContent('Connected'));
    expect(status).toHaveTextContent('15.0 fps');
  });

  it('offers full screen, the watch page and the monitor editor over the picture', async () => {
    renderRoute('/monitors/1/zones');
    const picture = await findZonesPicture();
    expect(within(picture).getByRole('button', { name: 'Open full screen' })).toBeInTheDocument();
    expect(within(picture).getByRole('link', { name: 'Open watch page' })).toHaveAttribute('href', '/monitors/1');
    expect(within(picture).getByRole('link', { name: 'Edit monitor' })).toHaveAttribute('href', '/monitors/1?edit=true');
  });

  it('invites the operator to add the first zone when there are none', async () => {
    db.zones = [];
    renderRoute('/monitors/1/zones');

    await findZonesPicture();
    expect(screen.getByText(/No zones yet/)).toBeInTheDocument();
    expect(screen.getByText(/0 zones/)).toBeInTheDocument();
  });

  it('shows the loading state while the monitor is still in flight', async () => {
    server.use(
      http.get('/api/v3/monitors/:id', async () => {
        await delay('infinite');
        return HttpResponse.json({});
      }),
    );
    renderRoute('/monitors/1/zones');

    expect(await screen.findByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByTestId('zones-picture')).toBeNull();
  });

  it('reports an unreachable backend and recovers on Retry', async () => {
    let fail = true;
    server.use(
      http.get('/api/v3/monitors/:id/zones', () => {
        if (fail) return HttpResponse.json({ error_message: 'boom' }, { status: 500 });
        return HttpResponse.json({ items: db.zones, total: 1, per_page: 100, current_page: 1, last_page: 1 });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/monitors/1/zones');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Cannot reach the server.');

    fail = false;
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    await findZonesPicture();
  });

  it('explains that a monitor with no frame size cannot have zones', async () => {
    db.monitors = [makeMonitor({ id: 1, name: 'Front Door', width: 0, height: 0 })];
    renderRoute('/monitors/1/zones');

    expect(
      await screen.findByText('Monitor dimensions unavailable — zones require a captured frame.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('zones-picture')).toBeNull();
  });

  it('draws the zones in the rotated view space for a ROTATE_90 camera', async () => {
    db.zones = [makeZone({ id: 9, monitor_id: 2, name: 'Gate' })];
    renderRoute('/monitors/2/zones');

    await findZonesPicture();
    // Monitor 2 is 2160x3840 with ROTATE_90, so the frame is 3840x2160.
    expect(document.querySelector('svg[viewBox="0 0 3840 2160"]')).not.toBeNull();
    expect(within(zonesTable()).getByRole('button', { name: 'Gate' })).toBeInTheDocument();
  });

  it('gives a monitors:View user the list without the verbs, and no editor', async () => {
    const user = userEvent.setup();
    renderRoute('/monitors/1/zones', { perms: { monitors: 'View' } });

    await findZonesPicture();
    expect(screen.queryByRole('button', { name: 'Add zone' })).toBeNull();
    expect(screen.queryByLabelText('Mark All')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Edit monitor' })).toBeNull();

    await user.click(within(zonesTable()).getByRole('button', { name: 'All' }));
    expect(await screen.findByRole('status')).toHaveTextContent('You do not have permission to view this.');
  });

  it('deletes every marked zone after one confirmation', async () => {
    db.zones = [
      makeZone({ id: 1, monitor_id: 1, name: 'A' }),
      makeZone({ id: 2, monitor_id: 1, name: 'B' }),
      makeZone({ id: 3, monitor_id: 1, name: 'C' }),
    ];
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const deleted: string[] = [];
    server.use(http.delete('/api/v3/zones/:id', ({ params }) => {
      deleted.push(String(params.id));
      return HttpResponse.json({ message: 'deleted' });
    }));
    const user = userEvent.setup();
    renderRoute('/monitors/1/zones');
    await findZonesPicture();

    expect(screen.queryByRole('button', { name: /^Delete/ })).toBeNull();
    await user.click(screen.getByLabelText('Mark A'));
    await user.click(screen.getByLabelText('Mark C'));
    await user.click(screen.getByRole('button', { name: 'Delete marked (2)' }));

    expect(confirm).toHaveBeenCalledWith('Delete 2 zones?');
    await waitFor(() => expect(deleted.sort()).toEqual(['1', '3']));
  });
});

describe('modern Zones page — opening a zone', () => {
  it('opens a zone from the table into the URL, and Back returns to the list', async () => {
    const user = userEvent.setup();
    const { router } = renderRoute('/monitors/1/zones');
    await findZonesPicture();

    await user.click(within(zonesTable()).getByRole('button', { name: 'All' }));
    await findEditor();
    expect(router.state.location.search).toEqual({ zid: 1 });
    expect(screen.getByText('Editing #1')).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByText('All'))
      .toHaveAttribute('aria-current', 'page');

    router.history.back();
    await findZonesPicture();
    expect(screen.queryByLabelText('Check Method')).toBeNull();
  });

  it('opens the zone named by ?zid= on load, as legacy\'s ?view=zone does', async () => {
    renderRoute('/monitors/1/zones?zid=1');
    await findEditor();
    expect(screen.getByText('Editing #1')).toBeInTheDocument();
    expect(screen.queryByTestId('zones-picture')).toBeNull();
  });

  it('opens a zone by clicking its polygon on the picture', async () => {
    const user = userEvent.setup();
    const { router } = renderRoute('/monitors/1/zones');
    await findZonesPicture();
    await user.click(screen.getByTestId('zone-polygon-1'));
    await findEditor();
    expect(router.state.location.search).toEqual({ zid: 1 });
  });

  it('creates a zone through POST /monitors/1/zones, then goes back to the list', async () => {
    let body: unknown;
    let url: string | undefined;
    server.use(
      http.post('/api/v3/monitors/:id/zones', async ({ request }) => {
        url = new URL(request.url).pathname;
        body = await request.json();
        return HttpResponse.json(makeZone({ id: 2, monitor_id: 1 }), { status: 201 });
      }),
    );
    const user = userEvent.setup();
    const { router } = renderRoute('/monitors/1/zones');

    await findZonesPicture();
    await user.click(screen.getByRole('button', { name: 'Add zone' }));
    await findEditor();
    expect(router.state.location.search).toEqual({ zid: 'new' });

    // Legacy's new zone: the whole frame, named "New".
    expect(screen.getByDisplayValue('New')).toBeInTheDocument();
    expect(screen.getByText(/4 vertices/)).toBeInTheDocument();
    await fillMinimums(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(url).toBe('/api/v3/monitors/1/zones'));
    expect(body).toMatchObject({
      name: 'New',
      type: 'Active',
      units: 'Percent',
      coords: '0,0 1919,0 1919,1079 0,1079',
      num_coords: 4,
      check_method: 'Blobs',
      alarm_rgb: 16711680,
      min_pixel_threshold: 25,
      min_blobs: 1,
      max_blobs: null,
    });
    // 1.39.41 goes back to the zones list after a save.
    await findZonesPicture();
    expect(router.state.location.search).toEqual({});
  });

  it('carries the chosen type into the created zone', async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post('/api/v3/monitors/:id/zones', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(makeZone({ id: 2, monitor_id: 1 }), { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/monitors/1/zones?zid=new');

    await findEditor();
    await user.selectOptions(screen.getByLabelText('Type'), 'Privacy');
    expect(screen.getByText('Region is blacked out in recordings and live view.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(body?.type).toBe('Privacy'));
    expect(body?.units).toBe('Percent');
  });

  it('updates an existing zone through PUT /zones/1 with its geometry and settings', async () => {
    let body: unknown;
    let url: string | undefined;
    server.use(
      http.put('/api/v3/zones/:id', async ({ request }) => {
        url = new URL(request.url).pathname;
        body = await request.json();
        return HttpResponse.json(db.zones[0]);
      }),
    );
    const user = userEvent.setup();
    renderRoute('/monitors/1/zones?zid=1');

    await findEditor();
    const name = screen.getByDisplayValue('All');
    await user.clear(name);
    await user.type(name, 'Whole frame');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(url).toBe('/api/v3/zones/1'));
    expect(body).toMatchObject({
      name: 'Whole frame',
      units: 'Percent',
      coords: '0,0 1919,0 1919,1079 0,1079',
      // The stored settings round-trip untouched.
      check_method: 'Blobs',
      filter_x: 3,
      min_alarm_pixels: 3456,
    });
  });

  it('deletes the edited zone through DELETE /zones/1 after confirming', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    let deleted: string | undefined;
    server.use(
      http.delete('/api/v3/zones/:id', ({ params }) => {
        deleted = String(params.id);
        return HttpResponse.json({ message: 'deleted' });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/monitors/1/zones?zid=1');

    await findEditor();
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(confirm).toHaveBeenCalledWith('Delete zone "All"?');
    await waitFor(() => expect(deleted).toBe('1'));
  });

  it('keeps the zone when the delete confirmation is dismissed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    let deleted = false;
    server.use(
      http.delete('/api/v3/zones/:id', () => {
        deleted = true;
        return HttpResponse.json({ message: 'deleted' });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/monitors/1/zones?zid=1');

    await findEditor();
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(deleted).toBe(false);
    expect(screen.getByText('Editing #1')).toBeInTheDocument();
  });

  it('reveals the stored settings panel for the selected zone', async () => {
    db.zones = [makeZone({
      id: 1, monitor_id: 1, name: 'All', units: 'Percent', area: 9926,
      coords: '0.00,0.00 100.00,0.00 100.00,100.00 0.00,100.00',
      min_alarm_pixels: 0.05, max_alarm_pixels: 75.06, max_pixel_threshold: null,
    })];
    renderRoute('/monitors/1/zones?zid=1');

    expect(await screen.findByRole('heading', { name: 'Stored settings' })).toBeInTheDocument();
    expect(screen.getByText(
      'The zone as the backend has it — the form beside the canvas is what changes it.',
    )).toBeInTheDocument();

    // Scoped to the panel: the editor form beside it uses the same labels.
    const panel = screen.getByTestId('zone-stored-settings');
    const row = (label: string) => within(panel).getByText(label).parentElement as HTMLElement;
    expect(within(row('Check Method')).getByText('Blobs')).toBeInTheDocument();
    expect(within(row('Zone Area')).getByText('9,926')).toBeInTheDocument();
    // Percent coords: the thresholds are percentages of the zone.
    expect(within(row('Min/Max Alarmed Area')).getByText('0.05% / 75.06%')).toBeInTheDocument();
    // Nulls read as an em dash, never as 0.
    expect(within(row('Min/Max Pixel Threshold')).getByText('25 / —')).toBeInTheDocument();
    // The packed AlarmRGB becomes a real swatch.
    expect(screen.getByTestId('zone-alarm-swatch')).toHaveStyle({ backgroundColor: '#ff0000' });
  });

  it('closes the editor, and the settings with it, from the cancel affordance', async () => {
    const user = userEvent.setup();
    const { router } = renderRoute('/monitors/1/zones?zid=1');

    await screen.findByRole('heading', { name: 'Stored settings' });
    await user.click(screen.getByRole('button', { name: 'Cancel edit' }));
    await findZonesPicture();
    expect(screen.queryByRole('heading', { name: 'Stored settings' })).toBeNull();
    expect(router.state.location.search).toEqual({});
  });

  it('shows no settings for a zone that does not exist yet', async () => {
    renderRoute('/monitors/1/zones?zid=new');
    await findEditor();
    expect(screen.getByDisplayValue('New')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Stored settings' })).toBeNull();
  });

  it('goes back to the list from the breadcrumb', async () => {
    const user = userEvent.setup();
    renderRoute('/monitors/1/zones?zid=1');
    await findEditor();
    await user.click(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('button', { name: 'Zones' }));
    await findZonesPicture();
  });
});
