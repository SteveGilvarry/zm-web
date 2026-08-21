/**
 * Route-level tests for the modern-skin Montage wall (`/montage`).
 *
 * The mosaic tree lives in a persisted zustand store, so every test starts
 * from a fresh single vacant cell and lets the page's hydration effect seed
 * the "Auto" layout from the seeded fleet (Front Door #1, Driveway #2).
 *
 * Live tiles are gated on IntersectionObserver, which the shared setup stubs
 * as a no-op — so cells mount idle and never open a socket. That is exactly
 * what we want here: the assertions are about layout, captions, and the
 * saved-layout CRUD against `/api/v3/montage_layouts`.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import { renderRoute } from '@/test/renderRoute';
import { setupMockServer, server, db } from '@/test/msw/server';
import { makeMontageLayout } from '@/test/fixtures';
import { leaf, split, type LayoutNode } from '@/features/montage/mosaic';
import { serialisePositions } from '@/features/montage/layoutFormat';
import { useMontageStore } from '@/stores/montage';
import { useMonitorFilterStore } from '@/stores/monitorFilter';
import { useUiStore } from '@/stores/ui';

setupMockServer();

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  useMontageStore.setState({ tree: leaf(null), protocol: 'webrtc', statusPosition: 'inside' });
  useMonitorFilterStore.getState().reset();
  useUiStore.setState({ maxLiveTiles: 12 });
});

/** Wait for the hydration effect to seed a cell per capturing monitor. */
async function findWall(): Promise<void> {
  await screen.findByText('Front Door');
  await screen.findByText('Driveway');
}

function cellCountLabel(): string {
  return screen.getByText(/^\d+ cells?$/).textContent ?? '';
}

/** A saved row whose `positions` this dashboard can actually parse. */
function savedLayout(name: string, tree: LayoutNode, id = 1) {
  return makeMontageLayout({
    id,
    name,
    positions: serialisePositions(tree, 'outside'),
  });
}

describe('MontagePage (modern) — wall', () => {
  it('seeds the Auto layout from the capturing monitors', async () => {
    renderRoute('/montage');
    await findWall();

    expect(cellCountLabel()).toBe('2 cells');
    // Both cells carry the split/close controls the editor puts on every cell.
    expect(screen.getAllByRole('button', { name: 'Split horizontally' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Remove tile' })).toHaveLength(2);
  });

  it('offers a vacant cell with no monitors to show', async () => {
    db.monitors = [];
    const user = userEvent.setup();
    renderRoute('/montage');

    const choose = await screen.findByRole('button', { name: 'Choose monitor' });
    expect(cellCountLabel()).toBe('1 cell');

    await user.click(choose);
    const dialog = await screen.findByRole('dialog', { name: 'Choose a monitor' });
    expect(within(dialog).getByText('No capturing monitors available.')).toBeInTheDocument();
  });

  it('keeps the wall usable when the monitors query 500s', async () => {
    server.use(
      http.get('/api/v3/monitors', () =>
        HttpResponse.json({ error_message: 'boom', code: 500 }, { status: 500 }),
      ),
    );
    renderRoute('/montage');

    // No fleet to hydrate from, so the store's single vacant cell stands.
    expect(await screen.findByRole('button', { name: 'Choose monitor' })).toBeInTheDocument();
    expect(cellCountLabel()).toBe('1 cell');
  });

  it('hides the mosaic behind the stream permission', async () => {
    renderRoute('/montage', { perms: { stream: 'None' } });

    expect(
      await screen.findByText('You do not have permission to view this.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Front Door')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove tile' })).not.toBeInTheDocument();
  });
});

describe('MontagePage (modern) — layout editing', () => {
  it('applies a preset and reshapes the wall', async () => {
    const user = userEvent.setup();
    renderRoute('/montage');
    await findWall();

    await user.click(
      within(screen.getByRole('group', { name: 'Layout presets' })).getByRole('button', {
        name: '1×1',
      }),
    );

    await waitFor(() => expect(cellCountLabel()).toBe('1 cell'));
    expect(screen.getByText('Front Door')).toBeInTheDocument();
    expect(screen.queryByText('Driveway')).not.toBeInTheDocument();
  });

  it('pads a bigger preset with vacant cells the operator can fill', async () => {
    const user = userEvent.setup();
    renderRoute('/montage');
    await findWall();

    await user.click(
      within(screen.getByRole('group', { name: 'Layout presets' })).getByRole('button', {
        name: '2×2',
      }),
    );
    await waitFor(() => expect(cellCountLabel()).toBe('4 cells'));

    const vacant = screen.getAllByRole('button', { name: 'Choose monitor' });
    expect(vacant).toHaveLength(2);

    await user.click(vacant[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Choose a monitor' });
    await user.click(within(dialog).getByRole('button', { name: /Driveway/ }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Choose a monitor' })).not.toBeInTheDocument();
    });
    expect(screen.getAllByText('Driveway')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Choose monitor' })).toHaveLength(1);
  });

  it('cancels the monitor picker without changing the wall', async () => {
    const user = userEvent.setup();
    renderRoute('/montage');
    await findWall();

    await user.click(
      within(screen.getByRole('group', { name: 'Layout presets' })).getByRole('button', {
        name: '2×2',
      }),
    );
    await user.click((await screen.findAllByRole('button', { name: 'Choose monitor' }))[0]);

    const dialog = await screen.findByRole('dialog', { name: 'Choose a monitor' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Choose a monitor' })).not.toBeInTheDocument();
    });
    expect(screen.getAllByRole('button', { name: 'Choose monitor' })).toHaveLength(2);
  });

  it('splits a cell and removes one again', async () => {
    const user = userEvent.setup();
    renderRoute('/montage');
    await findWall();

    await user.click(screen.getAllByRole('button', { name: 'Split vertically' })[0]);
    await waitFor(() => expect(cellCountLabel()).toBe('3 cells'));

    await user.click(screen.getAllByRole('button', { name: 'Remove tile' })[0]);
    await waitFor(() => expect(cellCountLabel()).toBe('2 cells'));
  });

  it('marks a cell whose monitor the filter bar excluded', async () => {
    // The shared filter store is what the bar reports through; select only
    // monitor 1 so Driveway's cell stays put but dims.
    useMonitorFilterStore.getState().setMonitorIds([1]);
    renderRoute('/montage');

    expect(await screen.findByText('Driveway (filtered)')).toBeInTheDocument();
    expect(screen.getByText('Front Door')).toBeInTheDocument();
  });

  it('says so when a cell points at a monitor that no longer exists', async () => {
    useMontageStore.setState({ tree: split('row', [leaf(1), leaf(99)]) });
    renderRoute('/montage');

    expect(await screen.findByText('Monitor 99 not found')).toBeInTheDocument();
  });
});

describe('MontagePage (modern) — toolbar', () => {
  it('switches the stream protocol and persists it', async () => {
    const user = userEvent.setup();
    renderRoute('/montage');
    await findWall();

    const group = screen.getByRole('group', { name: 'Stream protocol' });
    expect(within(group).getByRole('button', { name: 'WebRTC' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(within(group).getByRole('button', { name: 'HLS' }));

    await waitFor(() => {
      expect(within(group).getByRole('button', { name: 'HLS' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });
    expect(useMontageStore.getState().protocol).toBe('hls');
  });

  it('moves the caption outside the tile and then hides it', async () => {
    const user = userEvent.setup();
    renderRoute('/montage');
    await findWall();

    const picker = screen.getByLabelText('Monitor status position');
    await user.selectOptions(picker, 'outside');

    // The outside caption bar carries the runtime status from /monitor-status.
    expect(await screen.findByText('Connected · 15.0 fps')).toBeInTheDocument();
    expect(screen.getByText('NotRunning · 0.0 fps')).toBeInTheDocument();
    expect(useMontageStore.getState().statusPosition).toBe('outside');

    await user.selectOptions(picker, 'hidden');
    await waitFor(() => {
      expect(screen.queryByText('Connected · 15.0 fps')).not.toBeInTheDocument();
    });
    expect(screen.queryByText('Front Door')).not.toBeInTheDocument();
  });

  it('changes the live-tile budget', async () => {
    const user = userEvent.setup();
    renderRoute('/montage');
    await findWall();

    await user.selectOptions(screen.getByLabelText('Live tile limit'), '4');

    await waitFor(() => expect(useUiStore.getState().maxLiveTiles).toBe(4));
  });

  it('restarts every stream without disturbing the layout', async () => {
    const user = userEvent.setup();
    renderRoute('/montage');
    await findWall();

    await user.click(screen.getByRole('button', { name: 'Restart' }));

    expect(cellCountLabel()).toBe('2 cells');
    expect(screen.getByText('Front Door')).toBeInTheDocument();
  });

  it('requests fullscreen on the mosaic viewport, then exits', async () => {
    const request = vi.fn().mockResolvedValue(undefined);
    const exit = vi.fn().mockResolvedValue(undefined);
    Element.prototype.requestFullscreen = request;
    Object.defineProperty(document, 'exitFullscreen', { value: exit, configurable: true });

    const user = userEvent.setup();
    renderRoute('/montage');
    await findWall();

    await user.click(screen.getByRole('button', { name: 'Fullscreen' }));
    expect(request).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'fullscreenElement', {
      value: document.body,
      configurable: true,
    });
    await user.click(screen.getByRole('button', { name: 'Fullscreen' }));
    expect(exit).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, 'fullscreenElement', {
      value: null,
      configurable: true,
    });
  });

  it('pre-applies ?group= to the shared monitor filter', async () => {
    renderRoute('/montage?group=1');
    await screen.findByText('Front Door');

    await waitFor(() => {
      expect(useMonitorFilterStore.getState().groupIds).toEqual([1]);
    });
  });
});

describe('MontagePage (modern) — saved layouts', () => {
  it('lists only rows whose positions this dashboard can read', async () => {
    db.montageLayouts = [
      savedLayout('Night Wall', split('row', [leaf(1), leaf(2)]), 1),
      // The seed row's `positions` is a shape neither format understands.
      makeMontageLayout({ id: 2, name: 'Unreadable', positions: '{"nope":true}' }),
      makeMontageLayout({ id: 3, name: 'Preset row', positions: null }),
    ];
    renderRoute('/montage');
    await findWall();

    const menu = screen.getByLabelText('Saved layouts');
    expect(within(menu).getByRole('option', { name: 'Night Wall' })).toBeInTheDocument();
    expect(within(menu).queryByRole('option', { name: 'Unreadable' })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('option', { name: 'Preset row' })).not.toBeInTheDocument();
  });

  it('POSTs the current arrangement, tree and gridstack projection alike', async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post('/api/v3/montage_layouts', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          makeMontageLayout({ id: 7, name: String(body.name), positions: String(body.positions) }),
          { status: 201 },
        );
      }),
    );
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('  Night Wall  ');
    const user = userEvent.setup();
    renderRoute('/montage');
    await findWall();

    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => expect(body).toBeDefined());
    expect(promptSpy).toHaveBeenCalledWith('Save layout as:');
    expect(body).toMatchObject({ name: 'Night Wall', user_id: 1 });
    const positions = JSON.parse(String(body!.positions));
    expect(positions.dashboard.version).toBe(1);
    expect(positions.monitorStatusPosition).toBe('insideImgBottom');
    expect(positions.gridStack.map((g: { id: string }) => g.id)).toEqual(['1', '2']);
  });

  it('does not POST when the Save prompt is dismissed', async () => {
    let posted = false;
    server.use(
      http.post('/api/v3/montage_layouts', () => {
        posted = true;
        return HttpResponse.json(makeMontageLayout({ id: 7 }), { status: 201 });
      }),
    );
    vi.spyOn(window, 'prompt').mockReturnValue(null);
    const user = userEvent.setup();
    renderRoute('/montage');
    await findWall();

    await user.click(screen.getByRole('button', { name: /^Save$/ }));
    expect(posted).toBe(false);
  });

  it('loads a saved layout, applying its tree and caption position', async () => {
    db.montageLayouts = [savedLayout('Driveway only', leaf(2))];
    const user = userEvent.setup();
    renderRoute('/montage');
    await findWall();

    await user.selectOptions(screen.getByLabelText('Saved layouts'), 'Driveway only');

    await waitFor(() => expect(cellCountLabel()).toBe('1 cell'));
    expect(screen.queryByText('Front Door')).not.toBeInTheDocument();
    // The row was saved with the caption outside the tile.
    expect(await screen.findByText('NotRunning · 0.0 fps')).toBeInTheDocument();
    expect(useMontageStore.getState().statusPosition).toBe('outside');
  });

  it('keeps Update / Rename / Delete disabled until a layout is loaded', async () => {
    db.montageLayouts = [savedLayout('Night Wall', split('row', [leaf(1), leaf(2)]))];
    const user = userEvent.setup();
    renderRoute('/montage');
    await findWall();

    for (const name of ['Update', 'Rename', 'Delete']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${name}$`) })).toBeDisabled();
    }

    await user.selectOptions(screen.getByLabelText('Saved layouts'), 'Night Wall');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Update$/ })).toBeEnabled();
    });
  });

  it('PATCHes the positions on Update', async () => {
    db.montageLayouts = [savedLayout('Night Wall', split('row', [leaf(1), leaf(2)]))];
    let patch: { url: string; body: Record<string, unknown> } | undefined;
    server.use(
      http.patch('/api/v3/montage_layouts/:id', async ({ request, params }) => {
        patch = {
          url: `/api/v3/montage_layouts/${params.id}`,
          body: (await request.json()) as Record<string, unknown>,
        };
        return HttpResponse.json(db.montageLayouts[0]);
      }),
    );
    const user = userEvent.setup();
    renderRoute('/montage');
    await findWall();

    await user.selectOptions(screen.getByLabelText('Saved layouts'), 'Night Wall');
    await user.click(screen.getByRole('button', { name: /^Update$/ }));

    await waitFor(() => expect(patch).toBeDefined());
    expect(patch!.url).toBe('/api/v3/montage_layouts/1');
    expect(Object.keys(patch!.body)).toEqual(['positions']);
    expect(JSON.parse(String(patch!.body.positions)).dashboard.version).toBe(1);
  });

  it('PATCHes only the name on Rename', async () => {
    db.montageLayouts = [savedLayout('Night Wall', split('row', [leaf(1), leaf(2)]))];
    let body: Record<string, unknown> | undefined;
    server.use(
      http.patch('/api/v3/montage_layouts/:id', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(db.montageLayouts[0]);
      }),
    );
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Day Wall');
    const user = userEvent.setup();
    renderRoute('/montage');
    await findWall();

    await user.selectOptions(screen.getByLabelText('Saved layouts'), 'Night Wall');
    await user.click(screen.getByRole('button', { name: /^Rename$/ }));

    await waitFor(() => expect(body).toEqual({ name: 'Day Wall' }));
    expect(promptSpy).toHaveBeenCalledWith('Rename layout to:', 'Night Wall');
  });

  it('DELETEs the loaded layout after confirming', async () => {
    db.montageLayouts = [savedLayout('Night Wall', split('row', [leaf(1), leaf(2)]))];
    let deletedUrl: string | undefined;
    server.use(
      http.delete('/api/v3/montage_layouts/:id', ({ params }) => {
        deletedUrl = `/api/v3/montage_layouts/${params.id}`;
        db.montageLayouts = [];
        return HttpResponse.json({ message: 'deleted' });
      }),
    );
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderRoute('/montage');
    await findWall();

    await user.selectOptions(screen.getByLabelText('Saved layouts'), 'Night Wall');
    await user.click(screen.getByRole('button', { name: /^Delete$/ }));

    await waitFor(() => expect(deletedUrl).toBe('/api/v3/montage_layouts/1'));
    expect(confirmSpy).toHaveBeenCalledWith('Delete saved layout "Night Wall"?');
    await waitFor(() => {
      expect(
        within(screen.getByLabelText('Saved layouts')).queryByRole('option', {
          name: 'Night Wall',
        }),
      ).not.toBeInTheDocument();
    });
  });

  it('leaves the row alone when the delete confirm is declined', async () => {
    db.montageLayouts = [savedLayout('Night Wall', split('row', [leaf(1), leaf(2)]))];
    let deleted = false;
    server.use(
      http.delete('/api/v3/montage_layouts/:id', () => {
        deleted = true;
        return HttpResponse.json({ message: 'deleted' });
      }),
    );
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    renderRoute('/montage');
    await findWall();

    await user.selectOptions(screen.getByLabelText('Saved layouts'), 'Night Wall');
    await user.click(screen.getByRole('button', { name: /^Delete$/ }));

    expect(deleted).toBe(false);
    expect(
      within(screen.getByLabelText('Saved layouts')).getByRole('option', { name: 'Night Wall' }),
    ).toBeInTheDocument();
  });
});
