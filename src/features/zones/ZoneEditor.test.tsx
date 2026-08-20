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

describe('ZoneEditor — New zone', () => {
  it('seeds the draft with a 4-vertex rectangle in the middle of the frame', async () => {
    const user = userEvent.setup();
    server.use(http.get('/api/v3/monitors/1/zones', () =>
      HttpResponse.json({ items: [], total: 0, per_page: 50, current_page: 1, last_page: 1 }),
    ));
    renderWithProviders(<ZoneEditor monitorId={1} width={1920} height={1080} />);
    await waitFor(() => screen.getByText(/no zones yet/i));

    await user.click(screen.getByRole('button', { name: /new/i }));
    expect(screen.getByText(/new zone/i)).toBeInTheDocument();
    expect(screen.getByText(/4 vertices/i)).toBeInTheDocument();
  });

  it('POSTs /monitors/{id}/zones with serialised coords on Save', async () => {
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
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(body.name).toBe('New zone'));
    expect(body.units).toBe('Pixels');
    expect(body.num_coords).toBe(4);
    expect(typeof body.coords).toBe('string');
    // 4 "x,y" pairs separated by spaces — 3 spaces between them.
    expect((body.coords as string).split(' ')).toHaveLength(4);
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
    const nameInput = screen.getByDisplayValue('New zone');
    await user.clear(nameInput);
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
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

describe('ZoneEditor — units toggle', () => {
  it('starts a new zone in Pixels and switches to Percent on toggle', async () => {
    const user = userEvent.setup();
    server.use(http.get('/api/v3/monitors/1/zones', () =>
      HttpResponse.json({ items: [], total: 0, per_page: 50, current_page: 1, last_page: 1 }),
    ));
    renderWithProviders(<ZoneEditor monitorId={1} width={1920} height={1080} />);
    await waitFor(() => screen.getByText(/no zones yet/i));

    await user.click(screen.getByRole('button', { name: /new/i }));

    // Pixels is active by default.
    const pixelsBtn = screen.getByRole('button', { name: 'Pixels' });
    const percentBtn = screen.getByRole('button', { name: 'Percent' });
    expect(pixelsBtn.className).toMatch(/border-cyan/);

    await user.click(percentBtn);
    expect(percentBtn.className).toMatch(/border-cyan/);
  });

  it('serialises Percent units in the create POST body without rescaling the coords', async () => {
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
    await user.click(screen.getByRole('button', { name: 'Percent' }));
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(body.units).toBe('Percent'));
    // ZoneMinder stores Coords in pixels whatever the Units; the default
    // rectangle (middle 60% of 1920x1080) must reach the API untouched.
    expect(body.coords).toBe('384,216 1536,216 1536,864 384,864');
  });

  it('switching Pixels -> Percent -> Pixels leaves the polygon unchanged', async () => {
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
    await user.click(screen.getByRole('button', { name: 'Percent' }));
    await user.click(screen.getByRole('button', { name: 'Pixels' }));
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(body.units).toBe('Pixels'));
    expect(body.coords).toBe('384,216 1536,216 1536,864 384,864');
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

  it('applies a preset to the draft when selected from the dropdown', async () => {
    const user = userEvent.setup();
    // Override the default empty-preset handler.
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
    await waitFor(() => screen.getByText(/apply preset/i));

    // Find the preset combobox by its placeholder option text.
    const presetSelect = screen.getByText(/apply preset…/i).closest('select')!;
    await user.selectOptions(presetSelect, '2');
    // Type now reflects the preset's value.
    expect(screen.getByDisplayValue('Privacy')).toBeInTheDocument();
  });
});
