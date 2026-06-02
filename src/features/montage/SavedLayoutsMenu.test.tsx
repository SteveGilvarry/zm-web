import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import { SavedLayoutsMenu } from './SavedLayoutsMenu';
import { leaf, split, type LayoutNode } from './mosaic';
import type { MontageLayout } from '@/api/montageLayouts';

const sampleTree: LayoutNode = split('row', [leaf(1), leaf(2)]);
const sampleSerialised = JSON.stringify({ version: 1, tree: sampleTree });

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
  it('renders only rows whose positions JSON our app understands', async () => {
    server.use(
      listResponse([
        // Legacy/preset rows (no positions) — should NOT appear.
        { id: 1, name: 'Auto', positions: null, user_id: 0 },
        { id: 2, name: '4 Wide', positions: null, user_id: 0 },
        // Legacy gridstack format — also unsupported, hidden.
        { id: 3, name: 'Legacy Grid', positions: '[{"monitor_id":1,"x":0,"y":0,"w":4,"h":4}]', user_id: 1 },
        // Our format — visible.
        { id: 4, name: 'Front of house', positions: sampleSerialised, user_id: 1 },
      ]),
    );

    renderWithProviders(<SavedLayoutsMenu currentTree={leaf(null)} onLoad={() => {}} />);

    const select = await screen.findByRole('combobox', { name: /saved layouts/i });
    await waitFor(() => {
      expect(select).toHaveTextContent('Front of house');
    });
    // Legacy entries are filtered out.
    expect(select).not.toHaveTextContent('Auto');
    expect(select).not.toHaveTextContent('Legacy Grid');
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

    renderWithProviders(<SavedLayoutsMenu currentTree={sampleTree} onLoad={() => {}} />);
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(createBody).not.toBeNull());
    expect(createBody).toEqual({
      name: 'My Wall',
      positions: sampleSerialised,
      user_id: 1,
    });
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

    renderWithProviders(<SavedLayoutsMenu currentTree={sampleTree} onLoad={() => {}} />);
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    // Give microtasks a tick to drain.
    await new Promise((r) => setTimeout(r, 30));
    expect(postHits).toBe(0);
    promptSpy.mockRestore();
  });
});

describe('SavedLayoutsMenu — load', () => {
  it('deserialises the selected layout and calls onLoad with the tree', async () => {
    const user = userEvent.setup();
    const onLoad = vi.fn();

    server.use(
      listResponse([
        { id: 4, name: 'Front of house', positions: sampleSerialised, user_id: 1 },
      ]),
    );

    renderWithProviders(<SavedLayoutsMenu currentTree={leaf(null)} onLoad={onLoad} />);

    const select = await screen.findByRole('combobox', { name: /saved layouts/i });
    await waitFor(() => expect(select).toHaveTextContent('Front of house'));

    await user.selectOptions(select, '4');
    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(onLoad).toHaveBeenCalledWith(sampleTree);
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

    renderWithProviders(<SavedLayoutsMenu currentTree={leaf(null)} onLoad={() => {}} />);

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

    renderWithProviders(<SavedLayoutsMenu currentTree={leaf(null)} onLoad={() => {}} />);

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

    renderWithProviders(<SavedLayoutsMenu currentTree={leaf(null)} onLoad={() => {}} />);

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
