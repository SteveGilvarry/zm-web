import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import { SavedLayoutsMenu } from './SavedLayoutsMenu';
import { leaf, split, type LayoutNode } from './mosaic';
import { serialisePositions } from './layoutFormat';
import type { MontageLayout } from '@/api/montageLayouts';

const sampleTree: LayoutNode = split('row', [leaf(1), leaf(2)]);
const sampleSerialised = serialisePositions(sampleTree, 'inside');
/** Rows written by the dashboard before it spoke gridstack. */
const oldDashboardSerialised = JSON.stringify({ version: 1, tree: sampleTree });
const legacyGrid = '{"gridStack":[{"w":24,"h":461,"id":"1","x":0,"y":0},{"w":24,"h":461,"id":"2","x":24,"y":0}],"monitorStatusPosition":"outsideImgBottom"}';

function renderMenu(props: Partial<React.ComponentProps<typeof SavedLayoutsMenu>> = {}) {
  return renderWithProviders(
    <SavedLayoutsMenu currentTree={leaf(null)} statusPosition="inside" onLoad={() => {}} {...props} />,
  );
}

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test',
    refreshToken: 'test',
    user: { iat: 0, exp: 9999999999, user: 'admin', uid: 1 },
    isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

/** Reusable handler factory for the list endpoint. */
function listResponse(items: MontageLayout[]) {
  return http.get('/api/v3/montage_layouts', () =>
    HttpResponse.json({
      items,
      total: items.length,
      per_page: 200,
      current_page: 1,
      last_page: 1,
    }),
  );
}

describe('SavedLayoutsMenu — listing', () => {
  it('lists every loadable row — ours, older dashboard rows and legacy gridstack — but not presets', async () => {
    server.use(
      listResponse([
        // Built-in preset rows (no positions) — covered by the preset buttons.
        { id: 1, name: 'Auto', positions: null, user_id: 0 },
        { id: 2, name: '4 Wide', positions: null, user_id: 0 },
        // Legacy ZoneMinder gridstack row — loadable, flagged.
        { id: 3, name: 'Test1', positions: legacyGrid, user_id: 1 },
        // Our format, both generations.
        { id: 4, name: 'Front of house', positions: sampleSerialised, user_id: 1 },
        { id: 5, name: 'Older wall', positions: oldDashboardSerialised, user_id: 1 },
        // Junk never renders.
        { id: 6, name: 'Broken', positions: 'not json', user_id: 1 },
      ]),
    );

    renderMenu();

    const select = await screen.findByRole('combobox', { name: /saved layouts/i });
    await waitFor(() => expect(select).toHaveTextContent('Front of house'));
    expect(select).toHaveTextContent('Test1 (legacy grid)');
    expect(select).toHaveTextContent('Older wall');
    expect(select).not.toHaveTextContent('Auto');
    expect(select).not.toHaveTextContent('4 Wide');
    expect(select).not.toHaveTextContent('Broken');
  });
});

describe('SavedLayoutsMenu — save', () => {
  it('POSTs the current tree (serialised) under the prompted name', async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('My Wall');
    let createBody: unknown = null;

    server.use(
      listResponse([]),
      http.post('/api/v3/montage_layouts', async ({ request }) => {
        createBody = await request.json();
        return HttpResponse.json({
          id: 99,
          name: 'My Wall',
          positions: sampleSerialised,
          user_id: 1,
        });
      }),
    );

    renderMenu({ currentTree: sampleTree, statusPosition: 'outside' });
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(createBody).not.toBeNull());
    expect(createBody).toEqual({
      name: 'My Wall',
      positions: serialisePositions(sampleTree, 'outside'),
      user_id: 1,
    });
    // Legacy can read what we wrote.
    const legacyView = JSON.parse((createBody as { positions: string }).positions);
    expect(legacyView.gridStack).toEqual([
      { id: '1', x: 0, y: 0, w: 24, h: 1000 },
      { id: '2', x: 24, y: 0, w: 24, h: 1000 },
    ]);
    expect(legacyView.monitorStatusPosition).toBe('outsideImgBottom');
    promptSpy.mockRestore();
  });

  it('does nothing if the user cancels the name prompt', async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null);
    let postHits = 0;

    server.use(
      listResponse([]),
      http.post('/api/v3/montage_layouts', () => {
        postHits += 1;
        return HttpResponse.json({});
      }),
    );

    renderMenu({ currentTree: sampleTree });
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    // Give microtasks a tick to drain.
    await new Promise((r) => setTimeout(r, 30));
    expect(postHits).toBe(0);
    promptSpy.mockRestore();
  });
});

describe('SavedLayoutsMenu — load', () => {
  it('deserialises the selected layout and calls onLoad with the tree + status position', async () => {
    const user = userEvent.setup();
    const onLoad = vi.fn();

    server.use(
      listResponse([
        { id: 4, name: 'Front of house', positions: sampleSerialised, user_id: 1 },
      ]),
    );

    renderMenu({ onLoad });

    const select = await screen.findByRole('combobox', { name: /saved layouts/i });
    await waitFor(() => expect(select).toHaveTextContent('Front of house'));

    await user.selectOptions(select, '4');
    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(onLoad).toHaveBeenCalledWith({ tree: sampleTree, statusPosition: 'inside', source: 'dashboard' });
  });

  it('loads a legacy gridstack row as a converted tree', async () => {
    const user = userEvent.setup();
    const onLoad = vi.fn();
    server.use(listResponse([{ id: 3, name: 'Test1', positions: legacyGrid, user_id: 1 }]));
    renderMenu({ onLoad });
    const select = await screen.findByRole('combobox', { name: /saved layouts/i });
    await waitFor(() => expect(select).toHaveTextContent('Test1'));
    await user.selectOptions(select, '3');
    expect(onLoad).toHaveBeenCalledWith(expect.objectContaining({ source: 'gridstack', statusPosition: 'outside' }));
    const loaded = onLoad.mock.calls[0][0].tree;
    expect(loaded).toEqual(split('row', [leaf(1), leaf(2)], [0.5, 0.5]));
  });
});

describe('SavedLayoutsMenu — update', () => {
  it('PATCHes the active layout positions with the current arrangement', async () => {
    const user = userEvent.setup();
    let patchBody: unknown = null;
    server.use(
      listResponse([{ id: 4, name: 'Front of house', positions: sampleSerialised, user_id: 1 }]),
      http.patch('/api/v3/montage_layouts/4', async ({ request }) => {
        patchBody = await request.json();
        return HttpResponse.json({ id: 4, name: 'Front of house', positions: '', user_id: 1 });
      }),
    );
    const edited = split('column', [leaf(2), leaf(1)]);
    renderMenu({ currentTree: edited, statusPosition: 'hidden' });
    const select = await screen.findByRole('combobox', { name: /saved layouts/i });
    await waitFor(() => expect(select).toHaveTextContent('Front of house'));
    expect(screen.getByRole('button', { name: /update/i })).toBeDisabled();
    await user.selectOptions(select, '4');
    await user.click(screen.getByRole('button', { name: /update/i }));
    await waitFor(() => expect(patchBody).not.toBeNull());
    expect(patchBody).toEqual({ positions: serialisePositions(edited, 'hidden') });
  });
});

describe('SavedLayoutsMenu — rename', () => {
  it('PATCHes the active layout name after the operator confirms a new name', async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Renamed Wall');
    let patchedId: string | undefined;
    let patchBody: unknown = null;

    server.use(
      listResponse([
        { id: 4, name: 'Front of house', positions: sampleSerialised, user_id: 1 },
      ]),
      http.patch('/api/v3/montage_layouts/:id', async ({ params, request }) => {
        patchedId = params.id as string;
        patchBody = await request.json();
        return HttpResponse.json({ id: 4, name: 'Renamed Wall', positions: sampleSerialised, user_id: 1 });
      }),
    );

    renderMenu();

    const select = await screen.findByRole('combobox', { name: /saved layouts/i });
    await waitFor(() => expect(select).toHaveTextContent('Front of house'));
    // Rename is disabled until a layout is loaded.
    expect(screen.getByRole('button', { name: /rename/i })).toBeDisabled();

    await user.selectOptions(select, '4');
    await user.click(screen.getByRole('button', { name: /rename/i }));

    await waitFor(() => expect(patchedId).toBe('4'));
    expect(patchBody).toEqual({ name: 'Renamed Wall' });
    promptSpy.mockRestore();
  });
});

describe('SavedLayoutsMenu — delete', () => {
  it('DELETEs the active layout after confirm', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    let deletedId: string | undefined;

    server.use(
      listResponse([
        { id: 4, name: 'Front of house', positions: sampleSerialised, user_id: 1 },
      ]),
      http.delete('/api/v3/montage_layouts/:id', ({ params }) => {
        deletedId = params.id as string;
        return HttpResponse.json({}, { status: 204 });
      }),
    );

    renderMenu();

    const select = await screen.findByRole('combobox', { name: /saved layouts/i });
    await waitFor(() => expect(select).toHaveTextContent('Front of house'));
    // Delete is disabled until a layout is loaded.
    expect(screen.getByRole('button', { name: /delete/i })).toBeDisabled();

    await user.selectOptions(select, '4');
    await user.click(screen.getByRole('button', { name: /delete/i }));

    await waitFor(() => expect(deletedId).toBe('4'));
    confirmSpy.mockRestore();
  });

  it('does not fire DELETE when the operator declines the confirm', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    let deleteHits = 0;

    server.use(
      listResponse([
        { id: 4, name: 'Front of house', positions: sampleSerialised, user_id: 1 },
      ]),
      http.delete('/api/v3/montage_layouts/:id', () => {
        deleteHits += 1;
        return HttpResponse.json({}, { status: 204 });
      }),
    );

    renderMenu();

    const select = await screen.findByRole('combobox', { name: /saved layouts/i });
    await waitFor(() => expect(select).toHaveTextContent('Front of house'));
    await user.selectOptions(select, '4');
    await user.click(screen.getByRole('button', { name: /delete/i }));

    expect(confirmSpy).toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 30));
    expect(deleteHits).toBe(0);
    confirmSpy.mockRestore();
  });
});
