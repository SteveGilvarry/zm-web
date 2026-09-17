import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import { useEventPlaybackStore } from '@/stores/eventPlayback';
import { useToastStore } from '@/components/common/toastStore';
import type { ZmEvent } from '@/types';

// The bar navigates (View) through the router; shim it so the component
// renders without a RouterProvider.
const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}));

const { BulkActionBar } = await import('./BulkActionBar');
const { bulkEditPayload } = await import('./bulkEdit');

/** A row as the list shows it; only id and the archived flag matter here. */
function event(id: number, archived: 0 | 1): ZmEvent {
  return { id, monitor_id: 1, name: `Event ${id}`, archived } as ZmEvent;
}

const server = setupServer();
beforeAll(() => {
  // Stub auth so the API client's authedFetch attaches a token.
  useAuthStore.setState({
    accessToken: 'test',
    refreshToken: 'test',
    // No `perms` claim → every feature reads as Edit (pre-RBAC token).
    user: { user: 'admin', iat: 0, exp: 0 } as never,
    isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'warn' });
});
afterEach(() => {
  server.resetHandlers();
  mockNavigate.mockReset();
});
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

describe('BulkActionBar — visibility', () => {
  it('renders nothing when the selection is empty', () => {
    const { container } = renderWithProviders(
      <BulkActionBar selectedIds={new Set()} onClear={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows the count and every action button when 1+ selected', () => {
    renderWithProviders(
      <BulkActionBar selectedIds={new Set([1, 2, 3])} onClear={() => {}} />,
    );
    expect(screen.getByText(/3 selected/i)).toBeInTheDocument();
    for (const name of [/^view$/i, /^edit$/i, /^archive$/i, /^unarchive$/i, /^delete$/i]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });
});

describe('BulkActionBar — view', () => {
  it('opens the first selected event in table order, with the selection as the Prev/Next scope and play on', async () => {
    const user = userEvent.setup();
    useEventPlaybackStore.setState({ navScope: { monitorId: 3 } });
    renderWithProviders(
      <BulkActionBar
        selectedIds={new Set([42, 7, 99])}
        events={[event(7, 0), event(8, 0), event(42, 0)]}
        onClear={() => {}}
      />,
    );
    await user.click(screen.getByRole('button', { name: /^view$/i }));
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/events/$eventId', params: { eventId: '7' } });
    // Rows on the page first, in table order; anything checked elsewhere after.
    expect(useEventPlaybackStore.getState().navScope).toEqual({ monitorId: 3, ids: [7, 42, 99], autoplay: true });
    useEventPlaybackStore.setState({ navScope: null });
  });
});

describe('bulkEditPayload', () => {
  it('sends only the fields the operator filled in', () => {
    expect(bulkEditPayload({ name: '', cause: '', notes: '', archived: 'keep' })).toEqual({});
    expect(bulkEditPayload({ name: ' Parcel ', cause: '', notes: 'x', archived: 'archive' }))
      .toEqual({ name: 'Parcel', notes: 'x', archived: true });
    expect(bulkEditPayload({ name: '', cause: 'Linked', notes: '', archived: 'unarchive' }))
      .toEqual({ cause: 'Linked', archived: false });
  });
});

describe('BulkActionBar — edit', () => {
  it('PATCHes the filled-in fields to every selected id', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    const patched: Array<{ id: number; body: unknown }> = [];
    server.use(
      http.patch('/api/v3/events/:id', async ({ params, request }) => {
        patched.push({ id: Number(params.id), body: await request.json() });
        return HttpResponse.json({});
      }),
    );
    renderWithProviders(
      <BulkActionBar selectedIds={new Set([5, 6])} onClear={onClear} />,
    );
    await user.click(screen.getByRole('button', { name: /^edit$/i }));
    await user.type(screen.getByLabelText(/event cause/i), 'Reviewed');
    await user.click(screen.getByRole('radio', { name: /^archive$/i }));
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(patched).toHaveLength(2));
    expect(patched.map((p) => p.id).sort()).toEqual([5, 6]);
    expect(patched[0].body).toEqual({ cause: 'Reviewed', archived: true });
    await waitFor(() => expect(onClear).toHaveBeenCalled());
  });
});

describe('BulkActionBar — partial failure', () => {
  it('keeps going, reports the ids that failed and keeps the selection', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    const hit: number[] = [];
    server.use(
      http.patch('/api/v3/events/:id', ({ params }) => {
        const id = Number(params.id);
        hit.push(id);
        return id === 2
          ? HttpResponse.json({ kind: 'NOT_FOUND', error_message: 'no such event' }, { status: 404 })
          : HttpResponse.json({});
      }),
    );
    renderWithProviders(
      <BulkActionBar selectedIds={new Set([1, 2, 3])} onClear={onClear} />,
    );
    await user.click(screen.getByRole('button', { name: /^archive$/i }));

    const report = await screen.findByTestId('bulk-failures');
    expect(hit.sort()).toEqual([1, 2, 3]);
    expect(report.textContent).toMatch(/2 of 3 succeeded/);
    expect(report.textContent).toMatch(/#2 \(no such event\)/);
    expect(onClear).not.toHaveBeenCalled();
  });
});

describe('BulkActionBar — archive', () => {
  it('PATCHes archived=true for each selected id and calls onClear on success', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    const patched: Array<{ id: number; body: unknown }> = [];

    server.use(
      http.patch('/api/v3/events/:id', async ({ params, request }) => {
        patched.push({ id: Number(params.id), body: await request.json() });
        return HttpResponse.json({});
      }),
    );

    renderWithProviders(
      <BulkActionBar selectedIds={new Set([1, 2])} onClear={onClear} />,
    );

    await user.click(screen.getByRole('button', { name: /^archive$/i }));

    await waitFor(() => expect(patched).toHaveLength(2));
    expect(patched[0].body).toEqual({ archived: true });
    expect(patched[1].body).toEqual({ archived: true });
    expect(onClear).toHaveBeenCalled();
  });
});

describe('BulkActionBar — delete', () => {
  it('asks in a dialog before deleting and does nothing when cancelled', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    let hits = 0;
    server.use(
      http.delete('/api/v3/events/:id', () => {
        hits += 1;
        return HttpResponse.json({}, { status: 204 });
      }),
    );

    renderWithProviders(
      <BulkActionBar selectedIds={new Set([1, 2, 3])} onClear={onClear} />,
    );
    await user.click(screen.getByRole('button', { name: /^delete$/i }));

    const dialog = await screen.findByRole('dialog', { name: 'Delete Confirmation' });
    expect(dialog).toHaveTextContent('Are you sure you wish to delete the selected events?');
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(hits).toBe(0);
    expect(onClear).not.toHaveBeenCalled();
  });

  it('DELETEs each selected id once the dialog is confirmed', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    const deletedIds: number[] = [];

    server.use(
      http.delete('/api/v3/events/:id', ({ params }) => {
        deletedIds.push(Number(params.id));
        return HttpResponse.json({}, { status: 204 });
      }),
    );

    renderWithProviders(
      <BulkActionBar selectedIds={new Set([10, 11])} onClear={onClear} />,
    );
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /^delete$/i }));

    await waitFor(() => expect(deletedIds).toHaveLength(2));
    expect(deletedIds.sort()).toEqual([10, 11]);
    expect(onClear).toHaveBeenCalled();
  });

  it('skips the dialog on Shift+click', async () => {
    const user = userEvent.setup();
    const deletedIds: number[] = [];
    server.use(
      http.delete('/api/v3/events/:id', ({ params }) => {
        deletedIds.push(Number(params.id));
        return HttpResponse.json({}, { status: 204 });
      }),
    );

    renderWithProviders(
      <BulkActionBar selectedIds={new Set([10])} onClear={() => {}} />,
    );
    await user.keyboard('{Shift>}');
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    await user.keyboard('{/Shift}');

    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(deletedIds).toEqual([10]));
  });

  it('refuses archived events, deletes the rest and reports how many were skipped', async () => {
    const user = userEvent.setup();
    const deletedIds: number[] = [];
    server.use(
      http.delete('/api/v3/events/:id', ({ params }) => {
        deletedIds.push(Number(params.id));
        return HttpResponse.json({}, { status: 204 });
      }),
    );
    useToastStore.getState().clear();

    renderWithProviders(
      <BulkActionBar
        selectedIds={new Set([1, 2, 3])}
        events={[event(1, 1), event(2, 0), event(3, 1)]}
        onClear={() => {}}
      />,
    );
    await user.keyboard('{Shift>}');
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    await user.keyboard('{/Shift}');

    await waitFor(() => expect(deletedIds).toEqual([2]));
    expect(useToastStore.getState().toasts.map((x) => x.message))
      .toEqual(['2 archived events not deleted. Unarchive first.']);
  });
});

describe('BulkActionBar — unarchive', () => {
  it('is disabled with an explanation until an archived row is selected', () => {
    renderWithProviders(
      <BulkActionBar selectedIds={new Set([1])} events={[event(1, 0), event(2, 1)]} onClear={() => {}} />,
    );
    const btn = screen.getByRole('button', { name: /^unarchive$/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', 'Please select an event that is archived.');
  });

  it('confirms in a dialog, then PATCHes archived=false', async () => {
    const user = userEvent.setup();
    const patched: number[] = [];
    server.use(
      http.patch('/api/v3/events/:id', async ({ params, request }) => {
        expect(await request.json()).toEqual({ archived: false });
        patched.push(Number(params.id));
        return HttpResponse.json({});
      }),
    );

    renderWithProviders(
      <BulkActionBar selectedIds={new Set([1, 2])} events={[event(1, 0), event(2, 1)]} onClear={() => {}} />,
    );
    const btn = screen.getByRole('button', { name: /^unarchive$/i });
    expect(btn).toBeEnabled();
    await user.click(btn);

    const dialog = await screen.findByRole('dialog', { name: 'Confirm Unarchive' });
    expect(dialog).toHaveTextContent('Are you sure you wish to unarchive the selected events?');
    await user.click(within(dialog).getByRole('button', { name: /^unarchive$/i }));
    await waitFor(() => expect(patched.sort()).toEqual([1, 2]));
  });
});
