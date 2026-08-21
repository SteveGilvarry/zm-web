/**
 * MatchesPreview — the toolbar verbs the first suite did not press: Export
 * matches (which only exports once the list is open), and the archive /
 * unarchive halves of Execute now, including the "nothing to act on" guard.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/components/common/toastStore';
import type { FilterQuery } from '@/api/filters';
import type { Monitor } from '@/types';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to?: string }) => (
    <a href={to ?? '#'} {...rest}>{children}</a>
  ),
}));
const { MatchesPreview } = await import('./MatchesPreview');

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test',
    user: { user: 'admin', iat: 0, exp: 0 } as never, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => { server.resetHandlers(); useToastStore.getState().clear(); });
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

const monitors = [{ id: 1, name: 'Front Door' }] as unknown as Monitor[];
const events = [
  { id: 11, monitor_id: 1, storage_id: 0, name: 'Event 11', cause: 'Motion', start_date_time: '2026-05-24T12:00:00Z', end_date_time: '2026-05-24T12:00:30Z', length: '30.00', frames: 90, alarm_frames: 3, tot_score: 12, avg_score: 4, max_score: 9, disk_space: 2048, archived: 0 },
  { id: 12, monitor_id: 9, storage_id: 2, name: 'Event 12', cause: 'Motion', start_date_time: '2026-05-24T12:01:00Z', end_date_time: '2026-05-24T12:01:30Z', length: '30.00', frames: 90, alarm_frames: 1, tot_score: 4, avg_score: 2, max_score: 3, disk_space: 1024, archived: 1 },
];

/** Terms every preview can run server-side. */
const query: FilterQuery = { terms: [{ attr: 'Cause', op: '=', val: 'Motion' }], sort_field: '', limit: '0' };

function stubPreview(items: unknown[] = events) {
  server.use(
    http.post('/api/v3/filters/preview', () =>
      HttpResponse.json({ items, total: items.length, per_page: 50, current_page: 1, last_page: 1 })),
  );
}

const noActions = { archive: false, unarchive: false, delete: false };

/* ======================================================================== */
/*  Export matches                                                          */
/* ======================================================================== */

describe('MatchesPreview — export', () => {
  it('the first press opens the list; the second downloads a CSV of what is listed', async () => {
    const user = userEvent.setup();
    stubPreview();

    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:matches');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });
    const clicks: Array<{ download: string; href: string }> = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push({ download: this.download, href: this.href });
    });

    renderWithProviders(<MatchesPreview query={query} monitors={monitors} actions={noActions} />);

    const exportBtn = screen.getByRole('button', { name: /export matches/i });
    expect(screen.queryByRole('button', { name: /hide matches/i })).toBeNull();

    await user.click(exportBtn);           // opens the list, exports nothing yet
    await waitFor(() => expect(screen.getByText('Event 11')).toBeInTheDocument());
    expect(click).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /hide matches/i })).toBeInTheDocument();

    await user.click(exportBtn);           // now it downloads
    await waitFor(() => expect(clicks).toHaveLength(1));
    expect(clicks[0].download).toMatch(/^zm-filter-matches-.*\.csv$/);
    expect(createObjectURL).toHaveBeenCalledTimes(1);

    // The CSV carries the resolved monitor and storage names, not raw ids.
    const blob = createObjectURL.mock.calls[0][0];
    const text = await blob.text();
    expect(text).toContain('Front Door');   // known monitor
    expect(text).toContain('9');            // unknown monitor falls back to its id
    expect(text).toContain('Default');      // storage 0 is the default area
    expect(text).toContain('Event 11');
  });

  it('pages backwards as well as forwards through server results', async () => {
    const user = userEvent.setup();
    const pages: number[] = [];
    server.use(http.post('/api/v3/filters/preview', ({ request }) => {
      const page = Number(new URL(request.url).searchParams.get('page') ?? 1);
      pages.push(page);
      return HttpResponse.json({
        items: [{ ...events[0], id: 100 + page, name: `Event on page ${page}` }],
        total: 120, per_page: 50, current_page: page, last_page: 3,
      });
    }));
    renderWithProviders(<MatchesPreview query={query} monitors={monitors} actions={noActions} />);

    await user.click(screen.getByRole('button', { name: /list matches/i }));
    await waitFor(() => expect(screen.getByText('Event on page 1')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /previous page/i })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /next page/i }));
    await waitFor(() => expect(screen.getByText('Event on page 2')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /previous page/i }));
    await waitFor(() => expect(screen.getByText('Event on page 1')).toBeInTheDocument());
    expect(pages).toEqual([1, 2, 1]);
  });

  it('is disabled once the list is open and empty', async () => {
    const user = userEvent.setup();
    stubPreview([]);
    renderWithProviders(<MatchesPreview query={query} monitors={monitors} actions={noActions} />);

    await user.click(screen.getByRole('button', { name: /list matches/i }));
    await waitFor(() => expect(screen.getByText(/no events match/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /export matches/i })).toBeDisabled();
  });
});

/* ======================================================================== */
/*  Execute now — archive / unarchive                                       */
/* ======================================================================== */

describe('MatchesPreview — execute archive and unarchive', () => {
  it('archives every listed event after the confirm names the count', async () => {
    const user = userEvent.setup();
    stubPreview();
    const patched: Array<{ id: string; body: unknown }> = [];
    server.use(http.patch('/api/v3/events/:id', async ({ params, request }) => {
      patched.push({ id: String(params.id), body: await request.json() });
      return HttpResponse.json({ id: Number(params.id) });
    }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderWithProviders(
      <MatchesPreview
        query={query}
        monitors={monitors}
        actions={{ archive: true, unarchive: false, delete: false }}
      />,
    );
    await user.click(screen.getByRole('button', { name: /list matches/i }));
    await waitFor(() => expect(screen.getByText('Event 11')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /execute/i }));

    await waitFor(() => expect(patched).toHaveLength(2));
    expect(confirm).toHaveBeenCalledWith('Archive 2 listed events?');
    expect(patched.map((p) => p.id)).toEqual(['11', '12']);
    expect(patched[0].body).toMatchObject({ archived: true });
    await waitFor(() =>
      expect(useToastStore.getState().toasts.some((t) => /Applied to 2 event/.test(t.message))).toBe(true));
  });

  it('unarchives when that is the draft action', async () => {
    const user = userEvent.setup();
    stubPreview();
    const bodies: unknown[] = [];
    server.use(http.patch('/api/v3/events/:id', async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json({ id: 1 });
    }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderWithProviders(
      <MatchesPreview
        query={query}
        monitors={monitors}
        actions={{ archive: false, unarchive: true, delete: false }}
      />,
    );
    await user.click(screen.getByRole('button', { name: /list matches/i }));
    await waitFor(() => expect(screen.getByText('Event 11')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /execute/i }));

    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(confirm).toHaveBeenCalledWith('Unarchive 2 listed events?');
    expect(bodies[0]).toMatchObject({ archived: false });
  });

  it('sends nothing when the confirm is declined', async () => {
    const user = userEvent.setup();
    stubPreview();
    let patchHits = 0;
    server.use(http.patch('/api/v3/events/:id', () => { patchHits++; return HttpResponse.json({ id: 1 }); }));
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderWithProviders(
      <MatchesPreview
        query={query}
        monitors={monitors}
        actions={{ archive: true, unarchive: false, delete: false }}
      />,
    );
    await user.click(screen.getByRole('button', { name: /list matches/i }));
    await waitFor(() => expect(screen.getByText('Event 11')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /execute/i }));
    expect(patchHits).toBe(0);
  });

  it('reports a failed execute through the toast rail', async () => {
    const user = userEvent.setup();
    stubPreview();
    server.use(http.patch('/api/v3/events/:id', () =>
      HttpResponse.json({ kind: 'FORBIDDEN', error_message: 'read only' }, { status: 403 })));
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderWithProviders(
      <MatchesPreview
        query={query}
        monitors={monitors}
        actions={{ archive: true, unarchive: false, delete: false }}
      />,
    );
    await user.click(screen.getByRole('button', { name: /list matches/i }));
    await waitFor(() => expect(screen.getByText('Event 11')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /execute/i }));

    await waitFor(() =>
      expect(useToastStore.getState().toasts.some((t) => t.tone === 'error')).toBe(true));
  });

  it('hides Execute entirely from an operator without events:Edit', async () => {
    const user = userEvent.setup();
    stubPreview();
    useAuthStore.setState({ user: { iat: 0, exp: 0, user: 'viewer', perms: { events: 'View' } } as never });

    renderWithProviders(
      <MatchesPreview
        query={query}
        monitors={monitors}
        actions={{ archive: true, unarchive: false, delete: false }}
      />,
    );
    await user.click(screen.getByRole('button', { name: /list matches/i }));
    await waitFor(() => expect(screen.getByText('Event 11')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /execute/i })).toBeNull();

    useAuthStore.setState({ user: { user: 'admin', iat: 0, exp: 0 } as never });
  });

  it('View matches deep-links Montage Review when a review search is supplied', async () => {
    stubPreview();
    renderWithProviders(
      <MatchesPreview
        query={query}
        monitors={monitors}
        actions={noActions}
        reviewSearch={{ monitor_id: 1 }}
      />,
    );
    expect(screen.getByRole('link', { name: /view matches/i })).toHaveAttribute('href', '/montagereview');
  });
});
