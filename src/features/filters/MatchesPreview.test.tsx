import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import type { FilterQuery } from '@/api/filters';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to?: string }) => (
    <a href={to ?? '#'} {...rest}>{children}</a>
  ),
}));
const { MatchesPreview } = await import('./MatchesPreview');

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', user: { user: 'admin', iat: 0, exp: 0 } as never, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

const events = [
  { id: 1, monitor_id: 1, name: 'Event 1', cause: 'Motion',     start_date_time: '2026-05-24T12:00:00Z', archived: 0 },
  { id: 2, monitor_id: 1, name: 'Event 2', cause: 'Continuous', start_date_time: '2026-05-24T12:01:00Z', archived: 0 },
  { id: 3, monitor_id: 2, name: 'Event 3', cause: 'Motion',     start_date_time: '2026-05-24T12:02:00Z', archived: 0 },
];

const noActions = { archive: false, unarchive: false, delete: false };

describe('MatchesPreview — server path', () => {
  it('POSTs the AST to /filters/preview and lists the page it returns', async () => {
    const user = userEvent.setup();
    let body: unknown = null;
    let eventsHit = 0;
    server.use(
      http.post('/api/v3/filters/preview', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ items: [events[0], events[2]], total: 120, per_page: 50, current_page: 1, last_page: 3 });
      }),
      http.get('/api/v3/events', () => { eventsHit++; return HttpResponse.json({ items: [], total: 0, per_page: 500, current_page: 1, last_page: 1 }); }),
    );
    const query: FilterQuery = { terms: [{ attr: 'Cause', op: '=', val: 'Motion' }], sort_field: 'Id', sort_asc: '1', limit: '0' };
    renderWithProviders(<MatchesPreview query={query} monitors={[]} actions={noActions} />);
    expect(screen.queryByText(/event 1/i)).toBeNull();

    await user.click(screen.getByRole('button', { name: /list matches/i }));
    await waitFor(() => expect(screen.getByText(/^event 1$/i)).toBeInTheDocument());
    expect(body).toEqual({
      where: { match: 'all', rules: [{ field: 'cause', op: 'eq', value: 'Motion' }] },
      sort: { field: 'id', dir: 'asc' },
    });
    expect(screen.getByText(/120 match/i)).toBeInTheDocument();
    expect(screen.getByText(/server preview/i)).toBeInTheDocument();
    expect(screen.getByText(/page 1 of 3/i)).toBeInTheDocument();
    expect(eventsHit).toBe(0);
  });

  it('pages through server results', async () => {
    const user = userEvent.setup();
    const pages: string[] = [];
    server.use(
      http.post('/api/v3/filters/preview', ({ request }) => {
        const page = new URL(request.url).searchParams.get('page') ?? '1';
        pages.push(page);
        return HttpResponse.json({
          items: [events[Number(page) - 1]], total: 3, per_page: 1, current_page: Number(page), last_page: 3,
        });
      }),
    );
    renderWithProviders(<MatchesPreview query={{ terms: [] }} monitors={[]} actions={noActions} />);
    await user.click(screen.getByRole('button', { name: /list matches/i }));
    await waitFor(() => expect(screen.getByText(/^event 1$/i)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /next page/i }));
    await waitFor(() => expect(screen.getByText(/^event 2$/i)).toBeInTheDocument());
    expect(pages).toEqual(['1', '2']);
  });

  it('surfaces a preview error', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('/api/v3/filters/preview', () => HttpResponse.json(
        { kind: 'BAD_REQUEST_ERROR', error_message: 'value "0" does not match the field type' }, { status: 400 },
      )),
    );
    renderWithProviders(<MatchesPreview query={{ terms: [] }} monitors={[]} actions={noActions} />);
    await user.click(screen.getByRole('button', { name: /list matches/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/preview failed/i));
  });
});

describe('MatchesPreview — client fallback', () => {
  it('evaluates locally when a term is server-side only, and says why', async () => {
    const user = userEvent.setup();
    let previewHit = 0;
    server.use(
      http.post('/api/v3/filters/preview', () => { previewHit++; return HttpResponse.json({ items: [], total: 0, per_page: 50, current_page: 1, last_page: 1 }); }),
      http.get('/api/v3/events', () => HttpResponse.json({ items: events, total: 3, per_page: 500, current_page: 1, last_page: 1 })),
    );
    const query: FilterQuery = { terms: [
      { attr: 'Cause', op: '=~', val: '^Motion' },
      { cnj: 'and', attr: 'DiskPercent', op: '>=', val: '80' },
    ] };
    renderWithProviders(<MatchesPreview query={query} monitors={[]} actions={noActions} />);
    await user.click(screen.getByRole('button', { name: /list matches/i }));
    await waitFor(() => expect(screen.getByText(/^event 1$/i)).toBeInTheDocument());
    expect(screen.getByText(/^event 3$/i)).toBeInTheDocument();
    expect(screen.queryByText(/^event 2$/i)).toBeNull();
    expect(screen.getByText(/2 of the last 3 match \(client preview\)/i)).toBeInTheDocument();
    const note = screen.getByText(/server preview cannot run this filter/i);
    expect(note).toHaveTextContent(/regex/);
    expect(note).toHaveTextContent(/Treated as matching: DiskPercent/);
    expect(previewHit).toBe(0);
  });
});

describe('MatchesPreview — execute now', () => {
  it('is hidden without an action, and deletes the listed events after confirm', async () => {
    const user = userEvent.setup();
    const deleted: string[] = [];
    server.use(
      http.post('/api/v3/filters/preview', () => HttpResponse.json({ items: [events[0], events[1]], total: 2, per_page: 50, current_page: 1, last_page: 1 })),
      http.delete('/api/v3/events/:id', ({ params }) => { deleted.push(params.id as string); return new HttpResponse(null, { status: 204 }); }),
    );
    const { rerender } = renderWithProviders(<MatchesPreview query={{ terms: [] }} monitors={[]} actions={noActions} />);
    expect(screen.queryByRole('button', { name: /^execute$/i })).toBeNull();

    rerender(<MatchesPreview query={{ terms: [] }} monitors={[]} actions={{ ...noActions, delete: true }} />);
    const exec = screen.getByRole('button', { name: /^execute$/i });
    expect(exec).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /list matches/i }));
    await waitFor(() => expect(exec).toBeEnabled());
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(exec);
    await waitFor(() => expect(deleted).toEqual(['1', '2']));
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/delete 2 listed events/i));
    confirmSpy.mockRestore();
  });
});
