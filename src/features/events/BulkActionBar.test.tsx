import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { BulkActionBar } from './BulkActionBar';
import { useAuthStore } from '@/stores/auth';

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
afterEach(() => server.resetHandlers());
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

  it('shows the count and all three action buttons when 1+ selected', () => {
    renderWithProviders(
      <BulkActionBar selectedIds={new Set([1, 2, 3])} onClear={() => {}} />,
    );
    expect(screen.getByText(/3 selected/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^archive$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^unarchive$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
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
