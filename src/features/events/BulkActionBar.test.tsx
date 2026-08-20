import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';

// The bar navigates (View) through the router; shim it so the component
// renders without a RouterProvider.
const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}));

const { BulkActionBar } = await import('./BulkActionBar');
const { bulkEditPayload } = await import('./bulkEdit');

const server = setupServer();
beforeAll(() => {
  // Stub auth so the API client's authedFetch attaches a token.
  useAuthStore.setState({
    accessToken: 'test',
    refreshToken: 'test',
    user: null,
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
  it('opens the first selected event', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <BulkActionBar selectedIds={new Set([42, 7])} onClear={() => {}} />,
    );
    await user.click(screen.getByRole('button', { name: /^view$/i }));
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/events/$eventId', params: { eventId: '42' } });
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
  it('confirms before deleting and respects a declined confirm', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
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

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(hits).toBe(0);            // user declined → no requests fired
    expect(onClear).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('DELETEs each selected id on a confirmed delete', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
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

    await waitFor(() => expect(deletedIds).toHaveLength(2));
    expect(deletedIds.sort()).toEqual([10, 11]);
    expect(onClear).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
