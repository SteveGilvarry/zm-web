import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import { ZoneEditor } from './ZoneEditor';

// Snapshot polling would otherwise hammer the dev server every second; the
// editor still works fine with a null URL.
vi.mock('@/hooks/useRefreshingSnapshot', () => ({
  useRefreshingSnapshot: () => null,
}));

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', user: null, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'warn' });
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

// Default preset handler shared by every test — most tests don't care about
// presets, but the editor always queries them on mount.
beforeEach(() => {
  server.use(
    http.get('/api/v3/zone-presets', () => HttpResponse.json({
      items: [], total: 0, per_page: 100, current_page: 1, last_page: 1,
    })),
  );
});

const zoneFixture = {
  id: 7,
  monitor_id: 1,
  name: 'Driveway',
  type: 'Active',
  units: 'Pixels',
  coords: '100,100 500,100 500,400 100,400',
  num_coords: 4,
};

describe('ZoneEditor — zone list', () => {
  it('shows "no zones" state when the monitor has none', async () => {
    server.use(http.get('/api/v3/monitors/1/zones', () =>
      HttpResponse.json({ items: [], total: 0, per_page: 50, current_page: 1, last_page: 1 }),
    ));
    renderWithProviders(<ZoneEditor monitorId={1} width={1920} height={1080} />);
    await waitFor(() => expect(screen.getByText(/no zones yet/i)).toBeInTheDocument());
  });

  it('lists existing zones returned by the API', async () => {
    server.use(http.get('/api/v3/monitors/1/zones', () =>
      HttpResponse.json({
        items: [zoneFixture],
        total: 1, per_page: 50, current_page: 1, last_page: 1,
      }),
    ));
    renderWithProviders(<ZoneEditor monitorId={1} width={1920} height={1080} />);
    await waitFor(() => expect(screen.getByText('Driveway')).toBeInTheDocument());
  });

  it('loads a zone into the draft when its row is clicked', async () => {
    const user = userEvent.setup();
    server.use(http.get('/api/v3/monitors/1/zones', () =>
      HttpResponse.json({
        items: [zoneFixture],
        total: 1, per_page: 50, current_page: 1, last_page: 1,
      }),
    ));
    renderWithProviders(<ZoneEditor monitorId={1} width={1920} height={1080} />);
    await waitFor(() => screen.getByText('Driveway'));

    await user.click(screen.getByText('Driveway'));
    // Heading shows "Editing #7"
    expect(screen.getByText(/editing #7/i)).toBeInTheDocument();
    // Vertex count caption uses the parsed coord count.
    expect(screen.getByText(/4 vertices/i)).toBeInTheDocument();
  });
});

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

describe('ZoneEditor — New zone', () => {
  it('seeds the draft as legacy does: the whole frame, named "New"', async () => {
    const user = userEvent.setup();
    server.use(http.get('/api/v3/monitors/1/zones', () =>
      HttpResponse.json({ items: [], total: 0, per_page: 50, current_page: 1, last_page: 1 }),
    ));
    renderWithProviders(<ZoneEditor monitorId={1} width={1920} height={1080} />);
    await waitFor(() => screen.getByText(/no zones yet/i));

    await user.click(screen.getByRole('button', { name: /new/i }));
    expect(screen.getByText(/new zone/i)).toBeInTheDocument();
    expect(screen.getByText(/4 vertices/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('New')).toBeInTheDocument();
    expect(screen.getByTestId('zone-area-readout')).toHaveTextContent('Zone Area 99.86% · 2,070,601 px');
  });

  it('POSTs /monitors/{id}/zones with pixel coords and Units fixed at Percent', async () => {
    const user = userEvent.setup();
    let body: Record<string, unknown> = {};

    server.use(
      http.get('/api/v3/monitors/1/zones', () =>
        HttpResponse.json({ items: [], total: 0, per_page: 50, current_page: 1, last_page: 1 }),
      ),
      http.post('/api/v3/monitors/1/zones', async ({ request }) => {
        body = await request.json() as Record<string, unknown>;
        return HttpResponse.json({ id: 99 });
      }),
    );

    renderWithProviders(<ZoneEditor monitorId={1} width={1920} height={1080} />);
    await waitFor(() => screen.getByText(/no zones yet/i));

    await user.click(screen.getByRole('button', { name: /new/i }));
    await fillMinimums(user);
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(body.name).toBe('New'));
    // Legacy's hidden `newZone[Units]` is always Percent (zone.php:278).
    expect(body.units).toBe('Percent');
    expect(body.num_coords).toBe(4);
    // Coords stay integer pixels (plan F-3), so the daemon reads the
    // thresholds as pixel counts.
    expect(body.coords).toBe('0,0 1919,0 1919,1079 0,1079');
    expect(body.min_alarm_pixels).toBe(400);
    expect(body.min_blob_pixels).toBe(200);
  });

  it('offers no Units control, as legacy hides it', async () => {
    const user = userEvent.setup();
    server.use(http.get('/api/v3/monitors/1/zones', () =>
      HttpResponse.json({ items: [], total: 0, per_page: 50, current_page: 1, last_page: 1 }),
    ));
    renderWithProviders(<ZoneEditor monitorId={1} width={1920} height={1080} />);
    await waitFor(() => screen.getByText(/no zones yet/i));
    await user.click(screen.getByRole('button', { name: /new/i }));
    expect(screen.queryByRole('button', { name: 'Pixels' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Percent' })).toBeNull();
    expect(screen.queryByText('Units')).toBeNull();
  });
});

describe('ZoneEditor — Save validation', () => {
  it('disables Save when the name is empty', async () => {
    const user = userEvent.setup();
    server.use(http.get('/api/v3/monitors/1/zones', () =>
      HttpResponse.json({ items: [], total: 0, per_page: 50, current_page: 1, last_page: 1 }),
    ));
    renderWithProviders(<ZoneEditor monitorId={1} width={1920} height={1080} />);
    await waitFor(() => screen.getByText(/no zones yet/i));

    await user.click(screen.getByRole('button', { name: /new/i }));
    const nameInput = screen.getByDisplayValue('New');
    await user.clear(nameInput);
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('refuses a blank new zone with legacy\'s messages, and sends nothing', async () => {
    const user = userEvent.setup();
    const posted = vi.fn();
    server.use(
      http.get('/api/v3/monitors/1/zones', () =>
        HttpResponse.json({ items: [], total: 0, per_page: 50, current_page: 1, last_page: 1 }),
      ),
      http.post('/api/v3/monitors/1/zones', () => { posted(); return HttpResponse.json({ id: 99 }); }),
    );
    renderWithProviders(<ZoneEditor monitorId={1} width={1920} height={1080} />);
    await waitFor(() => screen.getByText(/no zones yet/i));

    await user.click(screen.getByRole('button', { name: /new/i }));
    await user.click(screen.getByRole('button', { name: /save/i }));

    const list = screen.getByRole('alert', { name: 'Cannot save the zone' });
    expect(list).toHaveTextContent('You must specify a minimum pixel threshold');
    expect(list).toHaveTextContent('You must specify a filter width and height');
    expect(list).toHaveTextContent('You must specify the minimum alarm pixel count');
    expect(list).toHaveTextContent('You must specify the minimum blob count');
    expect(posted).not.toHaveBeenCalled();
    // The draft stays open for the fix.
    expect(screen.getByDisplayValue('New')).toBeInTheDocument();
  });

  it('saves an Inactive zone with nothing filled, as legacy checks nothing there', async () => {
    const user = userEvent.setup();
    let body: Record<string, unknown> = {};
    server.use(
      http.get('/api/v3/monitors/1/zones', () =>
        HttpResponse.json({ items: [], total: 0, per_page: 50, current_page: 1, last_page: 1 }),
      ),
      http.post('/api/v3/monitors/1/zones', async ({ request }) => {
        body = await request.json() as Record<string, unknown>;
        return HttpResponse.json({ id: 99 });
      }),
    );
    renderWithProviders(<ZoneEditor monitorId={1} width={1920} height={1080} />);
    await waitFor(() => screen.getByText(/no zones yet/i));
    await user.click(screen.getByRole('button', { name: /new/i }));
    await user.selectOptions(screen.getByLabelText('Type'), 'Inactive');
    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(body.type).toBe('Inactive'));
  });
});

describe('ZoneEditor — Delete', () => {
  it('confirms then DELETEs /zones/{id}', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    let deletedId: string | undefined;

    server.use(
      http.get('/api/v3/monitors/1/zones', () =>
        HttpResponse.json({
          items: [zoneFixture],
          total: 1, per_page: 50, current_page: 1, last_page: 1,
        }),
      ),
      http.delete('/api/v3/zones/:id', ({ params }) => {
        deletedId = params.id as string;
        return HttpResponse.json({}, { status: 204 });
      }),
    );

    renderWithProviders(<ZoneEditor monitorId={1} width={1920} height={1080} />);
    await waitFor(() => screen.getByText('Driveway'));

    await user.click(screen.getByText('Driveway'));
    await user.click(screen.getByRole('button', { name: /delete/i }));

    await waitFor(() => expect(deletedId).toBe('7'));
    confirmSpy.mockRestore();
  });

  it('skips the DELETE when the operator cancels the confirm', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    let deleteHits = 0;

    server.use(
      http.get('/api/v3/monitors/1/zones', () =>
        HttpResponse.json({
          items: [zoneFixture],
          total: 1, per_page: 50, current_page: 1, last_page: 1,
        }),
      ),
      http.delete('/api/v3/zones/:id', () => {
        deleteHits += 1;
        return HttpResponse.json({}, { status: 204 });
      }),
    );

    renderWithProviders(<ZoneEditor monitorId={1} width={1920} height={1080} />);
    await waitFor(() => screen.getByText('Driveway'));

    await user.click(screen.getByText('Driveway'));
    await user.click(screen.getByRole('button', { name: /delete/i }));

    expect(confirmSpy).toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 40));
    expect(deleteHits).toBe(0);
    confirmSpy.mockRestore();
  });
});

describe('ZoneEditor — Cancel', () => {
  it('clears the draft and closes the editor when X is clicked', async () => {
    const user = userEvent.setup();
    server.use(http.get('/api/v3/monitors/1/zones', () =>
      HttpResponse.json({ items: [], total: 0, per_page: 50, current_page: 1, last_page: 1 }),
    ));
    renderWithProviders(<ZoneEditor monitorId={1} width={1920} height={1080} />);
    await waitFor(() => screen.getByText(/no zones yet/i));

    await user.click(screen.getByRole('button', { name: /new/i }));
    expect(screen.getByText(/new zone/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /cancel edit/i }));
    // Heading shouldn't show "New zone" anymore — only the list panel.
    await waitFor(() => {
      expect(screen.queryByText(/4 vertices/i)).toBeNull();
    });
  });
});

describe('ZoneEditor — polygon midpoint insertion', () => {
  it('inserts a vertex when a midpoint dot is clicked, updating the count', async () => {
    const user = userEvent.setup();
    server.use(http.get('/api/v3/monitors/1/zones', () =>
      HttpResponse.json({
        items: [zoneFixture],
        total: 1, per_page: 50, current_page: 1, last_page: 1,
      }),
    ));
    const { container } = renderWithProviders(
      <ZoneEditor monitorId={1} width={1920} height={1080} />,
    );
    await waitFor(() => screen.getByText('Driveway'));
    await user.click(screen.getByText('Driveway'));
    await waitFor(() => screen.getByText(/4 vertices/i));

    // Midpoints are <circle> elements with cursor=crosshair styling, drawn
    // for each edge (so 4 for a quad). Grab the first.
    const midDots = container.querySelectorAll('circle[style*="crosshair"]');
    expect(midDots.length).toBe(4);

    fireEvent.pointerDown(midDots[0]);
    await waitFor(() => expect(screen.getByText(/5 vertices/i)).toBeInTheDocument());
  });
});

describe('ZoneEditor — type hint', () => {
  it('shows a hint matching the selected zone type', async () => {
    const user = userEvent.setup();
    server.use(http.get('/api/v3/monitors/1/zones', () =>
      HttpResponse.json({ items: [], total: 0, per_page: 50, current_page: 1, last_page: 1 }),
    ));
    renderWithProviders(<ZoneEditor monitorId={1} width={1920} height={1080} />);
    await waitFor(() => screen.getByText(/no zones yet/i));

    await user.click(screen.getByRole('button', { name: /new/i }));
    // Default type Active → "Triggers alarms…" hint visible.
    expect(screen.getByText(/triggers alarms on motion/i)).toBeInTheDocument();

    // Switch to Privacy → its hint replaces the prior one.
    await user.selectOptions(screen.getByDisplayValue('Active'), 'Privacy');
    expect(screen.getByText(/region is blacked out/i)).toBeInTheDocument();
  });
});

describe('ZoneEditor — zone presets', () => {
  it('does NOT render the preset dropdown when no presets are configured', async () => {
    const user = userEvent.setup();
    server.use(http.get('/api/v3/monitors/1/zones', () =>
      HttpResponse.json({ items: [], total: 0, per_page: 50, current_page: 1, last_page: 1 }),
    ));
    renderWithProviders(<ZoneEditor monitorId={1} width={1920} height={1080} />);
    await waitFor(() => screen.getByText(/no zones yet/i));

    await user.click(screen.getByRole('button', { name: /new/i }));
    expect(screen.queryByText(/apply preset/i)).toBeNull();
  });

  it('applies the preset\'s check method and leaves the name and type alone, as legacy does', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('/api/v3/zone-presets', () => HttpResponse.json({
        items: [
          { id: 1, name: 'Front Path', type: 'Active', units: 'Pixels', check_method: 'Blobs' },
          { id: 2, name: 'Backyard Privacy', type: 'Privacy', units: 'Pixels', check_method: 'AlarmedPixels' },
        ],
        total: 2, per_page: 100, current_page: 1, last_page: 1,
      })),
      http.get('/api/v3/monitors/1/zones', () =>
        HttpResponse.json({ items: [], total: 0, per_page: 50, current_page: 1, last_page: 1 }),
      ),
    );
    renderWithProviders(<ZoneEditor monitorId={1} width={1920} height={1080} />);
    await waitFor(() => screen.getByText(/no zones yet/i));

    await user.click(screen.getByRole('button', { name: /new/i }));
    const presetSelect = await screen.findByLabelText('Preset');
    expect(presetSelect).toHaveDisplayValue('Choose Preset');
    await user.selectOptions(presetSelect, '2');

    expect(screen.getByLabelText('Check Method')).toHaveValue('AlarmedPixels');
    expect(screen.getByLabelText('Type')).toHaveValue('Active');
    expect(screen.getByLabelText('Name')).toHaveValue('New');
    // Back to "Choose Preset", ready for another pick.
    expect(presetSelect).toHaveDisplayValue('Choose Preset');
  });

  it('applies the thresholds too when the preset carries them, percent of the zone into pixels', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('/api/v3/zone-presets', () => HttpResponse.json({
        items: [{
          id: 3, name: 'Best, high sensitivity', type: 'Active', units: 'Percent', check_method: 'Blobs',
          min_pixel_threshold: 20, max_pixel_threshold: null, filter_x: 3, filter_y: 3,
          min_alarm_pixels: 5, max_alarm_pixels: null, min_filter_pixels: 3.5, max_filter_pixels: null,
          min_blob_pixels: 3, max_blob_pixels: null, min_blobs: 1, max_blobs: null,
          overload_frames: 0, extend_alarm_frames: 0,
        }],
        total: 1, per_page: 100, current_page: 1, last_page: 1,
      })),
      http.get('/api/v3/monitors/1/zones', () =>
        HttpResponse.json({ items: [], total: 0, per_page: 50, current_page: 1, last_page: 1 }),
      ),
    );
    // A 101×101 frame makes the new zone exactly 100×100 = 10,000 px.
    renderWithProviders(<ZoneEditor monitorId={1} width={101} height={101} />);
    await waitFor(() => screen.getByText(/no zones yet/i));
    await user.click(screen.getByRole('button', { name: /new/i }));
    await user.selectOptions(await screen.findByLabelText('Preset'), '3');

    expect(screen.getByLabelText('Min/Max Pixel Threshold (min)')).toHaveValue(20);
    expect(screen.getByLabelText('Min/Max Alarmed Area (min) (px)')).toHaveValue(500);
    expect(screen.getByLabelText('Min/Max Alarmed Area (min) (%)')).toHaveValue(5);
    expect(screen.getByLabelText('Min/Max Filtered Area (min) (px)')).toHaveValue(350);
    expect(screen.getByLabelText('Min/Max Blob Area (min) (px)')).toHaveValue(300);
  });

  it('disables the preset select for a zone that detects nothing', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('/api/v3/zone-presets', () => HttpResponse.json({
        items: [{ id: 1, name: 'Front Path', type: 'Active', units: 'Pixels', check_method: 'Blobs' }],
        total: 1, per_page: 100, current_page: 1, last_page: 1,
      })),
      http.get('/api/v3/monitors/1/zones', () =>
        HttpResponse.json({ items: [], total: 0, per_page: 50, current_page: 1, last_page: 1 }),
      ),
    );
    renderWithProviders(<ZoneEditor monitorId={1} width={1920} height={1080} />);
    await waitFor(() => screen.getByText(/no zones yet/i));
    await user.click(screen.getByRole('button', { name: /new/i }));
    await user.selectOptions(screen.getByLabelText('Type'), 'Privacy');
    expect(await screen.findByLabelText('Preset')).toBeDisabled();
  });
});
