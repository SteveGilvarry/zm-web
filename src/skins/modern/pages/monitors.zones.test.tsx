/**
 * Zones — Mission Control (`/monitors/$monitorId/zones`), through the real
 * router. The route is the one that regressed when flat file routing nested
 * it under the Watch page, so it is mounted by URL rather than by importing
 * the component: breadcrumb, coverage readout, the polygon editor's
 * create / update / delete request shapes, and the `monitors:Edit` gate.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';

import { renderRoute } from '@/test/renderRoute';
import { setupMockServer, server, db } from '@/test/msw/server';
import { makeMonitor, makeZone } from '@/test/fixtures';

setupMockServer();

/**
 * The panel only paints once the monitor query has answered — and the page
 * itself is a lazy chunk, so the first paint of the file is a null fallback.
 */
async function findZonesPanel() {
  return (await screen.findAllByRole('heading', { name: 'Motion zones' }, { timeout: 5_000 }))[0];
}

describe('modern Zones page', () => {
  it('renders the breadcrumb, coverage readout and the monitor zones', async () => {
    const { router } = renderRoute('/monitors/1/zones');

    await findZonesPanel();
    expect(router.state.location.pathname).toBe('/monitors/1/zones');

    // Breadcrumb: back to the monitor it belongs to, by name.
    const crumb = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumb).getByRole('link', { name: 'Front Door' })).toHaveAttribute(
      'href',
      '/monitors/1',
    );
    expect(within(crumb).getByText('Zones')).toHaveAttribute('aria-current', 'page');

    // The seeded zone covers the whole 1920x1080 frame.
    expect(screen.getByText(/1 zone/)).toBeInTheDocument();
    expect(screen.getByText(/100% covered/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /All/ })).toBeInTheDocument();
  });

  it('counts every zone and sums their coverage', async () => {
    db.zones = [
      makeZone({ id: 1, monitor_id: 1, coords: '0,0 959,0 959,539 0,539' }),
      makeZone({ id: 2, monitor_id: 1, name: 'Path', type: 'Exclusive', coords: '0,0 959,0 959,539 0,539' }),
    ];
    renderRoute('/monitors/1/zones');

    await findZonesPanel();
    expect(screen.getByText(/2 zones/)).toBeInTheDocument();
    // Two quarter-frame polygons ≈ 50%.
    expect(screen.getByText(/50% covered/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Path/ })).toBeInTheDocument();
  });

  it('invites the operator to draw the first zone when there are none', async () => {
    db.zones = [];
    renderRoute('/monitors/1/zones');

    await findZonesPanel();
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
    expect(screen.queryByRole('heading', { name: 'Motion zones' })).toBeNull();
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
    await findZonesPanel();
  });

  it('explains that a monitor with no frame size cannot have zones', async () => {
    db.monitors = [makeMonitor({ id: 1, name: 'Front Door', width: 0, height: 0 })];
    renderRoute('/monitors/1/zones');

    expect(
      await screen.findByText('Monitor dimensions unavailable — zones require a captured frame.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Motion zones' })).toBeNull();
  });

  it('draws the editor in the rotated view space for a ROTATE_90 camera', async () => {
    db.zones = [makeZone({ id: 9, monitor_id: 2, name: 'Gate' })];
    renderRoute('/monitors/2/zones');

    await findZonesPanel();
    // Monitor 2 is 2160x3840 with ROTATE_90, so the editor frame is 3840x2160.
    expect(document.querySelector('svg[viewBox="0 0 3840 2160"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: /Gate/ })).toBeInTheDocument();
  });

  it('replaces the editor with the no-permission note for a monitors:View user', async () => {
    renderRoute('/monitors/1/zones', { perms: { monitors: 'View' } });

    await findZonesPanel();
    expect(screen.getByRole('status')).toHaveTextContent(
      'You do not have permission to view this.',
    );
    expect(screen.queryByRole('button', { name: 'New' })).toBeNull();
  });

  it('creates a zone through POST /monitors/1/zones with the drawn polygon', async () => {
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
    renderRoute('/monitors/1/zones');

    await findZonesPanel();
    await user.click(screen.getByRole('button', { name: 'New' }));

    // The default draft is the middle 60% of the 1920x1080 frame.
    expect(screen.getByDisplayValue('New zone')).toBeInTheDocument();
    expect(screen.getByText(/4 vertices/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(url).toBe('/api/v3/monitors/1/zones'));
    expect(body).toEqual({
      name: 'New zone',
      type: 'Active',
      units: 'Pixels',
      coords: '384,216 1536,216 1536,864 384,864',
      num_coords: 4,
    });
    // A successful save closes the draft form.
    await waitFor(() => expect(screen.queryByDisplayValue('New zone')).toBeNull());
  });

  it('carries the chosen type and preset into the created zone', async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post('/api/v3/monitors/:id/zones', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(makeZone({ id: 2, monitor_id: 1 }), { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/monitors/1/zones');

    await findZonesPanel();
    await user.click(screen.getByRole('button', { name: 'New' }));
    // The Type select carries the draft's current type as its display value;
    // the editor's <label> elements are siblings, so there is no a11y name.
    await user.selectOptions(screen.getByDisplayValue('Active'), 'Privacy');
    expect(screen.getByText('Region is blacked out in recordings and live view.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Percent' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(body?.type).toBe('Privacy'));
    expect(body?.units).toBe('Percent');
  });

  it('updates an existing zone through PUT /zones/1 with name + polygon', async () => {
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
    renderRoute('/monitors/1/zones');

    await findZonesPanel();
    await user.click(screen.getByRole('button', { name: /All/ }));
    expect(screen.getByText('Editing #1')).toBeInTheDocument();

    const name = screen.getByDisplayValue('All');
    await user.clear(name);
    await user.type(name, 'Whole frame');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(url).toBe('/api/v3/zones/1'));
    expect(body).toEqual({
      name: 'Whole frame',
      polygon: '0,0 1919,0 1919,1079 0,1079',
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
    renderRoute('/monitors/1/zones');

    await findZonesPanel();
    await user.click(screen.getByRole('button', { name: /All/ }));
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
    renderRoute('/monitors/1/zones');

    await findZonesPanel();
    await user.click(screen.getByRole('button', { name: /All/ }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(deleted).toBe(false);
    expect(screen.getByText('Editing #1')).toBeInTheDocument();
  });

  it('closes the draft form without saving from the cancel affordance', async () => {
    const user = userEvent.setup();
    renderRoute('/monitors/1/zones');

    await findZonesPanel();
    await user.click(screen.getByRole('button', { name: /All/ }));
    await user.click(screen.getByRole('button', { name: 'Cancel edit' }));

    expect(screen.queryByDisplayValue('All')).toBeNull();
  });
});
